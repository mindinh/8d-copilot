import cds from '@sap/cds';
import { ENTITIES } from '../config/ai';
import { getGlobalAiConfigRaw, saveGlobalAiConfig } from '../core/ai/globalModelConfig';

const LOG = cds.log('ai-admin');

/**
 * Handler cho AiAdminService — backend của trang quản lý model.
 *
 * Chỉ làm hai việc: đồng bộ danh mục model từ AI Core, và trả về tập model một
 * activity được phép dùng. Việc đọc/ghi entity AIModels do CAP tự lo qua generic
 * handler, không cần viết gì thêm.
 */

/** Sắp xếp mặc định cho model mà bộ phân loại không có ý kiến. */
const MODEL_DEFAULT_SORT_ORDER = 100;

interface DiscoveredModel {
  /** CDK phơi id dưới tên `model` — KHÔNG phải `modelId` như tài liệu của nó viết. */
  model?: string;
  capabilities?: unknown[];
  contextWindow?: number;
  inputTokenCost?: number;
  outputTokenCost?: number;
  streamingSupported?: boolean;
  inputTypes?: unknown[];
  deprecated?: boolean;
  retirementDate?: string;
  version?: string;
}

interface DiscoveryModule {
  discoverFoundationModels(opts?: { force?: boolean }): Promise<DiscoveredModel[]>;
  classifyModel(modelId: string): { provider?: string; displayName?: string; sortOrder?: number };
}

let discoveryModule: DiscoveryModule | null = null;

/** Nạp lười để việc require file này không kéo theo cây phụ thuộc của discovery. */
async function getDiscovery(): Promise<DiscoveryModule> {
  if (!discoveryModule) {
    discoveryModule = (await import(
      '@cnma/sap-aicore-integrate/discovery'
    )) as unknown as DiscoveryModule;
  }
  return discoveryModule;
}

/**
 * Các cột do một lần discovery sở hữu và được phép ghi đè.
 *
 * `active` và `suitableActivities` cố ý vắng mặt — đó là quyết định của admin và
 * phải sống sót qua mỗi lần sync lại.
 */
function buildDiscoveryPatch(
  discovered: DiscoveredModel,
  classification: { provider?: string; displayName?: string; sortOrder?: number },
): Record<string, unknown> {
  return {
    provider: classification.provider,
    displayName: classification.displayName,
    capabilities: JSON.stringify(discovered.capabilities ?? []),
    contextWindow: discovered.contextWindow ?? null,
    inputTokenCost: discovered.inputTokenCost ?? null,
    outputTokenCost: discovered.outputTokenCost ?? null,
    streamingSupported: Boolean(discovered.streamingSupported),
    inputTypes: JSON.stringify(discovered.inputTypes ?? []),
    deprecated: Boolean(discovered.deprecated),
    retirementDate: discovered.retirementDate ?? null,
    version: discovered.version ?? null,
    sortOrder: classification.sortOrder ?? MODEL_DEFAULT_SORT_ORDER,
  };
}

function tryParseJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (e: any) {
    LOG.warn(`Bỏ qua JSON hỏng: ${e.message}`);
    return null;
  }
}

/**
 * `suitableActivities` bằng null nghĩa là "mọi activity" — quy ước của CDK.
 * Giá trị hỏng cũng xử lý như vậy, thay vì giấu luôn model đi.
 */
function isSuitableFor(model: Record<string, any>, activity?: string): boolean {
  if (!activity) return true;
  const activities = tryParseJson(model.suitableActivities);
  if (!Array.isArray(activities)) return true;
  return activities.includes(activity);
}

function toAvailableModel(model: Record<string, any>): Record<string, unknown> {
  return {
    model: model.modelId,
    provider: model.provider,
    displayName: model.displayName,
    capabilities: tryParseJson(model.capabilities) ?? [],
    suitableActivities: tryParseJson(model.suitableActivities),
  };
}

/**
 * Nạp lại danh mục từ AI Core, giữ nguyên phần admin đã chỉnh.
 *
 * Không bao giờ ném lỗi — hỏng thì trả qua trường `error` để UI hiện được thông
 * báo thay vì nuốt một stack trace.
 */
async function syncModels(): Promise<string> {
  const db = await cds.connect.to('db');
  let discovered: DiscoveredModel[];

  try {
    const discovery = await getDiscovery();
    discovered = await discovery.discoverFoundationModels({ force: true });
  } catch (e: any) {
    LOG.error('Đồng bộ model thất bại:', e.message);
    return JSON.stringify({ synced: 0, new: 0, updated: 0, total: 0, error: e.message });
  }

  const discovery = await getDiscovery();
  let added = 0;

  for (const item of discovered) {
    const modelId = item.model;
    if (!modelId) continue;

    const patch = buildDiscoveryPatch(item, discovery.classifyModel(modelId));
    const existing = await db.run(
      SELECT.one.from(ENTITIES.AI_MODELS).where({ modelId }),
    );

    if (existing) {
      await db.run(UPDATE(ENTITIES.AI_MODELS).set(patch).where({ modelId }));
    } else {
      await db.run(
        INSERT.into(ENTITIES.AI_MODELS).entries({
          modelId,
          active: true,
          suitableActivities: null,
          ...patch,
        }),
      );
      added++;
    }
  }

  LOG.info(`Đã đồng bộ ${discovered.length} model (${added} mới)`);
  return JSON.stringify({
    synced: discovered.length,
    new: added,
    updated: discovered.length - added,
    total: discovered.length,
  });
}

/** Model đang bật mà một activity được phép dùng, đã sắp xếp cho ô chọn. */
async function getAvailableModels(activity?: string): Promise<string> {
  const db = await cds.connect.to('db');
  const models: Record<string, any>[] = await db.run(
    SELECT.from(ENTITIES.AI_MODELS).where({ active: true }).orderBy('sortOrder', 'modelId'),
  );
  return JSON.stringify(models.filter((m) => isSuitableFor(m, activity)).map(toAvailableModel));
}

/** Gắn handler vào service. Gọi từ hook `serving` trong srv/server.ts. */
export function registerAiAdminHandlers(srv: any): void {
  srv.on('syncModels', async () => syncModels());
  srv.on('getAvailableModels', async (req: any) => getAvailableModels(req.data?.activity));

  srv.on('getGlobalAiConfig', async () => getGlobalAiConfigRaw());
  srv.on('updateGlobalAiConfig', async (req: any) => {
    try {
      return await saveGlobalAiConfig(req.data?.aiAgentConfig);
    } catch (e: any) {
      // Payload hỏng là lỗi của người gọi, không phải lỗi hệ thống.
      return req.reject(e.code === 400 ? 400 : 500, e.message);
    }
  });

  LOG.info('Đã gắn handler AiAdminService');
}

export { syncModels, getAvailableModels };
