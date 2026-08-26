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
    structuredField('team.roster', 'AI suggest', 'ai-suggest', 'array', 12, { required: true, minItems: 1 }, { items: { type: 'object', properties: { name: { type: 'string' }, organizationalRole: { type: 'string' }, assigned8DRole: { type: 'string' }, caseResponsibility: { type: 'string' }, selectionReason: { type: 'string' }, sourceType: { type: 'string', enum: ['current_case', 'precedent', 'unassigned'] }, sourcePath: { type: 'string' }, sourceCase: { type: 'string' } }, required: ['name', 'organizationalRole', 'assigned8DRole', 'caseResponsibility', 'selectionReason', 'sourceType', 'sourcePath'] } }),
    // Nhom nguoi dung THUC SU chot - do con nguoi nhap, KHONG phai AI sinh.
    //
    // Van phai khai o day vi `normalizeStepConfig` bat Data Schema va Form
    // Editor khop field chinh xac; thieu mot ben la ca cau hinh D1 vo. Nhung
    // `required` de trong: bao cao vua phan tich xong thi chua ai gan nhom, va
    // bat buoc mot field ma quy trinh chua the dien se sinh loi validate gia.
    //
    // `xSource: 'manual_input'` la thu phan biet no voi chin field kia tren Data
    // Schema - de nguoi doc biet ngay o day khong cho AI ghi.
    structuredField('team.assignedRoster', 'Decision table', 'decision-table', 'array', 12, {}, { xSource: 'manual_input', description: 'Filled in by the quality engineer on the report screen. The AI never writes this.', items: { type: 'object', properties: { partnerId: { type: 'string' }, partnerName: { type: 'string' }, functionTitle: { type: 'string' }, partnerRole: { type: 'string', enum: ['8D Team Leader', '8D Team Member'] } } } }),
    structuredField('team.readinessStatus', 'Team readiness', 'status', 'string', 3, { required: true, enum: ['Ready', 'Partial', 'Needs assignment'] }),
    structuredField('team.readinessRationale', 'Readiness assessment', 'markdown', 'string', 9, { required: true, minLength: 30, maxLength: 800 }),
    structuredField('team.uncoveredCapabilities', 'Uncovered capabilities', 'warning-list', 'array', 6, {}, { items: { type: 'string' } }),
    structuredField('team.sourceSummary', 'Where the team recommendation came from', 'markdown', 'string', 6, { required: true, minLength: 30, maxLength: 800 }),
    structuredField('sources', 'Source records', 'evidence-list', 'array', 12, { pattern: '^(team\\.|precedents#)' }, { items: { type: 'string' } }),
], groups: [
    // D1 mac dinh chi bay MOT field ra bao cao: bang nhom 8D.
    //
    // Chin field con lai VAN duoc AI sinh va van bi luat grounding cua D1 kiem
    // tra - chung chi khong nam trong group nao, nen roi vao panel "Available
    // Fields" cua Form Editor. Ai muon hien them thi keo vao group; khong ai
    // phai sua code de doi bo cuc mot buoc 8D.
    group('d1-ai-result', 'AI-generated team recommendation', ['team.roster', 'team.assignedRoster'], '100', 10),
] }, null, 2);

