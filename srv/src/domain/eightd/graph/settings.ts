/**
 * Đọc công tắc engine từ DB, có cache và có đường lùi an toàn.
 *
 * ── Vì sao mặc định là `scoring` chứ không `graph` ──
 * Ngày đầu tiên sau khi deploy, hành vi phải giống hệt hôm trước. Một tính năng
 * tự bật lên là một tính năng không ai kịp đối chiếu — và ở đây "đối chiếu" có
 * nghĩa cụ thể: chạy `npm run shadow:graph` rồi đọc bảng so sánh.
 *
 * Cùng lý do đó, MỌI đường lỗi ở file này đều trả về `scoring`: bảng chưa deploy,
 * dòng chưa seed, DB không đọc được. Rơi về engine đang chạy tốt là đúng; ném lỗi
 * hoặc âm thầm bật engine mới thì không.
 */

import cds from '@sap/cds';

const LOG = cds.log('graph');

export const GRAPH_SETTINGS = 'cnma.proresolve.GraphRetrievalSettings';

export type RetrievalEngine = 'scoring' | 'graph';

export interface GraphSettings {
    engine: RetrievalEngine;
    maxKeywords: number;
    fallbackEnabled: boolean;
}

export const DEFAULT_SETTINGS: GraphSettings = Object.freeze({
    engine: 'scoring',
    maxKeywords: 30,
    fallbackEnabled: true,
});

/**
 * Cache 30 giây — cùng con số và cùng lý do với `configRepository`.
 *
 * Một lượt phân tích đọc cấu hình nhiều lần; đọc DB mỗi lần là khứ hồi thừa cho
 * một giá trị đổi vài lần một tháng. 30 giây đủ ngắn để admin bấm lưu rồi thử
 * ngay mà không phải khởi động lại.
 */
const TTL_MS = 30_000;
let cached: { value: GraphSettings; at: number } | null = null;

export function resetGraphSettingsCache(): void {
    cached = null;
}

/** Chuẩn hoá một dòng DB thành cấu hình dùng được. Hàm thuần — test không cần DB. */
export function normalizeSettings(row: unknown): GraphSettings {
    const r = (row ?? {}) as Record<string, unknown>;
    const engine = String(r.engine ?? '').toLowerCase();
    const maxKeywords = Number(r.maxKeywords);

    return {
        // Giá trị lạ ⇒ `scoring`. Một chuỗi gõ sai không được phép bật engine mới,
        // và cũng không được phép làm hỏng lượt phân tích.
        engine: engine === 'graph' ? 'graph' : 'scoring',
        maxKeywords: Number.isFinite(maxKeywords) && maxKeywords > 0
            ? Math.floor(maxKeywords)
            : DEFAULT_SETTINGS.maxKeywords,
        fallbackEnabled: r.fallbackEnabled !== false,
    };
}

export async function getGraphSettings(): Promise<GraphSettings> {
    if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

    let value = DEFAULT_SETTINGS;
    try {
        const db = await cds.connect.to('db');
        const rows = (await db.run(SELECT.from(GRAPH_SETTINGS))) as unknown[];
        if (rows.length) value = normalizeSettings(rows[0]);
    } catch (e: any) {
        LOG.warn(`Không đọc được GraphRetrievalSettings (${e.message}) — dùng engine chấm điểm.`);
    }

    cached = { value, at: Date.now() };
    return value;
}
