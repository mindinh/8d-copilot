/**
 * Giá trị mặc định cho cấu hình truy hồi.
 *
 * ── Vì sao KHÔNG dùng CSV trong `db/data/` ──
 * CAP dịch CSV thành `.hdbtabledata` và HDI ghi đè toàn bộ bảng ở MỖI lần deploy.
 * Với dữ liệu tham chiếu bất biến thì hợp lý; với bảng admin chỉnh trên UI thì
 * đó là mất dữ liệu: chỉnh trọng số hôm nay, deploy ngày mai là về mặc định mà
 * không ai được báo.
 *
 * Nên seed bằng code lúc khởi động và CHỈ khi bảng rỗng. DB mới (kể cả HDI trên
 * CF) tự có mặc định; deploy lại giữ nguyên phần đã chỉnh.
 *
 * Trọng số dưới đây lấy nguyên văn từ `docs/AI Requirements - 8D Copilot POC.md`
 * mục 2. Sửa ở đây là sửa hành vi đã được acceptance criteria chốt.
 */

import type { Criterion } from './scoring';
import { DEFAULT_DISCIPLINE_GUIDE } from '../prompts';

export const DEFAULT_CRITERIA: readonly (Criterion & {
    description: string;
    sourceTable: string;
})[] = Object.freeze([
    Object.freeze({
        criterionKey: 'workCenter',
        label: 'Work center',
        description:
            'Same production line or machine group. The strongest single signal for D1: '
            + 'who has worked this equipment before is a question about identity, not about wording.',
        sourceTable: 'HistoricalCases · GD 4 WorkCenters',
        sourceField: 'workCenterId',
        matchType: 'exact',
        weight: 4,
        fallbackField: null,
        fallbackMatch: null,
        fallbackWeight: null,
        enabled: true,
        sortOrder: 10,
    }),
    Object.freeze({
        criterionKey: 'defectCode',
        label: 'Defect code',
        description:
            'Same catalogued defect. Falls back to shared keywords in the defect text when the '
            + 'codes differ — two plants often catalogue the same failure under different codes.',
        sourceTable: 'HistoricalCases · GD 3 Defects',
        sourceField: 'defectCode',
        matchType: 'exact',
        weight: 4,
        fallbackField: 'defectKeywords',
        fallbackMatch: 'keyword',
        fallbackWeight: 2,
        enabled: true,
        sortOrder: 20,
    }),
    Object.freeze({
        criterionKey: 'material',
        label: 'Material',
        description:
            'Same part number. Falls back to the same material group when the parts differ but '
            + 'belong to one family.',
        sourceTable: 'HistoricalCases · GD 1 Materials',
        sourceField: 'materialId',
        matchType: 'exact',
        weight: 3,
        fallbackField: 'materialFamily',
        fallbackMatch: 'family',
        fallbackWeight: 1,
        enabled: true,
        sortOrder: 30,
    }),
    Object.freeze({
        criterionKey: 'semantic',
        label: 'Similar description',
        description:
            'Semantic similarity between the two case narratives, from an embedding of the defect, '
            + 'the investigation findings and the causal chain. This is the only criterion that can '
            + 'connect two cases whose work centre, part and defect code all differ — the case where '
            + 'the same failure was written up in different words.',
        sourceTable: 'HistoricalCases.searchText (embedding)',
        sourceField: 'embedding',
        matchType: 'cosine',

        /**
         * Trọng số 5 — ngang một lần trùng work center (4).
         *
         * Với sàn 0.70, một case chỉ giống về ngữ nghĩa ăn 5 × 0.70 = 3.5 điểm,
         * vừa đủ vượt ngưỡng 3. Thấp hơn thì tiêu chí này không bao giờ tự đưa
         * nổi một case vào danh sách, tức là có cũng như không.
         */
        weight: 5,
        fallbackField: null,
        fallbackMatch: null,
        fallbackWeight: null,

        /**
         * Sàn 0.70, chọn theo SỐ ĐO chứ không theo cảm giác.
         *
         * `npx tsx scripts/measure-similarity.mjs` trên 78 cặp của kho hiện tại:
         *
         *     thấp nhất 0.543 · p25 0.608 · trung vị 0.636 · p75 0.687 · cao nhất 0.792
         *
         * Nền cao như vậy vì mọi case đều là văn bản lỗi sản xuất tiếng Anh cùng
         * khuôn — chúng giống nhau sẵn ~0.6 mà chẳng liên quan gì tới nhau. Sàn
         * 0.55 sẽ cho điểm 77/78 cặp và thứ hạng bị nhiễu nền chi phối.
         *
         * 0.70 nằm trên p75, giữ lại đúng nhóm đầu. Đổi công thức ghép
         * `searchText` hoặc đổi model nhúng ⇒ ĐO LẠI, vì phân bố sẽ khác.
         */
        minSimilarity: 0.70,
        enabled: true,
        sortOrder: 40,
    }),
]);

