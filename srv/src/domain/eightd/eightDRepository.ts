/**
 * Đọc/ghi báo cáo 8D.
 *
 * ── TUYỆT ĐỐI KHÔNG dùng `cds.tx()` ở tầng này ──
 * Driver SQLite của CAP giữ ĐÚNG MỘT connection cho mỗi tenant
 * (`libx/_runtime/sqlite/Service.js`), tuần tự hoá bằng cờ `_busy` và một hàng
 * đợi KHÔNG có timeout. Transaction chiếm connection ở `begin()` và chỉ nhả ở
 * `commit()`.
 *
 * Nghĩa là: tạo một transaction độc lập trong khi transaction khác đang mở =
 * tự khoá chính mình, treo vĩnh viễn. Bản đầu của file này mắc đúng lỗi đó —
 * `createReport` chạy lọt (chưa có tx nào mở), rồi `getGlobalModelConfig` mở tx
 * của request, rồi `saveResult` xếp hàng chờ mãi mãi. Cả bốn case seed đều treo
 * đủ 240 giây trước khi client bỏ cuộc.
 *
 * Mọi hàm ở đây dùng transaction sẵn có của lời gọi. Việc tách vòng đời được
 * giải quyết ở tầng trên bằng `cds.spawn` — xem `srv/src/services/eightDService.ts`.
 */

import cds from '@sap/cds';
import type { AnalyzeOutcome, CaseContext, DisciplineCode } from './types';
import {
    evaluateClosureGate,
    normalizeStatus,
    type ClosureGate,
    type ReviewStatus,
} from './review';
import {
    parseConfirmedFields,
} from './fieldConfirm';
import { assignedFieldFor, normalizeActionStatus, normalizeTasks } from '../../../../shared/action-task';
import { getPath } from './runtimeConfig';

const REPORTS = 'cnma.proresolve.Reports';
const DISCIPLINES = 'cnma.proresolve.Disciplines';
const REVIEW_EVENTS = 'cnma.proresolve.ReviewEvents';
const TASK_EVIDENCES = 'cnma.proresolve.TaskEvidences';

export interface ReportRow {
    ID: string;
    notificationId: string;
    status: string;
    sourcePayload: string;
}

