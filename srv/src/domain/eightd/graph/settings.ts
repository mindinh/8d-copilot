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
import {
    DEFAULT_STEP_PROFILES,
    STEP_CODES,
    normalizeStepParams,
    type GraphStepProfile,
    type StepCode,
} from './stepProfiles';

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

// ─────────────────────────────────────────────────────────────────────────────
// Trọng số từng bước
// ─────────────────────────────────────────────────────────────────────────────

export const GRAPH_STEP_PARAMS = 'cnma.proresolve.GraphStepParams';

let cachedProfiles: { value: Record<StepCode, GraphStepProfile>; at: number } | null = null;

export function resetStepProfilesCache(): void {
    cachedProfiles = null;
}

/**
 * Trọng số đang có hiệu lực cho cả tám bước.
 *
 * Thiếu dòng, dòng bị tắt, hoặc dòng vi phạm bất biến ⇒ bước đó dùng
 * `DEFAULT_STEP_PROFILES`. Nghĩa là deploy bảng này KHÔNG đổi hành vi cho tới khi
 * có người thật sự sửa một con số — cùng thái độ mà `StepPrompts` đã đặt ra.
 *
 * Dòng bị từ chối được LOG Ở MỨC WARN kèm lý do. Im lặng rơi về mặc định là cách
 * chắc chắn nhất để admin tin rằng cấu hình của mình đang chạy trong khi không.
 */
export async function getStepProfiles(): Promise<Record<StepCode, GraphStepProfile>> {
    if (cachedProfiles && Date.now() - cachedProfiles.at < TTL_MS) return cachedProfiles.value;

    const value = { ...DEFAULT_STEP_PROFILES };
    try {
        const db = await cds.connect.to('db');
        const rows = (await db.run(SELECT.from(GRAPH_STEP_PARAMS))) as Array<Record<string, unknown>>;
        const byCode = new Map(rows.map((r) => [String(r.stepCode), r]));

        for (const code of STEP_CODES) {
            const { profile, violation } = normalizeStepParams(code, byCode.get(code));
            if (violation) LOG.warn(`GraphStepParams bị từ chối — ${violation}`);
            value[code] = profile;
        }
    } catch (e: any) {
        LOG.warn(`Không đọc được GraphStepParams (${e.message}) — dùng trọng số mặc định.`);
    }

    cachedProfiles = { value, at: Date.now() };
    return value;
}

/**
 * Bù những bước chưa có dòng cấu hình, seed từ `DEFAULT_STEP_PROFILES`.
 *
 * Bù theo TỪNG BƯỚC chứ không phải "chỉ khi bảng rỗng" — cùng lý do
 * `profileRepository` đã ghi: thêm một bước mới rồi deploy phải tới được môi
 * trường đã chạy, chứ không im lặng bỏ qua vì bảng đã có dòng.
 *
 * Seed đúng bằng con số đang chạy, nên nó KHÔNG đổi hành vi — nó chỉ làm cho
 * những con số đó nhìn thấy và sửa được trên màn hình, thay vì nằm trong code.
 */
export async function seedGraphStepParams(): Promise<void> {
    try {
        const db = await cds.connect.to('db');
        const existing = (await db.run(
            SELECT.from(GRAPH_STEP_PARAMS).columns('stepCode'),
        )) as Array<{ stepCode: string }>;
        const have = new Set(existing.map((r) => String(r.stepCode)));
        const missing = STEP_CODES.filter((code) => !have.has(code));
        if (!missing.length) return;

        await db.run(INSERT.into(GRAPH_STEP_PARAMS).entries(
            missing.map((code, i) => {
                const p = DEFAULT_STEP_PROFILES[code];
                return {
                    stepCode: code,
                    label: p.label,
                    question: p.question,
                    wWorkCenter: p.weights.workCenter ?? null,
                    wMaterial: p.weights.material ?? null,
                    wMaterialFamily: p.weights.materialFamily ?? null,
                    wDefectCode: p.weights.defectCode ?? null,
                    wKeywords: p.weights.keywords ?? null,
                    wContainment: p.weights.containment ?? null,
                    wCorrective: p.weights.corrective ?? null,
                    wPreventive: p.weights.preventive ?? null,
                    keywordCap: p.keywordCap,
                    minScore: p.minScore,
                    topN: p.topN,
                    actionType: p.actionType ?? null,
                    // Seed câu hỏi và sàn kể cả khi trọng số là 0 (= tắt): bật
                    // re-rank cho một bước phải là sửa MỘT con số, không phải nhớ
                    // lại cả một đoạn instruction.
                    wRerank: p.rerank?.weight || null,
                    rerankFloor: p.rerank?.floor ?? null,
                    rerankInstruction: p.rerank?.instruction ?? null,
                    enabled: true,
                    sortOrder: (STEP_CODES.indexOf(code) + 1) * 10 + i * 0,
                };
            }),
        ));
        resetStepProfilesCache();
        LOG.info(`Đã seed trọng số graph cho ${missing.length} bước: ${missing.join(', ')}`);
    } catch (e: any) {
        LOG.error(`Seed GraphStepParams thất bại (app vẫn chạy với mặc định): ${e.message}`);
    }
}
