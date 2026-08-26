import { Card, cn } from '@cnma/react-ui';
import { CircleDashed, CircleDot, CircleCheck, ShieldCheck } from 'lucide-react';

/**
 * Bảng action của case, đọc thẳng từ CaseContext.
 *
 * ── Vì sao D6 không phải một đoạn văn AI viết ──
 * D6 là "thực thi và kiểm chứng". Nó không cần AI soạn gì cả: nó cần cho thấy
 * case này đã ghi những action nào và mỗi cái đang ở đâu. Một đoạn văn kể lại
 * chuyện đó vừa dài hơn, vừa mất mốc trạng thái, vừa dễ nghe như đã hoàn thành
 * trong khi thực tế chưa.
 *
 * ── Vì sao CHỈ ĐỌC ──
 * Action sống trong SAP QM. Cho sửa status ở đây là tạo ra bản sao trạng thái
 * thứ hai, và bản đó sẽ lệch với SAP ngay lần đầu ai đó cập nhật bên kia. Bảng
 * này soi vào SAP, không tranh quyền làm nguồn sự thật với nó.
 */

export interface CaseActionRow {
    lineNo: number;
    actionType: string;
    actionText: string;
    status: string;
}

export interface CaseActions {
    containment?: CaseActionRow[];
    corrective?: CaseActionRow[];
    preventive?: CaseActionRow[];
}

/** Ba nhóm theo đúng thứ tự 8D — containment (D3) trước corrective (D5) trước preventive (D7). */
const GROUPS: { key: keyof CaseActions; label: string; step: string }[] = [
    { key: 'containment', label: 'Containment', step: 'D3' },
    { key: 'corrective', label: 'Corrective', step: 'D5' },
    { key: 'preventive', label: 'Preventive', step: 'D7' },
];

/**
 * Trạng thái SAP → dấu hiệu thị giác.
 *
 * Chỉ `Verified` mới được màu xanh. `Done` nghĩa là đã làm xong, KHÔNG phải đã
 * chứng minh là hiệu quả — đó đúng là khác biệt mà cả D6 tồn tại để giữ, nên
 * giao diện không được xoá nó bằng cách tô cùng một màu.
 */
function statusStyle(status: string): { icon: typeof CircleDot; className: string } {
    const s = status.trim().toLowerCase();
    if (s === 'verified') return { icon: ShieldCheck, className: 'text-success' };
    if (s === 'done' || s === 'complete' || s === 'completed') return { icon: CircleCheck, className: 'text-primary' };
    if (s === 'in process' || s === 'in progress') return { icon: CircleDot, className: 'text-warning' };
    return { icon: CircleDashed, className: 'text-muted-foreground' };
}

export function ActionChecklist({ actions }: { actions: CaseActions | null }) {
    const groups = GROUPS.map((g) => ({ ...g, rows: actions?.[g.key] ?? [] }));
    const total = groups.reduce((sum, g) => sum + g.rows.length, 0);
    const verified = groups.reduce(
        (sum, g) => sum + g.rows.filter((r) => r.status.trim().toLowerCase() === 'verified').length,
        0,
    );

    if (total === 0) {
        return (
            <Card className="p-4 text-xs text-muted-foreground">
                No actions are recorded on this case yet. Nothing can be verified until there is
                something to verify.
            </Card>
        );
    }

    return (
        <Card className="overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Recorded actions
                </h4>
                <span className="text-xs text-muted-foreground">
                    <strong className="font-semibold text-foreground">{verified}</strong> of {total} verified
                </span>
            </div>

            <div className="divide-y">
                {groups.map((group) => (
                    <div key={group.key} className="px-4 py-3">
                        <div className="mb-1.5 flex items-center gap-2">
                            <span className="text-xs font-semibold">{group.label}</span>
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                {group.step}
                            </span>
                        </div>

                        {group.rows.length === 0 ? (
                            <p className="text-xs italic text-muted-foreground">
                                None recorded — {group.step} has nothing to verify.
                            </p>
                        ) : (
                            <ul className="space-y-1.5">
                                {group.rows.map((row) => {
                                    const { icon: Icon, className } = statusStyle(row.status);
                                    return (
                                        <li key={`${group.key}-${row.lineNo}`} className="flex items-start gap-2">
                                            <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', className)} />
                                            <span className="min-w-0 flex-1 break-words text-xs">
                                                {row.actionText}
                                            </span>
                                            <span className={cn('shrink-0 text-[11px] font-medium', className)}>
                                                {row.status}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                ))}
            </div>

            <p className="border-t bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
                Read-only — actions and their status live in SAP QM. Update them there.
            </p>
        </Card>
    );
}

/** Bóc `actions` khỏi chuỗi caseContext. Hỏng thì trả null chứ không làm vỡ trang. */
export function parseCaseActions(caseContext: string | null | undefined): CaseActions | null {
    if (!caseContext) return null;
    try {
        const parsed = JSON.parse(caseContext);
        const actions = parsed?.actions;
        return actions && typeof actions === 'object' && !Array.isArray(actions) ? actions : null;
    } catch {
        return null;
    }
}
