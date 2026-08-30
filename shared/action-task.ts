/**
 * Chuyển một hành động AI đề xuất thành một TASK giao được cho người.
 *
 * ── Vì sao là hai thứ khác nhau ──
 * Hành động AI đề xuất chỉ có mấy chữ: "Replace clamp pads". Đủ để đọc, không đủ
 * để giao việc. Muốn giao thì phải có người nhận, thời hạn, mô tả đủ để người
 * nhận hiểu mà không cần hỏi lại, và chỗ đính kèm bằng chứng khi làm xong.
 *
 * Nên bảng task KHÔNG phải là danh sách đề xuất được tô màu khác. Nó là bản ghi
 * riêng, do người xác nhận, và chỉ sinh ra khi có người bấm Accept — giống hệt
 * quan hệ giữa `team.roster` (AI đề xuất) và `team.assignedRoster` (kỹ sư chốt)
 * ở D1.
 *
 * Đặt ở `shared/` để jest của backend test được — cùng lý do với
 * `evidence-path.ts`, `precedent-shape.ts` và `step-status.ts`.
 */

export interface ActionTaskAttachment {
    name: string;
    /** Loại hiển thị trên chip: PDF, XLS, IMG… */
    kind: string;
}

export interface ActionTask {
    /** Ổn định trong suốt vòng đời hàng — dùng làm key của React và để sửa/xoá. */
    id: string;
    name: string;
    description: string;
    assignee: string;
    /** Thời gian dự kiến, tính theo ngày. 0 nghĩa là chưa ước lượng. */
    durationDays: number;
    status: string;
    /** Đề xuất này đến từ đâu: 'AI suggestion' hoặc 'User added'. */
    origin: string;
    attachments: ActionTaskAttachment[];
}

/** Hình dạng một hàng hành động do AI sinh (xem `corrective.actions` trong seed). */
export interface SuggestedAction {
    action?: string;
    actionText?: string;
    owner?: string;
    status?: string;
    origin?: string;
    protection?: string;
}

export const TASK_STATUSES = ['Planned', 'In Progress', 'Done', 'Verified', 'Blocked'] as const;

export function normalizeActionStatus(status?: string): 'Planned' | 'In Progress' | 'Done' | 'Verified' | 'Blocked' {
    const s = String(status ?? '').trim().toLowerCase();
    if (s.includes('block')) return 'Blocked';
    if (s.includes('verifi')) return 'Verified';
    if (s.includes('done') || s.includes('implement') || s.includes('complete')) return 'Done';
    if (s.includes('progress') || s.includes('process') || s.includes('doing')) return 'In Progress';
    return 'Planned';
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Tên hiển thị của một hành động, từ bất kỳ biến thể khoá nào.
 *
 * Model đã từng trả về `action`, và ở bản cũ hơn là `actionText`. Chấp nhận cả
 * hai ở ĐÚNG MỘT chỗ, thay vì rải `?? row.actionText` khắp nơi rồi quên một chỗ.
 */
export function actionLabel(action: SuggestedAction): string {
    return text(action.action) || text(action.actionText);
}

/**
 * Đường dẫn trường chứa task đã chốt, suy từ trường chứa đề xuất.
 *
 *   containment.actions  →  containment.assignedActions
 *   corrective.actions   →  corrective.assignedActions
 *
 * Quy ước này giống D1 (`team.roster` → `team.assignedRoster`) nên người cấu
 * hình Form Editor không phải học thêm luật mới.
 */
export function assignedFieldFor(suggestionField: string): string {
    const parts = suggestionField.split('.');
    parts[parts.length - 1] = 'assignedActions';
    return parts.join('.');
}

/**
 * Dựng task từ một đề xuất.
 *
 * Những trường AI không nói gì được để TRỐNG chứ không bịa: người nhận và thời
 * hạn là cam kết của một con người, và một giá trị mặc định trông như đã có
 * người chịu trách nhiệm là kiểu nói dối tệ nhất trong bảng phân công.
 * `owner` do AI đề xuất thì giữ, vì đó là đề xuất có căn cứ chứ không phải bịa.
 */
export function taskFromAction(action: SuggestedAction, seed: string): ActionTask {
    const name = actionLabel(action);
    return {
        id: `task-${seed}`,
        name,
        // Mô tả mặc định lặp lại tên là vô ích; để trống thì ô detail nói thẳng
        // là chưa có, và người dùng biết mình cần viết gì vào đó.
        description: text(action.protection),
        assignee: text(action.owner),
        durationDays: 0,
        status: text(action.status) || 'Not started',
        origin: text(action.origin) || 'AI suggestion',
        attachments: [],
    };
}

/** Đọc mảng task đã lưu, bỏ qua thứ không dùng được thay vì làm hỏng cả bảng. */
export function normalizeTasks(value: unknown): ActionTask[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((row, index) => {
        if (!row || typeof row !== 'object') return [];
        const item = row as Record<string, unknown>;
        const name = text(item.name) || actionLabel(item as SuggestedAction);
        if (!name) return [];
        const duration = Number(item.durationDays);
        return [{
            id: text(item.id) || `task-${index}`,
            name,
            description: text(item.description),
            assignee: text(item.assignee) || text(item.owner),
            durationDays: Number.isFinite(duration) && duration > 0 ? duration : 0,
            status: text(item.status) || 'Not started',
            origin: text(item.origin) || 'User added',
            attachments: Array.isArray(item.attachments)
                ? item.attachments.flatMap((a) => {
                    const att = a as Record<string, unknown>;
                    const attName = text(att?.name);
                    return attName ? [{ name: attName, kind: text(att.kind) || 'FILE' }] : [];
                })
                : [],
        }];
    });
}

/**
 * Thêm task mới vào danh sách, bỏ qua cái đã có.
 *
 * Trùng tính theo TÊN chứ không theo id: bấm Accept hai lần trên cùng một đề
 * xuất sinh ra hai id khác nhau nhưng vẫn là một việc, và bảng phân công có hai
 * dòng giống hệt là lỗi người dùng nhìn thấy ngay.
 */
export function mergeTasks(existing: ActionTask[], incoming: ActionTask[]): ActionTask[] {
    const seen = new Set(existing.map((task) => task.name.toLowerCase()));
    const fresh = incoming.filter((task) => {
        const key = task.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return fresh.length ? [...existing, ...fresh] : existing;
}

/** Đề xuất đã được nhận vào bảng task chưa. */
export function isAccepted(action: SuggestedAction, tasks: ActionTask[]): boolean {
    const label = actionLabel(action).toLowerCase();
    return Boolean(label) && tasks.some((task) => task.name.toLowerCase() === label);
}