const D2_FORM_SCHEMA = JSON.stringify({ fields: [
    // Tham chieu khieu nai: doc thang tu `CaseContext.customer` (SAP QM), KHONG
    // cho AI viet. `caseMapper` da bocs san va co co `applicable` de phan biet
    // "case Q3 nen khong co khach" voi "thieu du lieu" - widget tu an khi khong ap dung.
    structuredField('problem.complaintReference', 'Complaint reference', 'complaint-reference', 'string', 12, {}, { xSource: 'sap_qm', description: 'Read from the SAP QM customer reference on the case. The AI never writes this.' }),
    structuredField('problem.statement', 'Problem statement', 'problem-statement', 'string', 12, { required: true, minLength: 30, maxLength: 600 }),
    // Ban mo ta do KY SU tu sua, giu rieng khoi ban AI viet.
    //
    // Ghi de thang len `problem.statement` thi mat ban goc cua AI, va khong con
    // doi chieu duoc "may viet gi" voi "nguoi sua thanh gi" - dung nguyen tac da
    // dung cho `team.assignedRoster` o D1.
    structuredField('problem.statementOverride', 'Problem statement (edited)', 'text', 'string', 12, {}, { xSource: 'manual_input', description: 'Edited by the quality engineer on the report screen. The AI never writes this.' }),
    // 5W2H: sau o doc lap, moi o mot field - keo tha rieng tung o tren Form Editor.
    // colSpan 4 => tu xep thanh luoi 3 cot trong he 12 cot, dung nhu mockup.
    ...[['what', 'What'], ['where', 'Where'], ['when', 'When'], ['who', 'Who'], ['how', 'How'], ['extent', 'How Many']].map(([key, label]) => structuredField(`problem.${key}`, label, 'w2h-cell', 'string', 4, ['what', 'where', 'extent'].includes(key) ? { required: true } : {})),
    structuredField('problem.impact', 'Business / customer impact', 'text', 'string', 12, {}),
    structuredField('problem.is', 'Is', 'is-box', 'array', 6, {}, { items: { type: 'string' } }), structuredField('problem.isNot', 'Is not', 'isnot-box', 'array', 6, {}, { items: { type: 'string' } }),
    // Can cu cua Is/Is-Not. `CaseContext.isIsNot.notes` DA co du lieu nay nhung
    // truoc day D2 khong co field nao de chua, nen no bi bo phi.
    structuredField('problem.isIsNotBasis', 'Is / Is-Not basis', 'markdown', 'string', 12, {}),
    structuredField('problem.measuredEvidence', 'Measured evidence', 'table', 'array', 12, {}, { items: { type: 'object', properties: { characteristic: { type: 'string' }, measured: { type: 'string' }, specification: { type: 'string' }, assessment: { type: 'string' } } } }),
    structuredField('problem.gaps', 'Missing facts', 'warning-list', 'array', 12, {}, { items: { type: 'string' } }), structuredField('sources', 'Evidence and traceability', 'evidence-list', 'array', 12, {}, { items: { type: 'string' } }),
], groups: [group('d2-ai-result', 'AI-generated problem description', ['problem.complaintReference', 'problem.statement', 'problem.what', 'problem.where', 'problem.when', 'problem.who', 'problem.how', 'problem.extent', 'problem.is', 'problem.isNot', 'problem.isIsNotBasis'], '100', 10)] }, null, 2);

const D3_FORM_SCHEMA = JSON.stringify({ fields: [
    structuredField('containment.objective', 'Containment objective', 'callout', 'string', 12, { required: true, maxLength: 500 }),
    // `action-cards` chu khong phai `table`: bang lam moi dong nhu nhau, ma o D3
    // thi `origin` (da ghi nhan / de xuat theo tien le) va `status` la hai thu
    // nguoi doc can thay dau tien — the giu chung noi len, bang thi chon di.
    structuredField('containment.actions', 'Containment action plan', 'action-cards', 'array', 12, { required: true, minItems: 1 }, { items: { type: 'object', properties: { action: { type: 'string' }, owner: { type: 'string' }, status: { type: 'string' }, protection: { type: 'string' }, origin: { type: 'string' } } } }),
    structuredField('containment.protectionScope', 'Protected scope', 'tag-selector', 'array', 6, {}, { items: { type: 'string' } }), structuredField('containment.recommendationBasis', 'Why these actions are appropriate', 'markdown', 'string', 6, { required: true, minLength: 30 }),
    structuredField('containment.gaps', 'Open containment gaps', 'warning-list', 'array', 12, {}, { items: { type: 'string' } }), structuredField('sources', 'Evidence and traceability', 'evidence-list', 'array', 12, {}, { items: { type: 'string' } }),
], groups: [group('d3-ai-result', 'AI-generated containment plan', ['containment.objective', 'containment.actions', 'containment.protectionScope', 'containment.recommendationBasis', 'containment.gaps', 'sources'], '100', 10)] }, null, 2);

