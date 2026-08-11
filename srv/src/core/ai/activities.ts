import { registerActivities, type AiActivity } from '@cnma/sap-aicore-integrate/react/shared';

/**
 * Điểm đăng ký activity AI.
 *
 * ── Vì sao file này bắt buộc phải có ──
 * Registry của CDK là **theo từng bundle và khởi đầu RỖNG**. Ô chọn model trong
 * UI admin đọc từ registry này; không đăng ký gì thì ô chọn trống, và
 * `resolveActivityModel` không có key nào để tra.
 *
 * Backend đăng ký ở `srv/server.ts`. Bundle UI phải tự đăng ký lại đúng bộ này
 * ở phía nó — xem `app/cnma_proresolve_ui/src/config/ai-registry.ts`.
 *
 * ── Hai danh sách PHẢI KHỚP NHAU ──
 * Lệch nhau thì admin chọn được một activity mà backend không biết tra ở đâu.
 *
 * ── Cách thêm activity ──
 * Quy ước budgetKey: `<key>ThinkingBudget` — CDK tự gấp vào request khi model
 * được định tuyến có hỗ trợ thinking, bỏ qua khi không.
 *
 * `label` và `description` HIỆN TRÊN GIAO DIỆN nên viết bằng tiếng Anh.
 *
 * Bốn mục dưới đây là ví dụ tạm. Đội nghiệp vụ thay bằng bộ activity thật.
 */
export const APP_ACTIVITIES: readonly AiActivity[] = Object.freeze([
  Object.freeze({
    key: 'parseData',
    label: 'Parse input data',
    description:
      'Read the incoming data and turn it into structure: numbers, codes, tables. This is transcription rather than judgement, so a fast and cheap model is usually enough.',
    budgetKey: 'parseDataThinkingBudget',
  }),
  Object.freeze({
    key: 'analyzeDefect',
    label: 'Analyse defect',
    description:
      'Reason over the parsed data to find the cause. This is the step that needs the strongest model — get it wrong and everything downstream is worthless.',
    budgetKey: 'analyzeDefectThinkingBudget',
  }),
  Object.freeze({
    key: 'draftContent',
    label: 'Draft content',
    description:
      'Write prose from data that already exists. Needs phrasing, but must stay tied to the data.',
    budgetKey: 'draftContentThinkingBudget',
  }),
  Object.freeze({
    key: 'reviewQuality',
    label: 'Review quality',
    description:
      'Grade content written by a human or by AI against fixed criteria. Keep temperature at 0 so the same input always yields the same verdict.',
    budgetKey: 'reviewQualityThinkingBudget',
  }),
]);

let registered = false;

/** Idempotent — gọi nhiều lần vẫn chỉ đăng ký một lần. */
export function registerAppActivities(): void {
  if (registered) return;
  registerActivities([...APP_ACTIVITIES]);
  registered = true;
  console.log(
    `[ai/activities] Đã đăng ký ${APP_ACTIVITIES.length} activity: ${APP_ACTIVITIES.map((a) => a.key).join(', ')}`,
  );
}
