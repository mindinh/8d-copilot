import {
  getLlmProvider,
  setLlmProvider,
  resolveActivityModel,
  configureEmbeddings,
  getEmbeddingSettings,
} from '@cnma/sap-aicore-integrate/llm';
import type {
  CanonicalMessage,
  AIConfig,
  AIResponse,
  AIToolResponse,
  ToolSchema,
} from '@cnma/sap-aicore-integrate/types';
import { AICORE_DEFAULT_MODEL, EMBEDDING_DIM, DEFAULT_EMBEDDING_MODEL } from '../../config/ai';
import { APP_EMBEDDING_CORPORA } from './embeddingCorpora';
import { getGlobalModelConfig } from './globalModelConfig';

/**
 * Lớp bọc mỏng quanh OrchestrationProvider của CDK.
 *
 * Chỉ thêm ba thứ:
 *   1. Chọn model theo activity: cấu hình theo tenant → mặc định của app
 *   2. Truyền thinking budget từ aiAgentConfig
 *   3. Đường mock `MOCK_LLM=true` cho unit test
 *
 * **KHÔNG thêm retry, cache hay timeout** — CDK đã lo hết qua llmSemaphore và
 * withRetries. Thêm ở đây là nhân đôi số lần gọi thật.
 */

/** Tuỳ chọn chung cho mọi lời gọi qua client này. */
export interface LlmCallOptions extends AIConfig {
  /** Khoá activity đã đăng ký ở core/ai/activities.ts. Bắt buộc. */
  activity: string;
  /** aiAgentConfig của tenant — chuỗi JSON hoặc object đã parse. */
  aiAgentConfig?: Record<string, unknown> | string | null;
}

/** Vector 0 đúng số chiều đã đăng ký — không random, để phân biệt được lần chạy mock. */
function zeroVector(): number[] {
  return new Array(APP_EMBEDDING_CORPORA[0].dim).fill(0);
}

let mockInstalled = false;

function maybeInstallMock(): void {
  if (mockInstalled) return;
  if (process.env.MOCK_LLM !== 'true') return;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MOCK_LLM=true bị cấm ở production');
  }
  setLlmProvider({
    name: 'mock',
    async complete(messages: CanonicalMessage[], config?: AIConfig): Promise<AIResponse> {
      return {
        content: JSON.stringify({ mock: true, model: config?.model, messageCount: messages.length }),
        finishReason: 'stop',
      };
    },
    async completeWithTools(
      _messages: CanonicalMessage[],
      tools: ToolSchema[],
      config?: AIConfig,
    ): Promise<AIToolResponse> {
      return {
        content: JSON.stringify({ mock: true, tools: tools.length, model: config?.model }),
        finishReason: 'stop',
      };
    },
    async embed(_text: string): Promise<number[]> {
      return zeroVector();
    },
    async batchEmbed(texts: string[]): Promise<number[][]> {
      return texts.map(() => zeroVector());
    },
  });
  console.log(
    '[ai/llmClient] MOCK_LLM=true — đang dùng mock trong bộ nhớ, KHÔNG phải AI Core thật. Chỉ dành cho unit test.',
  );
  mockInstalled = true;
}

/**
 * Chọn model cho một activity.
 *
 * Thứ tự ưu tiên:
 *   1. cấu hình truyền thẳng vào lời gọi (theo tenant / theo đối tượng)
 *   2. cấu hình chung lưu trong DB — đây là thứ trang AI Settings ghi
 *   3. `AICORE_DEFAULT_MODEL` (mặc định gemini-2.5-pro)
 */
async function resolveModel(
  activity: string,
  aiAgentConfig?: LlmCallOptions['aiAgentConfig'],
): Promise<string> {
  const perCall = resolveActivityModel(aiAgentConfig ?? null, activity);
  if (perCall) return perCall;

  const globalCfg = await getGlobalModelConfig();
  const globalModel = resolveActivityModel(globalCfg, activity);
  if (globalModel) return globalModel;

  return AICORE_DEFAULT_MODEL;
}

function safeParseConfig(cfg: LlmCallOptions['aiAgentConfig']): Record<string, unknown> | undefined {
  if (!cfg) return undefined;
  if (typeof cfg !== 'string') return cfg;
  try {
    return JSON.parse(cfg) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Đọc `<activity>ThinkingBudget` từ aiAgentConfig; bỏ qua giá trị không hợp lệ. */
function resolveThinkingBudget(
  activity: string,
  aiAgentConfig: LlmCallOptions['aiAgentConfig'],
  fallback?: number,
): number | undefined {
  const value = safeParseConfig(aiAgentConfig)?.[`${activity}ThinkingBudget`];
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  return fallback;
}

async function buildConfig(options: LlmCallOptions): Promise<AIConfig> {
  const { activity, aiAgentConfig, thinkingBudget: fallbackBudget, ...rest } = options;
  if (!activity) throw new Error('llmClient: bắt buộc phải truyền options.activity');

  // Thinking budget cũng theo thứ tự: lời gọi → cấu hình chung → giá trị dự phòng.
  const globalCfg = await getGlobalModelConfig();
  const thinkingBudget =
    resolveThinkingBudget(activity, aiAgentConfig, undefined) ??
    resolveThinkingBudget(activity, globalCfg, fallbackBudget);

  return {
    ...rest,
    model: rest.model ?? (await resolveModel(activity, aiAgentConfig)),
    ...(thinkingBudget !== undefined && { thinkingBudget }),
  };
}

/** Chat completion thường. */
export async function complete(
  messages: CanonicalMessage[],
  options: LlmCallOptions,
): Promise<AIResponse> {
  maybeInstallMock();
  return getLlmProvider().complete(messages, await buildConfig(options));
}

/** Chat completion có khai báo tool (vòng lặp ReAct). */
export async function completeWithTools(
  messages: CanonicalMessage[],
  tools: ToolSchema[],
  options: LlmCallOptions,
): Promise<AIToolResponse> {
  maybeInstallMock();
  return getLlmProvider().completeWithTools(messages, tools, await buildConfig(options));
}

/** Nhúng một đoạn văn bản. */
export async function embed(text: string): Promise<number[]> {
  maybeInstallMock();
  return getLlmProvider().embed(text);
}

/** Nhúng nhiều đoạn văn bản, giữ nguyên thứ tự đầu vào. */
export async function batchEmbed(texts: string[], batchSize?: number): Promise<number[][]> {
  maybeInstallMock();
  return getLlmProvider().batchEmbed(texts, batchSize);
}

/**
 * Chốt model và số chiều embedding cho cả tiến trình.
 *
 * Gọi một lần lúc bootstrap. Khi nào cho admin chọn model trong UI thì gọi lại
 * mỗi lần cài đặt đổi — và nhớ nhúng lại toàn bộ kho, vì vector cũ không còn so
 * sánh được với vector mới.
 */
export function initEmbeddings(): void {
  configureEmbeddings({ model: DEFAULT_EMBEDDING_MODEL, dim: EMBEDDING_DIM });
  const active = getEmbeddingSettings();
  console.log(`[ai/llmClient] Embedding: "${active.model}" (${active.dim} chiều)`);
}

export { resolveModel };