const D4_FORM_SCHEMA = JSON.stringify({ fields: [
    structuredField('rootCause.statement', 'Root cause conclusion', 'callout', 'string', 9, { required: true, minLength: 30, maxLength: 800 }), structuredField('rootCause.category', '6M category', 'status', 'string', 3, { required: true, enum: ['Man', 'Machine', 'Method', 'Material', 'Measurement', 'Environment'] }),
    // Luoi Ishikawa 6M. KHONG phai AI viet: no doc thang mang `ishikawa` trong
    // CaseContext — day la danh gia da ghi trong SAP, bat model chep lai chi tao
    // them mot ban sao co the lech voi ban goc. Van khai thanh field de Form
    // Editor keo tha / an / doi kich thuoc duoc nhu moi widget khac.
    structuredField('rootCause.ishikawaBoard', 'Ishikawa 6M', 'ishikawa-grid', 'array', 12, {}, { xSource: 'sap_qm', description: 'Read from the recorded Ishikawa assessment on the case. The AI never writes this.', items: { type: 'object', properties: {} } }),
    // `why-chain` chu khong phai `table`: buoc ket luan goc phai noi len. Bang lam
    // no giong het bon dong con lai, va do dung la dong duy nhat nguoi doc can.
    structuredField('rootCause.fiveWhy', '5-Why chain', 'why-chain', 'array', 12, { required: true, minItems: 1 }, { items: { type: 'object', properties: { step: { type: 'integer' }, why: { type: 'string' }, answer: { type: 'string' }, evidence: { type: 'string' } } } }), structuredField('rootCause.contributingFactors', 'Contributing factors', 'tag-selector', 'array', 12, {}, { items: { type: 'string' } }),
    structuredField('rootCause.independentVerification.verdict', 'Independent verification', 'status', 'string', 4, { required: true, enum: ['Agrees', 'Partially agrees', 'Disagrees', 'Insufficient evidence'] }), structuredField('rootCause.independentVerification.aiFinding', 'Independent AI finding', 'text', 'string', 4, { required: true }), structuredField('rootCause.independentVerification.recordedFinding', 'Recorded finding', 'text', 'string', 4), structuredField('rootCause.independentVerification.rationale', 'Verification rationale', 'markdown', 'string', 12, { required: true, minLength: 30 }),
    structuredField('rootCause.evidenceGaps', 'Evidence gaps', 'warning-list', 'array', 12, {}, { items: { type: 'string' } }), structuredField('sources', 'Evidence and traceability', 'evidence-list', 'array', 12, {}, { items: { type: 'string' } }),
], groups: [group('d4-ai-result', 'AI-generated root cause analysis', ['rootCause.statement', 'rootCause.category', 'rootCause.ishikawaBoard', 'rootCause.fiveWhy', 'rootCause.contributingFactors', 'rootCause.independentVerification.verdict', 'rootCause.independentVerification.aiFinding', 'rootCause.independentVerification.recordedFinding', 'rootCause.independentVerification.rationale', 'rootCause.evidenceGaps', 'sources'], '100', 10)] }, null, 2);

function outputDataSchemaFromForm(formSchemaJson: string): string {
    const form = JSON.parse(formSchemaJson) as { fields: Array<{ key: string; label?: string; dataType?: string; items?: unknown; properties?: unknown; xSource?: string; description?: string; constraints?: { required?: boolean; enum?: unknown[] } }> };
    const schema: { type: 'object'; properties: Record<string, Record<string, unknown>>; required: string[]; additionalProperties: false } = { type: 'object', properties: {}, required: [], additionalProperties: false };
    for (const field of form.fields) {
        // Mac dinh moi field la do AI sinh. Field nao tu khai `xSource` thi giu
        // nguyen khai bao cua no - `team.assignedRoster` do con nguoi nhap, dan
        // nham la 'ai_enrichment' se noi doi ngay tren man hinh Data Schema.
        schema.properties[field.key] = { type: field.dataType ?? 'string', title: field.label, description: field.description ?? 'Generated by the 8D AI from verified case context.', 'x-source': field.xSource ?? 'ai_enrichment', items: field.items, properties: field.properties, enum: field.constraints?.enum };
        if (field.constraints?.required) schema.required.push(field.key);
    }
    return JSON.stringify(schema, null, 2);
}

