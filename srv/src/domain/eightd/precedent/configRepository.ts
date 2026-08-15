import cds from '@sap/cds';
import {
    DEFAULT_CRITERIA,
    DEFAULT_RETRIEVAL_SETTINGS,
    DEFAULT_STEP_PROMPTS,
} from './defaults';
import type { Criterion } from './scoring';

const LOG = cds.log('precedent-config');

export const CRITERIA = 'cnma.proresolve.SimilarityCriteria';
export const SETTINGS = 'cnma.proresolve.RetrievalSettings';
export const STEP_PROMPTS = 'cnma.proresolve.StepPrompts';

export const GLOBAL_SETTINGS_ID = 'GLOBAL';

export interface RetrievalSettings {
    minScore: number;
    topN: number;
    closedOnly: boolean;
}

export interface RetrievalConfig {
    criteria: Criterion[];
    settings: RetrievalSettings;
}

/**
 * TTL cache — cùng lý do và cùng độ dài với `core/ai/globalModelConfig.ts`.
 *
 * Driver SQLite của CAP chỉ có MỘT connection mỗi tenant. Một lần đọc DB rơi vào
 * giữa job nền sẽ mở transaction của job đó và giữ connection đến hết job, chặn
 * mọi request khác. Cache đủ dài để phủ trọn một lượt chạy thì job nền không
 * chạm DB lần nào.
 *
 * TTL chỉ là lưới dự phòng: mọi đường ghi đều gọi `clearRetrievalConfigCache()`.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: RetrievalConfig | null = null;
let cachedAt = 0;

/** Xoá cache — gọi ngay sau khi admin lưu cấu hình. */
export function clearRetrievalConfigCache(): void {
    cached = null;
    cachedAt = 0;
}

/** Mặc định dùng khi DB chưa seed hoặc đọc lỗi. Không bao giờ trả về rỗng. */
function fallbackConfig(): RetrievalConfig {
    return {
        criteria: DEFAULT_CRITERIA.map((c) => ({ ...c })),
        settings: {
            minScore: DEFAULT_RETRIEVAL_SETTINGS.minScore,
            topN: DEFAULT_RETRIEVAL_SETTINGS.topN,
            closedOnly: DEFAULT_RETRIEVAL_SETTINGS.closedOnly,
        },
    };
}

/**
 * Cấu hình chấm điểm đang có hiệu lực.
 *
 * Đọc lỗi hoặc bảng rỗng ⇒ rơi về mặc định trong `defaults.ts` thay vì ném lỗi.
 * Tìm tiền lệ bằng trọng số mặc định vẫn tốt hơn nhiều so với không tìm được gì
 * chỉ vì một bảng cấu hình chưa kịp seed.
 */
export async function getRetrievalConfig(): Promise<RetrievalConfig> {
    if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;

    try {
        const db = await cds.connect.to('db');
        const [rows, settingsRow] = await Promise.all([
            db.run(SELECT.from(CRITERIA).orderBy('sortOrder')),
            db.run(SELECT.one.from(SETTINGS).where({ ID: GLOBAL_SETTINGS_ID })),
        ]);

        const criteria: Criterion[] = (rows as Record<string, any>[]).map((r) => ({
            criterionKey: r.criterionKey,
            label: r.label,
            sourceField: r.sourceField,
            matchType: r.matchType || 'exact',
            weight: Number(r.weight) || 0,
            fallbackField: r.fallbackField ?? null,
            fallbackMatch: r.fallbackMatch ?? null,
            fallbackWeight: r.fallbackWeight == null ? null : Number(r.fallbackWeight),
            minSimilarity: r.minSimilarity == null ? null : Number(r.minSimilarity),
            enabled: r.enabled !== false,
            sortOrder: Number(r.sortOrder) || 0,
        }));

        cached = criteria.length
            ? {
                criteria,
                settings: {
                    minScore: Number(settingsRow?.minScore ?? DEFAULT_RETRIEVAL_SETTINGS.minScore),
                    topN: Number(settingsRow?.topN ?? DEFAULT_RETRIEVAL_SETTINGS.topN),
                    closedOnly: settingsRow?.closedOnly !== false,
                },
            }
            : fallbackConfig();
    } catch (e: any) {
        LOG.warn(`Không đọc được cấu hình truy hồi, dùng mặc định: ${e.message}`);
        cached = fallbackConfig();
    }

    cachedAt = Date.now();
    return cached;
}