/** Số EUR có thể là chuỗi trong workbook — chỉ ghi khi ra được số thật. */
function numberOrNull(v: unknown): number | null {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * Tạo bản ghi ở trạng thái `Analyzing`.
 *
 * Gọi từ handler của request, nên nó commit ngay khi handler trả về — trước khi
 * pipeline AI bắt đầu chạy ở nền. Nhờ vậy UI thấy case "đang phân tích" ngay lập
 * tức thay vì chờ một phút không biết chuyện gì xảy ra.
 */
export async function createReport(
    payload: string,
    context: CaseContext,
    title?: string,
): Promise<string> {
    const ID = cds.utils.uuid();

    await INSERT.into(REPORTS).entries({
        ID,
        status: 'Analyzing',

        notificationId: context.notificationId,
        origin: context.origin,
        symptomShortText: title?.trim() || context.header.symptomShortText,
        sapStatus: context.header.status,
        foundDate: context.header.foundDate,
        completionDate: context.header.completionDate,
        quantityExtent: context.header.quantityExtent,
        teamSize: context.header.teamSize,

        materialId: context.product.materialId,
        materialDesc: context.product.materialDesc,
        batchId: context.product.batchId,
        defectCode: context.product.defectCode,
        defectText: context.product.defectText,
        workCenterId: context.product.workCenterId,
        workCenterDesc: context.product.workCenterDesc,

        copqEur: numberOrNull(context.copqEur),
        rootCauseCategory: context.rootCause?.category ?? null,
        fmeaId: context.fmea?.fmeaId ?? null,

        sourcePayload: payload,
        caseContext: JSON.stringify(context),
    });

    return ID;
}

export interface PartialDisciplineItem {
    discipline: import('./types').DisciplineDraft;
    runtime?: {
        resultJson?: string;
        formSchemaJson?: string;
        validationJson?: string;
        configVersion?: string;
    };
}

/** Ghi/Cập nhật một discipline riêng lẻ vào DB cho báo cáo. */
export async function savePartialDiscipline(
    reportID: string,
    item: PartialDisciplineItem,
): Promise<void> {
    const d = item.discipline;
    await DELETE.from(DISCIPLINES).where({ report_ID: reportID, code: d.code });
    await INSERT.into(DISCIPLINES).entries({
        ID: cds.utils.uuid(),
        report_ID: reportID,
        code: d.code,
        sequence: d.sequence,
        title: d.title,
        summary: d.summary,
        content: d.content,
        actionItems: JSON.stringify(d.actionItems ?? []),
        sources: JSON.stringify(d.sources ?? []),
        confidence: d.confidence,
        dataBacked: d.dataBacked,
        resultJson: item.runtime?.resultJson ?? JSON.stringify(d.data ?? {}),
        formSchemaJson: item.runtime?.formSchemaJson ?? null,
        validationJson: item.runtime?.validationJson ?? null,
        configVersion: item.runtime?.configVersion ?? null,
        aiGenerated: true,
    });
}

/** Ghi context, chẩn đoán mù và tiền lệ sớm cho report để UI đọc được ngay. */
export async function saveReportContext(
    reportID: string,
    context: CaseContext,
    independent?: unknown,
    precedents?: unknown,
): Promise<void> {
    const ind = independent as
        | { finding?: { confidence?: number }; verdict?: { aiCategory?: string; agrees?: boolean } }
        | undefined;
    await UPDATE(REPORTS).set({
        caseContext: JSON.stringify(context),
        precedentsJson: precedents ? JSON.stringify(precedents) : null,
        aiFinding: ind ? JSON.stringify(ind) : null,
        aiRootCause: ind?.verdict?.aiCategory ?? null,
        aiAgreesWithRecord: ind?.verdict?.agrees ?? null,
        aiConfidence: numberOrNull(ind?.finding?.confidence),
    }).where({ ID: reportID });
}

/** Hoàn tất phân tích report: ghi hai bản tóm tắt, cập nhật status Analyzed và số đo. */
export async function finalizeReport(
    reportID: string,
    summaryInfo: {
        internalSummary?: string | null;
        customerSummary?: string | null;
        models: { parse: string; analyze: string };
        tokensUsed: number;
        durationMs: number;
    },
): Promise<void> {
    await UPDATE(REPORTS).set({
        status: 'Analyzed',
        internalSummary: summaryInfo.internalSummary ?? null,
        customerSummary: summaryInfo.customerSummary ?? null,
        aiModelParse: summaryInfo.models.parse,
        aiModelAnalyze: summaryInfo.models.analyze,
        analyzedAt: new Date().toISOString(),
        tokensUsed: summaryInfo.tokensUsed,
        durationMs: summaryInfo.durationMs,
        errorMessage: null,
    }).where({ ID: reportID });
}

/** Ghi kết quả và chuyển sang `Analyzed`. Xoá disciplines cũ trước — xem `reanalyze`. */
export async function saveResult(reportID: string, outcome: AnalyzeOutcome): Promise<void> {
    const { result, context, models, tokensUsed, durationMs } = outcome;

    await DELETE.from(DISCIPLINES).where({ report_ID: reportID });
    for (const d of result.disciplines) {
        await savePartialDiscipline(reportID, {
            discipline: d,
            runtime: outcome.runtime?.[d.code],
        });
    }

    await saveReportContext(reportID, context, outcome.independent, outcome.precedents);

    await finalizeReport(reportID, {
        internalSummary: result.internalSummary,
        customerSummary: result.customerSummary,
        models,
        tokensUsed,
        durationMs,
    });
}

/** Ghi kết quả cho các bước downstream và cập nhật summary của report mà không xoá các bước trước. */
export async function saveDownstreamResult(
    reportID: string,
    outcome: AnalyzeOutcome,
    downstreamCodes: readonly DisciplineCode[],
): Promise<void> {
    const { result, models, tokensUsed, durationMs } = outcome;

    for (const d of result.disciplines) {
        if (downstreamCodes.includes(d.code)) {
            await savePartialDiscipline(reportID, {
                discipline: d,
                runtime: outcome.runtime?.[d.code],
            });
        }
    }

    await finalizeReport(reportID, {
        internalSummary: result.internalSummary,
        customerSummary: result.customerSummary,
        models,
        tokensUsed,
        durationMs,
    });
}

/**
 * Đánh dấu thất bại.
 *
 * Giữ lại bản ghi thay vì xoá: một lần chạy hỏng có `errorMessage` thì còn debug
 * được, xoá đi thì người dùng chỉ thấy "không có gì xảy ra".
 */
export async function markFailed(reportID: string, message: string): Promise<void> {
    await UPDATE(REPORTS).set({
        status: 'Failed',
        // Cột giới hạn 1000 ký tự — cắt ở đây chứ đừng để DB ném lỗi rồi nuốt
        // mất nguyên nhân thật.
        errorMessage: message.slice(0, 1000),
    }).where({ ID: reportID });
}

/** Bản ghi tối thiểu cần cho `reanalyze`. `null` khi không tìm thấy. */
export async function getReportForRerun(reportID: string): Promise<ReportRow | null> {
    const row = await SELECT.one.from(REPORTS)
        .columns('ID', 'notificationId', 'status', 'sourcePayload')
        .where({ ID: reportID });
    return (row as ReportRow) ?? null;
}

/** Đặt lại trạng thái trước khi chạy lại, xoá luôn lỗi của lần trước. */
export async function markAnalyzing(reportID: string): Promise<void> {
    await UPDATE(REPORTS)
        .set({ status: 'Analyzing', errorMessage: null })
        .where({ ID: reportID });
}

/**
 * Đưa những bản ghi kẹt ở `Analyzing` về `Failed`.
 *
 * Chạy lúc khởi động. Job nền sống trong tiến trình; server chết giữa chừng thì
 * bản ghi kẹt ở `Analyzing` vĩnh viễn và UI quay vòng mãi không dừng. Dọn lúc
 * boot là cách duy nhất để phân biệt "đang chạy" với "đã chết từ lần trước".
 *
 * @returns Số bản ghi đã dọn
 */
export async function sweepStuckAnalyzing(): Promise<number> {
    const stuck = await SELECT.from(REPORTS).columns('ID').where({ status: 'Analyzing' });
    if (!stuck.length) return 0;

    await UPDATE(REPORTS).set({
        status: 'Failed',
        errorMessage: 'Server khởi động lại trong lúc đang phân tích. Chạy lại để có kết quả.',
    }).where({ status: 'Analyzing' });

    return stuck.length;
}

/** Mot dong nhom 8D nguoi dung da chot cho D1. */
export interface AssignedTeamRow {
    partnerId: string;
    partnerName: string;
    functionTitle: string;
    partnerRole: string;
}

/**
 * Ghi nhom 8D da chot vao `team.assignedRoster` cua discipline D1.
 *
 * -- Vi sao merge chu khong ghi de ca resultJson --
 * `resultJson` chua toan bo ket luan cua AI cho buoc do. Client gui len ca cuc
 * roi ghi de nghia la moi lan luu nhom, moi phan con lai deu bi thay bang ban
 * ma trinh duyet dang giu - va mot tab mo tu truoc se lang le keo du lieu cu ve.
 * Doc-sua-ghi o server chi dung mot khoa thi khong co duong nao de chuyen do xay ra.
 *
 * `aiGenerated` giu nguyen `true`: buoc nay VAN do AI sinh, chi rieng danh sach
 * nguoi la do con nguoi chot. Ha co xuong `false` se noi doi ve phan con lai.
 */
export async function saveAssignedTeam(
    disciplineID: string,
    roster: AssignedTeamRow[],
): Promise<void> {
    const row = await SELECT.one.from(DISCIPLINES)
        .columns('ID', 'code', 'resultJson', 'reviewStatus', 'workState')
        .where({ ID: disciplineID });
    if (!row) throw Object.assign(new Error(`Discipline ${disciplineID} not found.`), { code: 404 });
    if (normalizeStatus((row as any).reviewStatus) === 'Approved') {
        throw Object.assign(
            new Error(`Discipline ${row.code} has been completed and locked. Reopen the step to make changes.`),
            { code: 400 },
        );
    }
    if ((row as any).workState !== 'InProgress') {
        throw Object.assign(
            new Error(`Discipline ${row.code} is not in process (current status: ${(row as any).workState ?? 'NotStarted'}). Switch status to 'In process' to edit.`),
            { code: 400 },
        );
    }
    if (row.code !== 'D1') {
        throw Object.assign(
            new Error(`Only D1 has a team roster to save; this discipline is ${row.code}.`),
            { code: 400 },
        );
    }

    // resultJson hong hoac rong khong duoc lam hong luon thao tac luu: nhom nguoi
    // dung vua gan la du lieu that, con phan AI thi da hong san tu truoc.
    let data: Record<string, unknown> = {};
    try {
        const parsed = JSON.parse(String(row.resultJson ?? '{}'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            data = parsed as Record<string, unknown>;
        }
    } catch { /* bat dau tu object rong */ }

    const team = data.team && typeof data.team === 'object' && !Array.isArray(data.team)
        ? { ...(data.team as Record<string, unknown>) }
        : {};
    team.assignedRoster = roster;

    await UPDATE(DISCIPLINES)
        .set({ resultJson: JSON.stringify({ ...data, team }) })
        .where({ ID: disciplineID });

    cds.log('eightd-repo').info(`Saved 8D team for discipline ${disciplineID}: ${roster.length} member(s)`);
}


/**
 * Nhung khoa trong `resultJson` ma NGUOI DUNG duoc ghi, theo tung buoc D.
 *
 * Danh sach trang, khong phai danh sach den: them mot buoc D moi thi phai chu y
 * khai bao o day. Khoa nao khong co trong danh sach thi bi tu choi - ke ca khi
 * client gui len dung ten.
 *
 * Moi khoa deu la khoa RIENG cua nguoi dung. Khong khoa nao trung voi khoa AI
 * ghi, nen mot lan luu khong bao gio de mat ket luan cua may.
 */
const HUMAN_WRITABLE_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
    D1: new Set(['team.assignedRoster', 'team.roster']),
    D2: new Set([
        'problem.statementOverride',
        'problem.what',
        'problem.where',
        'problem.when',
        'problem.who',
        'problem.how',
        'problem.extent',
        'problem.is',
        'problem.isNot',
        'problem.isIsNotBasis',
    ]),
    D3: new Set(['containment.actions', 'containment.actionsOverride', 'containment.assignedActions', 'actionItems', 'actions']),
    D4: new Set([
        'whyChain',
        'ishikawaCustomFindings',
        'selectedRootCategory',
        'rootCause.whyChain',
        'rootCause.ishikawa',
        'rootCause.fiveWhy',
        'rootCause.customFindings',
        'rootCause.statement',
        'rootCause.statementOverride',
        'statement',
    ]),
    D5: new Set(['corrective.actions', 'corrective.assignedActions', 'actionItems', 'actions']),
    D6: new Set(['verification.plan', 'verification.assignedActions', 'implementation.actions', 'implementation.assignedActions', 'actionItems', 'actions']),
    D7: new Set(['preventive.actions', 'preventive.assignedActions', 'preventive.fmea', 'prevention.actions', 'prevention.assignedActions', 'actionItems', 'actions']),
    D8: new Set(['closure.notes', 'closure.teamRecognition', 'closure.lessonsWhatWorked', 'closure.lessonsWhatDidNot']),
});

