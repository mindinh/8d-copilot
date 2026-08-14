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
import { getDisciplineGuide } from './precedent/configRepository';
import { findPrecedents, type Precedent } from './precedent/findPrecedents';
import { callAndParse } from './jsonExtract';
import { postProcess } from './postProcess';
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
): Promise<{ result: EightDResult; tokens: number }> {
    let tokens = 0;

    // Hướng dẫn từng discipline admin chỉnh trên UI. Bảng rỗng ⇒ dùng hằng số
    // trong `prompts.ts`, tức là prompt y như cũ.
    const systemPrompt = buildEightDSystemPrompt(await getDisciplineGuide());

    const { value } = await callAndParse<EightDResult>(ACTIVITY_ANALYZE, async (repairHint) => {
        const res = await complete(
            [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: repairHint
                        ? `${buildEightDPrompt(context, enrichment, independent, precedents)}\n\n## CORRECTION\n${repairHint}`
                        : buildEightDPrompt(context, enrichment, independent, precedents),
                },
            ],
            {
                activity: ACTIVITY_ANALYZE,
                temperature: 0.2,
                max_tokens: BUDGET.analyze.maxTokens,
                thinkingBudget: BUDGET.analyze.thinkingBudget,
                responseMimeType: 'application/json',
                responseSchema: EIGHT_D_SCHEMA as unknown as Record<string, unknown>,
            },
        );
        tokens += res.usage?.totalTokens ?? 0;
        return { content: res.content, finishReason: res.finishReason };
    });

    return { result: value, tokens };
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

    const { result: rawResult, tokens: analyzeTokens } =
        await generateReport(context, enrichment, independent, precedents);

    // ── Lưới an toàn ──
    const { result, repairs } = postProcess(rawResult, context, enrichment, independent, precedents);
    if (repairs.length) LOG.warn(`postProcess phải chữa ${repairs.length} chỗ:`, repairs);

    const [parseModel, analyzeModel] = await Promise.all([
        resolveModel(ACTIVITY_PARSE),
        resolveModel(ACTIVITY_ANALYZE),
    ]);

    return {
        context,
        result,
        independent,
        models: { parse: parseModel, analyze: analyzeModel },
        tokensUsed: parseTokens + diagnoseTokens + analyzeTokens,
        durationMs: Date.now() - started,
        repairs,
    };
}