export const DEFAULT_RETRIEVAL_SETTINGS = Object.freeze({
    ID: 'GLOBAL',
    minScore: 3,
    topN: 3,
    closedOnly: true,
});

/**
 * Tám dòng hướng dẫn discipline, seed bằng CHÍNH nội dung đang chạy.
 *
 * ── Vì sao seed nội dung thật thay vì để trống ──
 * Bản đầu để trống, với lý do "trống = dùng hằng số trong code, tránh hai bản
 * sao lệch nhau". Đúng về mặt kỹ thuật nhưng vô dụng trên thực tế: người dùng
 * mở UI thấy tám ô rỗng, không biết prompt hiện tại viết gì, và muốn chỉnh một
 * câu thì phải đi lục `prompts.ts` rồi chép sang.
 *
 * Nỗi lo lệch bản vẫn còn thật, và được xử bằng nút "Reset all steps": nó xoá
 * dòng rồi seed lại từ `DEFAULT_DISCIPLINE_GUIDE`, tức là kéo bản trong DB về
 * đúng bản trong code bất cứ lúc nào.
 *
 * Nguồn duy nhất vẫn là `DEFAULT_DISCIPLINE_GUIDE` — ở đây chỉ tham chiếu tới
 * nó, không chép lại text.
 */
const structuredField = (key: string, label: string, widget: string, dataType: string, colSpan: number, constraints: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ key, label, widget, dataType, colSpan, constraints, ...extra });
const group = (id: string, label: string, fieldKeys: string[], width: string, order: number) => ({ id, label, fieldKeys, width, columns: 12, order });

const D1_FORM_SCHEMA = JSON.stringify({ fields: [
    structuredField('team.objective', 'Team objective', 'callout', 'string', 12, { required: true, minLength: 20, maxLength: 500 }),
    structuredField('team.selectionMethod', 'Selection method', 'status', 'string', 4, { required: true, enum: ['Current case team', 'Precedent recommendation', 'Hybrid', 'Roles only - assignment required'] }),
    structuredField('team.problemCapabilities', 'Capabilities required by this problem', 'tag-selector', 'array', 8, { required: true, minItems: 1 }, { items: { type: 'string' } }),
    structuredField('team.selectionRationale', 'How the team was selected', 'markdown', 'string', 12, { required: true, minLength: 60, maxLength: 1600 }),
    structuredField('team.roster', 'Assigned team and decision trace', 'table', 'array', 12, { required: true, minItems: 1 }, { items: { type: 'object', properties: { name: { type: 'string' }, organizationalRole: { type: 'string' }, assigned8DRole: { type: 'string' }, caseResponsibility: { type: 'string' }, selectionReason: { type: 'string' }, sourceType: { type: 'string', enum: ['current_case', 'precedent', 'unassigned'] }, sourcePath: { type: 'string' }, sourceCase: { type: 'string' } }, required: ['name', 'organizationalRole', 'assigned8DRole', 'caseResponsibility', 'selectionReason', 'sourceType', 'sourcePath'] } }),
    structuredField('team.readinessStatus', 'Team readiness', 'status', 'string', 3, { required: true, enum: ['Ready', 'Partial', 'Needs assignment'] }),
    structuredField('team.readinessRationale', 'Readiness assessment', 'markdown', 'string', 9, { required: true, minLength: 30, maxLength: 800 }),
    structuredField('team.uncoveredCapabilities', 'Uncovered capabilities', 'warning-list', 'array', 6, {}, { items: { type: 'string' } }),
    structuredField('team.sourceSummary', 'Where the team recommendation came from', 'markdown', 'string', 6, { required: true, minLength: 30, maxLength: 800 }),
    structuredField('sources', 'Source records', 'evidence-list', 'array', 12, { pattern: '^(team\\.|precedents#)' }, { items: { type: 'string' } }),
], groups: [
    group('d1-ai-result', 'AI-generated team recommendation', ['team.objective', 'team.selectionMethod', 'team.problemCapabilities', 'team.selectionRationale', 'team.roster', 'team.readinessStatus', 'team.readinessRationale', 'team.uncoveredCapabilities', 'team.sourceSummary', 'sources'], '100', 10),
] }, null, 2);