/**
 * Ghi mot khoa vao `resultJson` cua mot discipline.
 *
 * Doc-sua-ghi o SERVER chu khong nhan ca cuc `resultJson` tu client: nhan ca cuc
 * nghia la mot tab mo tu truoc bam Save se lang le keo moi thu khac ve ban cu.
 */
export async function saveDisciplineFieldValue(
    disciplineID: string,
    fieldKey: string,
    value: unknown,
): Promise<void> {
    const row = await SELECT.one.from(DISCIPLINES)
        .columns('ID', 'code', 'resultJson', 'reviewStatus', 'workState')
        .where({ ID: disciplineID });
    if (!row) throw Object.assign(new Error(`Discipline ${disciplineID} not found.`), { code: 404 });
    const isApproved = normalizeStatus((row as any).reviewStatus) === 'Approved';
    const isTaskActionUpdate = fieldKey.endsWith('.assignedActions') || fieldKey === 'assignedActions';

    if (isApproved && !isTaskActionUpdate) {
        throw Object.assign(
            new Error(`Discipline ${row.code} has been completed and locked. Reopen the step to make changes.`),
            { code: 400 },
        );
    }
    if ((row as any).workState !== 'InProgress') {
        throw Object.assign(
            new Error(`Discipline ${row.code} is not in process (current status: ${(row as any).workState ?? 'NotStarted'}). Switch status to 'In process' to edit.`),
            { code: 400 },
        );
    }

    const allowed = HUMAN_WRITABLE_FIELDS[String(row.code)];
    if (!allowed?.has(fieldKey)) {
        throw Object.assign(
            new Error(`"${fieldKey}" is not user-writable on ${row.code}. `
                + `Allowed: ${allowed ? [...allowed].join(', ') || 'none' : 'none'}.`),
            { code: 400 },
        );
    }

    // resultJson hong khong duoc lam hong luon thao tac luu: thu nguoi dung vua
    // nhap la du lieu that, con phan AI thi da hong san tu truoc.
    let data: Record<string, unknown> = {};
    try {
        const parsed = JSON.parse(String(row.resultJson ?? '{}'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            data = parsed as Record<string, unknown>;
        }
    } catch { /* bat dau tu object rong */ }

    // Khoa dang `a.b` la object long nhau trong resultJson, khong phai mot khoa
    // phang co dau cham - dat sai tang thi `getPath` o UI khong bao gio tim thay.
    const parts = fieldKey.split('.');
    let cursor = data;
    for (const part of parts.slice(0, -1)) {
        const next = cursor[part];
        cursor[part] = next && typeof next === 'object' && !Array.isArray(next)
            ? { ...(next as Record<string, unknown>) } : {};
        cursor = cursor[part] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]] = value;

    if (!isApproved) {
        // Tự động chuyển NotStarted -> InProgress khi có thao tác sửa thật
        const currentWorkState = String((row as any).workState ?? 'NotStarted');
        const nextWorkState = currentWorkState === 'NotStarted' ? 'InProgress' : currentWorkState;

        await UPDATE(DISCIPLINES).set({
            resultJson: JSON.stringify(data),
            workState: nextWorkState,
        }).where({ ID: disciplineID });
    } else {
        await UPDATE(DISCIPLINES).set({
            resultJson: JSON.stringify(data),
        }).where({ ID: disciplineID });
    }

    cds.log('eightd-repo').info(`Saved ${fieldKey} on discipline ${disciplineID} (${row.code})`);
}

