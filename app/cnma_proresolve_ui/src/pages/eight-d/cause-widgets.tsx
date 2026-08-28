import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    Textarea,
    cn,
} from '@cnma/react-ui';
import { AlertTriangle, Edit3, Loader2, RefreshCw, Sparkles, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { reanalyzeDownstream, saveDisciplineField } from '@/services/eightd-service';
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
 * Các widget cho D4 (Root Cause) và các bước hành động (D3, D5, D6, D7).
 *
 * Triết lý widget độc lập: mỗi khối trên Form Editor là một field độc lập,
 * không widget nào phụ thuộc vào tên bước D hay số bước cố định.
 */

// ── 5-Why Chain ─────────────────────────────────────────────────────────────

interface WhyStep {
    stepNo?: number;
    step?: number;
    why?: string;
    question?: string;
    answer?: string;
    isRootCause?: boolean;
    isRoot?: boolean;
}

function truthy(val: unknown): boolean {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return /^(true|yes|1|x)$/i.test(val.trim());
    return false;
}

function stepNumber(row: WhyStep, index: number): number {
    return Number(row.stepNo ?? row.step ?? index + 1);
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
    if (typeof row.isRoot === 'boolean') return row.isRoot;
    if (/\(root cause\)/i.test(String(row.question ?? row.why ?? ''))) return true;
    return index === total - 1;
}

export function WhyChainWidget({ value, disciplineID, fieldKey, readOnly = false }: {
    value: unknown;
    disciplineID?: string;
    fieldKey?: string;
    readOnly?: boolean;
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

    useEffect(() => {
        const rows: WhyStep[] = Array.isArray(value) ? (value as WhyStep[]) : [];
        setSteps(rows);
        const rootIdx = rows.findIndex((row, idx) => isRootStep(row, idx, rows.length));
        setSelectedRootIndex(rootIdx >= 0 ? rootIdx : (rows.length ? rows.length - 1 : null));
    }, [value]);

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

    const handleSetRoot = (index: number) => {
        setSelectedRootIndex(index);
        const nextSteps = steps.map((s, i) => ({ ...s, isRootCause: i === index }));
        setSteps(nextSteps);
        if (disciplineID) {
            saveDisciplineField(disciplineID, fieldKey || 'whyChain', nextSteps)
                .then(() => toast.success('Root cause step updated.'))
                .catch((err) => toast.error(`Failed to save: ${err.message}`));
        }
    };

    const handleRemoveStep = (index: number) => {
        const nextSteps = steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, stepNo: i + 1 }));
        setSteps(nextSteps);
        if (disciplineID) {
            saveDisciplineField(disciplineID, fieldKey || 'whyChain', nextSteps)
                .then(() => toast.success('Step removed.'))
                .catch((err) => toast.error(`Failed to save: ${err.message}`));
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

                                {!readOnly && (
                                    <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                                        {!isRoot && (
                                            <button
                                                type="button"
                                                onClick={() => handleSetRoot(index)}
                                                className="text-[11px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md px-2.5 py-1 border border-transparent hover:border-destructive/20 cursor-pointer flex items-center gap-1.5"
                                                title="Mark this step as root cause"
                                            >
                                                <Star className="h-3 w-3" />
                                                Set root cause
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveStep(index)}
                                            className="text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md p-1 border border-transparent hover:border-destructive/20 cursor-pointer"
                                            title="Delete step"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {!readOnly && (
                isAdding ? (
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
                )
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

/**
 * Sáu nhánh Ishikawa, nhánh được chọn tô đỏ.
 */
export function IshikawaGridWidget({
    context,
    proposed,
    disciplineID,
    savedFindings,
    savedRootCategory,
    readOnly = false,
}: {
    context: unknown;
    proposed?: unknown;
    disciplineID?: string;
    savedFindings?: unknown;
    savedRootCategory?: unknown;
    readOnly?: boolean;
}) {
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

    const parsedSavedFindings = (savedFindings && typeof savedFindings === 'object' && !Array.isArray(savedFindings))
        ? (savedFindings as Record<string, string>)
        : {};
    const parsedSavedRoot = typeof savedRootCategory === 'string' && savedRootCategory.trim()
        ? savedRootCategory.trim()
        : null;

    const [selectedRootCategory, setSelectedRootCategory] = useState<string | null>(parsedSavedRoot ?? initialRoot ?? null);
    const [customFindings, setCustomFindings] = useState<Record<string, string>>(parsedSavedFindings);
    const [editingCategory, setEditingCategory] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    useEffect(() => {
        if (savedFindings && typeof savedFindings === 'object' && !Array.isArray(savedFindings)) {
            setCustomFindings(savedFindings as Record<string, string>);
        }
        if (typeof savedRootCategory === 'string' && savedRootCategory.trim()) {
            setSelectedRootCategory(savedRootCategory.trim());
        }
    }, [savedFindings, savedRootCategory]);

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
                                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground/90">{category}</h4>
                                {!isEditingThis && !readOnly && (
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
                                <div className="mt-2 space-y-2">
                                    <Textarea
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        placeholder="Enter finding for this 6M category..."
                                        className="w-full min-h-[90px] text-[13px] bg-background p-2.5 rounded-md border leading-relaxed resize-y focus-visible:ring-1 focus-visible:ring-primary"
                                        autoFocus
                                    />
                                    <div className="flex items-center justify-end gap-1.5 pt-0.5">
                                        <Button size="sm" className="h-6 text-[11px] px-2.5 font-medium" onClick={() => saveEditing(category)}>
                                            Save
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 font-medium" onClick={() => setEditingCategory(null)}>
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <p className={cn(
                                    'mt-1.5 break-words text-[13px] leading-relaxed',
                                    text ? 'text-foreground font-normal' : 'italic text-muted-foreground',
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
                            ) : !readOnly ? (
                                <button
                                    type="button"
                                    onClick={() => handleSelectRoot(category)}
                                    className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                                >
                                    Set as root cause
                                </button>
                            ) : (
                                <span className="text-[11px] text-muted-foreground italic">Non-root factor</span>
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

export interface ActionRow {
    action?: string;
    actionText?: string;
    owner?: string;
    assignee?: string;
    status?: string;
    origin?: string;
}

function cleanActionText(rawText: string | undefined): string {
    let text = String(rawText ?? '').trim();
    if (!text) return '—';
    text = text.replace(/^(Proposed|Recorded)\s+containment\s+action(\s+based\s+on\s+precedent\s+[A-Z0-9-]+)?:?\s*/i, '');
    text = text.replace(/^(Proposed|Recorded)\s+action:?\s*/i, '');
    text = text.replace(/^(Precedent\s+proposed\s+action|Precedent\s+action):?\s*/i, '');
    return text.trim() || '—';
}

export function ActionCardsWidget({
    value,
    emptyLabel = 'No action logged yet.',
    disciplineID,
    fieldKey,
    acceptedValue,
    readOnly = false,
    reportID = '',
    disciplineCode = '',
}: {
    value: unknown;
    emptyLabel?: string;
    disciplineID?: string;
    fieldKey?: string;
    /** Task đã nhận, đọc từ `<prefix>.assignedActions` của chính discipline này. */
    acceptedValue?: unknown;
    readOnly?: boolean;
    reportID?: string;
    disciplineCode?: string;
}) {
    const initialRows: ActionRow[] = Array.isArray(value) ? (value as ActionRow[]) : [];
    const [actions, setActions] = useState<ActionRow[]>(initialRows);

    // Bảng task là bản ghi RIÊNG, không phải danh sách đề xuất tô màu khác. Giữ
    // bản sao ở đây để nút đổi ngay sang "Added" mà không phải chờ poll một vòng.
    const [tasks, setTasks] = useState<ActionTask[]>(() => normalizeTasks(acceptedValue));
    const assignedField = assignedFieldFor(fieldKey || 'containment.actions');

    useEffect(() => {
        const initialRows: ActionRow[] = Array.isArray(value) ? (value as ActionRow[]) : [];
        setActions(initialRows);
    }, [value]);

    useEffect(() => {
        setTasks(normalizeTasks(acceptedValue));
    }, [acceptedValue]);

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

    const persistTasks = (next: ActionTask[], message = 'Task list saved.') => {
        setTasks(next);
        if (!disciplineID) return;
        saveDisciplineField(disciplineID, assignedField, next)
            .then(() => toast.success(message))
            .catch((err) => toast.error(`Could not save: ${err.message}`));
    };

    const pending = actions.filter((row) => actionLabel(row) && !isAccepted(row, tasks));

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
                                    ) : !readOnly ? (
                                        <button
                                            type="button"
                                            onClick={() => accept([row])}
                                            className="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
                                        >
                                            + Add
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {!readOnly && pending.length > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() => accept(pending)}
                    >
                        ✓ Accept all suggested ({pending.length})
                    </Button>
                </div>
            )}

            <TaskTable
                tasks={tasks}
                onChange={persistTasks}
                readOnly={readOnly}
                reportID={reportID}
                disciplineCode={disciplineCode}
            />
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Khoi ban nhap cua AI
   ───────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────────────
   Khối kết luận Root Cause (AI Draft + Chỉnh sửa & Chạy lại các bước sau)
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Kết luận Root Cause do AI soạn hoặc kỹ sư chỉnh sửa.
 * Cho phép chỉnh sửa nội dung kết luận và cảnh báo xác nhận chạy lại các bước downstream (D5..D8).
 */
export function AiDraftWidget({
    value,
    disciplineID,
    readOnly = false,
    reportID = '',
    fieldKey = 'rootCause.statement',
}: {
    value: unknown;
    disciplineID?: string;
    readOnly?: boolean;
    reportID?: string;
    fieldKey?: string;
}) {
    const queryClient = useQueryClient();
    const params = useParams<{ id?: string }>();
    const effectiveReportID = reportID || params.id || '';
    const text = typeof value === 'string' ? value.trim() : '';
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(text);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!editing) {
            setDraft(text);
        }
    }, [text, editing]);

    const handleStartEdit = () => {
        setDraft(text);
        setEditing(true);
    };

    const handleCancel = () => {
        setDraft(text);
        setEditing(false);
    };

    const handleRequestSave = () => {
        if (draft.trim() === text) {
            setEditing(false);
            return;
        }
        setConfirmOpen(true);
    };

    const handleSaveAndReanalyze = async (reanalyze: boolean) => {
        if (!disciplineID) return;
        setSaving(true);
        try {
            const nextValue = draft.trim();
            await saveDisciplineField(disciplineID, fieldKey || 'rootCause.statement', nextValue);
            toast.success('Đã lưu kết luận nguyên nhân gốc.');
            setConfirmOpen(false);
            setEditing(false);

            if (reanalyze && effectiveReportID) {
                toast.info('Bắt đầu phân tích lại các bước sau D4 (D5, D6, D7, D8)...');
                await reanalyzeDownstream(effectiveReportID, 'D5');
                toast.success('Đã xếp lịch phân tích lại các bước D5-D8.');
            }

            await queryClient.invalidateQueries({ queryKey: ['8d'] });
        } catch (e: any) {
            toast.error(e?.response?.data?.error?.message || e.message || 'Lỗi khi lưu nguyên nhân gốc.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="relative mt-2 rounded-xl border border-primary/25 bg-primary/[0.03] p-4 shadow-xs transition-all">
            <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-primary/15">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Sparkles className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wide text-foreground">
                        {disciplineID ? 'Root Cause Conclusion (D4)' : 'AI Draft'}
                    </span>
                </div>
                {!readOnly && disciplineID && !editing && (
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                        onClick={handleStartEdit}
                    >
                        <Edit3 className="h-3.5 w-3.5" />
                        Chỉnh sửa
                    </Button>
                )}
            </div>

            {editing ? (
                <div className="space-y-3 pt-1">
                    <Textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={3}
                        placeholder="Nhập kết luận nguyên nhân gốc (ngắn gọn, đúng trọng tâm)..."
                        className="text-[13px] leading-relaxed resize-y bg-background font-normal"
                        autoFocus
                    />
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">
                            {draft.length} ký tự
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={handleCancel}
                                disabled={saving}
                            >
                                Hủy
                            </Button>
                            <Button
                                size="sm"
                                variant="default"
                                className="h-7 text-xs gap-1.5"
                                onClick={handleRequestSave}
                                disabled={saving || !draft.trim()}
                            >
                                Lưu thay đổi
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="min-w-0">
                    {text ? (
                        <p className="break-words text-[13px] leading-relaxed text-foreground font-medium">
                            {text}
                        </p>
                    ) : (
                        <p className="text-sm italic text-muted-foreground">
                            The AI produced no conclusion for this step.
                        </p>
                    )}
                </div>
            )}

            {/* Warning Confirmation Modal */}
            <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open && !saving) setConfirmOpen(false); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <div className="flex items-center gap-2 text-warning mb-1">
                            <AlertTriangle className="h-5 w-5 shrink-0" />
                            <DialogTitle className="text-base font-bold text-foreground">
                                Xác nhận thay đổi Root Cause
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
                            Thay đổi nguyên nhân gốc (Root Cause) ở bước D4 sẽ tác động trực tiếp đến các bước hành động và phòng ngừa tiếp theo:
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs">
                        <div className="font-semibold text-warning-foreground flex items-center gap-1.5">
                            <RefreshCw className="h-3.5 w-3.5" />
                            Các bước phụ thuộc sẽ được chạy lại:
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-1">
                            <li><strong className="text-foreground">D5 (Corrective Actions):</strong> Khắc phục theo nguyên nhân mới.</li>
                            <li><strong className="text-foreground">D6 (Verification Plan):</strong> Nghiệm thu và kiểm tra hiệu quả.</li>
                            <li><strong className="text-foreground">D7 (Preventive Actions):</strong> Ngăn ngừa tái phát và cập nhật FMEA.</li>
                            <li><strong className="text-foreground">D8 (Closure & Lessons):</strong> Tổng kết và công nhận nhóm.</li>
                        </ul>
                    </div>

                    <div className="text-xs text-muted-foreground">
                        Hệ thống sẽ lưu nguyên nhân gốc mới và tự động kích hoạt AI phân tích lại từ bước D5 trở đi.
                    </div>

                    <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmOpen(false)}
                            disabled={saving}
                            className="text-xs"
                        >
                            Hủy
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleSaveAndReanalyze(false)}
                            disabled={saving}
                            className="text-xs"
                        >
                            Chỉ lưu D4
                        </Button>
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleSaveAndReanalyze(true)}
                            disabled={saving}
                            className="text-xs gap-1.5 bg-primary font-semibold"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Đang xử lý...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-3.5 w-3.5" />
                                    Lưu & Chạy lại D5-D8
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