/**
 * Ghep huong dan NGHIEP VU voi co hoc dien field cho mot discipline.
 *
 * Runtime doc prompt bang `combinedPrompt ?? systemPrompt` (xem
 * `getDisciplineGuide` trong configRepository.ts). Nghia la combinedPrompt CHE
 * HOAN TOAN systemPrompt chu khong bo sung cho no. Truoc day D1-D4 chi khai
 * combinedPrompt la danh sach co hoc dien field, nen toan bo huong dan nghiep vu
 * trong DEFAULT_DISCIPLINE_GUIDE bi bo qua o dung bon buoc quan trong nhat -
 * model chi con biet dien vao o nao, khong biet phai viet cai gi vao do.
 *
 * Nen combinedPrompt phai TU CHUA phan nghiep vu. Doi noi dung nghiep vu thi sua
 * DEFAULT_DISCIPLINE_GUIDE mot cho, ca hai tang cung doi theo.
 */
const withGuide = (code: keyof typeof DEFAULT_DISCIPLINE_GUIDE, mechanics: readonly string[]): string =>
    [DEFAULT_DISCIPLINE_GUIDE[code], '', '## FIELD MECHANICS', ...mechanics].join('\n');


const D5_FORM_SCHEMA = JSON.stringify({ fields: [
    structuredField('corrective.objective', 'Corrective objective', 'callout', 'string', 12, { required: true, maxLength: 500 }),
    // Moi hanh dong PHAI chi ra buoc nao cua chuoi D4 no go bo. Do la khac biet
    // giua "sua nguyen nhan" va "che trieu chung", va la thu dau tien mot kiem
    // toan vien hoi. `action-cards` giu `origin` va `status` noi len.
    structuredField('corrective.actions', 'Permanent corrective actions', 'action-cards', 'array', 12, { required: true, minItems: 1 }, { items: { type: 'object', properties: { action: { type: 'string' }, owner: { type: 'string' }, status: { type: 'string' }, origin: { type: 'string' }, protection: { type: 'string' } } } }),
    structuredField('corrective.rootCauseCoverage', 'How each action removes the cause', 'markdown', 'string', 6, { required: true, minLength: 30 }),
    // Phan nguyen nhan goc chua ai che la dong huu ich nhat trang nay.
    structuredField('corrective.uncoveredCauses', 'Root cause not yet covered', 'warning-list', 'array', 6, {}, { items: { type: 'string' } }),
    structuredField('sources', 'Evidence and traceability', 'evidence-list', 'array', 12, {}, { items: { type: 'string' } }),
], groups: [group('d5-ai-result', 'AI-generated corrective plan', ['corrective.objective', 'corrective.actions', 'corrective.rootCauseCoverage', 'corrective.uncoveredCauses', 'sources'], '100', 10)] }, null, 2);

const D6_FORM_SCHEMA = JSON.stringify({ fields: [
    structuredField('verification.objective', 'Verification objective', 'callout', 'string', 12, { required: true, maxLength: 500 }),
    // Ke hoach phai DO DUOC. "Theo doi quy trinh" khong phai ke hoach; "tro lai
    // trong dung sai tren 30 chi tiet lien tiep" moi la.
    structuredField('verification.plan', 'Verification plan', 'table', 'array', 12, { required: true, minItems: 1 }, { items: { type: 'object', properties: { measure: { type: 'string' }, sampleSize: { type: 'string' }, period: { type: 'string' }, acceptanceCriterion: { type: 'string' }, signOff: { type: 'string' } } } }),
    structuredField('verification.evidenceStatus', 'Evidence status', 'status', 'string', 4, { required: true, enum: ['No evidence yet', 'Partially verified', 'Verified'] }),
    structuredField('verification.gaps', 'What is still unproven', 'warning-list', 'array', 8, {}, { items: { type: 'string' } }),
    structuredField('sources', 'Evidence and traceability', 'evidence-list', 'array', 12, {}, { items: { type: 'string' } }),
], groups: [group('d6-ai-result', 'AI-generated verification plan', ['verification.objective', 'verification.plan', 'verification.evidenceStatus', 'verification.gaps', 'sources'], '100', 10)] }, null, 2);