/**
 * Xác nhận hoặc gỡ xác nhận một trường thông tin AI trong bước D.
 */
export async function confirmDisciplineField(
    disciplineID: string,
    fieldKey: string,
    confirmed: boolean,
): Promise<{ confirmedFields: string[] }> {
    const row = await SELECT.one.from(DISCIPLINES)
        .columns('ID', 'code', 'report_ID', 'resultJson', 'reviewStatus', 'confirmedFieldsJson', 'workState')
        .where({ ID: disciplineID });
    if (!row) throw Object.assign(new Error(`Discipline ${disciplineID} not found.`), { code: 404 });
    if (normalizeStatus((row as any).reviewStatus) === 'Approved') {
        throw Object.assign(
            new Error(`Discipline ${row.code} has been completed and locked. Reopen the step to make changes.`),
            { code: 400 },
        );
    }
    if ((row as any).workState !== 'InProgress') {
        throw Object.assign(
            new Error(`Discipline ${row.code} is not in process (current status: ${(row as any).workState ?? 'NotStarted'}). Switch status to 'In process' to confirm fields.`),
            { code: 400 },
        );
    }

    if (confirmed) {
        // CỔNG CHẶN SERVER: Kiểm tra bằng chứng hoàn thành (evidence) cho các task đã Done
        let resultData: Record<string, unknown> = {};
        try {
            resultData = JSON.parse(String((row as any).resultJson ?? '{}'));
        } catch { /* empty */ }

        const assignedKey = assignedFieldFor(fieldKey);
        const tasksRaw = getPath(resultData, assignedKey) || getPath(resultData, fieldKey);
        const tasks = normalizeTasks(tasksRaw);
        const doneTasks = tasks.filter((t) => t.status === 'Done');

        if (doneTasks.length > 0) {
            const reportID = String((row as any).report_ID ?? '');
            const disciplineCode = String(row.code ?? '');
            const evidences = await SELECT.from(TASK_EVIDENCES)
                .columns('taskId')
                .where({ reportID, disciplineCode });
            const evidenceTaskIds = new Set(evidences.map((e: any) => String(e.taskId)));
            const missingEvidence = doneTasks.filter((t) => !evidenceTaskIds.has(t.id));
            if (missingEvidence.length > 0) {
                const names = missingEvidence.map((t) => t.name || t.id).join(', ');
                throw Object.assign(
                    new Error(
                        `Cannot confirm "${fieldKey}": ${missingEvidence.length} task(s) marked Done are missing completion evidence (${names}). Please upload PDF evidence before confirming.`,
                    ),
                    { code: 400 },
                );
            }
        }
    }

    const keys = fieldKey.split(',').map((k) => k.trim()).filter(Boolean);
    const currentList = parseConfirmedFields((row as any).confirmedFieldsJson);
    const set = new Set(currentList);
    for (const k of keys) {
        if (confirmed) {
            set.add(k);
        } else {
            set.delete(k);
        }
    }
    const nextConfirmed = [...set];

    await UPDATE(DISCIPLINES).set({
        confirmedFieldsJson: JSON.stringify(nextConfirmed),
    }).where({ ID: disciplineID });

    cds.log('eightd-repo').info(
        `${confirmed ? 'Confirmed' : 'Unconfirmed'} ${fieldKey} on discipline ${disciplineID} (${row.code})`,
    );
    return { confirmedFields: nextConfirmed };
}