const D2_FORM_SCHEMA = JSON.stringify({ fields: [
    structuredField('problem.statement', 'Problem statement', 'callout', 'string', 12, { required: true, minLength: 30, maxLength: 600 }),
    ...[['what', 'What'], ['where', 'Where'], ['when', 'When'], ['who', 'Who / affected party'], ['extent', 'Extent'], ['impact', 'Business / customer impact']].map(([key, label]) => structuredField(`problem.${key}`, label, 'text', 'string', 4, ['what', 'where', 'extent'].includes(key) ? { required: true } : {})),
    structuredField('problem.is', 'Is', 'positive-list', 'array', 6, {}, { items: { type: 'string' } }), structuredField('problem.isNot', 'Is not', 'negative-list', 'array', 6, {}, { items: { type: 'string' } }),
    structuredField('problem.measuredEvidence', 'Measured evidence', 'table', 'array', 12, {}, { items: { type: 'object', properties: { characteristic: { type: 'string' }, measured: { type: 'string' }, specification: { type: 'string' }, assessment: { type: 'string' } } } }),
    structuredField('problem.gaps', 'Missing facts', 'warning-list', 'array', 12, {}, { items: { type: 'string' } }), structuredField('sources', 'Evidence and traceability', 'evidence-list', 'array', 12, {}, { items: { type: 'string' } }),
], groups: [group('d2-ai-result', 'AI-generated problem description', ['problem.statement', 'problem.what', 'problem.where', 'problem.when', 'problem.who', 'problem.extent', 'problem.impact', 'problem.is', 'problem.isNot', 'problem.measuredEvidence', 'problem.gaps', 'sources'], '100', 10)] }, null, 2);

const D3_FORM_SCHEMA = JSON.stringify({ fields: [
    structuredField('containment.objective', 'Containment objective', 'callout', 'string', 12, { required: true, maxLength: 500 }),
    structuredField('containment.actions', 'Containment action plan', 'table', 'array', 12, { required: true, minItems: 1 }, { items: { type: 'object', properties: { action: { type: 'string' }, owner: { type: 'string' }, status: { type: 'string' }, protection: { type: 'string' }, origin: { type: 'string' } } } }),
    structuredField('containment.protectionScope', 'Protected scope', 'tag-selector', 'array', 6, {}, { items: { type: 'string' } }), structuredField('containment.recommendationBasis', 'Why these actions are appropriate', 'markdown', 'string', 6, { required: true, minLength: 30 }),
    structuredField('containment.gaps', 'Open containment gaps', 'warning-list', 'array', 12, {}, { items: { type: 'string' } }), structuredField('sources', 'Evidence and traceability', 'evidence-list', 'array', 12, {}, { items: { type: 'string' } }),
], groups: [group('d3-ai-result', 'AI-generated containment plan', ['containment.objective', 'containment.actions', 'containment.protectionScope', 'containment.recommendationBasis', 'containment.gaps', 'sources'], '100', 10)] }, null, 2);

