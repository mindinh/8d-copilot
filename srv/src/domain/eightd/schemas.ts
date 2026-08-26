/**
 * `responseSchema` cho hai bước AI — ép model trả đúng hình dạng.
 *
 * Probe đã xác nhận AI Core tôn trọng schema này, kể cả `minItems`/`maxItems`
 * (xem `scripts/probe-ai.ts`). Nhờ vậy không cần parser chịu lỗi phức tạp; chỉ
 * cần một lớp phòng thủ mỏng trong `jsonExtract.ts`.
 *
 * ── Lưu ý về phương ngữ schema ──
 * Đây là schema kiểu OpenAPI mà Gemini chấp nhận, KHÔNG phải JSON Schema đầy
 * đủ. Cụ thể: dùng `nullable: true` chứ không phải `type: ['string','null']`,
 * và không có `additionalProperties` hay `patternProperties`. Vì thế mọi map
 * tự do đều phải mô hình hoá thành mảng cặp khoá-giá trị.
 */

import { DISCIPLINE_CODES, ISHIKAWA_CATEGORIES } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Bước 1 — làm giàu ngữ cảnh (KHÔNG phải sinh lại CaseContext)
// ─────────────────────────────────────────────────────────────────────────────

export const SEVERITY_LEVELS = ['Low', 'Medium', 'High', 'Critical'] as const;
export type Severity = (typeof SEVERITY_LEVELS)[number];

export interface ContextEnrichment {
    /** Trường có trong dataset thô mà mapper không nhận ra. */
    unmapped: Array<{ path: string; value: string }>;
    /** Sự thật suy ra được bằng số học từ fact đã có, ví dụ 'burr là 3.2× giới hạn'. */
    derivedFacts: string[];
    /** Mâu thuẫn hoặc thiếu sót model nhận thấy trong dữ liệu. */
    dataQualityNotes: string[];
    severity: Severity;
    severityRationale: string;
}

export const ENRICHMENT_SCHEMA = {
    type: 'object',
    properties: {
        unmapped: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Dotted path in the raw dataset' },
                    value: { type: 'string', description: 'Value rendered as text' },
                },
                required: ['path', 'value'],
            },
        },
        derivedFacts: {
            type: 'array',
            items: { type: 'string' },
            description: 'Arithmetic or comparative facts derived strictly from values already present',
        },
        dataQualityNotes: {
            type: 'array',
            items: { type: 'string' },
        },
        severity: { type: 'string', enum: [...SEVERITY_LEVELS] },
        severityRationale: { type: 'string' },
    },
    required: ['unmapped', 'derivedFacts', 'dataQualityNotes', 'severity', 'severityRationale'],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Bước 2 — báo cáo 8D
// ─────────────────────────────────────────────────────────────────────────────

export const EIGHT_D_SCHEMA = {
    type: 'object',
    properties: {
        internalSummary: {
            type: 'string',
            description:
                'Candid summary for the plant. Equipment, batch and people may be named.',
        },
        customerSummary: {
            type: 'string',
            nullable: true,
            description:
                'Outward-facing summary. Only for Q1 customer complaints; null for Q3 internal defects.',
        },
        disciplines: {
            type: 'array',
            // Probe D1 xác nhận ràng buộc này có hiệu lực — model trả đúng 8 mục
            // đúng thứ tự. Vẫn giữ postProcess làm lưới thứ hai.
            minItems: 8,
            maxItems: 8,
            items: {
                type: 'object',
                properties: {
                    code: { type: 'string', enum: [...DISCIPLINE_CODES] },
                    sequence: { type: 'integer' },
                    title: { type: 'string' },
                    summary: {
                        type: 'string',
                        description: 'One or two sentences, plain text, at most 500 characters',
                    },
                    content: { type: 'string', description: 'Markdown body' },
                    actionItems: { type: 'array', items: { type: 'string' } },
                    sources: {
                        type: 'array',
                        items: { type: 'string' },
                        description:
                            "CaseContext paths this discipline rests on, e.g. 'actions.containment#1', " +
                            "'ishikawa.Machine', 'fiveWhy#2', 'inspections#1'",
                    },
                    confidence: { type: 'number' },
                    dataBacked: { type: 'boolean' },
                },
                required: [
                    'code', 'sequence', 'title', 'summary', 'content',
                    'actionItems', 'sources', 'confidence', 'dataBacked',
                ],
            },
        },
    },
    required: ['internalSummary', 'customerSummary', 'disciplines'],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Ngân sách token
//
// Suy ra từ ma trận probe. `gemini-2.5-pro` đốt completion token cho phần suy
// nghĩ nội bộ TRƯỚC khi sinh chữ nào, và `max_tokens` đếm cả hai. Budget chật
// thì output bị cắt giữa chừng và `finishReason` trả 'length' — đây là kiểu hỏng
// hay gặp nhất, không phải sai cú pháp.
//
// Probe cho thấy `thinkingBudget: 512` giảm 43% completion token và 34% thời
// gian mà vẫn đúng kết quả với việc bóc dữ liệu. Nhưng đó là việc cơ học; D4
// mới là chỗ cần suy luận thật, nên bước phân tích để ngân sách rộng hơn nhiều.
//
// `thinkingBudget: 0` bị AI Core từ chối — gemini-2.5-pro không cho tắt hẳn.
//
// Admin ghi đè được ở trang AI Settings qua `<activity>ThinkingBudget`.
// ─────────────────────────────────────────────────────────────────────────────

export const BUDGET = {
    parse: { maxTokens: 8_000, thinkingBudget: 512 },
    /**
     * Chẩn đoán mù là bước SUY LUẬN thuần: model phải cân nhắc 6 nhánh, dựng
     * chuỗi nhân quả và loại trừ 5 nhánh còn lại mà không có đáp án nào để bám.
     * Đây là chỗ đáng chi thinking budget nhất trong cả pipeline — rộng tay hơn
     * cả bước viết báo cáo, vì viết thì chỉ diễn đạt lại thứ đã kết luận.
     */
    diagnose: { maxTokens: 16_000, thinkingBudget: 8_192 },
    analyze: { maxTokens: 32_000, thinkingBudget: 4_096 },
    /**
     * Điền form: ánh xạ narrative ĐÃ VIẾT XONG vào các ô đã cấu hình. Không suy
     * luận, không sinh nội dung mới, output chỉ là một mảng {code, path,
     * valueJson} — nên 8K là dư và thinking budget là tiền vứt đi.
     *
     * Trước đây bước này dùng chung `analyze` (32K + 4096 thinking) vì chỗ gọi
     * khai nhầm `activity: ACTIVITY_ANALYZE`. Đo được: ~90s cho một thao tác
     * đáng lẽ vài giây.
     */
    structure: { maxTokens: 8_000, thinkingBudget: 0 },
} as const;
