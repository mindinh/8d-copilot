/**
 * Bóc dataset thô thành `CaseContext` — thuần code, KHÔNG gọi AI.
 *
 * ── Vì sao bước này không dùng model ──
 * Gom action theo loại, tách dòng root cause, sắp 5-Why theo thứ tự — đều là
 * việc cơ học có luật rõ ràng. Đưa cho model làm là trả tiền và trả thời gian
 * để đổi lấy một xác suất sai khác 0. Ở đây xác suất đó bằng 0 và chạy vài ms.
 *
 * ── Vì sao đọc `data` chứ không `nested_case_view` ──
 * Hai khối chứa cùng dữ liệu. Nhưng `datasetValidator` kiểm tra `data`, nên
 * mapper cũng phải đọc `data` — nếu không, ta xác thực một khối rồi phân tích
 * khối khác, và một sai lệch giữa hai khối sẽ lọt qua mà không ai biết.
 * `nested_case_view` chỉ dùng làm phương án dự phòng.
 */

import {
    ACTION_TYPE_TO_STEP,
    ORIGIN_CUSTOMER,
    PipelineError,
    type ActionRow,
    type CaseContext,
    type FiveWhyRow,
    type InspectionRow,
    type IshikawaRow,
    type TeamRow,
} from './types';
import { isDeliberateNA, isRootCauseFlag } from './datasetValidator';

// ─────────────────────────────────────────────────────────────────────────────
// So sánh đo đạc với dung sai
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Số thực đầu tiên trong chuỗi. `'0.32mm'` → 0.32, `'Class 3'` → 3.
 *
 * Chấp nhận cả dấu phẩy thập phân kiểu Đức (`0,32 mm`) — dữ liệu SAP xuất theo
 * locale của người dùng, và một hệ thống chỉ hiểu dấu chấm sẽ đọc 0,32 thành 0.
 */
