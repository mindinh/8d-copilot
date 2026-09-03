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
import { CalendarClock, CheckSquare, Clock, Edit2, Eye, FileText, Hash, Paperclip, Sparkles, Tag, User } from 'lucide-react';
import { TASK_STATUSES, normalizeActionStatus, type ActionTask } from '../../../../../shared/action-task';
import { classifyTaskCode, taskCodeGroupOf, taskCodeTextOf } from '../../../../../shared/task-catalogue';
import { listTaskEvidence } from '@/services/eightd-service';
import { useValueHelp } from '@/hooks/use-value-help';
import { ValueHelpInput } from '@/components/ui/ValueHelpInput';
import { VALUE_HELP_IDS } from '@/services/value-help-service';
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
 * Bảng hiển thị 7 cột: Task | Code | Assignee | Duration | Status | Evidence | (actions).
 *
 * ── Vì sao cột Code nằm trong bảng, còn hạn dự kiến thì không ──
 * Phase 4 đổi câu hỏi "lần trước gặp lỗi này chúng ta đã làm gì" từ một phép đọc
 * văn bản thành một phép đếm. Thứ trả tiền cho việc đó là MÃ, nên mã phải nhìn
 * thấy được ngay ở danh sách. `plannedEndDate` là dữ liệu vận hành của một việc
 * cụ thể — nó thuộc về ô chi tiết, và nhét thêm một cột ngày vào bảng chỉ làm
 * bảng chật đi mà không trả lại gì cho việc tra cứu.
 */

const STATUS_TONE: Record<string, string> = {
    'Planned': 'border-slate-300 bg-slate-100/90 text-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700',
    'Not started': 'border-slate-300 bg-slate-100/90 text-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700',
    'In Progress': 'border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
    'In progress': 'border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
    'Implemented': 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
    'Done': 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
    'Verified': 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    'Blocked': 'border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
};

function StatusChip({ status }: { status: string }) {
    const norm = normalizeActionStatus(status);
    return (
        <span
            title={norm}
            className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[140px]',
                STATUS_TONE[norm] ?? STATUS_TONE['Planned'],
            )}
        >
            {norm}
        </span>
    );
}

/** Ô trống phải nói RÕ là chưa ai điền, không được để trắng như lỗi hiển thị. */
function Blank({ label }: { label: string }) {
    return <span className="italic text-muted-foreground/70">{label}</span>;
}

