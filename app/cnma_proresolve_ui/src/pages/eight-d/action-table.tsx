import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Badge,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Textarea,
    cn,
} from '@cnma/react-ui';
import { CheckSquare, Clock, Edit2, Eye, FileText, Paperclip, Sparkles, Tag, User } from 'lucide-react';
import { TASK_STATUSES, type ActionTask } from '../../../../../shared/action-task';
import { listTaskEvidence } from '@/services/eightd-service';
import { TaskEvidenceSection } from './task-evidence';

/**
 * Bảng việc đã chốt của một bước D.
 *
 * ── Vì sao tách khỏi thẻ đề xuất ──
 * `ActionCardsWidget` bên trên hiển thị thứ AI ĐỀ XUẤT. Bảng này hiển thị thứ kỹ
 * sư ĐÃ NHẬN. Trộn hai thứ vào một danh sách rồi phân biệt bằng màu là cách chắc
 * chắn để tới lúc audit không ai nói được việc nào đã có người chịu trách nhiệm.
 * Cùng quan hệ với `team.roster` → `team.assignedRoster` ở D1.
 *
 * Bảng hiển thị 6 cột: Task | Assignee | Duration | Status | Evidence | (actions).
 */

const STATUS_TONE: Record<string, string> = {
    'Not started': 'border-border text-muted-foreground',
    'In progress': 'border-info/40 bg-info/10 text-info',
    Blocked: 'border-destructive/40 bg-destructive/10 text-destructive',
    Done: 'border-success/40 bg-success/10 text-success',
};

function StatusChip({ status }: { status: string }) {
    return (
        <span
            title={status}
            className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[140px]',
                STATUS_TONE[status] ?? STATUS_TONE['Not started'],
            )}
        >
            {status}
        </span>
    );
}

/** Ô trống phải nói RÕ là chưa ai điền, không được để trắng như lỗi hiển thị. */
function Blank({ label }: { label: string }) {
    return <span className="italic text-muted-foreground/70">{label}</span>;
}