const D4_FORM_SCHEMA = JSON.stringify({ fields: [
    structuredField('rootCause.statement', 'Root cause conclusion', 'callout', 'string', 9, { required: true, minLength: 30, maxLength: 800 }), structuredField('rootCause.category', '6M category', 'status', 'string', 3, { required: true, enum: ['Man', 'Machine', 'Method', 'Material', 'Measurement', 'Environment'] }),
    structuredField('rootCause.fiveWhy', '5-Why chain', 'table', 'array', 12, { required: true, minItems: 1 }, { items: { type: 'object', properties: { step: { type: 'integer' }, why: { type: 'string' }, answer: { type: 'string' }, evidence: { type: 'string' } } } }), structuredField('rootCause.contributingFactors', 'Contributing factors', 'tag-selector', 'array', 12, {}, { items: { type: 'string' } }),
    structuredField('rootCause.independentVerification.verdict', 'Independent verification', 'status', 'string', 4, { required: true, enum: ['Agrees', 'Partially agrees', 'Disagrees', 'Insufficient evidence'] }), structuredField('rootCause.independentVerification.aiFinding', 'Independent AI finding', 'text', 'string', 4, { required: true }), structuredField('rootCause.independentVerification.recordedFinding', 'Recorded finding', 'text', 'string', 4), structuredField('rootCause.independentVerification.rationale', 'Verification rationale', 'markdown', 'string', 12, { required: true, minLength: 30 }),
    structuredField('rootCause.evidenceGaps', 'Evidence gaps', 'warning-list', 'array', 12, {}, { items: { type: 'string' } }), structuredField('sources', 'Evidence and traceability', 'evidence-list', 'array', 12, {}, { items: { type: 'string' } }),
], groups: [group('d4-ai-result', 'AI-generated root cause analysis', ['rootCause.statement', 'rootCause.category', 'rootCause.fiveWhy', 'rootCause.contributingFactors', 'rootCause.independentVerification.verdict', 'rootCause.independentVerification.aiFinding', 'rootCause.independentVerification.recordedFinding', 'rootCause.independentVerification.rationale', 'rootCause.evidenceGaps', 'sources'], '100', 10)] }, null, 2);

function outputDataSchemaFromForm(formSchemaJson: string): string {
    const form = JSON.parse(formSchemaJson) as { fields: Array<{ key: string; label?: string; dataType?: string; items?: unknown; properties?: unknown; constraints?: { required?: boolean; enum?: unknown[] } }> };
    const schema: { type: 'object'; properties: Record<string, Record<string, unknown>>; required: string[]; additionalProperties: false } = { type: 'object', properties: {}, required: [], additionalProperties: false };
    for (const field of form.fields) {
        schema.properties[field.key] = { type: field.dataType ?? 'string', title: field.label, description: 'Generated by the 8D AI from verified case context.', 'x-source': 'ai_enrichment', items: field.items, properties: field.properties, enum: field.constraints?.enum };
        if (field.constraints?.required) schema.required.push(field.key);
    }
    return JSON.stringify(schema, null, 2);
}