/** Ngày ISO hiển thị cho người đọc; chuỗi không phải ngày thì trả về rỗng. */
function formatDate(iso: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    const parsed = new Date(`${iso}T00:00:00`);
    return Number.isNaN(parsed.getTime())
        ? ''
        : parsed.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Mã nhiệm vụ ở dạng chip, kèm mô tả trong tooltip để bảng không phải rộng thêm. */
function TaskCodeChip({ code }: { code: string }) {
    if (!code) return <Blank label="—" />;
    const text = taskCodeTextOf(code);
    return (
        <span
            title={text ? `${code} — ${text}` : code}
            className="inline-flex items-center rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground"
        >
            {code}
        </span>
    );
}

/**
 * Ô chọn mã nhiệm vụ, dùng chung cho form Add và ô Edit.
 *
 * ── Vì sao đi qua `ValueHelpInput` chứ không phải một `Select` đọc thẳng
 * `TASK_CODES` ──
 * Đọc thẳng hằng số thì gọn hơn và không cần mạng. Nhưng danh mục nhiệm vụ là
 * danh mục SAP (catalog type 2) y như danh mục lỗi (type 9) — ngày nối S/4, cả
 * hai phải đổi nguồn bằng cách sửa `sourceType` của MỘT DÒNG trong
 * `ValueHelpList`, không phải bằng cách sửa component. Một trong hai ô đi đường
 * riêng là đúng cái chỗ ngày đó sẽ bị bỏ quên.
 *
 * ── Vì sao KHÔNG `strict` ──
 * Ô mã lỗi khoá cứng vì nó là khoá chấm điểm tiền lệ: sai mã là mất điểm âm
 * thầm. Mã nhiệm vụ thì không chấm điểm — nó phục vụ tra cứu. Chặn lưu một việc
 * chỉ vì bộ luật chưa có mã cho nó là đổi một bản ghi thiếu mã lấy một việc
 * không được giao cho ai. Ô trống nói đúng sự thật: chưa mã hoá được.
 *
 * ── Vì sao nhóm là ô đọc-only ──
 * Cùng lý do với nhóm mã lỗi: một mã chỉ thuộc đúng một nhóm. Cho sửa nhóm là mở
 * đường cho một cặp nhóm/mã không tồn tại trong danh mục.
 */
function TaskCodeField({
    code,
    onCodeChange,
    suggestedFrom,
    idPrefix,
}: {
    code: string;
    onCodeChange: (code: string) => void;
    /** Tên task đang gõ — dùng để gợi ý mã khi ô còn trống. */
    suggestedFrom: string;
    idPrefix: string;
}) {
    const taskCodeVh = useValueHelp(VALUE_HELP_IDS.taskCode);
    const suggestion = code ? null : classifyTaskCode(suggestedFrom)?.taskCode ?? null;
    // Nhóm suy từ mã bằng đúng hàm mà `normalizeTasks` dùng, nên thứ hiện trên
    // màn hình và thứ được lưu xuống không thể lệch nhau.
    const group = taskCodeGroupOf(code) ?? '';

    return (
        <>
            <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-task-code`} className="text-xs font-medium text-muted-foreground">
                    Task Code
                </Label>
                <ValueHelpInput
                    id={`${idPrefix}-task-code`}
                    value={code}
                    onChange={onCodeChange}
                    entries={taskCodeVh.entries}
                    loading={taskCodeVh.loading}
                    quiet
                    catalogLabel="the task catalogue"
                    placeholder="e.g. TSK-1010"
                />
                {suggestion && (
                    <button
                        type="button"
                        onClick={() => onCodeChange(suggestion)}
                        className="flex items-start gap-1 text-left text-[10.5px] leading-snug text-primary hover:underline cursor-pointer"
                    >
                        <Sparkles className="mt-px h-3 w-3 shrink-0" />
                        <span>Suggested from the task name: {suggestion} — {taskCodeTextOf(suggestion)}</span>
                    </button>
                )}
            </div>
            <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Code Group</Label>
                <Input
                    value={group}
                    readOnly
                    placeholder="— from Task Code —"
                    className="h-8 text-xs bg-muted/40 font-mono"
                />
            </div>
        </>
    );
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
    const [taskCode, setTaskCode] = useState(task.taskCode);
    const [plannedEndDate, setPlannedEndDate] = useState(task.plannedEndDate);

    useEffect(() => {
        setName(task.name);
        setAssignee(task.assignee);
        setDurationDays(task.durationDays ? String(task.durationDays) : '');
        setStatus(task.status || 'Not started');
        setDescription(task.description);
        setTaskCode(task.taskCode);
        setPlannedEndDate(task.plannedEndDate);
        setIsEditing(initialEditing);
    }, [task, initialEditing]);

    const handleSave = () => {
        // Mã viết hoa trước khi lưu: danh mục là chữ hoa, và `TSK-1010` gõ thành
        // `tsk-1010` sẽ đếm thành một mã thứ hai lúc tra cứu.
        const code = taskCode.trim().toUpperCase();
        onSave({
            ...task,
            name: name.trim() || task.name,
            assignee: assignee.trim(),
            durationDays: Math.max(0, Number(durationDays) || 0),
            status,
            description: description.trim(),
            taskCode: code,
            // Nhóm KHÔNG lấy từ state riêng: nó là hàm của mã. Giữ hai state rồi
            // lưu cả hai là cách để chúng lệch nhau đúng lúc không ai nhìn.
            taskCodeGroup: taskCodeGroupOf(code) ?? '',
            plannedEndDate,
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

                        {/* Quality Task coding — SAP catalog type 2 */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <TaskCodeField
                                code={taskCode}
                                onCodeChange={setTaskCode}
                                suggestedFrom={name}
                                idPrefix={`task-detail-${task.id}`}
                            />
                            <div className="space-y-1.5">
                                <Label htmlFor={`task-detail-${task.id}-due`} className="text-xs font-medium text-muted-foreground">
                                    Planned End Date
                                </Label>
                                <Input
                                    id={`task-detail-${task.id}-due`}
                                    type="date"
                                    value={plannedEndDate}
                                    onChange={(e) => setPlannedEndDate(e.target.value)}
                                    className="h-8 text-xs bg-background"
                                />
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

                            {/* Task Code chiếm hai cột: mô tả của mã dài hơn hẳn ba ô trên,
                                và cắt nó đi thì cái chip mã trở thành một chuỗi vô nghĩa. */}
                            <div className="rounded-lg border bg-muted/20 p-3 space-y-1 sm:col-span-2">
                                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                                    <Hash className="h-3.5 w-3.5 text-muted-foreground" /> Task Code
                                </div>
                                {task.taskCode ? (
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-1.5">
                                            <TaskCodeChip code={task.taskCode} />
                                            {task.taskCodeGroup && (
                                                <span className="font-mono text-[10.5px] text-muted-foreground">
                                                    {task.taskCodeGroup}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[11px] leading-snug text-muted-foreground">
                                            {taskCodeTextOf(task.taskCode) ?? 'Not in the task catalogue.'}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-xs font-semibold">
                                        <Blank label="Not coded" />
                                    </div>
                                )}
                            </div>

                            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
                                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                                    <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" /> Planned End Date
                                </div>
                                <div className="text-xs font-semibold text-foreground">
                                    {formatDate(task.plannedEndDate) || <Blank label="No date committed" />}
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

/**
 * Cột của bảng nhiệm vụ, kèm bề rộng tối thiểu.
 *
 * ── Vì sao phải ghim bề rộng ──
 * Bảng là `w-full` và sáu cột còn lại đều `whitespace-nowrap`, nên trình duyệt
 * lấy đủ chỗ cho chúng trước rồi mới dồn phần thừa cho cột Task — cột DUY NHẤT
 * được phép xuống dòng. Với sáu cột thì phần thừa còn đủ; thêm cột Code vào là
 * Task co xuống còn vài chục pixel và câu hành động rơi mỗi dòng một chữ.
 *
 * Ghim sàn cho Task rồi để `overflow-x-auto` ngoài bảng lo phần tràn: cuộn ngang
 * là thứ người dùng hiểu được, còn một cột dựng đứng thì không.
 */
const HEADERS: Array<{ label: string; className?: string }> = [
    { label: 'Task', className: 'min-w-[240px]' },
    { label: 'Code' },
    { label: 'Assignee' },
    { label: 'Duration' },
    { label: 'Status' },
    { label: 'Evidence' },
    { label: '' },
];

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
    const [newTaskCode, setNewTaskCode] = useState('');
    const [newPlannedEndDate, setNewPlannedEndDate] = useState('');

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
        // Không ép người dùng bấm nút gợi ý: bỏ trống ô mã thì suy từ tên, hệt như
        // `taskFromAction` làm với một đề xuất được Accept. Việc gõ tay và việc
        // nhận từ AI phải ra cùng một kết quả, không thì thống kê theo mã sẽ nói
        // rằng việc do người tự thêm "ít khi có mã" — một kết luận về form nhập
        // liệu bị đọc nhầm thành một kết luận về nhà máy.
        const code = newTaskCode.trim().toUpperCase() || classifyTaskCode(name)?.taskCode || '';
        persist([...tasks, {
            id: `task-manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            name,
            description: newDescription.trim(),
            assignee: newAssignee.trim(),
            durationDays: Math.max(0, Number(newDurationDays) || 0),
            status: newStatus || TASK_STATUSES[0],
            origin: 'User added',
            attachments: [],
            taskCode: code,
            taskCodeGroup: taskCodeGroupOf(code) ?? '',
            plannedEndDate: newPlannedEndDate,
        }]);
        setNewTaskName('');
        setNewDescription('');
        setNewAssignee('');
        setNewDurationDays('');
        setNewStatus(TASK_STATUSES[0]);
        setNewTaskCode('');
        setNewPlannedEndDate('');
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
                            {HEADERS.map(({ label, className }, index) => (
                                <th
                                    key={index}
                                    className={cn(
                                        'border-b px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
                                        className,
                                    )}
                                >
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {tasks.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-2.5 py-5 text-center text-[13.5px] font-normal text-muted-foreground">
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
                                    <td className="border-b px-2.5 py-2 align-middle whitespace-nowrap text-[13.5px] font-normal">
                                        <TaskCodeChip code={task.taskCode} />
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
                    {/* Quality Task coding — SAP catalog type 2 */}
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                        <TaskCodeField
                            code={newTaskCode}
                            onCodeChange={setNewTaskCode}
                            suggestedFrom={newTaskName}
                            idPrefix="new-task"
                        />
                        <div className="space-y-1.5">
                            <Label htmlFor="new-task-due" className="text-xs font-medium text-muted-foreground">
                                Planned End Date
                            </Label>
                            <Input
                                id="new-task-due"
                                type="date"
                                value={newPlannedEndDate}
                                onChange={(e) => setNewPlannedEndDate(e.target.value)}
                                className="h-8 text-xs bg-background"
                            />
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



