import { useState } from 'react';
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    cn,
} from '@cnma/react-ui';
import { Info, Paperclip, Plus, Sparkles, User } from 'lucide-react';
import { TASK_STATUSES, type ActionTask } from '../../../../../shared/action-task';

/**
 * Bảng việc đã chốt của một bước D.
 *
 * ── Vì sao tách khỏi thẻ đề xuất ──
 * `ActionCardsWidget` bên trên hiển thị thứ AI ĐỀ XUẤT. Bảng này hiển thị thứ kỹ
 * sư ĐÃ NHẬN. Trộn hai thứ vào một danh sách rồi phân biệt bằng màu là cách chắc
 * chắn để tới lúc audit không ai nói được việc nào đã có người chịu trách nhiệm.
 * Cùng quan hệ với `team.roster` → `team.assignedRoster` ở D1.
 *
 * Bảng cố ý chỉ hiện năm cột. Mô tả, đính kèm và phần còn lại nằm sau nút chi
 * tiết — một bảng phải quét được bằng mắt, và mô tả dài làm hỏng đúng việc đó.
 */

const STATUS_TONE: Record<string, string> = {
    'Not started': 'border-border text-muted-foreground',
    'In progress': 'border-info/40 bg-info/10 text-info',
    Blocked: 'border-destructive/40 bg-destructive/10 text-destructive',
    Done: 'border-success/40 bg-success/10 text-success',
};

function StatusChip({ status }: { status: string }) {
    return (
        <span className={cn(
            'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
            STATUS_TONE[status] ?? STATUS_TONE['Not started'],
        )}>
            {status}
        </span>
    );
}

/** Ô trống phải nói RÕ là chưa ai điền, không được để trắng như lỗi hiển thị. */
function Blank({ label }: { label: string }) {
    return <span className="italic text-muted-foreground/70">{label}</span>;
}

function TaskDetail({ task, onClose }: { task: ActionTask | null; onClose: () => void }) {
    if (!task) return null;

    const rows: Array<[string, React.ReactNode]> = [
        ['Assignee', task.assignee || <Blank label="Not assigned" />],
        ['Duration', task.durationDays > 0
            ? `${task.durationDays} day${task.durationDays > 1 ? 's' : ''}`
            : <Blank label="Not estimated" />],
        ['Status', <StatusChip status={task.status} />],
        ['Origin', task.origin],
    ];

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-base">{task.name}</DialogTitle>
                    <DialogDescription className="text-xs">
                        Task detail — edit on the report screen once the plan is agreed.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Description
                        </div>
                        <p className="mt-1 text-[13px] leading-relaxed">
                            {task.description || <Blank label="No description yet." />}
                        </p>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                        {rows.map(([label, value]) => (
                            <div key={label} className="min-w-0">
                                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {label}
                                </dt>
                                <dd className="mt-0.5 text-[13px]">{value}</dd>
                            </div>
                        ))}
                    </dl>

                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Attachments
                        </div>
                        {task.attachments.length === 0 ? (
                            <p className="mt-1 text-[13px]"><Blank label="None attached." /></p>
                        ) : (
                            <ul className="mt-1.5 flex flex-wrap gap-1.5">
                                {task.attachments.map((file) => (
                                    <li
                                        key={file.name}
                                        className="inline-flex items-center gap-1 rounded border bg-muted px-2 py-0.5 text-[11px]"
                                    >
                                        <Paperclip className="h-3 w-3" />
                                        <span className="font-medium">{file.kind}</span>
                                        <span className="text-muted-foreground">{file.name}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function TaskTable({ tasks, onChange }: {
    tasks: ActionTask[];
    onChange: (next: ActionTask[]) => void;
}) {
    const [detail, setDetail] = useState<ActionTask | null>(null);
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState('');

    const persist = onChange;

    const addByHand = () => {
        const name = draft.trim();
        if (!name) return;
        setDraft('');
        setAdding(false);
        persist([...tasks, {
            id: `task-manual-${tasks.length + 1}`,
            name,
            description: '',
            assignee: '',
            durationDays: 0,
            status: TASK_STATUSES[0],
            origin: 'User added',
            attachments: [],
        }]);
    };

    return (
        <div className="space-y-2.5 pt-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Assigned tasks
            </div>
            <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[560px] text-[13px]">
                    <thead>
                        <tr className="border-b bg-muted/40 text-left">
                            {['Task', 'Assignee', 'Duration', 'Status', ''].map((head) => (
                                <th
                                    key={head}
                                    className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                                >
                                    {head}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {tasks.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                                    No task accepted yet. Use <span className="font-medium">+ Add</span> on a
                                    suggestion above, or add one by hand.
                                </td>
                            </tr>
                        ) : tasks.map((task) => (
                            <tr key={task.id} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="px-3 py-2">
                                    <span className="flex items-center gap-1.5">
                                        {task.origin === 'AI suggestion' && (
                                            <Sparkles className="h-3 w-3 shrink-0 text-primary" />
                                        )}
                                        <span className="font-medium">{task.name}</span>
                                    </span>
                                </td>
                                <td className="px-3 py-2">
                                    {task.assignee
                                        ? <span className="inline-flex items-center gap-1">
                                            <User className="h-3 w-3 text-muted-foreground" />{task.assignee}
                                        </span>
                                        : <Blank label="Unassigned" />}
                                </td>
                                <td className="px-3 py-2 tabular-nums">
                                    {task.durationDays > 0 ? `${task.durationDays}d` : <Blank label="—" />}
                                </td>
                                <td className="px-3 py-2"><StatusChip status={task.status} /></td>
                                <td className="px-3 py-2 text-right">
                                    <button
                                        type="button"
                                        onClick={() => setDetail(task)}
                                        aria-label={`Detail for ${task.name}`}
                                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-primary hover:bg-primary/10"
                                    >
                                        <Info className="h-3.5 w-3.5" />
                                        Detail
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {adding ? (
                <div className="flex items-center gap-1.5">
                    <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addByHand(); }}
                        placeholder="Task name…"
                        className="flex-1 rounded border bg-background px-2 py-1 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <Button size="sm" className="h-7 text-[11px]" onClick={addByHand}>Add</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setAdding(false)}>
                        Cancel
                    </Button>
                </div>
            ) : (
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => setAdding(true)}
                >
                    <Plus className="mr-1 h-3 w-3" /> Add task
                </Button>
            )}

            <TaskDetail task={detail} onClose={() => setDetail(null)} />
        </div>
    );
}