const STRUCTURED_CONFIG_OVERRIDES: Record<string, { description: string; combinedPrompt: string; inputSchemaJson: string; formSchemaJson: string; constraintsJson?: string }> = {
    D1: { description: 'Build an explainable cross-functional team with per-member responsibilities, selection reasons, and source traceability.', combinedPrompt: ['Determine the capabilities required by the actual defect before selecting people.', 'Set selectionMethod to exactly one allowed value: Current case team, Precedent recommendation, Hybrid, or Roles only - assignment required.', 'Prefer identities from team.leader and team.members. Use precedents#N.team only to cover a capability missing from the current team.', 'For every roster row separate organizationalRole, assigned8DRole, and caseResponsibility. Do not put a job title in caseResponsibility.', 'For every roster row explain selectionReason and provide sourceType, sourcePath, and sourceCase when applicable.', 'sourcePath must resolve to team.leader, team.members#N, or precedents#N.team#M. Never invent a person.', 'If a required role has no grounded person, use name Unassigned, sourceType unassigned, sourcePath team.gaps, and readinessStatus Needs assignment.', 'Set readinessStatus to exactly Ready, Partial, or Needs assignment. Put the explanation only in readinessRationale.', 'Explain the mix of current-case and precedent sources in sourceSummary, and list all supporting paths in sources.'].join('\n'), inputSchemaJson: outputDataSchemaFromForm(D1_FORM_SCHEMA), formSchemaJson: D1_FORM_SCHEMA, constraintsJson: JSON.stringify({ enabled: true, rules: [{ id: 'D1_GROUNDING', type: 'sourcePattern', severity: 'error', enabled: true, pattern: '^(team\\.|precedents#)', message: 'Team identities must come from the current team or a cited precedent.' }, { id: 'D1_DATA_BACKED', type: 'dataBackedWhenInputPresent', severity: 'warning', enabled: true, inputFields: ['teamMembers', 'precedentTeams'], message: 'No current or precedent team data supports this assignment.' }] }, null, 2) },
    D2: { description: 'Describe the problem as structured 5W2H, Is/Is-Not, measurements, and explicit gaps.', combinedPrompt: ['Populate separate fields for statement, What, Where, When, Who, extent, and impact.', 'Return measured evidence as table rows.', 'Use verified facts only and expose missing facts in problem.gaps.', 'Do not hide all 5W2H information inside one narrative field.'].join('\n'), inputSchemaJson: outputDataSchemaFromForm(D2_FORM_SCHEMA), formSchemaJson: D2_FORM_SCHEMA, constraintsJson: JSON.stringify({ enabled: true, rules: [{ id: 'D2_CITATIONS', type: 'citationRequired', severity: 'error', enabled: true, message: 'D2 requires traceable case evidence.' }, { id: 'D2_SOURCES', type: 'sourcePattern', severity: 'warning', enabled: true, pattern: '^(header|product|inspections|isIsNot|derivedFacts)', message: 'Some D2 evidence is outside the configured problem-data scope.' }] }, null, 2) },
    D3: { description: 'Build a structured containment plan with ownership, protection, origin, rationale, and gaps.', combinedPrompt: ['Return containment.actions as rows with action, owner, status, protection, and origin.', 'Separate protection scope, recommendation basis, and gaps.', 'Distinguish recorded actions from precedent-based proposals.', 'Do not collapse the action plan into one narrative paragraph.'].join('\n'), inputSchemaJson: outputDataSchemaFromForm(D3_FORM_SCHEMA), formSchemaJson: D3_FORM_SCHEMA, constraintsJson: JSON.stringify({ enabled: true, rules: [{ id: 'D3_SOURCES', type: 'sourcePattern', severity: 'error', enabled: true, pattern: '^(actions\\.containment|customer|precedents#)', message: 'Containment actions must be recorded actions or cited proposals.' }, { id: 'D3_DATA_BACKED', type: 'dataBackedWhenInputPresent', severity: 'warning', enabled: true, inputFields: ['actions', 'precedents'], message: 'No current or precedent containment data supports this plan.' }] }, null, 2) },
    D4: { description: 'Show the causal chain, conclusion, contributing factors, independent verification, and evidence gaps.', combinedPrompt: ['Populate a structured conclusion, 5-Why table, contributing factors, and independent verification.', 'Independent verification contains verdict, AI finding, recorded finding, and rationale.', 'Expose evidence gaps separately.', 'Treat precedent causes as hypotheses, not facts.'].join('\n'), inputSchemaJson: outputDataSchemaFromForm(D4_FORM_SCHEMA), formSchemaJson: D4_FORM_SCHEMA, constraintsJson: JSON.stringify({ enabled: true, rules: [{ id: 'D4_DISCLOSURE', type: 'requiredDisclosure', field: 'rootCause.independentVerification.rationale', severity: 'error', enabled: true, pattern: 'agree|disagree|insufficient|evidence', message: 'Independent verification must explain agreement, disagreement, or insufficient evidence.' }, { id: 'D4_SOURCES', type: 'sourcePattern', severity: 'error', enabled: true, pattern: '^(fiveWhy|ishikawa|rootCause|independent|precedents#)', message: 'Root-cause conclusions require traceable causal evidence.' }] }, null, 2) },
};

