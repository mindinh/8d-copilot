/**
 * Vòng đời "người duyệt" của từng bước D, và cổng đóng case ở D8.
 *
 * ── Ranh giới với phần AI ──
 * Không có gì trong file này được AI gọi. `stepStatus` chỉ đổi qua
 * `setDisciplineStatus`, và hàm đó chỉ chạy từ một action do người bấm. Đây là
 * chỗ hiện thực quy tắc R0.2/R0.4: mô hình soạn nội dung, người chốt trạng thái.
 *
 * ── TUYỆT ĐỐI KHÔNG dùng `cds.tx()` ở tầng này ──
 * Cùng lý do đã ghi ở đầu `eightDRepository.ts`: driver SQLite của CAP giữ đúng
 * một connection mỗi tenant, nên mở transaction lồng nhau là tự khoá chính mình.
 * Mọi hàm ở đây dùng transaction sẵn có của lời gọi.
 */

import cds from '@sap/cds';
import { DISCIPLINE_CODES, type DisciplineCode } from './types';

const REPORTS = 'cnma.proresolve.Reports';
const DISCIPLINES = 'cnma.proresolve.Disciplines';
const SUGGESTION_AUDIT = 'cnma.proresolve.SuggestionAudit';

/** Hai giá trị được LƯU. 'In review' không nằm ở đây — xem `DerivedStepState`. */
export const STORED_STEP_STATUSES = ['Draft', 'Complete'] as const;
export type StoredStepStatus = (typeof STORED_STEP_STATUSES)[number];

/** Giá trị hợp lệ của cột `action` trong SuggestionAudit. */
export const SUGGESTION_OUTCOMES = ['shown', 'accepted', 'rejected', 'edited'] as const;
export type SuggestionOutcome = (typeof SUGGESTION_OUTCOMES)[number];

/**
 * Trạng thái HIỆN cho người dùng — ba giá trị, trong khi chỉ hai được lưu.
 *
 * 'InReview' suy ra lúc đọc: bước còn Draft mà đã có ít nhất một dòng audit
 * accepted/edited. Lưu nó thành cột thứ ba nghĩa là thêm một thứ phải đặt bằng
 * tay và một thứ có thể lệch với lịch sử thao tác thật; suy ra thì không lệch
 * được, và nếu audit hỏng thì trạng thái biến mất chứ không âm thầm sai.
 */
export type DerivedStepState = 'Draft' | 'InReview' | 'Complete';

/**
 * Quyết định MỚI NHẤT trên một đề xuất.
 *
 * Đây là thứ dựng nên bảng "đã chốt" trên UI: nhận một gợi ý không chỉ là ghi
 * một dòng log, nó CHÍNH LÀ hành động giao việc. Nhờ vậy không cần bảng thứ hai
 * cho roster hay danh sách task — bảng đó là các dòng `accepted` đọc lại.
 */
export interface StepDecision {
    suggestionKey: string;
    outcome: Exclude<SuggestionOutcome, 'shown'>;
    /** Nội dung đề xuất lúc được chốt, đã parse. */
    payload: unknown;
    decidedBy: string | null;
    decidedAt: string | null;
}

export interface StepActivity {
    code: DisciplineCode;
    disciplineID: string;
    /** Giá trị lưu trong DB. */
    stepStatus: StoredStepStatus;
    /** Giá trị hiện lên UI, đã gộp dấu vết audit. */
    state: DerivedStepState;
    approvedBy: string | null;
    approvedAt: string | null;
    counts: Record<SuggestionOutcome, number>;
    /** Một dòng cho mỗi đề xuất đã được chốt, lấy quyết định gần nhất. */
    decisions: StepDecision[];
}

export interface ClosureGate {
    /** true khi D1–D7 đều Complete. */
    passed: boolean;
    /** Các bước còn thiếu, theo thứ tự D1→D7. Rỗng khi `passed`. */
    incomplete: DisciplineCode[];
    /** Câu giải thích sẵn để UI hiện, không phải ghép ở client. */
    message: string;
}

/** Bảy bước cổng đóng case xét. D8 không tự xét chính nó. */
const GATED_CODES = DISCIPLINE_CODES.filter((code) => code !== 'D8');

function isStoredStatus(value: string): value is StoredStepStatus {
    return (STORED_STEP_STATUSES as readonly string[]).includes(value);
}

/**
 * Quy tắc suy ra 'In review' — tách thành hàm thuần để test được mà không cần
 * dựng CAP. Đây là toàn bộ định nghĩa của trạng thái thứ ba; không có chỗ nào
 * khác trong hệ thống được tự quyết định nó.
 */
export function deriveStepState(
    stepStatus: StoredStepStatus,
    counts: Pick<Record<SuggestionOutcome, number>, 'accepted' | 'edited'>,
): DerivedStepState {
    if (stepStatus === 'Complete') return 'Complete';
    return counts.accepted + counts.edited > 0 ? 'InReview' : 'Draft';
}

/**
 * Quy tắc cổng đóng case, tách thuần khỏi phần đọc DB.
 *
 * Nhận tập bước đã Complete, trả kết quả cổng. Không đọc gì từ đầu ra của model
 * — cổng là phép đếm, không phải một khẳng định (R2.8.2).
 */