function firstNumber(s: string): number | null {
    const m = String(s).match(/-?\d+(?:[.,]\d+)?/);
    if (!m) return null;
    const n = Number(m[0].replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

/**
 * Ô trống theo kiểu người nhập.
 *
 * `''`, `'-'`, `'n.a.'`, `'k.A.'` đều nghĩa là "không có" nhưng không phải null,
 * nên code không tự nhận ra. Không quy chúng về null thì model sẽ tưởng đó là
 * nội dung thật và trích dẫn nguyên văn dấu gạch ngang vào báo cáo.
 *
 * Chuỗi 'N/A - ...' KHÔNG nằm ở đây: đó là giá trị có chủ đích, xử lý riêng.
 */
const BLANKISH = new Set(['', '-', '--', 'n.a.', 'n/a.', 'k.a.', 'na', 'kein', 'none']);

function isBlankish(v: unknown): boolean {
    if (v == null) return true;
    const s = String(v).trim().toLowerCase();
    return BLANKISH.has(s);
}

/** Cắt khoảng trắng thừa quanh mã — dữ liệu qua Excel hay dính. */
function id(v: unknown): string {
    return String(v ?? '').trim();
}

/**
 * Đưa ngày về ISO `YYYY-MM-DD`.
 *
 * SAP xuất ngày theo locale của transaction, nên cùng một file có thể lẫn
 * `03.08.2026` (Đức), `03-AUG-26` (ALV cũ) và `2026-08-03`. Giữ nguyên chuỗi thì
 * model phải tự đoán, và nó sẽ đoán sai thứ tự ngày/tháng ở đúng những ngày
 * mập mờ như 03.08 với 08.03.
 */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function normalizeDate(value: unknown): string | null {
    if (isBlankish(value)) return null;
    const s = String(value).trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const dmy = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
    if (dmy) {
        const [, d, m, y] = dmy;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    const alv = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
    if (alv) {
        const [, d, mon, yy] = alv;
        const mi = MONTHS.indexOf(mon.toLowerCase());
        if (mi >= 0) {
            return `20${yy}-${String(mi + 1).padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
    }

    // Không nhận ra định dạng: trả nguyên chuỗi chứ không đoán. Model đọc được
    // '3rd of August' còn hơn nhận một ngày sai do ta suy diễn.
    return s;
}

/**
 * Dựng vị từ kiểm tra từ chuỗi spec. `null` khi không hiểu được định dạng —
 * và khi đó `outOfSpec` để null chứ không đoán.
 *
 * Hiểu được: 'max 0.10mm' · 'min 2.0' · '24.950-25.000mm' · '0.05mm +/-0' ·
 *            '60-90um' · 'Class 0-1'
 */
function parseSpec(spec: string): ((v: number) => boolean) | null {
    const s = String(spec).toLowerCase().replace(/±/g, '+/-');

    const max = s.match(/max\s*(-?\d+(?:[.,]\d+)?)/);
    if (max) {
        const limit = Number(max[1].replace(',', '.'));
        return (v) => v <= limit;
    }

    const min = s.match(/min\s*(-?\d+(?:[.,]\d+)?)/);
    if (min) {
        const limit = Number(min[1].replace(',', '.'));
        return (v) => v >= limit;
    }

    // Kiểm tra '+/-' TRƯỚC dải giá trị: '0.05mm +/-0' cũng chứa dấu gạch nối.
    const tol = s.match(/(-?\d+(?:[.,]\d+)?)\s*[a-z%*/]*\s*\+\/-\s*(\d+(?:[.,]\d+)?)/);
    if (tol) {
        const nominal = Number(tol[1].replace(',', '.'));
        const delta = Number(tol[2].replace(',', '.'));
        return (v) => Math.abs(v - nominal) <= delta;
    }

    const range = s.match(/(-?\d+(?:[.,]\d+)?)\s*-\s*(-?\d+(?:[.,]\d+)?)/);
    if (range) {
        const lo = Number(range[1].replace(',', '.'));
        const hi = Number(range[2].replace(',', '.'));
        return (v) => v >= Math.min(lo, hi) && v <= Math.max(lo, hi);
    }

    return null;
}

/**
 * Xếp một nhãn action tự do vào đúng loại của 8D.
 *
 * Golden Dataset dùng đúng ba chuỗi Containment / Corrective / Preventive, và
 * `schema.enumerations.action_type_to_8d_step` ánh xạ chúng sang D3 / D5 / D7.
 * Dữ liệu thật thì viết tay: `Sofortmassnahme`, `SM`, `Korrekturmassnahme`,
 * `KM`, `vorbeugend`, hoặc bỏ trống.
 *
 * Chỉ nhận diện những biến thể QUEN THUỘC. Không đoán mò: nhãn lạ trả `null` và
 * được ghi vào `gaps` để model biết có action chưa xếp được vào discipline nào,
 * thay vì lặng lẽ nhét bừa vào D3.
 */
const ACTION_ALIASES: Array<[keyof typeof ACTION_TYPE_TO_STEP, RegExp]> = [
    ['Containment', /^(containment|sofortmassnahme|sofortma|sm|eindaemmung|eindämmung|interim)/i],
    ['Corrective', /^(corrective|korrekturmassnahme|korrektur|km|abstellmassnahme|abstell)/i],
    ['Preventive', /^(preventive|vorbeugemassnahme|vorbeuge|vm|vorbeugend|prevention)/i],
];

export function classifyAction(label: unknown): keyof typeof ACTION_TYPE_TO_STEP | null {
    const s = String(label ?? '').trim();
    if (!s) return null;
    for (const [type, pattern] of ACTION_ALIASES) {
        if (pattern.test(s)) return type;
    }
    return null;
}

/** `true` = vượt spec. `null` = không đủ cơ sở để kết luận. */
export function evaluateOutOfSpec(measured: string, spec: string): boolean | null {
    const value = firstNumber(measured);
    if (value === null) return null;
    const inSpec = parseSpec(spec);
    if (!inSpec) return null;
    return !inSpec(value);
}

// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, any>;

function rows(src: Row, key: string): Row[] {
    const v = src?.[key];
    return Array.isArray(v) ? v : [];
}

function one(src: Row, key: string): Row | null {
    return rows(src, key)[0] ?? null;
}

/**
 * `null` cho ô trống — kể cả các biến thể người nhập gõ tay.
 * Giữ nguyên chuỗi 'N/A - ...' vì đó là giá trị có chủ đích.
 */
function text(v: unknown): string | null {
    if (isBlankish(v)) return null;
    return String(v).trim();
}

/**
 * Chuyển `nested_case_view` về hình dạng phẳng giống `data`, để mapper chỉ phải
 * hiểu một hình dạng duy nhất.
 */
function flattenNested(nested: Row): Row {
    const nid = nested.notification_id;
    const stamp = (r: Row) => ({ notification_id: nid, ...r });
    const node = (k: string) => {
        const n = nested[k];
        if (!n || typeof n !== 'object') return null;
        const clean: Row = {};
        for (const [key, val] of Object.entries(n)) if (!key.startsWith('_')) clean[key] = val;
        return clean;
    };

    const header = node('header') ?? {};
    const material = node('material') ?? {};
    const batch = node('batch') ?? {};
    const defect = node('defect') ?? {};
    const wc = node('work_center') ?? {};
    const fmea = node('fmea_link');

    return {
        materials: material.material_id ? [material] : [],
        batches: batch.batch_id ? [batch] : [],
        defect_catalog: defect.defect_code ? [defect] : [],
        work_centers: wc.work_center_id ? [wc] : [],
        notifications: [{
            notification_id: nid,
            material_id: material.material_id,
            batch_id: batch.batch_id,
            defect_code: defect.defect_code,
            work_center_id: wc.work_center_id,
            ...header,
        }],
        inspections: (nested.inspections?.rows ?? []).map(stamp),
        causes_ishikawa: (nested.causes_ishikawa?.rows ?? []).map(stamp),
        actions: (nested.actions?.rows ?? []).map(stamp),
        five_why_chain: (nested.five_why_chain?.rows ?? []).map(stamp),
        team_assignments: (nested.team_assignments?.rows ?? []).map(stamp),
        fmea_link: fmea?.fmea_id ? [stamp(fmea)] : [],
        cost_copq: node('cost_copq') ? [stamp(node('cost_copq')!)] : [],
        lessons_learned: node('lessons_learned') ? [stamp(node('lessons_learned')!)] : [],
        is_is_not: node('is_is_not') ? [stamp(node('is_is_not')!)] : [],
        customer_reference: node('customer_reference') ? [stamp(node('customer_reference')!)] : [],
        spc_process_data: [],
    };
}

// ─────────────────────────────────────────────────────────────────────────────

export function mapCase(raw: any): CaseContext {
    const data: Row =
        raw?.data && typeof raw.data === 'object'
            ? raw.data
            : raw?.nested_case_view
                ? flattenNested(raw.nested_case_view)
                : null;

    if (!data) {
        throw new PipelineError(
            "Payload không có khối 'data' lẫn 'nested_case_view' — không phải Golden Dataset.",
            400,
        );
    }

    const note = one(data, 'notifications');
    if (!note) throw new PipelineError('Dataset không có dòng notifications nào.', 400);

    const gaps: string[] = [];
    const origin = String(note.origin ?? '');
    const isCustomerFacing = origin === ORIGIN_CUSTOMER;

    const material = one(data, 'materials') ?? {};
    const batch = one(data, 'batches') ?? {};
    const defect = one(data, 'defect_catalog') ?? {};
    const workCenter = one(data, 'work_centers') ?? {};

    // ── Đo đạc ──
    const inspections: InspectionRow[] = rows(data, 'inspections').map((r) => ({
        characteristic: String(r.characteristic ?? ''),
        measuredValue: String(r.measured_value ?? ''),
        specValue: String(r.spec_value ?? ''),
        outOfSpec: evaluateOutOfSpec(r.measured_value, r.spec_value),
    }));
    if (!inspections.length) gaps.push('No inspection results — D2 cannot be quantified from measurements.');
    if (inspections.length && inspections.every((i) => i.outOfSpec === null)) {
        gaps.push('Inspection values could not be compared with the specification automatically.');
    }

    // ── Ishikawa + root cause ──
    const ishikawa: IshikawaRow[] = rows(data, 'causes_ishikawa').map((r) => ({
        category: String(r.category ?? ''),
        description: String(r.description ?? ''),
        metricValue: text(r.metric_value),
        isRootCause: isRootCauseFlag(r.is_root_cause),
        source: String(r.source ?? ''),
    }));
    const rootRow = ishikawa.find((r) => r.isRootCause) ?? null;
    if (!rootRow) gaps.push('No Ishikawa row is flagged as the root cause — D4 rests on the 5-Why chain alone.');

    // ── 5-Why ──
    const fiveWhy: FiveWhyRow[] = rows(data, 'five_why_chain')
        .map((r) => ({
            stepNo: Number(r.step_no),
            question: String(r.question ?? ''),
            answer: String(r.answer ?? ''),
            evidenceCitation: String(r.evidence_citation ?? ''),
            isRootCauseStep: String(r.question ?? '').toLowerCase().includes('(root cause)'),
        }))
        .sort((a, b) => a.stepNo - b.stepNo);
    if (!fiveWhy.length) gaps.push('No 5-Why chain — D4 has no causal reasoning to cite.');

    // ── Actions, gom theo ánh xạ do dataset khai ──
    const toAction = (r: Row): ActionRow => ({
        lineNo: Number(r.line_no),
        actionType: String(r.action_type ?? ''),
        actionText: String(r.action_text ?? ''),
        status: String(r.status ?? ''),
    });
    const allActions = rows(data, 'actions').map(toAction).sort((a, b) => a.lineNo - b.lineNo);
    const byType = (t: keyof typeof ACTION_TYPE_TO_STEP) =>
        allActions.filter((a) => classifyAction(a.actionType) === t);

    const actions = {
        containment: byType('Containment'),
        corrective: byType('Corrective'),
        preventive: byType('Preventive'),
    };
    const unclassified = allActions.filter((a) => classifyAction(a.actionType) === null);
    if (unclassified.length) {
        gaps.push(
            `${unclassified.length} action(s) have no recognisable type and could not be assigned ` +
            'to D3, D5 or D7.',
        );
    }
    if (!actions.containment.length) gaps.push('No containment action recorded — D3 has no source data.');
    if (!actions.corrective.length) gaps.push('No corrective action recorded — D5 has no source data.');
    if (!actions.preventive.length) gaps.push('No preventive action recorded — D7 has no source data.');

    // ── Team ──
    const teamRows: TeamRow[] = rows(data, 'team_assignments').map((r) => ({
        partnerId: String(r.partner_id ?? ''),
        partnerName: String(r.partner_name ?? ''),
        functionTitle: String(r.function_title ?? ''),
        partnerRole: String(r.partner_role ?? ''),
    }));
    // Vai trò hay bị bỏ trống. Không có ai được đánh dấu thì lấy người đầu tiên
    // làm trưởng nhóm — thứ tự dòng trong SAP thường phản ánh đúng điều đó — và
    // ghi nhận là suy đoán để model biết mà không khẳng định chắc chắn.
    let leader = teamRows.find((r) => r.partnerRole === '8D Team Leader') ?? null;
    if (!leader && teamRows.length) {
        leader = teamRows[0];
        gaps.push('No team leader was marked; assuming the first listed member leads the team.');
    }
    const members = teamRows.filter((r) => r !== leader);
    if (!teamRows.length) gaps.push('No 8D team members recorded — D1 has no source data.');

    // ── Phần còn lại ──
    const fmeaRow = one(data, 'fmea_link');
    const fmea = fmeaRow?.fmea_id
        ? { fmeaId: String(fmeaRow.fmea_id), description: String(fmeaRow.description ?? '') }
        : null;
    if (!fmea) gaps.push('No FMEA link — D7 cannot reference an existing failure-mode entry.');

    const costRow = one(data, 'cost_copq');
    const rawCopq = costRow?.cost_of_poor_quality_eur;
    const copqEur = isBlankish(rawCopq) ? null : firstNumber(String(rawCopq));
    if (copqEur === null) gaps.push('No cost of poor quality recorded.');

    // Một dòng lessons learned mà cả hai vế đều trống thì không phải lessons
    // learned — nó là một hàng bảng rỗng. Trả null để D8 biết là thiếu dữ liệu,
    // thay vì nhận hai chuỗi rỗng rồi tưởng có nội dung.
    const llRow = one(data, 'lessons_learned');
    const whatWorked = text(llRow?.what_worked);
    const whatDidnt = text(llRow?.what_didnt);
    const lessonsLearned = whatWorked || whatDidnt
        ? { whatWorked: whatWorked ?? '', whatDidnt: whatDidnt ?? '' }
        : null;
    if (!lessonsLearned) gaps.push('No lessons learned recorded — D8 has no source data.');

    // Is/Is-Not chỉ có giá trị khi có ít nhất một vế. Cả hai trống thì bỏ hẳn —
    // đây là công cụ khoanh vùng của D2, và một bảng rỗng không khoanh được gì.
    const iinRow = one(data, 'is_is_not');
    const iinIs = text(iinRow?.is_where_when_it_happens);
    const iinIsNot = text(iinRow?.is_not_where_when_it_doesnt);
    const isIsNot = iinIs || iinIsNot
        ? { is: iinIs ?? '', isNot: iinIsNot ?? '', notes: text(iinRow?.notes) }
        : null;
    if (!isIsNot) {
        gaps.push('No Is / Is-Not comparison recorded — the problem boundary is undefined.');
    }

    // ── Khách hàng ──
    // Với case Q3, ba trường này là chuỗi 'N/A - ...' CÓ CHỦ ĐÍCH. Giữ nguyên
    // giá trị và hạ cờ `applicable`, để model biết đây là "không áp dụng" chứ
    // không phải "thiếu dữ liệu".
    const crefRow = one(data, 'customer_reference');
    const custApplicable =
        isCustomerFacing &&
        !!crefRow &&
        !isDeliberateNA(crefRow.complaint_reference);
    const customer = {
        complaintReference: text(crefRow?.complaint_reference),
        plantContact: text(crefRow?.customer_plant_contact),
        slaResponseDue: text(crefRow?.sla_response_due),
        applicable: custApplicable,
    };
    if (isCustomerFacing && !custApplicable) {
        gaps.push('Customer complaint case but no usable customer reference data.');
    }

    return {
        notificationId: id(note.notification_id),
        origin,
        isCustomerFacing,
        header: {
            symptomShortText: String(note.symptom_short_text ?? ''),
            status: String(note.status ?? ''),
            foundDate: normalizeDate(note.found_date),
            completionDate: normalizeDate(note.completion_date),
            quantityExtent: String(note.quantity_extent ?? ''),
            teamSize: typeof note.team_size === 'number' ? note.team_size : null,
        },
        product: {
            materialId: id(note.material_id ?? material.material_id),
            materialDesc: id(material.description),
            batchId: id(note.batch_id ?? batch.batch_id),
            defectCode: id(note.defect_code ?? defect.defect_code),
            defectText: id(defect.defect_text),
            workCenterId: id(note.work_center_id ?? workCenter.work_center_id),
            workCenterDesc: id(workCenter.description),
        },
        inspections,
        isIsNot,
        rootCause: rootRow
            ? {
                category: rootRow.category,
                description: rootRow.description,
                metricValue: rootRow.metricValue,
                source: rootRow.source,
            }
            : null,
        ishikawa,
        fiveWhy,
        actions,
        team: { leader, members },
        fmea,
        copqEur,
        lessonsLearned,
        customer,
        unmapped: {},
        gaps,
    };
}