/**
 * Đặt trạng thái xử lý (workState) của bước D (NotStarted <-> InProgress).
 */
export async function setDisciplineWorkState(
    disciplineID: string,
    newWorkState: string,
): Promise<{ workState: string }> {
    const state = String(newWorkState ?? '').trim();
    if (state !== 'NotStarted' && state !== 'InProgress' && state !== 'Completed') {
        throw Object.assign(
            new Error(`Invalid workState "${state}". Allowed values: NotStarted, InProgress, Completed.`),
            { code: 400 },
        );
    }

    const row = await SELECT.one.from(DISCIPLINES)
        .columns('ID', 'code', 'reviewStatus', 'workState')
        .where({ ID: disciplineID });
    if (!row) throw Object.assign(new Error(`Discipline ${disciplineID} not found.`), { code: 404 });

    const reviewStatus = state === 'Completed' ? 'Approved' : 'Draft';

    await UPDATE(DISCIPLINES).set({
        workState: state,
        reviewStatus: reviewStatus,
    }).where({ ID: disciplineID });

    cds.log('eightd-repo').info(`Set workState to ${state} on discipline ${disciplineID} (${row.code})`);
    return { workState: state };
}

// ─────────────────────────────────────────────────────────────────────────────
// Duyệt từng bước
// ─────────────────────────────────────────────────────────────────────────────