const D7_FORM_SCHEMA = JSON.stringify({ fields: [
    structuredField('preventive.objective', 'Preventive objective', 'callout', 'string', 12, { required: true, maxLength: 500 }),
    structuredField('preventive.actions', 'Preventive actions', 'action-cards', 'array', 12, { required: true, minItems: 1 }, { items: { type: 'object', properties: { action: { type: 'string' }, owner: { type: 'string' }, status: { type: 'string' }, origin: { type: 'string' }, protection: { type: 'string' } } } }),
    // D7 chi thuc su chan tai dien khi thay doi duoc ghi vao FMEA. Trang thai
    // CHUA lien ket phai hien ro — do la lo hong that, khong phai o trong.
    structuredField('preventive.fmea', 'FMEA entry to update', 'fmea-link', 'object', 12, {}, { properties: { fmeaId: { type: 'string' }, description: { type: 'string' }, change: { type: 'string' }, currentRating: { type: 'string' }, proposedRating: { type: 'string' } } }),
    structuredField('preventive.systemicScope', 'Where else this applies', 'tag-selector', 'array', 6, {}, { items: { type: 'string' } }),
    structuredField('preventive.gaps', 'Open preventive gaps', 'warning-list', 'array', 6, {}, { items: { type: 'string' } }),
    structuredField('sources', 'Evidence and traceability', 'evidence-list', 'array', 12, {}, { items: { type: 'string' } }),
], groups: [group('d7-ai-result', 'AI-generated preventive plan', ['preventive.objective', 'preventive.actions', 'preventive.fmea', 'preventive.systemicScope', 'preventive.gaps', 'sources'], '100', 10)] }, null, 2);

const D8_FORM_SCHEMA = JSON.stringify({ fields: [
    // Cong dong case. KHONG phai AI viet: no doc trang thai duyet cua D1-D7. Cho
    // model tra loi "dong duoc chua" la cho no tu cap phep dong case.
    structuredField('closure.gate', 'Closure readiness', 'closure-gate', 'object', 12, {}, { xSource: 'manual_input', description: 'Computed from the review status of D1-D7. The AI never writes this.', properties: {} }),
    structuredField('closure.costOfPoorQuality', 'Cost of poor quality', 'text', 'string', 4, {}, { xSource: 'sap_qm', description: 'Read from the case. The AI never writes this.' }),
    structuredField('closure.lessonsWhatWorked', 'What worked', 'markdown', 'string', 6, { required: true, minLength: 20 }),
    structuredField('closure.lessonsWhatDidNot', 'What did not', 'markdown', 'string', 6, { required: true, minLength: 20 }),
    structuredField('closure.teamRecognition', 'Team recognition', 'markdown', 'string', 12, {}),
    structuredField('closure.openItems', 'Still open at closure', 'warning-list', 'array', 12, {}, { items: { type: 'string' } }),
    structuredField('sources', 'Evidence and traceability', 'evidence-list', 'array', 12, {}, { items: { type: 'string' } }),
], groups: [group('d8-ai-result', 'AI-generated closure summary', ['closure.gate', 'closure.costOfPoorQuality', 'closure.lessonsWhatWorked', 'closure.lessonsWhatDidNot', 'closure.teamRecognition', 'closure.openItems', 'sources'], '100', 10)] }, null, 2);