function TaskDetail({
    task,
    initialEditing = false,
    readOnly = false,
    reportID = '',
    disciplineCode = '',
    onClose,
    onSave,
}: {
    task: ActionTask | null;
    initialEditing?: boolean;
    readOnly?: boolean;
    reportID?: string;
    disciplineCode?: string;
    onClose: () => void;
    onSave: (updatedTask: ActionTask) => void;
}) {
    if (!task) return null;

    const [isEditing, setIsEditing] = useState(initialEditing);
    const [name, setName] = useState(task.name);
    const [assignee, setAssignee] = useState(task.assignee);
    const [durationDays, setDurationDays] = useState<number | string>(task.durationDays ? String(task.durationDays) : '');
    const [status, setStatus] = useState(task.status || 'Not started');
    const [description, setDescription] = useState(task.description);

    useEffect(() => {
        setName(task.name);
        setAssignee(task.assignee);
        setDurationDays(task.durationDays ? String(task.durationDays) : '');
        setStatus(task.status || 'Not started');
        setDescription(task.description);
        setIsEditing(initialEditing);
    }, [task, initialEditing]);

    const handleSave = () => {
        onSave({
            ...task,
            name: name.trim() || task.name,
            assignee: assignee.trim(),
            durationDays: Math.max(0, Number(durationDays) || 0),
            status,
            description: description.trim(),
        });
        setIsEditing(false);
    };

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="w-[calc(100%-2rem)] sm:max-w-3xl md:max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="space-y-2 border-b pb-3">
                    <div className="flex items-center justify-between gap-2 pr-6">
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <FileText className="h-4 w-4" />
                            </span>
                            <div>
                                <DialogTitle className="text-base font-semibold">
                                    {isEditing ? 'Edit Task Details' : 'Task Details'}
                                </DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground">
                                    {isEditing
                                        ? 'Update task assignment, schedule, and scope'
                                        : 'View detailed task instructions and assignment status'}
                                </DialogDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            {task.origin === 'AI suggestion' ? (
                                <Badge variant="outline" className="gap-1 text-[11px] font-normal border-primary/30 text-primary bg-primary/5">
                                    <Sparkles className="h-3.5 w-3.5" /> AI Suggestion
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="gap-1 text-[11px] font-normal text-muted-foreground">
                                    <User className="h-3.5 w-3.5" /> User Added
                                </Badge>
                            )}
                            <StatusChip status={isEditing ? status : task.status} />
                        </div>
                    </div>
                </DialogHeader>

                {isEditing ? (
                    <div className="space-y-4 pt-2">
                        {/* Task Name */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                                Task Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="h-8 text-xs bg-background font-medium"
                                placeholder="Task name..."
                            />
                        </div>

                        {/* Description */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                                Description & Instructions
                            </Label>
                            <Textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={4}
                                className="text-xs leading-relaxed bg-background min-h-[80px]"
                                placeholder="Detailed instructions, scope of work, or criteria..."
                            />
                        </div>

                        {/* Grid */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground">
                                    Assignee
                                </Label>
                                <Input
                                    value={assignee}
                                    onChange={(e) => setAssignee(e.target.value)}
                                    className="h-8 text-xs bg-background"
                                    placeholder="e.g. Quality Engineer"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground">
                                    Duration (Days)
                                </Label>
                                <Input
                                    type="number"
                                    min={0}
                                    placeholder="0"
                                    value={durationDays}
                                    onChange={(e) => setDurationDays(e.target.value)}
                                    className="h-8 text-xs bg-background"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground">
                                    Status
                                </Label>
                                <Select value={status} onValueChange={setStatus}>
                                    <SelectTrigger className="h-8 text-xs bg-background w-full">
                                        <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TASK_STATUSES.map((st) => (
                                            <SelectItem key={st} value={st}>{st}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-3 border-t">
                            <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="h-8 text-xs">
                                Cancel
                            </Button>
                            <Button size="sm" onClick={handleSave} disabled={!name.trim()} className="h-8 text-xs">
                                Save changes
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 pt-2">
                        {/* Task Title Box */}
                        <div className="rounded-lg border bg-card p-3.5 space-y-1">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Task Statement
                            </div>
                            <p className="text-sm font-medium leading-relaxed text-foreground break-words">
                                {task.name}
                            </p>
                        </div>

                        {/* Attribute Cards Grid */}
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
                                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                                    <User className="h-4 w-4 text-muted-foreground" /> Assignee
                                </div>
                                <div className="text-xs font-semibold text-foreground truncate">
                                    {task.assignee || <Blank label="Unassigned" />}
                                </div>
                            </div>

                            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
                                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                                    <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Duration
                                </div>
                                <div className="text-xs font-semibold text-foreground">
                                    {task.durationDays > 0 ? `${task.durationDays} day${task.durationDays > 1 ? 's' : ''}` : <Blank label="Not estimated" />}
                                </div>
                            </div>

                            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
                                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                                    <Tag className="h-3.5 w-3.5 text-muted-foreground" /> Status
                                </div>
                                <div>
                                    <StatusChip status={task.status} />
                                </div>
                            </div>
                        </div>

                        {/* Description Section */}
                        {/* Description Section */}
                        <div className="rounded-lg border bg-muted/10 p-3.5 space-y-1.5">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Description & Instructions
                            </div>
                            <div className="text-xs leading-relaxed text-foreground whitespace-pre-wrap break-words">
                                {task.description ? (
                                    task.description
                                ) : (
                                    <span className="italic text-muted-foreground">No description or instructions recorded.</span>
                                )}
                            </div>
                        </div>

                        {/* Completion Evidence Section */}
                        {reportID && disciplineCode && (
                            <TaskEvidenceSection
                                reportID={reportID}
                                disciplineCode={disciplineCode}
                                task={task}
                                readOnly={readOnly}
                            />
                        )}

                        {/* Attachments Section */}
                        {task.attachments && task.attachments.length > 0 && (
                            <div className="space-y-1.5">
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Attachments ({task.attachments.length})
                                </div>
                                <ul className="flex flex-wrap gap-2">
                                    {task.attachments.map((file) => (
                                        <li
                                            key={file.name}
                                            className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1 text-xs"
                                        >
                                            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                                            <span className="font-medium text-foreground">{file.kind}</span>
                                            <span className="text-muted-foreground">{file.name}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-2 pt-3 border-t">
                            {!readOnly && (
                                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} className="h-8 text-xs gap-1.5">
                                    <Edit2 className="h-3.5 w-3.5" /> Edit Task
                                </Button>
                            )}
                            <Button size="sm" variant="default" onClick={onClose} className="h-8 text-xs">
                                Close
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

export function TaskTable({
    tasks,
    onChange,
    readOnly = false,
    reportID = '',
    disciplineCode = '',
}: {
    tasks: ActionTask[];
    onChange: (next: ActionTask[]) => void;
    readOnly?: boolean;
    reportID?: string;
    disciplineCode?: string;
}) {
    const [selectedTask, setSelectedTask] = useState<ActionTask | null>(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [adding, setAdding] = useState(false);

    const [newTaskName, setNewTaskName] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newAssignee, setNewAssignee] = useState('');
    const [newDurationDays, setNewDurationDays] = useState<number | string>('');
    const [newStatus, setNewStatus] = useState<string>(TASK_STATUSES[0]);

    const { data: evidences = [] } = useQuery({
        queryKey: ['8d', 'evidence', reportID],
        queryFn: () => listTaskEvidence(reportID),
        enabled: Boolean(reportID),
    });

    const persist = onChange;

    const removeTask = (id: string) => {
        persist(tasks.filter((t) => t.id !== id));
    };

    const updateTask = (updated: ActionTask) => {
        const next = tasks.map((t) => (t.id === updated.id ? updated : t));
        persist(next);
        setSelectedTask(null);
    };

    const handleCreateTask = () => {
        const name = newTaskName.trim();
        if (!name) return;
        persist([...tasks, {
            id: `task-manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            name,
            description: newDescription.trim(),
            assignee: newAssignee.trim(),
            durationDays: Math.max(0, Number(newDurationDays) || 0),
            status: newStatus || TASK_STATUSES[0],
            origin: 'User added',
            attachments: [],
        }]);
        setNewTaskName('');
        setNewDescription('');
        setNewAssignee('');
        setNewDurationDays('');
        setNewStatus(TASK_STATUSES[0]);
        setAdding(false);
    };

    return (
        <div className="min-w-0 overflow-hidden rounded-xl border bg-card p-4 shadow-xs transition-all border-border/70">
            <div className="mb-3 pb-2 border-b border-border/60 flex min-w-0 items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <CheckSquare className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 break-words text-[14px] font-bold tracking-tight text-foreground">
                        Assigned Tasks
                    </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {!readOnly && !adding && (
                        <button
                            type="button"
                            onClick={() => setAdding(true)}
                            className="rounded-md border border-input bg-card px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted/60 disabled:opacity-50 cursor-pointer"
                        >
                            Add
                        </button>
                    )}
                </div>
            </div>

            <div className="max-w-full overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr>
                            {['Task', 'Assignee', 'Duration', 'Status', 'Evidence', ''].map((label, index) => (
                                <th
                                    key={index}
                                    className="border-b px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                                >
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {tasks.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-2.5 py-5 text-center text-[13.5px] font-normal text-muted-foreground">
                                    No task accepted yet. Use <span className="font-medium text-foreground">Accept</span> on a
                                    suggestion above, or add one by hand.
                                </td>
                            </tr>
                        ) : tasks.map((task) => {
                            const taskFiles = evidences.filter(
                                (e) => e.taskId === task.id && (disciplineCode ? e.disciplineCode === disciplineCode : true),
                            );
                            const isMissingEvidence = task.status === 'Done' && taskFiles.length === 0;

                            return (
                                <tr
                                    key={task.id}
                                    className={cn(
                                        readOnly && 'opacity-90',
                                        isMissingEvidence && 'bg-amber-500/10 dark:bg-amber-500/15',
                                    )}
                                >
                                    <td className="border-b px-2.5 py-2 align-middle">
                                        <span className="flex items-center gap-1.5 text-[13.5px]">
                                            {task.origin === 'AI suggestion' && (
                                                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                                            )}
                                            <span className="font-normal text-foreground">{task.name}</span>
                                        </span>
                                    </td>
                                    <td className="border-b px-2.5 py-2 align-middle text-[13.5px] font-normal">
                                        {task.assignee
                                            ? <span className="inline-flex items-center gap-1.5 text-foreground">
                                                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <span>{task.assignee}</span>
                                            </span>
                                            : <Blank label="Unassigned" />}
                                    </td>
                                    <td className="border-b px-2.5 py-2 align-middle text-[13.5px] font-normal tabular-nums">
                                        {task.durationDays > 0 ? `${task.durationDays}d` : <Blank label="—" />}
                                    </td>
                                    <td className="border-b px-2.5 py-2 align-middle whitespace-nowrap">
                                        <StatusChip status={task.status} />
                                    </td>
                                    <td className="border-b px-2.5 py-2 align-middle whitespace-nowrap text-[13.5px] font-normal">
                                        {task.status !== 'Done' ? (
                                            <span className="text-muted-foreground">—</span>
                                        ) : taskFiles.length === 0 ? (
                                            <button
                                                type="button"
                                                onClick={() => { setSelectedTask(task); setIsEditMode(false); }}
                                                className="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning hover:bg-warning/20 transition-colors cursor-pointer"
                                                title="Completion evidence required. Click to view or upload."
                                            >
                                                Required
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => { setSelectedTask(task); setIsEditMode(false); }}
                                                className="inline-flex items-center rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success hover:bg-success/20 transition-colors cursor-pointer"
                                                title="View attached evidence"
                                            >
                                                {taskFiles.length} {taskFiles.length === 1 ? 'PDF' : 'PDFs'}
                                            </button>
                                        )}
                                    </td>
                                    <td className="border-b px-2.5 py-2 text-right align-middle">
                                        <div className="inline-flex items-center gap-1 justify-end">
                                            <button
                                                type="button"
                                                onClick={() => { setSelectedTask(task); setIsEditMode(false); }}
                                                aria-label="View details"
                                                className="inline-flex h-7 w-7 items-center justify-center rounded text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                                                title="View details"
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                            </button>
                                            {!readOnly && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setSelectedTask(task); setIsEditMode(true); }}
                                                        aria-label="Edit task"
                                                        className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                                                        title="Edit task"
                                                    >
                                                        <Edit2 className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeTask(task.id)}
                                                        className="rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-primary transition-colors hover:bg-muted/60 cursor-pointer"
                                                        title="Remove task"
                                                    >
                                                        Remove
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {!readOnly && adding && (
                <div className="mt-3 rounded-lg border bg-muted/20 p-3.5 space-y-3">
                    <p className="text-xs font-semibold text-foreground">Add New Task</p>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">
                            Task Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            type="text"
                            placeholder="e.g. Replace clamp pads and perform calibration..."
                            value={newTaskName}
                            onChange={(e) => setNewTaskName(e.target.value)}
                            className="h-8 text-xs bg-background"
                            autoFocus
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">
                            Description & Instructions
                        </Label>
                        <Textarea
                            placeholder="Detailed instructions, scope of work, or criteria..."
                            value={newDescription}
                            onChange={(e) => setNewDescription(e.target.value)}
                            rows={2}
                            className="text-xs leading-relaxed bg-background min-h-[60px]"
                        />
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                                Assignee
                            </Label>
                            <Input
                                type="text"
                                placeholder="e.g. Quality Engineer"
                                value={newAssignee}
                                onChange={(e) => setNewAssignee(e.target.value)}
                                className="h-8 text-xs bg-background"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                                Duration (Days)
                            </Label>
                            <Input
                                type="number"
                                min={0}
                                placeholder="0"
                                value={newDurationDays}
                                onChange={(e) => setNewDurationDays(e.target.value)}
                                className="h-8 text-xs bg-background"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                                Status
                            </Label>
                            <Select value={newStatus} onValueChange={setNewStatus}>
                                <SelectTrigger className="h-8 text-xs bg-background w-full">
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    {TASK_STATUSES.map((st) => (
                                        <SelectItem key={st} value={st}>
                                            {st}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                        <Button size="sm" onClick={handleCreateTask} disabled={!newTaskName.trim()}>
                            Add task
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            <TaskDetail
                task={selectedTask}
                initialEditing={isEditMode}
                readOnly={readOnly}
                reportID={reportID}
                disciplineCode={disciplineCode}
                onClose={() => setSelectedTask(null)}
                onSave={updateTask}
            />
        </div>
    );
}



