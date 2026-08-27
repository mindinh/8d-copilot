import { useState } from 'react';
import {
    Button,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    cn,
} from '@cnma/react-ui';
import { Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { saveDisciplineField } from '@/services/eightd-service';
import { TaskTable } from './action-table';
import {
    actionLabel,
    assignedFieldFor,
    isAccepted,
    mergeTasks,
    normalizeTasks,
    taskFromAction,
    type ActionTask,
} from '../../../../../shared/action-task';

/**
 * Widget cua D3 va D4, dung lai dung hinh thuc cua ban mockup flagship.
 *
 * -- Vi sao khong dung `table` cho may thu nay --
 * Ba khoi duoi day tung duoc ve bang widget `table`. Bang lam moi dong nhu nhau,
 * ma o D3 va D4 thi cac dong KHONG nhu nhau: mot buoc trong chuoi 5-Why la ket
 * luan goc, nam nhanh Ishikawa la nhanh da bi loai. Bang xoa mat dung phan thong
 * tin ma ky su can doc dau tien, va do la ly do trang cu doc nhu mot tai lieu
 * thay vi mot ket qua phan tich.
 */

/* ─────────────────────────────────────────────────────────────────────────────
   D4 — Chuoi 5-Why
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Mot buoc 5-Why.
 *
 * Chap nhan nhieu ten khoa vi du lieu den tu hai duong: schema output cua D4 dung
 * `{step, why, answer, evidence}`, con CaseContext va Golden Dataset dung
 * `{stepNo, question, answer, evidenceCitation}`. Chi doc mot bo ten thi nua so
 * report se hien ra o rong ma khong bao gi.
 */
interface WhyStep {
    stepNo?: number | string;
    step?: number | string;
    question?: string;
    why?: string;
    answer?: string;
    evidence?: string;
    evidenceCitation?: string;
    isRootCause?: boolean;
}

function stepNumber(row: WhyStep, index: number): string {
    const raw = row.stepNo ?? row.step;
    return raw === undefined || raw === null || raw === '' ? String(index + 1) : String(raw);
}

/**
 * Buoc nao la ket luan goc.
 *
 * Uu tien co `isRootCause` neu du lieu co. Khong co thi coi buoc CUOI la goc —
 * dung quy uoc cua ban mockup. Doan mo ta cung chap nhan chu "(root cause)" viet
 * thang trong cau hoi, vi Golden Dataset danh dau kieu do.
 */
function isRootStep(row: WhyStep, index: number, total: number): boolean {
    if (typeof row.isRootCause === 'boolean') return row.isRootCause;
    if (/\(root cause\)/i.test(String(row.question ?? row.why ?? ''))) return true;
    return index === total - 1;
}

export function WhyChainWidget({ value, disciplineID, fieldKey }: {
    value: unknown;
    disciplineID?: string;
    fieldKey?: string;
}) {
    const initialRows: WhyStep[] = Array.isArray(value) ? (value as WhyStep[]) : [];
    const [steps, setSteps] = useState<WhyStep[]>(initialRows);
    const [isAdding, setIsAdding] = useState(false);
    const [newQuestion, setNewQuestion] = useState('');
    const [newAnswer, setNewAnswer] = useState('');

    const initialRootIndex = steps.findIndex((row, idx) => isRootStep(row, idx, steps.length));
    const [selectedRootIndex, setSelectedRootIndex] = useState<number | null>(
        initialRootIndex >= 0 ? initialRootIndex : (steps.length ? steps.length - 1 : null),
    );

    const handleAddStep = () => {
        if (!newQuestion.trim()) return;
        const newStep: WhyStep = {
            stepNo: steps.length + 1,
            question: newQuestion.trim(),
            answer: newAnswer.trim() || 'Pending verification',
        };
        const nextSteps = [...steps, newStep];
        setSteps(nextSteps);
        setNewQuestion('');
        setNewAnswer('');
        setIsAdding(false);

        if (disciplineID) {
            saveDisciplineField(disciplineID, fieldKey || 'whyChain', nextSteps)
                .then(() => toast.success('Why-step saved to server.'))
                .catch((err) => toast.error(`Failed to save step: ${err.message}`));
        }
    };

    return (
        <div className="space-y-3">
            {steps.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">
                    No 5-Why chain recorded for this case yet.
                </p>
            ) : (
                <div className="space-y-2.5">
                    {steps.map((row, index) => {
                        const isRoot = selectedRootIndex === index;
                        return (
                            <div
                                key={index}
                                className={cn(
                                    'group relative flex min-w-0 items-start justify-between gap-3 rounded-lg border p-3.5 transition-colors',
                                    isRoot
                                        ? 'border-destructive/40 bg-destructive/[0.03] shadow-xs'
                                        : 'border-border bg-card hover:border-border/80',
                                )}
                            >
                                <div className="flex gap-3 min-w-0 flex-1">
                                    <span
                                        className={cn(
                                            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors',
                                            isRoot
                                                ? 'bg-destructive text-destructive-foreground ring-2 ring-destructive/20'
                                                : 'bg-muted text-muted-foreground group-hover:bg-foreground group-hover:text-background',
                                        )}
                                    >
                                        {stepNumber(row, index)}
                                    </span>
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="break-words text-sm font-semibold text-foreground">
                                                {row.question ?? row.why ?? '—'}
                                            </p>
                                            {isRoot && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive border border-destructive/20">
                                                    <Star className="h-3 w-3 fill-current" />
                                                    Root cause
                                                </span>
                                            )}
                                        </div>
                                        <p className="break-words text-[13px] text-muted-foreground leading-relaxed">
                                            {row.answer ?? '—'}
                                        </p>
                                    </div>
                                </div>

                                {!isRoot && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedRootIndex(index)}
                                        className="shrink-0 text-[11px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 transition-all hover:text-destructive hover:bg-destructive/10 rounded-md px-2.5 py-1 border border-transparent hover:border-destructive/20 cursor-pointer flex items-center gap-1.5"
                                        title="Mark this step as root cause"
                                    >
                                        <Star className="h-3 w-3" />
                                        Set root cause
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {isAdding ? (
                <div className="rounded-lg border bg-muted/20 p-3.5 space-y-3">
                    <p className="text-xs font-semibold text-foreground">Add 5-Why Step</p>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">
                            Question <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            type="text"
                            placeholder="Why did this happen? (e.g. Why did the clamp slip?)"
                            value={newQuestion}
                            onChange={(e) => setNewQuestion(e.target.value)}
                            className="h-8 text-xs bg-background"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">
                            Answer / Finding
                        </Label>
                        <Input
                            type="text"
                            placeholder="Enter finding or verification result..."
                            value={newAnswer}
                            onChange={(e) => setNewAnswer(e.target.value)}
                            className="h-8 text-xs bg-background"
                        />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                        <Button size="sm" onClick={handleAddStep} disabled={!newQuestion.trim()}>
                            Add step
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)}>
                            Cancel
                        </Button>
                    </div>
                </div>
            ) : (
                <Button size="sm" variant="outline" onClick={() => setIsAdding(true)} className="text-xs">
                    + Add why-step
                </Button>
            )}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────────
   D4 — Luoi Ishikawa 6M
   ───────────────────────────────────────────────────────────────────────── */

/** Thu tu 6M co dinh — doc theo hang quen thuoc, khong theo thu tu du lieu tra ve. */
const SIX_M = ['Man', 'Machine', 'Method', 'Material', 'Measurement', 'Environment'] as const;

interface CauseRow {
    category?: string;
    description?: string;
    finding?: string;
    metricValue?: string;
    metric?: string;
    isRootCause?: boolean | string;
    source?: string;
}

function truthy(value: unknown): boolean {
    return value === true || String(value ?? '').trim().toUpperCase() === 'Y';
}

/**
 * Sau nhanh Ishikawa, nhanh duoc chon to do.
 *
 * Ban ghi cua SAP (`caseContext.ishikawa`) LUON thang: no la danh gia da chot,
 * khong phai ket luan AI viet ra. Bat AI chep lai mot ban ghi da co chi tao
 * them mot ban sao co the lech voi ban goc.
 *
 * Nhung rat nhieu case den day voi `ishikawa: []` — khong he co danh gia 6M nao.
 * Truoc day luoi khi do trong vinh vien va nguoi dung khong co gi de lam. Nen
 * khi va CHI KHI khong co ban ghi nao, luoi doc de xuat cua AI tu
 * `data.rootCause.ishikawaBoard`, va noi ro do la de xuat. Dung dung mot khuon
 * voi D1 (de xuat doi ngu tu tien le) va D3 (de xuat hanh dong chan tam).
 *
 * Nhanh KHONG co du lieu van ve o, ghi "Not assessed" — sau o luon day du thi
 * nguoi doc thay ngay dieu tra con thung cho nao. An o trong di la giau mat.
 */
export function IshikawaGridWidget({ context, proposed, disciplineID }: { context: unknown; proposed?: unknown; disciplineID?: string }) {
    const root = context && typeof context === 'object' ? (context as Record<string, unknown>) : null;
    const recorded: CauseRow[] = Array.isArray(root?.ishikawa) ? (root.ishikawa as CauseRow[]) : [];
    const suggested: CauseRow[] = Array.isArray(proposed)
        ? (proposed as CauseRow[]).filter((r) => String(r?.finding ?? r?.description ?? '').trim())
        : [];

    const usingProposal = recorded.length === 0 && suggested.length > 0;
    const rows: CauseRow[] = recorded.length ? recorded : suggested;

    const byCategory = new Map(
        rows.map((r) => [String(r.category ?? '').trim().toLowerCase(), r]),
    );

    const initialRoot = SIX_M.find((cat) => {
        const row = byCategory.get(cat.toLowerCase());
        return row ? truthy(row.isRootCause) : false;
    });

    const [selectedRootCategory, setSelectedRootCategory] = useState<string | null>(initialRoot ?? null);
    const [customFindings, setCustomFindings] = useState<Record<string, string>>({});
    const [editingCategory, setEditingCategory] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const startEditing = (cat: string, currentText: string) => {
        setEditingCategory(cat);
        setEditValue(currentText === 'Not assessed' ? '' : currentText);
    };

    const saveEditing = (cat: string) => {
        if (editValue.trim()) {
            const nextFindings = { ...customFindings, [cat]: editValue.trim() };
            setCustomFindings(nextFindings);
            if (disciplineID) {
                saveDisciplineField(disciplineID, 'ishikawaCustomFindings', nextFindings)
                    .then(() => toast.success(`Saved finding for ${cat}`))
                    .catch((err) => toast.error(`Failed to save: ${err.message}`));
            }
        }
        setEditingCategory(null);
    };

    const handleSelectRoot = (cat: string) => {
        setSelectedRootCategory(cat);
        if (disciplineID) {
            saveDisciplineField(disciplineID, 'selectedRootCategory', cat)
                .then(() => toast.success(`Marked ${cat} as root cause`))
                .catch((err) => toast.error(`Failed to save: ${err.message}`));
        }
    };

    return (
        <div className="space-y-2">
            {usingProposal && (
                <p className="rounded-md border border-warning/40 bg-warning/[0.07] px-2.5 py-1.5 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-warning-foreground">Proposed by AI.</span>{' '}
                    This case has no recorded 6M assessment in SAP. The findings below are
                    the AI reading the evidence, not a confirmed assessment — review each
                    one before relying on it.
                </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SIX_M.map((category) => {
                const row = byCategory.get(category.toLowerCase());
                const isRoot = selectedRootCategory
                    ? selectedRootCategory.toLowerCase() === category.toLowerCase()
                    : (row ? truthy(row.isRootCause) : false);
                const originalText = row?.description ?? row?.finding ?? '';
                const text = customFindings[category] ?? originalText;
                const metric = row?.metricValue ?? row?.metric;
                const isEditingThis = editingCategory === category;

                return (
                    <div
                        key={category}
                        className={cn(
                            'min-w-0 rounded-lg border p-3 flex flex-col justify-between',
                            isRoot ? 'border-destructive bg-destructive/[0.05]' : 'border-border bg-card',
                        )}
                    >
                        <div>
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold">{category}</h4>
                                {!isEditingThis && (
                                    <button
                                        type="button"
                                        onClick={() => startEditing(category, text || 'Not assessed')}
                                        className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
                                    >
                                        Edit
                                    </button>
                                )}
                            </div>

                            {isEditingThis ? (
                                <div className="mt-1.5 space-y-1.5">
                                    <input
                                        type="text"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        placeholder="Enter finding for this category..."
                                        className="w-full rounded border px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                        autoFocus
                                    />
                                    <div className="flex items-center gap-1.5">
                                        <Button size="sm" className="h-6 text-[11px] px-2 py-0" onClick={() => saveEditing(category)}>
                                            Save
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 py-0" onClick={() => setEditingCategory(null)}>
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <p className={cn(
                                    'mt-1 break-words text-[12.5px]',
                                    text ? 'text-foreground' : 'italic text-muted-foreground',
                                )}>
                                    {text || 'Not assessed'}
                                </p>
                            )}

                            {metric && !isEditingThis && (
                                <span className="mt-2 inline-block rounded-full border bg-muted px-2 py-0.5 text-[11px]">
                                    {metric}
                                </span>
                            )}
                        </div>

                        <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between">
                            {isRoot ? (
                                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-destructive">
                                    <Star className="h-3 w-3 fill-current" />
                                    Root cause
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => handleSelectRoot(category)}
                                    className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                                >
                                    Set as root cause
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────────
   D3 — The action
   ───────────────────────────────────────────────────────────────────────── */

interface ActionRow {
    action?: string;
    actionText?: string;
    owner?: string;
    status?: string;
    protection?: string;
    origin?: string;
}

function cleanActionText(rawText?: string): string {
    let text = String(rawText ?? '').trim();
    if (!text) return '—';
    text = text.replace(/^(Proposed|Recorded)\s+containment\s+action(\s+based\s+on\s+precedent\s+[A-Z0-9-]+)?:?\s*/i, '');
    text = text.replace(/^(Proposed|Recorded)\s+action:?\s*/i, '');
    text = text.replace(/^(Precedent\s+proposed\s+action|Precedent\s+action):?\s*/i, '');
    return text.trim() || '—';
}

export function ActionCardsWidget({ value, emptyLabel = 'No action logged yet.', disciplineID, fieldKey, acceptedValue }: {
    value: unknown;
    emptyLabel?: string;
    disciplineID?: string;
    fieldKey?: string;
    /** Task đã nhận, đọc từ `<prefix>.assignedActions` của chính discipline này. */
    acceptedValue?: unknown;
}) {
    const initialRows: ActionRow[] = Array.isArray(value) ? (value as ActionRow[]) : [];
    const [actions, setActions] = useState<ActionRow[]>(initialRows);
    const [isAdding, setIsAdding] = useState(false);
    const [newActionText, setNewActionText] = useState('');
    const [newOwner, setNewOwner] = useState('');
    const [newStatus, setNewStatus] = useState('In Process');

    // Bảng task là bản ghi RIÊNG, không phải danh sách đề xuất tô màu khác. Giữ
    // bản sao ở đây để nút đổi ngay sang "Added" mà không phải chờ poll một vòng.
    const [tasks, setTasks] = useState<ActionTask[]>(() => normalizeTasks(acceptedValue));
    const assignedField = assignedFieldFor(fieldKey || 'containment.actions');

    const accept = (rows: ActionRow[]) => {
        const incoming = rows
            .filter((row) => actionLabel(row))
            .map((row, i) => taskFromAction(row, `${Date.now().toString(36)}-${i}`));
        const next = mergeTasks(tasks, incoming);
        if (next === tasks) {
            toast.info('Already in the task list.');
            return;
        }
        persistTasks(next, incoming.length > 1 ? `${next.length - tasks.length} tasks added.` : 'Task added.');
    };

    const removeAction = (index: number) => {
        const nextActions = actions.filter((_, i) => i !== index);
        setActions(nextActions);
        if (disciplineID) {
            saveDisciplineField(disciplineID, fieldKey || 'containment.actions', nextActions)
                .then(() => toast.success('Action removed.'))
                .catch((err) => toast.error(`Failed to save action: ${err.message}`));
        }
    };

    const persistTasks = (next: ActionTask[], message = 'Task list saved.') => {
        setTasks(next);
        if (!disciplineID) return;
        saveDisciplineField(disciplineID, assignedField, next)
            .then(() => toast.success(message))
            .catch((err) => toast.error(`Could not save: ${err.message}`));
    };

    const pending = actions.filter((row) => actionLabel(row) && !isAccepted(row, tasks));

    const handleAddAction = () => {
        if (!newActionText.trim()) return;
        const newRow: ActionRow = {
            action: newActionText.trim(),
            owner: newOwner.trim() || 'Quality Engineer',
            status: newStatus,
            origin: 'User Added',
        };
        const nextActions = [...actions, newRow];
        setActions(nextActions);
        setNewActionText('');
        setNewOwner('');
        setIsAdding(false);

        if (disciplineID) {
            saveDisciplineField(disciplineID, fieldKey || 'containment.actions', nextActions)
                .then(() => toast.success('Action saved to server.'))
                .catch((err) => toast.error(`Failed to save action: ${err.message}`));
        }
    };

    return (
        <div className="space-y-3">
            {actions.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">{emptyLabel}</p>
            ) : (
                <div className="space-y-2.5">
                    {actions.map((row, index) => {
                        const rawText = row.action ?? row.actionText ?? '';
                        const text = cleanActionText(rawText);
                        return (
                            <div
                                key={index}
                                className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3"
                            >
                                <p className="break-words text-[13px] font-medium">{text}</p>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {isAccepted(row, tasks) ? (
                                        <span className="whitespace-nowrap text-[11px] font-medium text-success">
                                            ✓ Added
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => accept([row])}
                                            className="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
                                        >
                                            + Add
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => removeAction(index)}
                                        aria-label={`Remove action ${index + 1}`}
                                        className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                        title="Remove action"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                {pending.length > 1 && (
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() => accept(pending)}
                    >
                        ✓ Accept all suggested ({pending.length})
                    </Button>
                )}
                {!isAdding && (
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() => setIsAdding(true)}
                    >
                        <Plus className="mr-1 h-3 w-3" /> Add action
                    </Button>
                )}
            </div>

            {isAdding && (
                <div className="rounded-lg border bg-muted/20 p-3.5 space-y-3">
                    <p className="text-xs font-semibold text-foreground">Add Action</p>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">
                            Action Description <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            type="text"
                            placeholder="e.g. Sort batch 2605 and quarantine non-conforming parts..."
                            value={newActionText}
                            onChange={(e) => setNewActionText(e.target.value)}
                            className="h-8 text-xs bg-background"
                        />
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                                Assignee
                            </Label>
                            <Input
                                type="text"
                                placeholder="e.g. Quality Engineer"
                                value={newOwner}
                                onChange={(e) => setNewOwner(e.target.value)}
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
                                    <SelectItem value="Planned">Planned</SelectItem>
                                    <SelectItem value="In Process">In Process</SelectItem>
                                    <SelectItem value="Done">Done</SelectItem>
                                    <SelectItem value="Verified">Verified</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                        <Button size="sm" onClick={handleAddAction} disabled={!newActionText.trim()}>
                            Add action
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)}>
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            <TaskTable tasks={tasks} onChange={persistTasks} />
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Khoi ban nhap cua AI
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Ket luan do AI soan, danh dau ro la BAN NHAP.
 *
 * -- Vi sao khong dung `callout` -
 * `callout` la mot khoi thong tin trung tinh: no noi "day la thong tin quan
 * trong". Cai can noi o day khac han - "day la MAY viet, chua ai duyet". Nhan
 * "AI DRAFT" nam de len vien khoi lam dieu do trong mot cai liec, va no la quy
 * uoc xuyen suot ban mockup.
 *
 * Mau canh bao nhat chu khong phai mau thanh cong: ban nhap chua duoc duyet thi
 * khong duoc trong nhu mot ket luan da chot.
 */
export function AiDraftWidget({ value }: { value: unknown }) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) {
        return (
            <p className="text-sm italic text-muted-foreground">
                The AI produced no conclusion for this step.
            </p>
        );
    }

    return (
        <div className="relative mt-2 rounded-lg border border-destructive/25 bg-destructive/[0.04] px-4 py-4">
            <span className="absolute -top-2.5 left-3.5 rounded-full bg-destructive px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive-foreground">
                AI draft
            </span>
            <p className="break-words text-[13px] leading-relaxed">{text}</p>
        </div>
    );
}