export interface ReviewResult {
    disciplineID: string;
    code: string;
    fromStatus: ReviewStatus;
    toStatus: ReviewStatus;
    reviewedBy: string;
    reviewedAt: string;
    gate: ClosureGate;
}

/**
 * Ghi một quyết định duyệt, kèm một dòng vết KHÔNG XOÁ được.
 *
 * Hai thao tác ghi phải đi cùng nhau: trạng thái hiện tại để UI và cổng D8 đọc,
 * và dòng lịch sử để trả lời được "đã qua mấy vòng". Ghi trạng thái mà quên vết
 * thì một case bị trả lại rồi duyệt lại trông y hệt case duyệt thẳng.
 *
 * `actor` lấy từ `req.user` ở tầng service, KHÔNG nhận từ client — chữ ký mà
 * client tự khai được thì không phải chữ ký.
 */
export async function reviewDiscipline(
    disciplineID: string,
    toStatus: ReviewStatus,
    note: string | null,
    actor: string,
): Promise<ReviewResult> {
    const row = await SELECT.one.from(DISCIPLINES)
        .columns('ID', 'code', 'reviewStatus', 'report_ID', 'formSchemaJson', 'confirmedFieldsJson', 'workState')
        .where({ ID: disciplineID });
    if (!row) throw Object.assign(new Error(`Discipline ${disciplineID} not found.`), { code: 404 });

    const reportID = String((row as any).report_ID ?? '');
    const fromStatus = normalizeStatus((row as any).reviewStatus);
    const at = new Date().toISOString();

    let nextWorkState = String((row as any).workState ?? 'NotStarted');

    if (toStatus === 'Approved') {
        if (String(row.code ?? '') === 'D6') {
            const siblings = await SELECT.from(DISCIPLINES)
                .columns('code', 'resultJson')
                .where({ report_ID: reportID });

            for (const s of siblings) {
                if (['D3', 'D5', 'D7'].includes(String(s.code))) {
                    let parsed: any = {};
                    try {
                        parsed = JSON.parse(String(s.resultJson ?? '{}'));
                    } catch { /* empty */ }
                    const keyPrefix = s.code === 'D3' ? 'containment' : s.code === 'D5' ? 'corrective' : 'preventive';
                    const tasks = parsed?.[keyPrefix]?.assignedActions || parsed?.assignedActions || [];
                    if (Array.isArray(tasks) && tasks.length > 0) {
                        for (const t of tasks) {
                            const status = normalizeActionStatus(t?.status);
                            if (status !== 'Done' && status !== 'Verified') {
                                const taskName = t?.name || t?.actionText || t?.action || 'Task';
                                throw Object.assign(
                                    new Error(`Cannot complete D6: Task "${taskName}" in ${s.code} is still ${status}. All action tasks in D3, D5, and D7 must be completed (Done or Verified) first.`),
                                    { code: 400 },
                                );
                            }
                        }
                    }
                }
            }
        }
        nextWorkState = 'Completed';
    } else if (toStatus === 'Draft') {
        nextWorkState = 'InProgress';
    } else if (toStatus === 'ChangeRequested') {
        nextWorkState = 'InProgress';
    }

    await UPDATE(DISCIPLINES).set({
        reviewStatus: toStatus,
        reviewedBy: actor,
        reviewedAt: at,
        // Ghi chú thuộc về quyết định vừa rồi. Duyệt xong mà giữ lại ghi chú của
        // lần trả lại trước thì màn hình nói ngược với trạng thái.
        reviewNote: note ?? null,
        workState: nextWorkState,
    }).where({ ID: disciplineID });

    await INSERT.into(REVIEW_EVENTS).entries({
        reportID,
        disciplineCode: String(row.code ?? ''),
        fromStatus,
        toStatus,
        note: note ?? null,
        actor,
        at,
    });

    // Đọc lại CẢ report để tính cổng: cổng là thuộc tính của toàn case, không suy
    // ra được từ một bước vừa đổi.
    const siblings = await SELECT.from(DISCIPLINES)
        .columns('code', 'reviewStatus')
        .where({ report_ID: reportID });

    cds.log('eightd-repo').info(
        `Review ${row.code} ${fromStatus} -> ${toStatus} by ${actor} on report ${reportID}`,
    );

    return {
        disciplineID,
        code: String(row.code ?? ''),
        fromStatus,
        toStatus,
        reviewedBy: actor,
        reviewedAt: at,
        gate: evaluateClosureGate(siblings as any[]),
    };
}