const STRUCTURED_CONFIG_OVERRIDES: Record<string, { description: string; combinedPrompt: string; inputSchemaJson: string; formSchemaJson: string; constraintsJson?: string }> = {
    D1: { description: 'Build an explainable cross-functional team with per-member responsibilities, selection reasons, and source traceability.', combinedPrompt: withGuide('D1', ['Determine the capabilities required by the actual defect before selecting people.', 'Set selectionMethod to exactly one allowed value: Current case team, Precedent recommendation, Hybrid, or Roles only - assignment required.', 'Prefer identities from team.leader and team.members. Use precedents#N.team only to cover a capability missing from the current team.', 'For every roster row separate organizationalRole, assigned8DRole, and caseResponsibility. Do not put a job title in caseResponsibility.', 'For every roster row explain selectionReason and provide sourceType, sourcePath, and sourceCase when applicable.', 'sourcePath must resolve to team.leader, team.members#N, or precedents#N.team#M. Never invent a person.', 'If a required role has no grounded person, use name Unassigned, sourceType unassigned, sourcePath team.gaps, and readinessStatus Needs assignment.', 'Set readinessStatus to exactly Ready, Partial, or Needs assignment. Put the explanation only in readinessRationale.', 'Explain the mix of current-case and precedent sources in sourceSummary, and list all supporting paths in sources.', 'Never output team.assignedRoster. The quality engineer fills that table in on the report screen.']), inputSchemaJson: outputDataSchemaFromForm(D1_FORM_SCHEMA), formSchemaJson: D1_FORM_SCHEMA, constraintsJson: JSON.stringify({ enabled: true, rules: [{ id: 'D1_GROUNDING', type: 'sourcePattern', severity: 'error', enabled: true, pattern: '^(team\\.|precedents#)', message: 'Team identities must come from the current team or a cited precedent.' }, { id: 'D1_DATA_BACKED', type: 'dataBackedWhenInputPresent', severity: 'warning', enabled: true, inputFields: ['teamMembers', 'precedentTeams'], message: 'No current or precedent team data supports this assignment.' }] }, null, 2) },
    D2: { description: 'Describe the problem as structured 5W2H, Is/Is-Not, measurements, and explicit gaps.', combinedPrompt: withGuide('D2', ['Populate separate fields for statement, What, Where, When, Who, extent, and impact.', 'Return measured evidence as table rows.', 'Use verified facts only and expose missing facts in problem.gaps.', 'Do not hide all 5W2H information inside one narrative field.', 'Set problem.how to how the defect surfaced, for example in-process inspection or customer complaint.', 'Put the reasoning behind Is / Is-Not into problem.isIsNotBasis, citing the records it rests on.', 'Never output problem.complaintReference or problem.statementOverride. Those come from SAP and from the quality engineer.']), inputSchemaJson: outputDataSchemaFromForm(D2_FORM_SCHEMA), formSchemaJson: D2_FORM_SCHEMA, constraintsJson: JSON.stringify({ enabled: true, rules: [{ id: 'D2_CITATIONS', type: 'citationRequired', severity: 'error', enabled: true, message: 'D2 requires traceable case evidence.' }, { id: 'D2_SOURCES', type: 'sourcePattern', severity: 'warning', enabled: true, pattern: '^(header|product|inspections|isIsNot|derivedFacts)', message: 'Some D2 evidence is outside the configured problem-data scope.' }] }, null, 2) },
    D3: { description: 'Build a structured containment plan with ownership, protection, origin, rationale, and gaps.', combinedPrompt: withGuide('D3', ['Return containment.actions as rows with action, owner, status, protection, and origin.', 'Separate protection scope, recommendation basis, and gaps.', 'Distinguish recorded actions from precedent-based proposals.', 'Do not collapse the action plan into one narrative paragraph.']), inputSchemaJson: outputDataSchemaFromForm(D3_FORM_SCHEMA), formSchemaJson: D3_FORM_SCHEMA, constraintsJson: JSON.stringify({ enabled: true, rules: [{ id: 'D3_SOURCES', type: 'sourcePattern', severity: 'error', enabled: true, pattern: '^(actions\\.containment|customer|precedents#)', message: 'Containment actions must be recorded actions or cited proposals.' }, { id: 'D3_DATA_BACKED', type: 'dataBackedWhenInputPresent', severity: 'warning', enabled: true, inputFields: ['actions', 'precedents'], message: 'No current or precedent containment data supports this plan.' }] }, null, 2) },
    D4: { description: 'Show the causal chain, conclusion, contributing factors, independent verification, and evidence gaps.', combinedPrompt: withGuide('D4', ['Populate a structured conclusion, 5-Why table, contributing factors, and independent verification.', 'Independent verification contains verdict, AI finding, recorded finding, and rationale.', 'Expose evidence gaps separately.', 'Treat precedent causes as hypotheses, not facts.', 'Never output rootCause.ishikawaBoard. The screen reads the recorded Ishikawa assessment straight from the case.']), inputSchemaJson: outputDataSchemaFromForm(D4_FORM_SCHEMA), formSchemaJson: D4_FORM_SCHEMA, constraintsJson: JSON.stringify({ enabled: true, rules: [{ id: 'D4_DISCLOSURE', type: 'requiredDisclosure', field: 'rootCause.independentVerification.rationale', severity: 'error', enabled: true, pattern: 'agree|disagree|insufficient|evidence', message: 'Independent verification must explain agreement, disagreement, or insufficient evidence.' }, { id: 'D4_SOURCES', type: 'sourcePattern', severity: 'error', enabled: true, pattern: '^(fiveWhy|ishikawa|rootCause|independent|precedents#)', message: 'Root-cause conclusions require traceable causal evidence.' }] }, null, 2) },
    D5: { description: 'Tie every corrective action to the step of the root cause chain it removes.', combinedPrompt: withGuide('D5', ['Return corrective.actions as rows with action, owner, status, origin.', 'In corrective.rootCauseCoverage name, per action, which step of the D4 chain it removes.', 'List any part of the root cause with no action against it in corrective.uncoveredCauses.', 'Distinguish recorded actions from precedent-based proposals using origin.', 'Do not collapse the plan into one narrative paragraph.']), inputSchemaJson: outputDataSchemaFromForm(D5_FORM_SCHEMA), formSchemaJson: D5_FORM_SCHEMA, constraintsJson: JSON.stringify({ enabled: true, rules: [{ id: 'D5_SOURCES', type: 'sourcePattern', severity: 'error', enabled: true, pattern: '^(actions\\.corrective|rootCause|fiveWhy|precedents#)', message: 'Corrective actions must cite recorded actions or the root cause chain.' }, { id: 'D5_DATA_BACKED', type: 'dataBackedWhenInputPresent', severity: 'warning', enabled: true, inputFields: ['actions', 'precedents'], message: 'No current or precedent corrective data supports this plan.' }] }, null, 2) },
    D6: { description: 'Write a measurable verification plan; this dataset carries no verification evidence.', combinedPrompt: withGuide('D6', ['Return verification.plan as rows with measure, sampleSize, period, acceptanceCriterion, signOff.', 'Anchor every acceptance criterion to a real specification value from inspections.', 'Set verification.evidenceStatus to exactly one allowed value.', 'Never describe a corrective action as proven effective.']), inputSchemaJson: outputDataSchemaFromForm(D6_FORM_SCHEMA), formSchemaJson: D6_FORM_SCHEMA, constraintsJson: JSON.stringify({ enabled: true, rules: [{ id: 'D6_SOURCES', type: 'sourcePattern', severity: 'warning', enabled: true, pattern: '^(actions|inspections|rootCause|precedents#)', message: 'Verification criteria should cite the actions and measurements they rest on.' }] }, null, 2) },
    D7: { description: 'Preventive actions and the FMEA entry that has to change.', combinedPrompt: withGuide('D7', ['Return preventive.actions as rows with action, owner, status, origin.', 'Put the FMEA entry into preventive.fmea with fmeaId, description and the change required.', 'When the case links no FMEA entry, leave preventive.fmea.fmeaId empty and say what a systemic fix would have to cover.', 'List where else the failure mode applies in preventive.systemicScope.', 'An action that only protects this batch is corrective and belongs in D5.']), inputSchemaJson: outputDataSchemaFromForm(D7_FORM_SCHEMA), formSchemaJson: D7_FORM_SCHEMA, constraintsJson: JSON.stringify({ enabled: true, rules: [{ id: 'D7_SOURCES', type: 'sourcePattern', severity: 'error', enabled: true, pattern: '^(actions\\.preventive|fmea|rootCause|precedents#)', message: 'Preventive actions must cite recorded actions, the FMEA link, or a precedent.' }, { id: 'D7_DATA_BACKED', type: 'dataBackedWhenInputPresent', severity: 'warning', enabled: true, inputFields: ['actions', 'fmea', 'precedents'], message: 'No preventive action or FMEA link supports this plan.' }] }, null, 2) },
    D8: { description: 'Lessons learned and what is still open. The closure gate reads D1-D7, not the model.', combinedPrompt: withGuide('D8', ['Write closure.lessonsWhatWorked and closure.lessonsWhatDidNot as two separate fields.', 'Name the specific thing worth repeating; "good teamwork" is not a lesson.', 'List anything unfinished in closure.openItems - unverified actions, a pending FMEA update, an evidence gap.', 'Never output closure.gate or closure.costOfPoorQuality. The screen computes the gate from the review status of D1-D7, and the cost comes from the case.']), inputSchemaJson: outputDataSchemaFromForm(D8_FORM_SCHEMA), formSchemaJson: D8_FORM_SCHEMA, constraintsJson: JSON.stringify({ enabled: true, rules: [{ id: 'D8_SOURCES', type: 'sourcePattern', severity: 'warning', enabled: true, pattern: '^(lessonsLearned|actions|copqEur|team|gaps)', message: 'Closure statements should cite the lessons, actions or cost recorded on the case.' }] }, null, 2) },
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
