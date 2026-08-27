/**
 * Mỗi bước D làm ĐÚNG một việc: trình bày đề xuất → người chốt → thứ được chốt
 * tự rơi vào bảng làm việc.
 *
 * ── Vì sao một bảng cấu hình thay vì tám component ──
 * D1 giao người, D3/D5/D7 giao việc, D8 chốt bài học. Nhìn thì khác nhau, nhưng
 * hình dạng thao tác giống hệt: một danh sách gợi ý, một nút nhận, một bảng kết
 * quả. Viết tám component là tám nơi để chúng trôi khác nhau và tám nơi phải sửa
 * khi luật đổi.
 *
 * ── Vì sao `key` phải lấy từ NỘI DUNG đề xuất ──
 * Khoá này là danh tính của gợi ý trong vết audit, và bảng "đã chốt" được dựng
 * lại từ chính vết đó. Lấy theo chỉ số mảng thì lần phân tích sau chèn thêm một
 * dòng ở đầu là mọi quyết định cũ trỏ sang người khác — tức là ai đó bỗng nhiên
 * "được giao" một việc họ chưa từng được đề xuất.
 */

export interface SuggestionColumn {
    label: string;
    /** Khoá trong object của một dòng gợi ý. */
    field: string;
}

export interface StepSuggestionConfig {
    /** Đường dẫn trong `resultJson` tới mảng gợi ý. */
    path: string;
    /** Tiêu đề khối gợi ý. */
    suggestTitle: string;
    /** Tiêu đề bảng kết quả sau khi chốt. */
    confirmedTitle: string;
    /** Câu hiện khi chưa chốt gì — nói rõ chốt xong sẽ ra cái gì. */
    confirmedEmpty: string;
    /** Câu hiện khi AI không có gợi ý nào. */
    suggestEmpty: string;
    /** Danh tính ổn định của một dòng gợi ý. */
    key: (row: Record<string, any>, index: number) => string;
    /** Dòng chữ đậm của một thẻ gợi ý. */
    title: (row: Record<string, any>) => string;
    /** Dòng phụ, xám. Ngắn — đây là chỗ layout cũ phình ra thành một khối văn. */
    subtitle: (row: Record<string, any>) => string;
    /** Vì sao AI đề xuất dòng này. Hiện khi bấm mở, không hiện mặc định. */
    reason?: (row: Record<string, any>) => string;
    /** Cột của bảng đã chốt. */
    columns: SuggestionColumn[];
    /** Nhãn nút nhận tất cả. Bỏ trống ⇒ không có nút đó. */
    acceptAllLabel?: string;
}

const text = (value: unknown): string => {
    if (value == null) return '';
    if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
    return String(value).trim();
};

/** Ghép vài trường thành một dòng phụ, bỏ trường trống, ngăn bằng dấu chấm giữa. */
const join = (...parts: unknown[]) => parts.map(text).filter(Boolean).join(' · ');

/** Dòng gợi ý cho hành động — D3, D5, D7 dùng chung hình dạng này. */
function actionConfig(overrides: Partial<StepSuggestionConfig> & Pick<StepSuggestionConfig, 'path' | 'suggestTitle' | 'confirmedTitle' | 'confirmedEmpty' | 'suggestEmpty'>): StepSuggestionConfig {
    return {
        key: (row, index) => `action:${text(row.action) || index}`,
        title: (row) => text(row.action) || 'Untitled action',
        subtitle: (row) => join(row.owner, row.status, row.origin === 'proposal' ? 'from precedent' : row.origin === 'recorded' ? 'already recorded' : ''),
        columns: [
            { label: 'Action', field: 'action' },
            { label: 'Owner', field: 'owner' },
            { label: 'Status', field: 'status' },
        ],
        acceptAllLabel: 'Accept all',
        ...overrides,
    };
}