export function buildClosureGate(completeCodes: Iterable<string>): ClosureGate {
    const complete = new Set(completeCodes);
    const incomplete = GATED_CODES.filter((code) => !complete.has(code));
    return {
        passed: incomplete.length === 0,
        incomplete,
        message: incomplete.length === 0
            ? 'All of D1–D7 are complete. This case can be closed.'
            : `Cannot close: ${incomplete.join(', ')} ${incomplete.length === 1 ? 'is' : 'are'} not marked complete.`,
    };
}

export function isSuggestionOutcome(value: string): value is SuggestionOutcome {
    return (SUGGESTION_OUTCOMES as readonly string[]).includes(value);
}

/**
 * Đặt trạng thái duyệt của một bước. Đường DUY NHẤT ghi vào `stepStatus`.
 *
 * `actor` lấy từ `req.user`, không nhận từ payload của client: để client tự khai
 * mình là ai thì cột `approvedBy` không còn là bằng chứng gì cả.
 */
export async function setDisciplineStatus(
    disciplineID: string,
    status: string,
    actor: string,
): Promise<StepActivity> {
    if (!isStoredStatus(status)) {
        throw Object.assign(
            new Error(`status must be one of ${STORED_STEP_STATUSES.join(', ')}`),
            { code: 400 },
        );
    }

    const row = await SELECT.one
        .from(DISCIPLINES)
        .columns('ID', 'code', 'report_ID')
        .where({ ID: disciplineID });
    if (!row) throw Object.assign(new Error('Discipline not found'), { code: 404 });

    // D8 không được Complete khi D1–D7 chưa xong. Chặn ở đây chứ không chỉ ở
    // `closeReport`: nếu chỉ chặn lúc đóng thì UI vẫn cho tick Complete trên D8
    // rồi mới báo lỗi ở bước sau, và người dùng đã tin là mình duyệt xong rồi.
    if (row.code === 'D8' && status === 'Complete') {
        const gate = await computeClosureGate(row.report_ID);
        if (!gate.passed) throw Object.assign(new Error(gate.message), { code: 409 });
    }

    await UPDATE(DISCIPLINES)
        .set(
            status === 'Complete'
                ? { stepStatus: status, approvedBy: actor, approvedAt: new Date().toISOString() }
                // Mở lại thì xoá luôn dấu duyệt cũ: giữ `approvedBy` của một
                // bước đang Draft là để lại một chữ ký cho nội dung đã đổi.
                : { stepStatus: status, approvedBy: null, approvedAt: null },
        )
        .where({ ID: disciplineID });

    const activity = await getDisciplineActivity(row.report_ID);
    return activity.find((entry) => entry.disciplineID === disciplineID)!;
}

/**
 * Ghi một dòng vết cho đề xuất.
 *
 * Ghi cả `shown` chứ không chỉ lúc người dùng bấm: tỉ lệ bị từ chối mới là con
 * số nói lên chất lượng gợi ý, và một đề xuất bị bỏ qua hoàn toàn thì không có
 * thao tác nào để mà ghi.
 */
export async function recordSuggestionOutcome(input: {
    reportID: string;
    stepCode: string;
    suggestionKey: string;
    outcome: string;
    payload?: unknown;
    actor: string;
}): Promise<void> {
    if (!isSuggestionOutcome(input.outcome)) {
        throw Object.assign(
            new Error(`outcome must be one of ${SUGGESTION_OUTCOMES.join(', ')}`),
            { code: 400 },
        );
    }

    await INSERT.into(SUGGESTION_AUDIT).entries({
        ID: cds.utils.uuid(),
        report_ID: input.reportID,
        stepCode: input.stepCode,
        action: input.outcome,
        suggestionKey: input.suggestionKey,
        payload:
            input.payload === undefined
                ? null
                : typeof input.payload === 'string'
                    ? input.payload
                    : JSON.stringify(input.payload),
        actor: input.actor,
    });
}

/**
 * Ghi một loạt dòng `shown` ngay sau khi pipeline lưu kết quả.
 *
 * Tách khỏi `saveResult` để việc ghi vết không kéo theo rủi ro cho việc lưu báo
 * cáo: audit hỏng thì mất vết, còn báo cáo vẫn còn. Ngược lại thì không chấp
 * nhận được.
 */
export async function recordShownSuggestions(
    reportID: string,
    shown: Array<{ stepCode: string; suggestionKey: string; payload?: unknown }>,
    actor = 'system',
): Promise<void> {
    if (!shown.length) return;
    await INSERT.into(SUGGESTION_AUDIT).entries(
        shown.map((entry) => ({
            ID: cds.utils.uuid(),
            report_ID: reportID,
            stepCode: entry.stepCode,
            action: 'shown' satisfies SuggestionOutcome,
            suggestionKey: entry.suggestionKey,
            payload: entry.payload === undefined ? null : JSON.stringify(entry.payload),
            actor,
        })),
    );
}

