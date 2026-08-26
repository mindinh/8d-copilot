/**
 * Cấu hình tầng AI Core.
 *
 * Chỉ chứa thứ tầng tích hợp cần. Hằng số nghiệp vụ (nhiệt độ, số token, ngưỡng
 * điểm cho từng bước 8D) thuộc về module nghiệp vụ, không để ở đây.
 *
 * Mọi lời gọi model đi qua CDK `@cnma/sap-aicore-integrate` → SAP AI Core
 * Orchestration. CDK đã lo retry, timeout và semaphore — đừng thêm ở tầng này.
 */

/** Entity do CDK cung cấp, dùng khi expose registry model ra service. */
export const ENTITIES = {
  AI_MODELS: 'cnma.aicore.integrate.AIModels',
} as const;

/**
 * Model chat mặc định khi chưa cấu hình gì ở tenant hay global.
 * Ghi đè bằng biến môi trường `AICORE_DEFAULT_MODEL`.
 */
export const AICORE_DEFAULT_MODEL = process.env.AICORE_DEFAULT_MODEL || 'gemini-2.5-pro';

/**
 * Model mặc định cho những activity mà ứng dụng BIẾT là không cần model mạnh.
 *
 * ── Vì sao cần lớp này ──
 * `aiAgentConfig` chỉ khai một `model` duy nhất là mọi bước đều chạy model đó —
 * kể cả bước đổ narrative có sẵn vào ô form, vốn không suy luận gì. Đo trên một
 * lượt chạy thật: cả 5 lời gọi đều là Opus 4.8, tổng 317s.
 *
 * Bảng này chỉ nêu ý kiến cho các bước cơ khí. Bước suy luận thật —
 * `reviewQuality` (chẩn đoán mù) và `analyzeDefect` (viết báo cáo) — CỐ TÌNH
 * không có mặt ở đây, để chúng nhận model mà admin đã chọn.
 *
 * Thứ tự ưu tiên khi chọn model, xem `resolveModel` ở core/ai/llmClient.ts:
 *   1. cấu hình truyền thẳng vào lời gọi
 *   2. `models[activity]` trong aiAgentConfig  ← admin ghi đè được từng bước
 *   3. bảng này
 *   4. `model` trong aiAgentConfig
 *   5. AICORE_DEFAULT_MODEL
 *
 * Đặt trên (4) là có chủ ý: `model` là lựa chọn CHUNG, không phải lời khẳng định
 * rằng bước điền form cũng đáng chạy model đắt nhất. Muốn ép, khai thẳng vào
 * `models[activity]` trên trang AI Settings — mục (2) luôn thắng bảng này.
 */
export const ACTIVITY_MODEL_DEFAULTS: Readonly<Record<string, string>> = {
  /** Trích xuất theo schema: đọc payload thô, xếp lại cho gọn. */
  parseData: process.env.AICORE_MODEL_PARSE || 'anthropic--claude-4.5-haiku',
  /** Đổ narrative đã có vào ô form đã cấu hình. Thuần cơ khí. */
  analyzeDefectStructuredFields:
    process.env.AICORE_MODEL_STRUCTURE || 'anthropic--claude-4.5-haiku',
};

/**
 * Số chiều vector. Phải khớp ba nơi cùng lúc:
 *   1. kiểu cột `cds.Vector(n)` trong schema
 *   2. số chiều model embedding thật sự trả về
 *   3. khai báo `dim` trong core/ai/embeddingCorpora.ts
 * CDK assert mỗi vector nhận được — lệch là ném lỗi ngay, không ghi âm thầm.
 */
export const EMBEDDING_DIM = 1536;

/**
 * Model embedding mặc định. Ghi đè bằng `AICORE_MODEL_EMBEDDING`.
 *
 * Đổi model là làm mất giá trị mọi vector đã lưu — vector của hai model không
 * nằm chung một không gian, cosine giữa chúng vô nghĩa. Đổi thì phải nhúng lại
 * toàn bộ kho.
 */
export const DEFAULT_EMBEDDING_MODEL =
  process.env.AICORE_MODEL_EMBEDDING || 'text-embedding-3-small';