/**
 * Hướng dẫn từng discipline lấy từ bảng `StepPrompts`.
 *
 * Bước bị tắt hoặc để trống thì KHÔNG có mặt trong kết quả — người gọi rơi về
 * `DEFAULT_DISCIPLINE_GUIDE` trong `prompts.ts`. Nhờ vậy một bảng rỗng cho ra
 * đúng prompt như trước khi có tính năng này.
 *
 * Đọc lỗi ⇒ trả object rỗng, KHÔNG ném: một bảng cấu hình hỏng không được phép
 * làm chết cả pipeline phân tích.
 */
export async function getDisciplineGuide(): Promise<Record<string, string>> {
    try {
        const db = await cds.connect.to('db');
        const rows = await db.run(SELECT.from(STEP_PROMPTS).columns('stepCode', 'systemPrompt', 'combinedPrompt', 'enabled'));
        const out: Record<string, string> = {};
        for (const r of rows as any[]) {
            if (r.enabled === false) continue;
            const text = String(r.combinedPrompt ?? r.systemPrompt ?? '').trim();
            if (text) out[String(r.stepCode)] = text;
        }
        return out;
    } catch (e: any) {
        LOG.warn(`Không đọc được hướng dẫn từng bước, dùng mặc định trong code: ${e.message}`);
        return {};
    }
}

export interface StepPromptRuntimeConfig {
    inputSchemaJson: string;
    combinedPrompt: string;
    formSchemaJson: string;
    constraintsJson: string;
}

export async function getStepPromptRuntimeConfig(stepCode: string): Promise<StepPromptRuntimeConfig | null> {
    try {
        const db = await cds.connect.to('db');
        const row = await db.run(SELECT.one.from(STEP_PROMPTS).where({ stepCode }));
        if (!row || row.enabled === false) return null;
        return {
            inputSchemaJson: String(row.inputSchemaJson ?? ''),
            combinedPrompt: String(row.combinedPrompt ?? row.systemPrompt ?? ''),
            formSchemaJson: String(row.formSchemaJson ?? ''),
            constraintsJson: String(row.constraintsJson ?? ''),
        };
    } catch (e: any) {
        LOG.warn(`Khong doc duoc cau hinh runtime ${stepCode}: ${e.message}`);
        return null;
    }
}

