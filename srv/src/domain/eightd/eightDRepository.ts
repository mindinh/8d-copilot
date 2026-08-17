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

const REPORTS = 'cnma.proresolve.Reports';
const DISCIPLINES = 'cnma.proresolve.Disciplines';

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