/** Vết duyệt của một report, mới nhất trước. Dùng cho panel audit trên UI. */
export async function getReviewTrail(reportID: string): Promise<Record<string, unknown>[]> {
    return SELECT.from(REVIEW_EVENTS)
        .where({ reportID })
        .orderBy('at desc') as unknown as Record<string, unknown>[];
}

/** Cổng đóng case, đọc thẳng từ DB. */
export async function getClosureGate(reportID: string): Promise<ClosureGate> {
    const rows = await SELECT.from(DISCIPLINES)
        .columns('code', 'reviewStatus')
        .where({ report_ID: reportID });
    return evaluateClosureGate(rows as any[]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Quản lý bằng chứng hoàn thành (Task Completion Evidence)
// ─────────────────────────────────────────────────────────────────────────────

export interface TaskEvidenceRow {
    ID: string;
    reportID: string;
    disciplineCode: string;
    taskId: string;
    fileName: string;
    fileSize: number;
    mediaType: string;
    uploadedBy: string;
    uploadedAt: string;
}

export function findTaskInResultJson(resultJson: string | null | undefined, taskId: string): { status: string } | null {
    if (!resultJson) return null;
    try {
        const data = typeof resultJson === 'string' ? JSON.parse(resultJson) : resultJson;
        if (!data || typeof data !== 'object') return null;

        const candidateArrays: unknown[] = [];
        if (data.containment?.assignedActions) candidateArrays.push(data.containment.assignedActions);
        if (data.corrective?.assignedActions) candidateArrays.push(data.corrective.assignedActions);
        if (data.preventive?.assignedActions) candidateArrays.push(data.preventive.assignedActions);
        if (Array.isArray(data.assignedActions)) candidateArrays.push(data.assignedActions);
        if (Array.isArray(data.tasks)) candidateArrays.push(data.tasks);

        for (const val of Object.values(data)) {
            if (Array.isArray(val)) candidateArrays.push(val);
            else if (val && typeof val === 'object') {
                for (const subVal of Object.values(val as Record<string, unknown>)) {
                    if (Array.isArray(subVal)) candidateArrays.push(subVal);
                }
            }
        }

        for (const arr of candidateArrays) {
            const normalized = normalizeTasks(arr);
            const found = normalized.find((t) => t.id === taskId);
            if (found) return found;
        }
        return null;
    } catch {
        return null;
    }
}

export async function createTaskEvidence(params: {
    reportID: string;
    disciplineCode: string;
    taskId: string;
    fileName: string;
    fileSize: number;
    mediaType: string;
    content?: any;
    actor: string;
}): Promise<TaskEvidenceRow> {
    const { reportID, disciplineCode, taskId, fileName, fileSize, mediaType, content, actor } = params;

    if (mediaType !== 'application/pdf') {
        throw Object.assign(new Error('Only PDF files are allowed.'), { code: 400 });
    }

    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
    if (fileSize > MAX_SIZE) {
        const actualMb = (fileSize / (1024 * 1024)).toFixed(2);
        throw Object.assign(
            new Error(`File size exceeds 10 MB limit (actual: ${actualMb} MB).`),
            { code: 400 },
        );
    }

    const discipline = await SELECT.one.from(DISCIPLINES)
        .columns('ID', 'code', 'reviewStatus', 'resultJson', 'workState')
        .where({ report_ID: reportID, code: disciplineCode });
    if (!discipline) {
        throw Object.assign(new Error(`Discipline ${disciplineCode} not found for report ${reportID}.`), { code: 404 });
    }

    const isActionStep = ['D3', 'D5', 'D7'].includes(String(disciplineCode));
    if (normalizeStatus((discipline as any).reviewStatus) === 'Approved' && !isActionStep) {
        throw Object.assign(
            new Error(`Discipline ${disciplineCode} has been completed and locked. Reopen the step to make changes.`),
            { code: 400 },
        );
    }
    if ((discipline as any).workState !== 'InProgress') {
        throw Object.assign(
            new Error(`Discipline ${disciplineCode} is not in process. Switch status to 'In process' to upload evidence.`),
            { code: 400 },
        );
    }

    const task = findTaskInResultJson((discipline as any).resultJson, taskId);
    if (!task || (task.status !== 'Done' && task.status !== 'Verified')) {
        throw Object.assign(
            new Error('Evidence can only be uploaded for tasks with status Done or Verified.'),
            { code: 400 },
        );
    }

    const ID = cds.utils.uuid();
    const uploadedAt = new Date().toISOString();

    await INSERT.into(TASK_EVIDENCES).entries({
        ID,
        reportID,
        disciplineCode,
        taskId,
        fileName: fileName || 'evidence.pdf',
        fileSize,
        mediaType,
        content: content ?? null,
        uploadedBy: actor || 'anonymous',
        uploadedAt,
    });

    cds.log('eightd-repo').info(
        `Created task evidence ${ID} (${fileName}) for task ${taskId} on report ${reportID} (${disciplineCode}) by ${actor}`,
    );

    return {
        ID,
        reportID,
        disciplineCode,
        taskId,
        fileName: fileName || 'evidence.pdf',
        fileSize,
        mediaType,
        uploadedBy: actor || 'anonymous',
        uploadedAt,
    };
}

export async function deleteTaskEvidence(evidenceID: string): Promise<{ deleted: string }> {
    const row = await SELECT.one.from(TASK_EVIDENCES)
        .columns('ID', 'reportID', 'disciplineCode', 'taskId', 'fileName')
        .where({ ID: evidenceID });
    if (!row) {
        throw Object.assign(new Error(`Evidence ${evidenceID} not found.`), { code: 404 });
    }

    const discipline = await SELECT.one.from(DISCIPLINES)
        .columns('ID', 'code', 'reviewStatus', 'workState')
    if (discipline) {
        const isActionStep = ['D3', 'D5', 'D7'].includes(String((row as any).disciplineCode));
        if (normalizeStatus((discipline as any).reviewStatus) === 'Approved' && !isActionStep) {
            throw Object.assign(
                new Error(`Discipline ${(row as any).disciplineCode} has been completed and locked. Reopen the step to make changes.`),
                { code: 400 },
            );
        }
        if ((discipline as any).workState !== 'InProgress') {
            throw Object.assign(
                new Error(`Discipline ${(row as any).disciplineCode} is not in process. Switch status to 'In process' to delete evidence.`),
                { code: 400 },
            );
        }
    }

    await DELETE.from(TASK_EVIDENCES).where({ ID: evidenceID });
    cds.log('eightd-repo').info(`Deleted task evidence ${evidenceID}`);
    return { deleted: evidenceID };
}

export async function listTaskEvidence(reportID: string): Promise<TaskEvidenceRow[]> {
    const rows = await SELECT.from(TASK_EVIDENCES)
        .columns('ID', 'reportID', 'disciplineCode', 'taskId', 'fileName', 'fileSize', 'mediaType', 'uploadedBy', 'uploadedAt')
        .where({ reportID })
        .orderBy('uploadedAt desc');
    return rows as unknown as TaskEvidenceRow[];
}

