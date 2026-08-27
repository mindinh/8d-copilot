/**
 * Handler cho EightDService.
 *
 * Tầng này mỏng có chủ đích: nó chỉ nối HTTP với domain, quản lý vòng đời bản
 * ghi, và ánh xạ lỗi. Mọi suy luận nằm ở `srv/src/domain/eightd/`.
 *
 * ── Vì sao chạy BẤT ĐỒNG BỘ ──
 * Bản đầu chạy đồng bộ: action chờ AI xong rồi mới trả về. Nó chết vì hai lý do,
 * lý do thứ hai mới là lý do thật:
 *
 *   1. Request 60-75 giây vượt timeout mặc định của gần như mọi HTTP client.
 *
 *   2. Nghiêm trọng hơn: driver SQLite của CAP chỉ có MỘT connection cho mỗi
 *      tenant. Transaction chiếm nó ở `begin()` và giữ đến `commit()`. Chạy AI
 *      bên trong một transaction đang mở nghĩa là khoá toàn bộ DB của ứng dụng
 *      suốt 60 giây — kể cả request polling để xem tiến độ cũng bị chặn. Không
 *      có cách nào bọc pipeline dài trong transaction mà vẫn giữ app phản hồi.
 *
 * Nên: handler tạo bản ghi rồi trả về ngay, còn pipeline chạy ở nền bằng
 * `cds.spawn`. Client theo dõi qua trường `status` của Reports.
 *
 * ── Vì sao hâm nóng cache cấu hình AI trước khi spawn ──
 * `llmClient` đọc cấu hình model chung từ DB ở mỗi lời gọi. Nếu lần đọc đó rơi
 * vào giữa job nền, nó sẽ mở transaction của job và giữ connection cho tới khi
 * job kết thúc — đúng cái vấn đề vừa nói. Đọc trước ở đây, trong transaction
 * ngắn của request, thì suốt job nền mọi lời gọi đều trúng cache và KHÔNG chạm
 * DB. Xem `CACHE_TTL_MS` trong `core/ai/globalModelConfig.ts`.
 */

import cds from '@sap/cds';
import { analyze } from '../domain/eightd/eightDAnalyzer';
import { mapCase } from '../domain/eightd/caseMapper';
import { blockingIssues, validateDataset } from '../domain/eightd/datasetValidator';
import { getGlobalModelConfig } from '../core/ai/globalModelConfig';
import {
    createReport,
    getReportForRerun,
    markAnalyzing,
    markFailed,
    saveResult,
    sweepStuckAnalyzing,
} from '../domain/eightd/eightDRepository';
import { PipelineError, type CaseContext } from '../domain/eightd/types';
import {
    closeReport,
    getDisciplineActivity,
    recordShownSuggestions,
    recordSuggestionOutcome,
    setDisciplineStatus,
} from '../domain/eightd/disciplineWorkflow';
import { findPrecedentsByStep } from '../domain/eightd/precedent/findPrecedents';
import { clearLibrary, embedLibrary, seedLibrary } from '../domain/eightd/precedent/librarySeeder';
import { getWorklistItem, markEightDCreated, syncWorklist } from '../domain/eightd/worklistRepository';

const LOG = cds.log('eightd-service');

/** Gộp thông báo lỗi cùng phần chi tiết thành một dòng người đọc hiểu được. */
function describe(e: any): string {
    const base = e?.message ?? String(e);
    if (e instanceof PipelineError && Array.isArray(e.details)) {
        return `${base} ${e.details.join(' ')}`;
    }
    if (e?.response?.data) {
        return `${base} — Details: ${JSON.stringify(e.response.data)}`;
    }
    if (e?.cause) {
        return `${base} — Cause: ${e.cause.message ?? e.cause}`;
    }
    return base;
}

/**
 * Chạy pipeline ở nền rồi ghi kết quả.
 *
 * `cds.spawn` cấp cho job một transaction tách rời, chạy sau khi handler đã trả
 * về. Nhờ vậy transaction của request đóng lại và nhả connection SQLite trước
 * khi lời gọi AI bắt đầu.
 *
 * Không ném lỗi ra ngoài: không còn ai đứng đó mà nhận. Lỗi được ghi vào bản ghi
 * để người dùng đọc được ở UI.
 */
