import cds from '@sap/cds';

const LOG = cds.log('ai-config');

/**
 * Cấu hình model dùng chung, đọc từ bảng AiSettings.
 *
 * Có cache vì `resolveModel` được gọi ở MỌI lời gọi model — không cache thì mỗi
 * lần gọi AI kèm thêm một truy vấn DB. TTL ngắn để admin sửa xong là áp dụng
 * gần như ngay, và `clearGlobalModelCache()` xoá tức thì khi lưu qua UI.
 */

/** Dòng cấu hình chung — luôn đúng một dòng, khoá cố định. */
export const GLOBAL_SETTINGS_ID = 'GLOBAL';

const ENTITY = 'cnma.proresolve.AiSettings';

/** TTL cache. Đủ ngắn để admin không phải khởi động lại, đủ dài để không đập DB. */
const CACHE_TTL_MS = 60 * 1000;

let cached: Record<string, unknown> | null = null;
let cachedAt = 0;

/** Xoá cache — gọi ngay sau khi ghi cấu hình. */
export function clearGlobalModelCache(): void {
  cached = null;
  cachedAt = 0;
}

/** Cấu hình chung đã parse. Trả `{}` khi chưa có gì hoặc khi JSON hỏng. */
export async function getGlobalModelConfig(): Promise<Record<string, unknown>> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;

  try {
    const db = await cds.connect.to('db');
    const row = await db.run(SELECT.one.from(ENTITY).where({ ID: GLOBAL_SETTINGS_ID }));
    const raw = row?.aiAgentConfig;
    cached = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch (e: any) {
    // Cấu hình hỏng không được làm chết lời gọi model — rơi về mặc định của app.
    LOG.warn(`Không đọc được cấu hình AI chung, dùng mặc định: ${e.message}`);
    cached = {};
  }

  cachedAt = Date.now();
  return cached;
}

/** Chuỗi JSON đang lưu, hoặc `'{}'`. Dùng cho endpoint đọc của UI. */
export async function getGlobalAiConfigRaw(): Promise<string> {
  const db = await cds.connect.to('db');
  const row = await db.run(SELECT.one.from(ENTITY).where({ ID: GLOBAL_SETTINGS_ID }));
  return row?.aiAgentConfig || '{}';
}

/**
 * Ghi cấu hình chung.
 *
 * @throws Khi payload không phải object JSON — cấu hình hỏng sẽ làm gãy việc
 *         chọn model của toàn hệ thống, nên chặn ngay ở cửa vào.
 */
export async function saveGlobalAiConfig(aiAgentConfig?: string): Promise<string> {
  const raw = aiAgentConfig?.trim() || '{}';

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e: any) {
    const err: any = new Error(`aiAgentConfig không phải JSON hợp lệ: ${e.message}`);
    err.code = 400;
    throw err;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const err: any = new Error('aiAgentConfig phải là một object JSON');
    err.code = 400;
    throw err;
  }

  const normalized = JSON.stringify(parsed);
  const db = await cds.connect.to('db');

  const existing = await db.run(SELECT.one.from(ENTITY).where({ ID: GLOBAL_SETTINGS_ID }));
  if (existing) {
    await db.run(UPDATE(ENTITY).set({ aiAgentConfig: normalized }).where({ ID: GLOBAL_SETTINGS_ID }));
  } else {
    await db.run(INSERT.into(ENTITY).entries({ ID: GLOBAL_SETTINGS_ID, aiAgentConfig: normalized }));
  }

  clearGlobalModelCache();
  LOG.info('Đã lưu cấu hình AI chung');
  return normalized;
}