/** Prompt của một bước D, hoặc `null` khi chưa cấu hình / đã tắt. */
export async function getStepPrompt(
    stepCode: string,
): Promise<{ systemPrompt: string; userTemplate: string } | null> {
    try {
        const db = await cds.connect.to('db');
        const row = await db.run(SELECT.one.from(STEP_PROMPTS).where({ stepCode }));
        if (!row || row.enabled === false) return null;

        const systemPrompt = String(row.systemPrompt ?? '').trim();
        const userTemplate = String(row.userTemplate ?? '').trim();
        // Trống = "chưa cấu hình" ⇒ người gọi dùng hằng số trong prompts.ts.
        if (!systemPrompt && !userTemplate) return null;

        return { systemPrompt, userTemplate };
    } catch (e: any) {
        LOG.warn(`Không đọc được prompt bước ${stepCode}, dùng mặc định: ${e.message}`);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nạp mặc định vào ba bảng cấu hình — CHỈ khi bảng còn rỗng.
 *
 * Idempotent: chạy mỗi lần khởi động, lần thứ hai trở đi không làm gì. Đây là lý
 * do không dùng CSV trong `db/data/`: CSV bị HDI ghi đè mỗi lần deploy, còn cách
 * này giữ nguyên phần admin đã chỉnh.
 *
 * Không bao giờ ném lỗi lên trên — app phải khởi động được kể cả khi seed hỏng,
 * vì `getRetrievalConfig()` đã có đường rơi về mặc định trong code.
 */
export async function seedRetrievalConfig(): Promise<void> {
    try {
        const db = await cds.connect.to('db');

        // Bù theo TỪNG KHOÁ, không phải "chỉ khi bảng rỗng".
        //
        // Bản đầu chỉ seed khi bảng rỗng. Hệ quả: thêm một tiêu chí mới vào
        // `defaults.ts` rồi deploy thì nó KHÔNG BAO GIỜ tới được môi trường đã
        // chạy, vì bảng đã có mấy dòng cũ nên điều kiện không đúng nữa. Tính năng
        // im lặng không hoạt động và không có gì báo — đúng như tiêu chí ngữ
        // nghĩa đã vắng mặt trên HANA sau khi thêm.
        //
        // Chỉ THÊM khoá còn thiếu; trọng số admin đã chỉnh trên khoá cũ giữ nguyên.
        const existingCriteria = await db.run(SELECT.from(CRITERIA).columns('criterionKey'));
        const haveKeys = new Set(existingCriteria.map((r: any) => String(r.criterionKey)));
        const missingCriteria = DEFAULT_CRITERIA.filter((c) => !haveKeys.has(c.criterionKey));
        if (missingCriteria.length) {
            await db.run(
                INSERT.into(CRITERIA).entries(
                    missingCriteria.map((c) => ({
                        criterionKey: c.criterionKey,
                        label: c.label,
                        description: c.description,
                        sourceTable: c.sourceTable,
                        sourceField: c.sourceField,
                        matchType: c.matchType,
                        weight: c.weight,
                        fallbackField: c.fallbackField,
                        fallbackMatch: c.fallbackMatch,
                        fallbackWeight: c.fallbackWeight,
                        minSimilarity: c.minSimilarity ?? null,
                        enabled: c.enabled,
                        sortOrder: c.sortOrder,
                    })),
                ),
            );
            LOG.info(`Đã thêm ${missingCriteria.length} tiêu chí chấm điểm: ${missingCriteria.map((c) => c.criterionKey).join(", ")}`);
        }

        const existingSettings = await db.run(
            SELECT.one.from(SETTINGS).where({ ID: GLOBAL_SETTINGS_ID }),
        );
        if (!existingSettings) {
            await db.run(INSERT.into(SETTINGS).entries({ ...DEFAULT_RETRIEVAL_SETTINGS }));
            LOG.info(
                `Đã seed ngưỡng truy hồi: minScore=${DEFAULT_RETRIEVAL_SETTINGS.minScore} `
                + `topN=${DEFAULT_RETRIEVAL_SETTINGS.topN}`,
            );
        }

        const existingPrompts = await db.run(SELECT.from(STEP_PROMPTS).columns('stepCode'));
        const have = new Set(existingPrompts.map((r: any) => r.stepCode));
        const missing = DEFAULT_STEP_PROMPTS.filter((p) => !have.has(p.stepCode));
        if (missing.length) {
            await db.run(
                INSERT.into(STEP_PROMPTS).entries(
                    missing.map((p) => ({
                        stepCode: p.stepCode,
                        label: p.label,
                        description: p.description,
                        systemPrompt: p.systemPrompt,
                        userTemplate: null,
                        inputSchemaJson: p.inputSchemaJson ?? null,
                        combinedPrompt: p.combinedPrompt ?? p.systemPrompt,
                        formSchemaJson: p.formSchemaJson ?? null,
                        constraintsJson: p.constraintsJson ?? null,
                        enabled: true,
                        version: 1,
                    })),
                ),
            );
            LOG.info(`Đã seed ${missing.length} dòng prompt bước D`);
        }

        for (const configuredDefault of DEFAULT_STEP_PROMPTS.filter((prompt) => ['D1', 'D2', 'D3', 'D4'].includes(prompt.stepCode))) {
            const current = await db.run(SELECT.one.from(STEP_PROMPTS).where({ stepCode: configuredDefault.stepCode }));
            const patch: Record<string, string> = {};
            for (const field of ['inputSchemaJson', 'combinedPrompt', 'formSchemaJson', 'constraintsJson'] as const) {
                if (!String(current?.[field] ?? '').trim() && configuredDefault[field]) patch[field] = configuredDefault[field];
            }
            if (Object.keys(patch).length) await db.run(UPDATE(STEP_PROMPTS).set(patch).where({ stepCode: configuredDefault.stepCode }));
        }

        // Bù nội dung cho dòng đã tồn tại nhưng còn rỗng.
        //
        // Bảng được tạo ở bản trước với `systemPrompt = null`. Chỉ thêm dòng
        // thiếu là không đủ: tám dòng cũ vẫn rỗng, UI vẫn trống, và không có gì
        // báo — đúng cái vòng lặp đã xảy ra với kho case và với tiêu chí chấm điểm.
        const blank = (await db.run(
            SELECT.from(STEP_PROMPTS).columns('stepCode', 'systemPrompt'),
        )).filter((r: any) => !String(r.systemPrompt ?? '').trim());
        if (blank.length) {
            for (const row of blank as any[]) {
                const def = DEFAULT_STEP_PROMPTS.find((p) => p.stepCode === row.stepCode);
                if (!def) continue;
                await db.run(
                    UPDATE(STEP_PROMPTS).set({ systemPrompt: def.systemPrompt }).where({ stepCode: row.stepCode }),
                );
            }
            LOG.info(`Đã bù nội dung cho ${blank.length} dòng prompt còn rỗng`);
        }

        clearRetrievalConfigCache();
    } catch (e: any) {
        LOG.error(`Seed cấu hình truy hồi thất bại (app vẫn chạy với mặc định): ${e.message}`);
    }
}