function runInBackground(reportID: string, payload: string): void {
    // Tham số đầu là options của job nền; `{}` nghĩa là chạy một lần, ngay lập
    // tức. `cds.spawn` dựng một root transaction tách rời cho mỗi lượt chạy.
    cds.spawn({}, async () => {
        try {
            const outcome = await analyze(payload);
            await saveResult(reportID, outcome);

            // Vết "đã trình bày" cho từng bản nháp, ghi SAU khi lưu và trong
            // try/catch riêng: audit hỏng thì mất vết, còn báo cáo vẫn còn —
            // chiều ngược lại thì không chấp nhận được.
            //
            // Hiện mỗi discipline một dòng `draft:<code>`. Các slice sau sẽ tách
            // nhỏ hơn (từng người ở D1, từng bài học ở D8) bằng chính hàm này,
            // chỉ đổi `suggestionKey`.
            try {
                await recordShownSuggestions(
                    reportID,
                    outcome.result.disciplines.map((d) => ({
                        stepCode: d.code,
                        suggestionKey: `draft:${d.code}`,
                        payload: { summary: d.summary, sources: d.sources, dataBacked: d.dataBacked },
                    })),
                );
            } catch (auditErr: any) {
                LOG.warn(`Không ghi được vết đề xuất cho ${reportID}:`, auditErr?.message);
            }

            LOG.info(
                `Report ${reportID} xong trong ${(outcome.durationMs / 1000).toFixed(1)}s, ` +
                `${outcome.tokensUsed} token` +
                (outcome.repairs.length ? `, postProcess chữa ${outcome.repairs.length} chỗ` : ''),
            );
        } catch (e: any) {
            LOG.error(`Report ${reportID} thất bại:`);
            LOG.error(e?.response?.data ?? e);
            try {
                await markFailed(reportID, describe(e));
            } catch (writeErr: any) {
                // Ghi lỗi mà cũng hỏng thì bản ghi kẹt ở `Analyzing`. Lần khởi
                // động sau `sweepStuckAnalyzing` sẽ dọn.
                LOG.error(`Không ghi được trạng thái Failed cho ${reportID}:`, writeErr?.message);
            }
        }
    });
}

