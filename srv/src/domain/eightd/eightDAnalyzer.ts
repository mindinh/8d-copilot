/**
 * Điều phối pipeline 8D.
 *
 *   raw JSON
 *     → validateDataset   (code)  chặn sớm dữ liệu hỏng
 *     → mapCase           (code)  fact đã xác minh, 0% bịa
 *     → enrichContext     (AI)    số liệu suy ra + đánh giá mức độ + lỗ hổng dữ liệu
 *     → diagnoseIndep…    (AI)    ⭐ chẩn đoán MÙ — tự tìm root cause, không thấy đáp án
 *     → generateReport    (AI)    narrative D1-D8 + hai bản tóm tắt
 *     → postProcess       (code)  lưới an toàn cuối cùng
 *
 * Lỗi được ném lên tầng service, không nuốt ở đây — tầng trên cần biết để ghi
 * `errorMessage` và đặt status `Failed`. Một pipeline âm thầm trả về báo cáo
 * rỗng còn tệ hơn một pipeline báo lỗi.
 */

import cds from '@sap/cds';
import { complete, resolveModel } from '../../core/ai/llmClient';
import { blockingIssues, qualityIssues, validateDataset } from './datasetValidator';
import { mapCase } from './caseMapper';
import {
    BUDGET,
    EIGHT_D_SCHEMA,
    ENRICHMENT_SCHEMA,
    type ContextEnrichment,
} from './schemas';
import {
    ENRICHMENT_SYSTEM_PROMPT,
    buildEightDPrompt,
    buildEightDSystemPrompt,
    buildEnrichmentPrompt,
} from './prompts';
import { getDisciplineGuide, getStepPromptRuntimeConfig } from './precedent/configRepository';
import { findPrecedents, type Precedent } from './precedent/findPrecedents';
import { callAndParse } from './jsonExtract';
import { postProcess } from './postProcess';
import {
    buildFlexibleResponseSchema,
    buildRuntimeSources,
    normalizeStepConfig,
    setPath,
    syncLegacyFields,
    validateFlexibleResult,
    type RuntimeStepConfig,
} from './runtimeConfig';
import { auditBlindEvidence, buildBlindEvidence } from './blindEvidence';
import {
    INDEPENDENT_SCHEMA,
    INDEPENDENT_SYSTEM_PROMPT,
    buildIndependentPrompt,
    compareWithRecorded,
    normalizeFinding,
    type IndependentAnalysis,
    type IndependentFinding,
} from './independentAnalysis';
import {
    PipelineError,
    type AnalyzeOutcome,
    type CaseContext,
    type EightDResult,
} from './types';

const LOG = cds.log('eightd');

const ACTIVITY_PARSE = 'parseData';
const ACTIVITY_ANALYZE = 'analyzeDefect';
const ACTIVITY_STRUCTURE = 'analyzeDefectStructuredFields';
/** Chẩn đoán mù dùng activity riêng để admin chỉnh model/budget độc lập. */
const ACTIVITY_DIAGNOSE = 'reviewQuality';

// ─────────────────────────────────────────────────────────────────────────────
// Bước AI 1 — làm giàu ngữ cảnh
// ─────────────────────────────────────────────────────────────────────────────