export const DEFAULT_STEP_PROMPTS: readonly {
    stepCode: string;
    label: string;
    description: string;
    systemPrompt: string;
    inputSchemaJson?: string;
    combinedPrompt?: string;
    formSchemaJson?: string;
    constraintsJson?: string;
}[] = Object.freeze([
    {
        stepCode: 'D1',
        label: 'Establish the Team',
        description: 'Suggest roles and people from the teams of matching precedent cases.',
        systemPrompt: DEFAULT_DISCIPLINE_GUIDE.D1,
        combinedPrompt: [
            'Extract the official team leader and members with their functions.',
            'Explain why the skill mix is appropriate for this problem.',
            'When official team data is missing, recommend people only from matching precedent cases and cite precedents#N.',
            'When neither current team data nor precedents exist, state that manual assignment is required.',
        ].join('\n'),
        inputSchemaJson: JSON.stringify({
            type: 'object',
            properties: {
                teamMembers: { type: 'array', title: 'Team members', description: 'Official team leader and members from the current case.', 'x-source': 'sap_qm', items: { type: 'object', properties: {} } },
                teamSize: { type: 'number', title: 'Team size', description: 'Calculated number of current team members.', 'x-source': 'ai_enrichment' },
                precedentTeams: { type: 'array', title: 'Precedent teams', description: 'Teams from similar completed 8D cases.', 'x-source': 'vector_search', items: { type: 'object', properties: {} } },
            },
            required: [],
            additionalProperties: false,
        }, null, 2),
        formSchemaJson: JSON.stringify({
            fields: [
                { key: 'content', label: 'D1 team recommendation', widget: 'textarea', width: '100%', constraints: { required: true, minLength: 20, maxLength: 1000 } },
                { key: 'sources', label: 'Evidence sources', widget: 'tag-selector', width: '100%', constraints: { pattern: '^(team\\.|precedents#)' } },
                { key: 'confidence', label: 'Confidence', widget: 'input', width: '50%', constraints: { min: 0, max: 100 } },
                { key: 'dataBacked', label: 'Data backed', widget: 'checkbox', width: '50%', constraints: {} },
            ],
            groups: [{ id: 'team', label: 'Team assignment', fieldKeys: ['content', 'sources', 'confidence', 'dataBacked'], width: '100', columns: 2, order: 10 }],
        }, null, 2),
        constraintsJson: JSON.stringify({
            enabled: true,
            rules: [
                { id: 'D1_GROUNDING', name: 'Ground team identities', type: 'sourcePattern', severity: 'error', enabled: true, pattern: '^(team\\.|precedents#)', message: 'Team names must come from the current team or a cited precedent.' },
                { id: 'D1_DATA_BACKED', name: 'Correct data-backed flag', type: 'dataBackedWhenInputPresent', severity: 'warning', enabled: true, inputFields: ['teamMembers', 'precedentTeams'], message: 'Set dataBacked to false when current and precedent team data are both empty.' },
            ],
        }, null, 2),
    },
    {
        stepCode: 'D2', label: 'Describe the Problem', description: 'Draft the problem paragraph and the 5W2H grid from verified case facts.', systemPrompt: DEFAULT_DISCIPLINE_GUIDE.D2,
        combinedPrompt: ['Describe the problem with verified 5W2H facts.', 'Quantify measured-versus-specification differences when values exist.', 'Use Is/Is-Not boundaries and cite every factual statement.', 'Do not invent missing measurements or locations.'].join('\n'),
        inputSchemaJson: JSON.stringify({ type: 'object', properties: {
            header: { type: 'object', title: 'Case header', 'x-source': 'sap_qm', properties: {} },
            product: { type: 'object', title: 'Material and product', 'x-source': 'sap_qm', properties: {} },
            defect: { type: 'object', title: 'Defect details', 'x-source': 'sap_qm', properties: {} },
            inspections: { type: 'array', title: 'Inspection results', 'x-source': 'sap_qm', items: { type: 'object', properties: {} } },
            isIsNot: { type: 'object', title: 'Is / Is-Not analysis', 'x-source': 'manual_input', properties: {} },
            derivedFacts: { type: 'array', title: 'Derived facts', 'x-source': 'ai_enrichment', items: { type: 'string' } },
        }, required: [], additionalProperties: false }, null, 2),
        formSchemaJson: JSON.stringify({ fields: [
            { key: 'summary', label: 'Problem summary', widget: 'textarea', width: '100%', constraints: { required: true, minLength: 20, maxLength: 500 } },
            { key: 'content', label: '5W2H and Is / Is-Not analysis', widget: 'textarea', width: '100%', constraints: { required: true, minLength: 50, maxLength: 2000 } },
            { key: 'sources', label: 'Evidence sources', widget: 'tag-selector', width: '100%', constraints: {} },
            { key: 'confidence', label: 'Confidence', widget: 'input', width: '50%', constraints: { min: 0, max: 1 } },
            { key: 'dataBacked', label: 'Data backed', widget: 'checkbox', width: '50%', constraints: {} },
        ], groups: [{ id: 'problem', label: 'Problem description', fieldKeys: ['summary', 'content', 'sources', 'confidence', 'dataBacked'], width: '100', columns: 2, order: 10 }] }, null, 2),
        constraintsJson: JSON.stringify({ enabled: true, rules: [
            { id: 'D2_CITATIONS', name: 'Require factual citations', type: 'citationRequired', severity: 'error', enabled: true, message: 'Measured values and verified facts require sources.' },
            { id: 'D2_SOURCES', name: 'Use problem evidence', type: 'sourcePattern', severity: 'warning', enabled: true, pattern: '^(header|product|defect|inspections|isIsNot|derivedFacts)', message: 'D2 sources must resolve to problem evidence.' },
        ] }, null, 2),
    },
    {
        stepCode: 'D3', label: 'Interim Containment Actions', description: 'Surface containment actions, or reuse the top precedent when none exist yet.', systemPrompt: DEFAULT_DISCIPLINE_GUIDE.D3,
        combinedPrompt: ['List immediate containment actions with owner and status when recorded.', 'Explain how each action protects the customer or process.', 'If no current action exists, present precedent actions only as proposals and cite precedents#N.', 'Clearly distinguish recorded actions from recommendations.'].join('\n'),
        inputSchemaJson: JSON.stringify({ type: 'object', properties: {
            actions: { type: 'object', title: 'Current actions', 'x-source': 'sap_qm', properties: {} },
            customer: { type: 'object', title: 'Customer impact', 'x-source': 'sap_qm', properties: {} },
            precedents: { type: 'array', title: 'Precedent actions', 'x-source': 'vector_search', items: { type: 'object', properties: {} } },
        }, required: [], additionalProperties: false }, null, 2),
        formSchemaJson: JSON.stringify({ fields: [
            { key: 'summary', label: 'Containment summary', widget: 'textarea', width: '100%', constraints: { required: true, maxLength: 500 } },
            { key: 'content', label: 'Containment action analysis', widget: 'textarea', width: '100%', constraints: { required: true, minLength: 20, maxLength: 2000 } },
            { key: 'actionItems', label: 'Recommended follow-up actions', widget: 'multiSelect', width: '100%', constraints: {} },
            { key: 'sources', label: 'Evidence sources', widget: 'tag-selector', width: '100%', constraints: {} },
            { key: 'confidence', label: 'Confidence', widget: 'input', width: '50%', constraints: { min: 0, max: 1 } },
            { key: 'dataBacked', label: 'Data backed', widget: 'checkbox', width: '50%', constraints: {} },
        ], groups: [{ id: 'containment', label: 'Interim containment', fieldKeys: ['summary', 'content', 'actionItems', 'sources', 'confidence', 'dataBacked'], width: '100', columns: 2, order: 10 }] }, null, 2),
        constraintsJson: JSON.stringify({ enabled: true, rules: [
            { id: 'D3_SOURCES', name: 'Ground containment actions', type: 'sourcePattern', severity: 'error', enabled: true, pattern: '^(actions\.containment|customer|precedents#)', message: 'Containment actions must be recorded actions or cited proposals.' },
            { id: 'D3_DATA_BACKED', name: 'Correct data-backed flag', type: 'dataBackedWhenInputPresent', severity: 'warning', enabled: true, inputFields: ['actions', 'precedents'], message: 'Set dataBacked false when neither current nor precedent actions exist.' },
        ] }, null, 2),
    },
    {
        stepCode: 'D4', label: 'Root Cause Analysis', description: 'Walk the 5-Why chain and weigh it against the independent diagnosis.', systemPrompt: DEFAULT_DISCIPLINE_GUIDE.D4,
        combinedPrompt: ['Walk the recorded 5-Why chain and evaluate Ishikawa 6M evidence.', 'State the confirmed root cause only when supported by evidence.', 'Include an Independent verification section that reports agreement or disagreement with the blind diagnosis.', 'Treat precedent root causes as hypotheses, never as facts for this case.'].join('\n'),
        inputSchemaJson: JSON.stringify({ type: 'object', properties: {
            fiveWhy: { type: 'array', title: '5-Why chain', 'x-source': 'sap_qm', items: { type: 'object', properties: {} } },
            ishikawa: { type: 'array', title: 'Ishikawa findings', 'x-source': 'sap_qm', items: { type: 'object', properties: {} } },
            rootCause: { type: 'object', title: 'Recorded root cause', 'x-source': 'sap_qm', properties: {} },
            independent: { type: 'object', title: 'Independent diagnosis', 'x-source': 'ai_enrichment', properties: {} },
            precedents: { type: 'array', title: 'Precedent root causes', 'x-source': 'vector_search', items: { type: 'object', properties: {} } },
        }, required: [], additionalProperties: false }, null, 2),
        formSchemaJson: JSON.stringify({ fields: [
            { key: 'summary', label: 'Root cause summary', widget: 'textarea', width: '100%', constraints: { required: true, maxLength: 500 } },
            { key: 'content', label: '5-Why, Ishikawa and independent verification', widget: 'textarea', width: '100%', constraints: { required: true, minLength: 50, maxLength: 2500 } },
            { key: 'sources', label: 'Evidence sources', widget: 'tag-selector', width: '100%', constraints: {} },
            { key: 'confidence', label: 'Confidence', widget: 'input', width: '50%', constraints: { min: 0, max: 1 } },
            { key: 'dataBacked', label: 'Data backed', widget: 'checkbox', width: '50%', constraints: {} },
        ], groups: [{ id: 'root-cause', label: 'Root cause analysis', fieldKeys: ['summary', 'content', 'sources', 'confidence', 'dataBacked'], width: '100', columns: 2, order: 10 }] }, null, 2),
        constraintsJson: JSON.stringify({ enabled: true, rules: [
            { id: 'D4_DISCLOSURE', name: 'Independent verification disclosure', type: 'requiredDisclosure', severity: 'error', enabled: true, pattern: 'independent verification', message: 'D4 must disclose agreement or disagreement with the independent diagnosis.' },
            { id: 'D4_SOURCES', name: 'Ground root cause analysis', type: 'sourcePattern', severity: 'error', enabled: true, pattern: '^(fiveWhy|ishikawa|rootCause|independent|precedents#)', message: 'D4 sources must resolve to root-cause evidence.' },
        ] }, null, 2),
    },
    { stepCode: 'D5', label: 'Permanent Corrective Actions', description: 'Tie each corrective action to a step of the root cause chain.' , systemPrompt: DEFAULT_DISCIPLINE_GUIDE.D5 },
    { stepCode: 'D6', label: 'Verify Effectiveness', description: 'Write the verification plan; this dataset carries no verification evidence.' , systemPrompt: DEFAULT_DISCIPLINE_GUIDE.D6 },
    { stepCode: 'D7', label: 'Prevent Recurrence', description: 'Preventive actions and the FMEA entry to update.' , systemPrompt: DEFAULT_DISCIPLINE_GUIDE.D7 },
    { stepCode: 'D8', label: 'Closure and Recognition', description: 'Lessons learned and the completeness gate over D1–D7.' , systemPrompt: DEFAULT_DISCIPLINE_GUIDE.D8 },
].map((row) => ({ ...row, ...(STRUCTURED_CONFIG_OVERRIDES[row.stepCode] ?? {}) })).map((r) => Object.freeze(r)));