export function registerEightDHandlers(srv: any): void {

    // ── analyzeFromJson ──────────────────────────────────────────────────────
    srv.on('analyzeFromJson', async (req: any) => {
        const { payload, title } = req.data ?? {};

        if (typeof payload !== 'string' || !payload.trim()) {
            return req.error(400, 'payload là bắt buộc và phải là chuỗi JSON.');
        }

        // Validate và map TRƯỚC khi tạo bản ghi: payload rác thì đừng để lại một
        // hàng Failed rỗng không nói lên điều gì.
        let context;
        try {
            const raw = JSON.parse(payload);

            // Chỉ chặn khi payload KHÔNG PHẢI một case. Vấn đề chất lượng —
            // thiếu nhánh Ishikawa, 5-Why cụt, action chưa phân loại — được đưa
            // vào ngữ cảnh cho model chứ không từ chối phân tích. Từ chối những
            // case đó là từ chối đúng những case cần giúp nhất.
            const blocking = blockingIssues(validateDataset(raw));
            if (blocking.length) {
                return req.error(
                    400,
                    `Payload không dùng được: ` +
                    blocking.map((i) => `[${i.constraintId}] ${i.message}`).join(' '),
                );
            }

            context = mapCase(raw);
        } catch (e: any) {
            const code = e instanceof PipelineError ? e.code : 400;
            return req.error(code, describe(e));
        }

        const reportID = await createReport(payload, context, title);

        // Nạp cấu hình model vào cache trong transaction ngắn của request, để
        // job nền không phải chạm DB giữa chừng.
        await getGlobalModelConfig();

        runInBackground(reportID, payload);

        LOG.info(`Report ${reportID} (case ${context.notificationId}) đã xếp lịch phân tích`);
        return reportID;
    });

    // ── reanalyze ────────────────────────────────────────────────────────────
    srv.on('reanalyze', async (req: any) => {
        const reportID = req.data?.reportID;
        if (typeof reportID !== 'string' || !reportID.trim()) {
            return req.error(400, 'reportID là bắt buộc.');
        }

        const row = await getReportForRerun(reportID);
        if (!row) return req.error(404, `Không tìm thấy report ${reportID}.`);
        if (!row.sourcePayload) {
            return req.error(422, `Report ${reportID} không có sourcePayload để chạy lại.`);
        }
        if (row.status === 'Analyzing') {
            return req.error(409, `Report ${reportID} đang chạy rồi.`);
        }

        await markAnalyzing(reportID);
        await getGlobalModelConfig();

        // `saveResult` xoá disciplines cũ rồi mới ghi bộ mới. Không merge: trộn
        // hai lần chạy khác model cho ra báo cáo không nhất quán mà chẳng ai truy
        // được phần nào từ đâu.
        runInBackground(reportID, row.sourcePayload);

        LOG.info(`Report ${reportID} (case ${row.notificationId}) đã xếp lịch chạy lại`);
        return reportID;
    });

    // ── syncWorklist ─────────────────────────────────────────────────────────
    srv.on('syncWorklist', async (req: any) => {
        const payload = req.data?.payload;

        // Payload là TUỲ CHỌN: rỗng nghĩa là pull từ mock-data/incoming.
        let cases: unknown[] | undefined;
        if (typeof payload === 'string' && payload.trim()) {
            let parsed: unknown;
            try {
                parsed = JSON.parse(payload);
            } catch (e: any) {
                return req.error(400, `payload không phải JSON hợp lệ: ${e.message}`);
            }
            cases = Array.isArray(parsed) ? parsed : [parsed];
        }

        return JSON.stringify(await syncWorklist(cases));
    });

    // ── createEightDFromWorklist ─────────────────────────────────────────────
    srv.on('createEightDFromWorklist', async (req: any) => {
        const itemID = req.data?.itemID;
        if (typeof itemID !== 'string' || !itemID.trim()) {
            return req.error(400, 'itemID là bắt buộc.');
        }

        const item = await getWorklistItem(itemID);
        if (!item) return req.error(404, `Không tìm thấy dòng worklist ${itemID}.`);

        // Đã mở 8D rồi thì trả về report cũ trong thông điệp lỗi, không mở bản
        // thứ hai — hai report cho cùng một notification chỉ gây nhầm lẫn.
        if (item.status === 'EightDCreated' && item.report_ID) {
            return req.error(409, `Sự vụ ${item.notificationId} đã có 8D (report ${item.report_ID}).`);
        }
        if (!item.sourcePayload) {
            return req.error(422, `Dòng worklist ${itemID} không có sourcePayload để mở 8D.`);
        }

        // Từ đây giống hệt analyzeFromJson: validate → map → tạo bản ghi → chạy nền.
        let context;
        try {
            const raw = JSON.parse(item.sourcePayload);
            const blocking = blockingIssues(validateDataset(raw));
            if (blocking.length) {
                return req.error(
                    400,
                    `Payload không dùng được: ` +
                    blocking.map((i) => `[${i.constraintId}] ${i.message}`).join(' '),
                );
            }
            context = mapCase(raw);
        } catch (e: any) {
            const code = e instanceof PipelineError ? e.code : 400;
            return req.error(code, describe(e));
        }

        const reportID = await createReport(item.sourcePayload, context);

        // Gắn report vào dòng worklist NGAY, trước khi job nền chạy: kể cả khi
        // phân tích thất bại, dòng vẫn trỏ đúng về bản ghi Failed để chạy lại.
        await markEightDCreated(itemID, reportID);

        await getGlobalModelConfig();
        runInBackground(reportID, item.sourcePayload);

        LOG.info(`Worklist ${item.notificationId} → report ${reportID} đã xếp lịch phân tích`);
        return reportID;
    });

    // ── Duyệt từng bước & đóng case ──────────────────────────────────────────
    //
    // `actor` luôn lấy từ `req.user`, không bao giờ từ `req.data`: để client tự
    // khai mình là ai thì `approvedBy` không còn là bằng chứng gì cả.

    const actorOf = (req: any): string => String(req.user?.id ?? 'anonymous');

    /** Lỗi từ tầng domain đã mang sẵn `code` HTTP — chuyển nguyên vẹn ra ngoài. */
    const rejectWith = (req: any, e: any) => req.error(e?.code ?? 500, describe(e));

    srv.on('setDisciplineStatus', async (req: any) => {
        const { disciplineID, status } = req.data ?? {};
        if (typeof disciplineID !== 'string' || !disciplineID.trim()) {
            return req.error(400, 'disciplineID là bắt buộc.');
        }
        try {
            return JSON.stringify(await setDisciplineStatus(disciplineID, String(status ?? ''), actorOf(req)));
        } catch (e: any) {
            return rejectWith(req, e);
        }
    });

    srv.on('recordSuggestionOutcome', async (req: any) => {
        const { reportID, stepCode, suggestionKey, outcome, payload } = req.data ?? {};
        if (typeof reportID !== 'string' || !reportID.trim()) {
            return req.error(400, 'reportID là bắt buộc.');
        }
        try {
            await recordSuggestionOutcome({
                reportID,
                stepCode: String(stepCode ?? '').toUpperCase(),
                suggestionKey: String(suggestionKey ?? ''),
                outcome: String(outcome ?? ''),
                payload: payload ?? undefined,
                actor: actorOf(req),
            });
            return JSON.stringify(await getDisciplineActivity(reportID));
        } catch (e: any) {
            return rejectWith(req, e);
        }
    });

    srv.on('getDisciplineActivity', async (req: any) => {
        const reportID = req.data?.reportID;
        if (typeof reportID !== 'string' || !reportID.trim()) {
            return req.error(400, 'reportID là bắt buộc.');
        }
        return JSON.stringify(await getDisciplineActivity(reportID));
    });

    srv.on('closeReport', async (req: any) => {
        const reportID = req.data?.reportID;
        if (typeof reportID !== 'string' || !reportID.trim()) {
            return req.error(400, 'reportID là bắt buộc.');
        }
        try {
            return JSON.stringify(await closeReport(reportID, actorOf(req)));
        } catch (e: any) {
            return rejectWith(req, e);
        }
    });

    // ── findPrecedents ───────────────────────────────────────────────────────
    srv.on('findPrecedents', async (req: any) => {
        const reportID = req.data?.reportID;
        if (typeof reportID !== 'string' || !reportID.trim()) {
            return req.error(400, 'reportID là bắt buộc.');
        }

        const db = await cds.connect.to('db');
        const row = await db.run(
            SELECT.one.from('cnma.proresolve.Reports')
                .columns('ID', 'notificationId', 'caseContext', 'sourcePayload')
                .where({ ID: reportID }),
        );
        if (!row) return req.error(404, `Không tìm thấy report ${reportID}.`);

        // `caseContext` được ghi lúc tạo bản ghi, nên có sẵn kể cả khi pipeline AI
        // chưa chạy xong. Rơi về `sourcePayload` phòng bản ghi cũ chưa có cột này.
        let context: CaseContext;
        try {
            context = row.caseContext
                ? (JSON.parse(row.caseContext) as CaseContext)
                : mapCase(JSON.parse(row.sourcePayload));
        } catch (e: any) {
            return req.error(422, `Report ${reportID} không dựng lại được case context: ${e.message}`);
        }

        // Bước D nào chạy profile nào là do `StepRetrievalBindings` quyết, nên
        // action này trả về CẢ TÁM kết quả chứ không một. Trả đúng một bộ nghĩa
        // là chọn hộ người gọi một trong tám, và lựa chọn đó sẽ sai với bảy bước.
        //
        // `sourcePayload` đi kèm để tiêu chí trỏ vào đường dẫn payload SAP có dữ
        // liệu mà so — thiếu nó thì chúng lặng lẽ ăn 0 điểm.
        let raw: unknown;
        try {
            raw = row.sourcePayload ? JSON.parse(row.sourcePayload) : undefined;
        } catch {
            // Payload hỏng chỉ làm mất nhóm tiêu chí theo đường dẫn, không đáng
            // để hỏng cả lời gọi — các tiêu chí theo cột vẫn chấm được.
            raw = undefined;
        }

        return JSON.stringify(await findPrecedentsByStep(context, raw));
    });

    // ── seedCaseLibrary ──────────────────────────────────────────────────────
    srv.on('seedCaseLibrary', async (req: any) => {
        const payload = req.data?.payload;
        if (typeof payload !== 'string' || !payload.trim()) {
            return req.error(400, 'payload là bắt buộc và phải là chuỗi JSON.');
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(payload);
        } catch (e: any) {
            return req.error(400, `payload không phải JSON hợp lệ: ${e.message}`);
        }

        // Nhận cả một case đơn lẻ lẫn cả mẻ — người gọi không phải bọc mảng chỉ
        // để nạp một file.
        const cases = Array.isArray(parsed) ? parsed : [parsed];
        if (!cases.length) return req.error(400, 'payload rỗng, không có case nào để nạp.');

        return JSON.stringify(await seedLibrary(cases));
    });

    // ── clearCaseLibrary ─────────────────────────────────────────────────────
    srv.on('clearCaseLibrary', async () => JSON.stringify({ deleted: await clearLibrary() }));

    // ── embedCaseLibrary ─────────────────────────────────────────────────────
    srv.on('embedCaseLibrary', async (req: any) =>
        JSON.stringify(await embedLibrary(req.data?.force === true)));

    LOG.info('Đã gắn handler EightDService');
}

/**
 * Dọn bản ghi kẹt lúc khởi động.
 *
 * Tách khỏi `registerEightDHandlers` vì việc này cần DB sẵn sàng — gọi ở
 * `cds.on('served')`, không phải lúc đăng ký service.
 */
export async function sweepOnStartup(): Promise<void> {
    try {
        const n = await sweepStuckAnalyzing();
        if (n) LOG.warn(`Đã dọn ${n} report kẹt ở trạng thái Analyzing từ lần chạy trước.`);
    } catch (e: any) {
        LOG.error('Không dọn được report kẹt:', e?.message ?? e);
    }
}
