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
