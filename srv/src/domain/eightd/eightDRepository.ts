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
import type { AnalyzeOutcome, CaseContext } from './types';
import {
    evaluateClosureGate,
    normalizeStatus,
    type ClosureGate,
    type ReviewStatus,
} from './review';

const REPORTS = 'cnma.proresolve.Reports';
const DISCIPLINES = 'cnma.proresolve.Disciplines';
const REVIEW_EVENTS = 'cnma.proresolve.ReviewEvents';

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

/** Ghi kết quả và chuyển sang `Analyzed`. Xoá disciplines cũ trước — xem `reanalyze`. */
export async function saveResult(reportID: string, outcome: AnalyzeOutcome): Promise<void> {
    const { result, context, models, tokensUsed, durationMs } = outcome;
    const independent = outcome.independent as
        | { finding?: { confidence?: number }; verdict?: { aiCategory?: string; agrees?: boolean } }
        | undefined;

    await DELETE.from(DISCIPLINES).where({ report_ID: reportID });

    await INSERT.into(DISCIPLINES).entries(
        result.disciplines.map((d) => ({
            ID: cds.utils.uuid(),
            report_ID: reportID,
            code: d.code,
            sequence: d.sequence,
            title: d.title,
            summary: d.summary,
            content: d.content,
            actionItems: JSON.stringify(d.actionItems),
            sources: JSON.stringify(d.sources),
            confidence: d.confidence,
            dataBacked: d.dataBacked,
            resultJson: outcome.runtime?.[d.code]?.resultJson ?? JSON.stringify(d.data ?? {}),
            formSchemaJson: outcome.runtime?.[d.code]?.formSchemaJson ?? null,
            validationJson: outcome.runtime?.[d.code]?.validationJson ?? null,
            configVersion: outcome.runtime?.[d.code]?.configVersion ?? null,
            aiGenerated: true,
        })),
    );

    await UPDATE(REPORTS).set({
        status: 'Analyzed',
        internalSummary: result.internalSummary,
        customerSummary: result.customerSummary,
        caseContext: JSON.stringify(context),
        aiModelParse: models.parse,
        aiModelAnalyze: models.analyze,
        analyzedAt: new Date().toISOString(),
        tokensUsed,
        durationMs,
        errorMessage: null,

        aiFinding: independent ? JSON.stringify(independent) : null,
        aiRootCause: independent?.verdict?.aiCategory ?? null,
        aiAgreesWithRecord: independent?.verdict?.agrees ?? null,
        aiConfidence: numberOrNull(independent?.finding?.confidence),
    }).where({ ID: reportID });
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
        .columns('ID', 'code', 'resultJson')
        .where({ ID: disciplineID });
    if (!row) throw Object.assign(new Error(`Discipline ${disciplineID} not found.`), { code: 404 });
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
    D1: new Set(['team.assignedRoster']),
    D2: new Set(['problem.statementOverride']),
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
        .columns('ID', 'code', 'resultJson')
        .where({ ID: disciplineID });
    if (!row) throw Object.assign(new Error(`Discipline ${disciplineID} not found.`), { code: 404 });

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

    await UPDATE(DISCIPLINES).set({ resultJson: JSON.stringify(data) }).where({ ID: disciplineID });
    cds.log('eightd-repo').info(`Saved ${fieldKey} on discipline ${disciplineID} (${row.code})`);
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
        .columns('ID', 'code', 'reviewStatus', 'report_ID')
        .where({ ID: disciplineID });
    if (!row) throw Object.assign(new Error(`Discipline ${disciplineID} not found.`), { code: 404 });

    const reportID = String((row as any).report_ID ?? '');
    const fromStatus = normalizeStatus((row as any).reviewStatus);
    const at = new Date().toISOString();

    await UPDATE(DISCIPLINES).set({
        reviewStatus: toStatus,
        reviewedBy: actor,
        reviewedAt: at,
        // Ghi chú thuộc về quyết định vừa rồi. Duyệt xong mà giữ lại ghi chú của
        // lần trả lại trước thì màn hình nói ngược với trạng thái.
        reviewNote: note ?? null,
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
