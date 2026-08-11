import {
    registerActivities,
    registerEmbeddingCorpora,
    type AiActivity,
    type EmbeddingCorpus,
} from '@cnma/sap-aicore-integrate/react/shared';

/**
 * Đăng ký registry AI cho bundle UI.
 *
 * ⚠️ Registry của CDK là **theo từng bundle và khởi đầu RỖNG**. Backend đã đăng ký
 * ở `srv/server.ts`, nhưng bundle UI chạy trong trình duyệt là một tiến trình
 * khác — không thấy gì từ đăng ký phía backend. Không đăng ký ở đây thì ô chọn
 * model trong trang cấu hình sẽ trống, dù backend hoàn toàn bình thường.
 *
 * ⚠️ Hai danh sách dưới đây **phải khớp** với:
 *     srv/src/core/ai/activities.ts
 *     srv/src/core/ai/embeddingCorpora.ts
 * Lệch nhau thì admin chọn được một activity mà backend không biết tra ở đâu.
 *
 * `label` và `description` hiện thẳng trên giao diện — giữ bằng tiếng Anh.
 */

const ACTIVITIES: readonly AiActivity[] = Object.freeze([
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

const EMBEDDING_CORPORA: readonly EmbeddingCorpus[] = Object.freeze([
    Object.freeze({
        kind: 'default',
        label: 'Default corpus',
        description:
            'Placeholder corpus so the integration layer runs before any vector table exists. Replace kind and schemaColumns once the real schema lands.',
        dim: 1536,
        schemaColumns: '<Entity>.embedding cds.Vector(1536)',
        defaultModel: 'text-embedding-3-small',
        modelEnvVar: 'AICORE_MODEL_EMBEDDING',
    }),
]);

let registered = false;

/** Idempotent — gọi một lần ở main.tsx, trước khi render. */
export function registerAiRegistry(): void {
    if (registered) return;
    registerActivities([...ACTIVITIES]);
    registerEmbeddingCorpora([...EMBEDDING_CORPORA]);
    registered = true;
}