async function enrichContext(
    raw: unknown,
    context: CaseContext,
): Promise<{ enrichment: ContextEnrichment; tokens: number }> {
    let tokens = 0;

    const { value } = await callAndParse<ContextEnrichment>(ACTIVITY_PARSE, async (repairHint) => {
        const res = await complete(
            [
                { role: 'system', content: ENRICHMENT_SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: repairHint
                        ? `${buildEnrichmentPrompt(raw, context)}\n\n## CORRECTION\n${repairHint}`
                        : buildEnrichmentPrompt(raw, context),
                },
            ],
            {
                activity: ACTIVITY_PARSE,
                temperature: 0,
                max_tokens: BUDGET.parse.maxTokens,
                thinkingBudget: BUDGET.parse.thinkingBudget,
                responseMimeType: 'application/json',
                responseSchema: ENRICHMENT_SCHEMA as unknown as Record<string, unknown>,
            },
        );
        tokens += res.usage?.totalTokens ?? 0;
        return { content: res.content, finishReason: res.finishReason };
    });

    return { enrichment: value, tokens };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bước AI 2 — chẩn đoán mù
//
// Model chỉ thấy bằng chứng thô; chuỗi 5-Why, đáp án root cause, action khắc
// phục và FMEA đều bị cắt. Nó phải tự suy ra. Đây là bước duy nhất trong pipeline
// mà kết quả KHÔNG THỂ có được bằng cách chép lại input.
// ─────────────────────────────────────────────────────────────────────────────

async function diagnoseIndependently(
    context: CaseContext,
): Promise<{ analysis: IndependentAnalysis; tokens: number }> {
    let tokens = 0;

    const evidence = buildBlindEvidence(context);

    // Kiểm tra ngay tại runtime chứ không chỉ trong test: CaseContext sẽ còn
    // được thêm trường, và một trường mới vô tình mang theo kết luận sẽ âm thầm
    // biến bài kiểm tra độc lập thành trò hề.
    const leaks = auditBlindEvidence(evidence, context);
    if (leaks.length) LOG.warn(`Bằng chứng mù bị rò đáp án: ${leaks.join(' ')}`);

    const { value } = await callAndParse<IndependentFinding>(ACTIVITY_DIAGNOSE, async (repairHint) => {
        const res = await complete(
            [
                { role: 'system', content: INDEPENDENT_SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: repairHint
                        ? `${buildIndependentPrompt(evidence)}\n\n## CORRECTION\n${repairHint}`
                        : buildIndependentPrompt(evidence),
                },
            ],
            {
                activity: ACTIVITY_DIAGNOSE,
                // Đặt 0 để chẩn đoán tất định hết mức có thể. Lưu ý: CDK BỎ QUA
                // temperature với model Claude khi extended thinking đang bật
                // (xem log 'Compat: dropped temperature'), nên với Claude cùng
                // một input vẫn có thể ra chuỗi lập luận khác nhau giữa các lần.
                temperature: 0,
                max_tokens: BUDGET.diagnose.maxTokens,
                thinkingBudget: BUDGET.diagnose.thinkingBudget,
                responseMimeType: 'application/json',
                responseSchema: INDEPENDENT_SCHEMA as unknown as Record<string, unknown>,
            },
        );
        tokens += res.usage?.totalTokens ?? 0;
        return { content: res.content, finishReason: res.finishReason };
    });

    const finding = normalizeFinding(value);
    const verdict = compareWithRecorded(finding, context);

    LOG.info(
        `Chẩn đoán độc lập: AI chọn ${verdict.aiCategory}, kỹ sư ghi ${verdict.recordedCategory} ` +
        `→ ${verdict.agrees ? 'TRÙNG' : 'LỆCH'} (confidence ${Math.round(finding.confidence * 100)}%)`,
    );

    return { analysis: { finding, verdict, leaks }, tokens };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bước AI 3 — sinh báo cáo
// ─────────────────────────────────────────────────────────────────────────────

async function generateReport(
    context: CaseContext,
    enrichment: ContextEnrichment,
    independent: IndependentAnalysis,
    precedents: Precedent[],
): Promise<{
    result: EightDResult;
    tokens: number;
    configs: Partial<Record<import('./types').DisciplineCode, RuntimeStepConfig>>;
    inputs: Partial<Record<import('./types').DisciplineCode, Record<string, unknown>>>;
    diagnostics: Partial<Record<import('./types').DisciplineCode, unknown[]>>;
}> {
    let tokens = 0;

    // Hướng dẫn từng discipline admin chỉnh trên UI. Bảng rỗng ⇒ dùng hằng số
    // trong `prompts.ts`, tức là prompt y như cũ.
    const configurableCodes = ['D1', 'D2', 'D3', 'D4'] as const;
    const configs = Object.fromEntries(await Promise.all(configurableCodes.map(async (code) => [code, await getStepPromptRuntimeConfig(code)] as const)));
    const effectiveConfigs = Object.fromEntries(configurableCodes.flatMap((code) => {
        const config = configs[code];
        if (!config) return [];
        try {
            normalizeStepConfig(code, config);
            return [[code, config]];
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.startsWith('Data Schema and Form Editor fields must match.')) throw error;
            // A prior release persisted the new Form Editor beside the old Data Schema.
            // Trust the visible form contract until startup migration repairs the row.
            return [[code, { ...config, inputSchemaJson: '' }]];
        }
    })) as typeof configs;
    const normalizedConfigs = Object.fromEntries(configurableCodes.flatMap((code) => {
        const config = effectiveConfigs[code];
        return config ? [[code, normalizeStepConfig(code, config)]] : [];
    })) as Partial<Record<import('./types').DisciplineCode, RuntimeStepConfig>>;
    const runtimeSources = buildRuntimeSources(context, enrichment, independent, precedents);
    const resolved = Object.fromEntries(Object.keys(normalizedConfigs).map((code) => [code, { input: runtimeSources, diagnostics: [] }]));
    const configuredConstraints = Object.fromEntries(configurableCodes.flatMap((code) => {
        const json = effectiveConfigs[code]?.constraintsJson; if (!json) return [];
        try { return (JSON.parse(json) as { enabled?: boolean }).enabled === false ? [] : [[code, json]]; } catch { return []; }
    }));
    const systemPrompt = buildEightDSystemPrompt(
        await getDisciplineGuide(),
        configuredConstraints,
    );
    const inputSchemas = Object.fromEntries(configurableCodes.flatMap((code) => effectiveConfigs[code]?.inputSchemaJson ? [[code, effectiveConfigs[code]!.inputSchemaJson]] : []));
    const formSchemas = Object.fromEntries(configurableCodes.flatMap((code) => effectiveConfigs[code]?.formSchemaJson ? [[code, effectiveConfigs[code]!.formSchemaJson]] : []));

    const responseSchema = buildFlexibleResponseSchema(normalizedConfigs);
    let { value } = await callAndParse<EightDResult>(ACTIVITY_ANALYZE, async (repairHint) => {
        const res = await complete(
            [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: repairHint
                        ? `${buildEightDPrompt(context, enrichment, independent, precedents, inputSchemas, formSchemas)}\n\n## CORRECTION\n${repairHint}`
                        : buildEightDPrompt(context, enrichment, independent, precedents, inputSchemas, formSchemas),
                },
            ],
            {
                activity: ACTIVITY_ANALYZE,
                temperature: 0.2,
                max_tokens: BUDGET.analyze.maxTokens,
                thinkingBudget: BUDGET.analyze.thinkingBudget,
                responseMimeType: 'application/json',
                responseSchema,
            },
        );
        tokens += res.usage?.totalTokens ?? 0;
        return { content: res.content, finishReason: res.finishReason };
    });

    const configuredFieldContracts = Object.entries(normalizedConfigs).flatMap(([code, config]) =>
        config?.formSchema?.fields.map((field) => ({ code, path: field.key, type: field.type, label: field.label, required: Boolean(field.constraints.required), items: field.items, properties: field.properties })) ?? [],
    );
    if (configuredFieldContracts.length) {
        const structuredSchema = {
            type: 'object',
            properties: {
                fields: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            code: { type: 'string', enum: configurableCodes },
                            path: { type: 'string' },
                            valueJson: { type: 'string' },
                        },
                        required: ['code', 'path', 'valueJson'],
                    },
                },
            },
            required: ['fields'],
        };
        const structured = await callAndParse<{ fields: Array<{ code: string; path: string; valueJson: string }> }>(ACTIVITY_STRUCTURE, async (repairHint) => {
            const res = await complete([
                {
                    role: 'system',
                    content: 'Convert a grounded 8D narrative into configured form fields. Return one entry for every contract field. valueJson must be a JSON-encoded value of the requested type. Use only the supplied verified context and narrative. When evidence is incomplete, write an explicit recommendation or gap; never invent a person, measurement, date, identifier, or completed action.',
                },
                {
                    role: 'user',
                    content: JSON.stringify({
                        contracts: configuredFieldContracts,
                        verifiedContext: runtimeSources,
                        report: value.disciplines.filter((discipline) => configurableCodes.includes(discipline.code as typeof configurableCodes[number])),
                        correction: repairHint || undefined,
                    }),
                },
            ], {
                activity: ACTIVITY_ANALYZE,
                temperature: 0,
                max_tokens: BUDGET.analyze.maxTokens,
                thinkingBudget: BUDGET.analyze.thinkingBudget,
                responseMimeType: 'application/json',
                responseSchema: structuredSchema,
            });
            tokens += res.usage?.totalTokens ?? 0;
            return { content: res.content, finishReason: res.finishReason };
        });
        const allowedPaths = new Map(configuredFieldContracts.map((field) => [`${field.code}:${field.path}`, field]));
        for (const field of structured.value.fields ?? []) {
            if (!allowedPaths.has(`${field.code}:${field.path}`)) continue;
            const discipline = value.disciplines.find((item) => item.code === field.code);
            if (!discipline) continue;
            try {
                setPath(discipline.data ??= {}, field.path, JSON.parse(field.valueJson));
            } catch {
                LOG.warn(`Structured AI field ${field.code}.${field.path} returned invalid valueJson.`);
            }
        }
    }

    for (const discipline of value.disciplines ?? []) syncLegacyFields(discipline);
    const errors = (value.disciplines ?? []).flatMap((discipline) => {
        const config = normalizedConfigs[discipline.code];
        return config
            ? validateFlexibleResult(discipline, config, resolved[discipline.code]?.input ?? {})
                .filter((item) => item.severity === 'error')
                .map((item) => ({ code: discipline.code, ...item }))
            : [];
    });
    if (errors.length) {
        const configuredData = new Map(value.disciplines.map((discipline) => [discipline.code, discipline.data]));
        const repaired = await callAndParse<EightDResult>(`${ACTIVITY_ANALYZE}-configured-repair`, async (repairHint) => {
            const res = await complete([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `${buildEightDPrompt(context, enrichment, independent, precedents, inputSchemas, formSchemas)}\n\n## CONFIGURATION VALIDATION ERRORS\n${JSON.stringify(errors, null, 2)}\nReturn the complete corrected report.${repairHint ? `\n${repairHint}` : ''}` },
            ], { activity: ACTIVITY_ANALYZE, temperature: 0, max_tokens: BUDGET.analyze.maxTokens, thinkingBudget: BUDGET.analyze.thinkingBudget, responseMimeType: 'application/json', responseSchema });
            tokens += res.usage?.totalTokens ?? 0;
            return { content: res.content, finishReason: res.finishReason };
        });
        value = repaired.value;
        for (const discipline of value.disciplines ?? []) {
            // The narrative repair schema intentionally keeps data open to avoid
            // Gemini's serving-state limit, so it must not erase structured output.
            discipline.data = configuredData.get(discipline.code) ?? discipline.data ?? {};
            syncLegacyFields(discipline);
        }
    }
    return {
        result: value,
        tokens,
        configs: normalizedConfigs,
        inputs: Object.fromEntries(Object.entries(resolved).map(([code, item]) => [code, item.input])),
        diagnostics: Object.fromEntries(Object.entries(resolved).map(([code, item]) => [code, item.diagnostics])),
    };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chạy trọn pipeline trên một payload Golden Dataset.
 *
 * @throws {PipelineError} 400 khi payload hỏng, 502 khi model trả về thứ không dùng được
 */