/**
 * Trạng thái + số liệu audit của cả 8 bước trong MỘT lời gọi.
 *
 * Gộp lại vì trang chi tiết cần đủ 8 dòng cùng lúc để vẽ thanh trạng thái; hỏi
 * lẻ từng bước là 8 vòng round-trip cho một thứ luôn hiện cùng nhau.
 */
export async function getDisciplineActivity(reportID: string): Promise<StepActivity[]> {
    const [rows, audit] = await Promise.all([
        SELECT.from(DISCIPLINES)
            .columns('ID', 'code', 'sequence', 'stepStatus', 'approvedBy', 'approvedAt')
            .where({ report_ID: reportID }),
        SELECT.from(SUGGESTION_AUDIT)
            .columns('stepCode', 'action', 'suggestionKey', 'payload', 'actor', 'createdAt')
            .where({ report_ID: reportID })
            // Cũ trước, mới sau: bên dưới ghi đè theo thứ tự, nên dòng cuối cùng
            // của một khoá là quyết định còn hiệu lực.
            .orderBy('createdAt'),
    ]);

    type AuditRow = {
        stepCode: string; action: string; suggestionKey: string | null;
        payload: string | null; actor: string | null; createdAt: string | null;
    };

    const counts = new Map<string, Record<SuggestionOutcome, number>>();
    const decisions = new Map<string, Map<string, StepDecision>>();

    for (const entry of audit as AuditRow[]) {
        if (!isSuggestionOutcome(entry.action)) continue;
        const bucket = counts.get(entry.stepCode)
            ?? { shown: 0, accepted: 0, rejected: 0, edited: 0 };
        bucket[entry.action] += 1;
        counts.set(entry.stepCode, bucket);

        // `shown` không phải một quyết định — nó là việc hệ thống trình bày, chứ
        // không phải việc người dùng chọn.
        if (entry.action === 'shown' || !entry.suggestionKey) continue;
        const byKey = decisions.get(entry.stepCode) ?? new Map<string, StepDecision>();
        let payload: unknown = null;
        try { payload = entry.payload ? JSON.parse(entry.payload) : null; } catch { payload = entry.payload; }
        // Ghi đè: đổi ý thì lần chốt sau thắng, và bảng "đã chốt" đi theo.
        byKey.set(entry.suggestionKey, {
            suggestionKey: entry.suggestionKey,
            outcome: entry.action as Exclude<SuggestionOutcome, 'shown'>,
            payload,
            decidedBy: entry.actor ?? null,
            decidedAt: entry.createdAt ?? null,
        });
        decisions.set(entry.stepCode, byKey);
    }

    return (rows as Array<Record<string, any>>)
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
        .map((row) => {
            const bucket = counts.get(row.code) ?? { shown: 0, accepted: 0, rejected: 0, edited: 0 };
            const stepStatus: StoredStepStatus = row.stepStatus === 'Complete' ? 'Complete' : 'Draft';
            return {
                code: row.code as DisciplineCode,
                disciplineID: row.ID,
                stepStatus,
                // Đây là toàn bộ chỗ 'In review' tồn tại: một phép suy, không
                // phải một cột.
                state: deriveStepState(stepStatus, bucket),
                approvedBy: row.approvedBy ?? null,
                approvedAt: row.approvedAt ?? null,
                counts: bucket,
                decisions: [...(decisions.get(row.code)?.values() ?? [])],
            } satisfies StepActivity;
        });
}

/**
 * Cổng đóng case: D1–D7 đã Complete chưa.
 *
 * Tính ở server từ `stepStatus`, KHÔNG đọc từ đầu ra của model. Prompt có nói gì
 * đi nữa thì kết quả cổng vẫn là phép đếm này (R2.8.2).
 */
export async function computeClosureGate(reportID: string): Promise<ClosureGate> {
    const rows = await SELECT.from(DISCIPLINES)
        .columns('code', 'stepStatus')
        .where({ report_ID: reportID });

    return buildClosureGate(
        (rows as Array<{ code: string; stepStatus: string }>)
            .filter((row) => row.stepStatus === 'Complete')
            .map((row) => row.code),
    );
}

/**
 * Đóng case. Người bấm, không phải AI (R0.4).
 *
 * Cổng được tính lại ngay tại đây thay vì tin vào kết quả UI đang hiện: giữa lúc
 * trang được vẽ và lúc nút được bấm, một bước có thể đã bị mở lại ở tab khác.
 */
export async function closeReport(reportID: string, actor: string): Promise<ClosureGate> {
    const report = await SELECT.one.from(REPORTS).columns('ID', 'status').where({ ID: reportID });
    if (!report) throw Object.assign(new Error('Report not found'), { code: 404 });
    if (report.status === 'Closed') return computeClosureGate(reportID);

    const gate = await computeClosureGate(reportID);
    if (!gate.passed) throw Object.assign(new Error(gate.message), { code: 409 });

    await UPDATE(REPORTS).set({ status: 'Closed' }).where({ ID: reportID });
    await recordSuggestionOutcome({
        reportID,
        stepCode: 'D8',
        suggestionKey: 'closure',
        outcome: 'accepted',
        payload: { closedBy: actor, gate },
        actor,
    });

    return gate;
}