export const STEP_SUGGESTIONS: Record<string, StepSuggestionConfig> = {
    D1: {
        path: 'team.roster',
        suggestTitle: 'Suggested team members',
        confirmedTitle: '8D team',
        confirmedEmpty: 'No one assigned yet. Accept a suggestion above and they appear here as team members.',
        suggestEmpty: 'No team suggestion available — assign the team manually.',
        // Tên là danh tính tự nhiên của một người trong roster.
        key: (row, index) => `person:${text(row.name) || index}`,
        title: (row) => text(row.name) || 'Unassigned',
        subtitle: (row) => join(row.organizationalRole, row.assigned8DRole),
        reason: (row) => join(row.caseResponsibility, row.selectionReason),
        columns: [
            { label: 'Name', field: 'name' },
            { label: 'Function', field: 'organizationalRole' },
            { label: '8D role', field: 'assigned8DRole' },
            { label: 'Responsibility', field: 'caseResponsibility' },
        ],
        // Bắt bấm nhận từng người không mở rộng được khi danh sách dài — đúng
        // lý do tài liệu yêu cầu một nút nhận tất cả ở D1.
        acceptAllLabel: 'Accept all suggested',
    },

    D3: actionConfig({
        path: 'containment.actions',
        suggestTitle: 'Suggested containment actions',
        confirmedTitle: 'Containment plan',
        confirmedEmpty: 'No containment action confirmed yet. Accept a suggestion to add it to the plan.',
        suggestEmpty: 'No containment action recorded and no precedent available — define one manually.',
    }),

    D5: actionConfig({
        path: 'corrective.actions',
        suggestTitle: 'Suggested corrective actions',
        confirmedTitle: 'Corrective action plan',
        confirmedEmpty: 'No corrective action confirmed yet. Accept a suggestion to add it to the plan.',
        suggestEmpty: 'No corrective action recorded and no precedent available.',
        subtitle: (row) => join(row.owner, row.status, row.linkedCauseStep && `addresses ${text(row.linkedCauseStep)}`),
        columns: [
            { label: 'Action', field: 'action' },
            { label: 'Owner', field: 'owner' },
            { label: 'Addresses', field: 'linkedCauseStep' },
            { label: 'Status', field: 'status' },
        ],
    }),

    D7: actionConfig({
        path: 'preventive.actions',
        suggestTitle: 'Suggested preventive actions',
        confirmedTitle: 'Prevention plan',
        confirmedEmpty: 'No preventive action confirmed yet. Accept a suggestion to add it to the plan.',
        suggestEmpty: 'No preventive action recorded and no precedent available.',
        subtitle: (row) => join(row.owner, row.status, row.scope),
        columns: [
            { label: 'Action', field: 'action' },
            { label: 'Owner', field: 'owner' },
            { label: 'Scope', field: 'scope' },
            { label: 'Status', field: 'status' },
        ],
    }),

    D8: {
        path: 'precedentLessons',
        suggestTitle: 'Lessons from similar cases',
        confirmedTitle: 'Lessons adopted for this case',
        confirmedEmpty: 'No lesson adopted yet. Accept one above to carry it into this closure.',
        suggestEmpty: 'No precedent lessons available.',
        key: (row, index) => `lesson:${text(row.caseId)}#${index}`,
        title: (row) => text(row.lesson) || 'Lesson',
        subtitle: (row) => join(row.caseId, row.score && `match ${text(row.score)}`),
        columns: [
            { label: 'Lesson', field: 'lesson' },
            { label: 'From case', field: 'caseId' },
            { label: 'Match', field: 'score' },
        ],
        acceptAllLabel: 'Accept all suggested',
    },
};

/**
 * Bước chỉ có MỘT kết luận để chốt, không phải một danh sách để chọn.
 *
 * D2 mô tả vấn đề, D4 kết luận nguyên nhân — không có gì để "chọn trong số",
 * nhưng vẫn có một phán quyết của con người, và đó là phán quyết nặng nhất của
 * cả quy trình. Ghi nó thành một quyết định riêng chứ không gộp vào "đã đánh dấu
 * hoàn thành": sau này đọc lại, "kỹ sư đồng ý với KẾT LUẬN NÀY" và "kỹ sư bấm
 * xong bước này" là hai câu khác nhau.
 *
 * D6 KHÔNG có mặt ở đây: nó được tính từ status của action, không có gì để đồng
 * ý hay phản đối.
 */
export interface StepConfirmConfig {
    /** Đường dẫn tới nội dung cần chốt. */
    path: string;
    /** Khoá audit. Cố định, vì mỗi bước chỉ có một quyết định loại này. */
    key: string;
    title: string;
    confirmLabel: string;
    /** Câu hiện khi AI chưa đưa ra kết luận nào. */
    empty: string;
    /** Dòng phụ, ví dụ nhánh 6M của D4. */
    meta?: (result: Record<string, any>) => string;
}

export const STEP_CONFIRMATIONS: Record<string, StepConfirmConfig> = {
    D2: {
        path: 'problem.statement',
        key: 'statement:problem',
        title: 'Problem statement',
        confirmLabel: 'Confirm problem statement',
        empty: 'No problem statement drafted — there is nothing to confirm yet.',
    },
    D4: {
        path: 'rootCause.statement',
        key: 'rootcause:conclusion',
        title: 'Root cause conclusion',
        confirmLabel: 'Confirm root cause',
        // Chốt ở đây là chỗ DUY NHẤT root cause được coi là đã xác nhận. AI
        // không bao giờ tự đặt cờ đó (R0.3), nên nếu ô này trống thì case chưa
        // có nguyên nhân được xác nhận, bất kể model viết gì.
        empty: 'No root cause established from the available evidence — nothing to confirm.',
        meta: (result) => {
            const category = result?.rootCause?.category;
            return category ? `6M category: ${String(category)}` : '';
        },
    },
};

/** Đọc một đường dẫn có dấu chấm trong `resultJson`. */
export function readPath(root: unknown, path: string): unknown {
    let current: any = root;
    for (const segment of path.split('.')) {
        if (current == null || typeof current !== 'object') return undefined;
        current = current[segment];
    }
    return current;
}

/**
 * Mảng gợi ý của một bước. Rỗng khi bước này không thuộc kiểu gợi-ý-rồi-chốt
 * (D2 mô tả vấn đề, D4 kết luận, D6 checklist tính sẵn).
 */
export function suggestionsOf(
    stepCode: string,
    result: unknown,
): Array<Record<string, any>> {
    const config = STEP_SUGGESTIONS[stepCode];
    if (!config) return [];
    const value = readPath(result, config.path);
    return Array.isArray(value) ? value.filter((row) => row && typeof row === 'object') : [];
}