export async function analyze(rawJson: string): Promise<AnalyzeOutcome> {
    const started = Date.now();

    let raw: unknown;
    try {
        raw = JSON.parse(rawJson);
    } catch (e: any) {
        throw new PipelineError(`Payload không phải JSON hợp lệ: ${e.message}`, 400);
    }

    // ── Chặn sớm ──
    const issues = validateDataset(raw);
    const blocking = blockingIssues(issues);
    if (blocking.length) {
        throw new PipelineError(
            `Dataset vi phạm ${blocking.length} ràng buộc toàn vẹn.`,
            400,
            blocking.map((i) => `[${i.constraintId}] ${i.message}`),
        );
    }
    // Cảnh báo chất lượng KHÔNG chặn. Chúng chảy vào `gaps` và được gửi thẳng
    // cho model — biết dữ liệu mỏng ở đâu thì nó hạ độ tự tin cho đúng chỗ,
    // thay vì viết một báo cáo tự tin trên nền dữ liệu khuyết.
    const warnings = qualityIssues(issues);
    if (warnings.length) {
        LOG.info(`Dataset có ${warnings.length} vấn đề chất lượng — chuyển cho model làm ngữ cảnh.`);
    }

    // ── Facts ──
    const context = mapCase(raw);
    for (const w of warnings) context.gaps.push(`${w.constraintId}: ${w.message}`);

    LOG.info(
        `Case ${context.notificationId} (${context.origin}) — ` +
        `${context.fiveWhy.length} bước 5-Why, ${context.gaps.length} lỗ hổng dữ liệu`,
    );

    // ── AI ──
    const { enrichment, tokens: parseTokens } = await enrichContext(raw, context);

    // Chẩn đoán mù chạy TRƯỚC bước viết báo cáo và trên bộ input đã bị cắt đáp
    // án. Kết luận của nó được đưa vào bước sau để D4 nêu được cả hai góc nhìn.
    const { analysis: independent, tokens: diagnoseTokens } = await diagnoseIndependently(context);

    // ── Tiền lệ ──
    // Chạy TRƯỚC bước viết báo cáo và độc lập với nó: đây là 100% code, và khi
    // case mới chưa có điều tra gì thì nó là nguồn duy nhất để D1/D3/D5/D7 dựa
    // vào thay vì nói chung chung.
    //
    // Hỏng thì đi tiếp với danh sách rỗng — mất phần gợi ý theo tiền lệ vẫn còn
    // cả báo cáo, đổi cả lượt phân tích lấy một sự cố truy vấn là quá đắt.
    let precedents: Precedent[] = [];
    try {
        const found = await findPrecedents(context);
        precedents = found.precedents;
        LOG.info(
            found.precedents.length
                ? `Tiền lệ: ${found.precedents.map((p) => `${p.notificationId} ${p.score}/${p.maxScore}`).join(', ')}`
                : `Không có tiền lệ — ${found.reason}`,
        );
    } catch (e: any) {
        LOG.warn(`Tìm tiền lệ thất bại, viết báo cáo không có tiền lệ: ${e.message}`);
    }

    const {
        result: rawResult,
        tokens: analyzeTokens,
        configs: runtimeConfigs,
        inputs: runtimeInputs,
        diagnostics: inputDiagnostics,
    } =
        await generateReport(context, enrichment, independent, precedents);

    // ── Lưới an toàn ──
    const constraintConfigs = Object.fromEntries((await Promise.all(['D1', 'D2', 'D3', 'D4'].map(async (code) => [code, await getStepPromptRuntimeConfig(code)] as const))).flatMap(([code, config]) => {
        if (!config?.constraintsJson) return [];
        try { return (JSON.parse(config.constraintsJson) as { enabled?: boolean }).enabled === false ? [] : [[code, config.constraintsJson]]; } catch { return []; }
    }));
    const { result, repairs } = postProcess(
        rawResult,
        context,
        enrichment,
        independent,
        precedents,
        constraintConfigs,
    );
    if (repairs.length) LOG.warn(`postProcess phải chữa ${repairs.length} chỗ:`, repairs);

    const [parseModel, analyzeModel] = await Promise.all([
        resolveModel(ACTIVITY_PARSE),
        resolveModel(ACTIVITY_ANALYZE),
    ]);

    const runtime = Object.fromEntries(result.disciplines.flatMap((discipline) => {
        const config = runtimeConfigs[discipline.code];
        if (!config?.formSchema) return [];
        const violations = validateFlexibleResult(discipline, config, runtimeInputs[discipline.code] ?? {});
        return [[discipline.code, {
            resultJson: JSON.stringify(discipline.data ?? {}),
            formSchemaJson: JSON.stringify(config.formSchema),
            validationJson: JSON.stringify({ version: 1, violations, inputDiagnostics: inputDiagnostics[discipline.code] ?? [], repairs }),
            configVersion: config.configVersion,
        }]];
    }));

    return {
        context,
        result,
        independent,
        models: { parse: parseModel, analyze: analyzeModel },
        tokensUsed: parseTokens + diagnoseTokens + analyzeTokens,
        durationMs: Date.now() - started,
        repairs,
        runtime,
    };
}
