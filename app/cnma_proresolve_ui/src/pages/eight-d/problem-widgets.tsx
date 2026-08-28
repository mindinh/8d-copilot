import { useEffect, useState } from 'react';
import { Button, Textarea, cn } from '@cnma/react-ui';
import {
    Calendar,
    Check,
    CheckCircle2,
    FileText,
    Hash,
    HelpCircle,
    MapPin,
    Sparkles,
    TriangleAlert,
    User,
    Wrench,
    XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { saveDisciplineField } from '@/services/eightd-service';
import { Markdown } from './markdown';

/**
 * Cac widget cua D2 (Describe the problem), dung theo mockup HTML.
 *
 * Moi khoi trong mockup la MOT field doc lap tren Form Editor - keo vao layout
 * group thi hien, keo ra thi mat. Khong widget nao biet ten buoc D nao ca.
 *
 *   problem.complaintReference -> <ComplaintReferenceWidget>  (doc CaseContext)
 *   problem.statement          -> <ProblemStatementWidget>    (AI draft + sua tay)
 *   problem.what/where/...     -> <W2hCellWidget>             (mot o cua luoi 5W2H)
 *   problem.is                 -> <IsBoxWidget>               (hop xanh)
 *   problem.isNot              -> <IsNotBoxWidget>            (hop xam)
 */

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown> : null;
}

/** Mang chuoi -> mot doan doc duoc. Mockup hien Is/Is-Not la cau van, khong phai chip. */
function asLines(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String).filter((line) => line.trim());
    if (typeof value === 'string' && value.trim()) return [value];
    return [];
}

// ── Complaint reference ─────────────────────────────────────────────────────

export function ComplaintReferenceWidget({ caseContext }: {
    caseContext: Record<string, unknown> | null;
}) {
    const customer = asRecord(caseContext?.customer);
    // `applicable === false` la case Q3: ba truong kia la chuoi 'N/A - ...' CO
    // CHU DICH chu khong phai thieu du lieu. Hien mot dong "N/A" cho lo noi bo
    // chi lam nhieu man hinh - an han di.
    if (!customer || customer.applicable === false) return null;

    const parts = [
        customer.complaintReference && { label: 'Complaint Ref', val: customer.complaintReference },
        customer.plantContact && { label: 'Plant Contact', val: customer.plantContact },
        customer.slaResponseDue && { label: 'SLA Response Due', val: customer.slaResponseDue },
    ].filter(Boolean) as Array<{ label: string; val: unknown }>;

    if (!parts.length) return null;

    return (
        <div className="rounded-xl border border-info/30 bg-info/[0.03] p-3.5 shadow-xs mb-2">
            <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-info/20 text-xs sm:text-[13px] font-bold text-info">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-info/15 text-info">
                    <FileText className="h-3.5 w-3.5" />
                </span>
                <span>Customer Complaint Reference</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                {parts.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                        <span className="text-muted-foreground font-medium">{p.label}:</span>
                        <span className="font-semibold text-foreground">{String(p.val)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Problem statement (AI draft + sua tay) ──────────────────────────────────

export function ProblemStatementWidget({ statement, override, disciplineID, readOnly = false }: {
    statement: unknown;
    /** Ban ky su tu sua. Co gia tri => hien no thay cho ban AI. */
    override: unknown;
    disciplineID: string;
    readOnly?: boolean;
}) {
    const aiText = String(statement ?? '').trim();
    const savedOverride = String(override ?? '').trim();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(savedOverride || aiText);
    const [current, setCurrent] = useState(savedOverride);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const saved = String(override ?? '').trim();
        setCurrent(saved);
        if (!editing) {
            setDraft(saved || aiText);
        }
    }, [override, aiText, editing]);

    if (!aiText && !current) return null;
    const shown = current || aiText;

    const commit = async (value: string | null) => {
        setSaving(true);
        setError(null);
        try {
            await saveDisciplineField(disciplineID, 'problem.statementOverride', value);
            setCurrent(value ?? '');
            setEditing(false);
            if (value === null) setDraft(aiText);
        } catch (e: unknown) {
            // Giu nguyen o soan khi luu hong: dong o lai la nem mat doan nguoi
            // dung vua go, con loi thi ho khong lam gi duoc nua.
            const detail = (e as { response?: { data?: { error?: { message?: string } } } })
                ?.response?.data?.error?.message;
            setError(detail || (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-w-0 space-y-2">
            <div className="rounded-xl border border-primary/25 bg-primary/[0.03] p-4 shadow-xs">
                <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-primary/15">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Sparkles className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-[14px] font-bold tracking-tight text-foreground">
                            {current ? 'Problem Description (Engineer Override)' : 'AI Drafted Problem Description'}
                        </span>
                    </div>
                    {current && (
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                            Manual Edit
                        </span>
                    )}
                </div>

                {editing && !readOnly ? (
                    <Textarea
                        className="mt-2 min-h-28 bg-background text-[13px] leading-relaxed font-normal"
                        value={draft}
                        disabled={saving}
                        onChange={(event) => setDraft(event.target.value)}
                    />
                ) : (
                    <p className="text-[13px] leading-relaxed text-foreground/90 font-normal">
                        {shown}
                    </p>
                )}

                {!readOnly && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        {editing ? (
                            <>
                                <Button
                                    size="sm"
                                    onClick={() => void commit(draft.trim())}
                                    disabled={saving || !draft.trim() || draft.trim() === shown}
                                    className="h-7 text-xs font-medium"
                                >
                                    {saving ? 'Saving…' : 'Save description'}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => { setEditing(false); setDraft(shown); setError(null); }}
                                    disabled={saving}
                                    className="h-7 text-xs font-medium"
                                >
                                    Cancel
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => { setDraft(shown); setEditing(true); }}
                                    className="h-7 text-xs font-medium bg-background hover:bg-muted"
                                >
                                    Edit description
                                </Button>
                                {current && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => void commit(null)}
                                        disabled={saving}
                                        className="h-7 text-xs text-muted-foreground"
                                    >
                                        Revert to AI draft
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {error && (
                <p className="flex items-start gap-1.5 text-[11px] text-destructive">
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                    Could not save: {error}
                </p>
            )}
        </div>
    );
}

// ── Mot o cua luoi 5W2H ─────────────────────────────────────────────────────

function getW2hMeta(label: string): { icon: any; colorClass: string; bgClass: string; title: string } {
    const l = label.toLowerCase();
    if (l.includes('what')) {
        return { icon: HelpCircle, colorClass: 'text-blue-600 dark:text-blue-400', bgClass: 'bg-blue-500/10', title: 'What' };
    }
    if (l.includes('where')) {
        return { icon: MapPin, colorClass: 'text-emerald-600 dark:text-emerald-400', bgClass: 'bg-emerald-500/10', title: 'Where' };
    }
    if (l.includes('when')) {
        return { icon: Calendar, colorClass: 'text-amber-600 dark:text-amber-400', bgClass: 'bg-amber-500/10', title: 'When' };
    }
    if (l.includes('who')) {
        return { icon: User, colorClass: 'text-purple-600 dark:text-purple-400', bgClass: 'bg-purple-500/10', title: 'Who' };
    }
    if (l.includes('how many') || l.includes('extent')) {
        return { icon: Hash, colorClass: 'text-indigo-600 dark:text-indigo-400', bgClass: 'bg-indigo-500/10', title: 'How Many' };
    }
    if (l.includes('how')) {
        return { icon: Wrench, colorClass: 'text-orange-600 dark:text-orange-400', bgClass: 'bg-orange-500/10', title: 'How' };
    }
    return { icon: FileText, colorClass: 'text-muted-foreground', bgClass: 'bg-muted', title: label.replace(/\s*\(.*?\)/g, '').trim() };
}

export function W2hCellWidget({ label, value, disciplineID, fieldKey, readOnly = false }: {
    label: string;
    value: unknown;
    disciplineID?: string;
    fieldKey?: string;
    readOnly?: boolean;
}) {
    const rawText = Array.isArray(value)
        ? value.map(String).join(', ')
        : String(value ?? '').trim();

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(rawText);
    const [current, setCurrent] = useState(rawText);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const text = Array.isArray(value)
            ? value.map(String).join(', ')
            : String(value ?? '').trim();
        setCurrent(text);
        if (!editing) {
            setDraft(text);
        }
    }, [value, editing]);

    const meta = getW2hMeta(label);
    const Icon = meta.icon;

    const commit = async () => {
        if (!disciplineID || !fieldKey) return;
        setSaving(true);
        setError(null);
        try {
            await saveDisciplineField(disciplineID, fieldKey, draft.trim());
            setCurrent(draft.trim());
            setEditing(false);
        } catch (e: unknown) {
            const detail = (e as { response?: { data?: { error?: { message?: string } } } })
                ?.response?.data?.error?.message;
            setError(detail || (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="h-full rounded-xl border bg-card p-3.5 shadow-xs transition-all flex flex-col justify-start hover:border-border border-border/80">
            <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-border/50">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-bold', meta.bgClass, meta.colorClass)}>
                        <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[13px] font-semibold uppercase tracking-wider text-foreground/90 truncate">
                        {meta.title}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {!readOnly && disciplineID && fieldKey && !editing && (
                        <button
                            type="button"
                            onClick={() => { setDraft(current); setEditing(true); }}
                            className="text-[11px] font-medium text-primary hover:underline hover:bg-primary/10 rounded px-1.5 py-0.5 transition-colors shrink-0 cursor-pointer"
                        >
                            Edit
                        </button>
                    )}
                </div>
            </div>

            {editing && !readOnly ? (
                <div className="space-y-2 flex-1 flex flex-col justify-between">
                    <Textarea
                        className="w-full min-h-[64px] text-[12px] bg-background p-2 rounded-md border leading-relaxed resize-y font-normal"
                        value={draft}
                        disabled={saving}
                        onChange={(e) => setDraft(e.target.value)}
                        autoFocus
                    />
                    <div className="flex items-center justify-end gap-1.5 pt-1">
                        <Button
                            size="sm"
                            onClick={() => void commit()}
                            disabled={saving || draft.trim() === current}
                            className="h-6 px-2.5 text-[11px] font-medium"
                        >
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setEditing(false); setDraft(current); setError(null); }}
                            disabled={saving}
                            className="h-6 px-2 text-[11px] font-medium"
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            ) : (
                <div className={cn('text-[12px] leading-relaxed flex-1 font-normal', current ? 'text-foreground/90' : 'italic text-muted-foreground')}>
                    {current || 'Not tracked in current dataset'}
                </div>
            )}

            {error && (
                <p className="mt-1 flex items-start gap-1 text-[11px] text-destructive">
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                    {error}
                </p>
            )}
        </div>
    );
}

// ── Is / Is-Not ─────────────────────────────────────────────────────────────

function IsIsNotBox({ heading, value, disciplineID, fieldKey, tone, readOnly = false }: {
    heading: string;
    value: unknown;
    disciplineID?: string;
    fieldKey?: string;
    tone: 'is' | 'isNot';
    readOnly?: boolean;
}) {
    const isTone = tone === 'is';
    const rawLines = asLines(value);

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(rawLines.join('\n'));
    const [currentLines, setCurrentLines] = useState<string[]>(rawLines);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const lines = asLines(value);
        setCurrentLines(lines);
        if (!editing) {
            setDraft(lines.join('\n'));
        }
    }, [value, editing]);

    const commit = async () => {
        if (!disciplineID || !fieldKey) return;
        setSaving(true);
        setError(null);
        try {
            const nextLines = draft
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean);
            await saveDisciplineField(disciplineID, fieldKey, nextLines);
            setCurrentLines(nextLines);
            setEditing(false);
        } catch (e: unknown) {
            const detail = (e as { response?: { data?: { error?: { message?: string } } } })
                ?.response?.data?.error?.message;
            setError(detail || (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={cn(
            'h-full rounded-xl border p-4 shadow-xs transition-all flex flex-col justify-start',
            isTone
                ? 'border-emerald-500/30 bg-emerald-500/[0.03]'
                : 'border-border/90 bg-muted/25',
        )}>
            <div className={cn(
                'flex items-center justify-between gap-2 mb-2 pb-1.5 border-b',
                isTone ? 'border-emerald-500/20' : 'border-border/70',
            )}>
                <div className="flex items-center gap-2 min-w-0">
                    <span className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs',
                        isTone ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
                    )}>
                        {isTone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    </span>
                    <h4 className={cn(
                        'text-[13px] font-semibold uppercase tracking-wider truncate',
                        isTone ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground/90',
                    )}>
                        {heading || (isTone ? 'Is' : 'Is Not')} — {isTone ? 'Affected Scope & Condition' : 'Excluded Scope & Condition'}
                    </h4>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {!readOnly && disciplineID && fieldKey && !editing && (
                        <button
                            type="button"
                            onClick={() => { setDraft(currentLines.join('\n')); setEditing(true); }}
                            className={cn(
                                'text-[11px] font-medium hover:underline rounded px-1.5 py-0.5 transition-colors shrink-0 cursor-pointer',
                                isTone ? 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10' : 'text-primary hover:bg-primary/10',
                            )}
                        >
                            Edit
                        </button>
                    )}
                </div>
            </div>

            {editing && !readOnly ? (
                <div className="space-y-2 flex-1 flex flex-col justify-between">
                    <Textarea
                        className="w-full min-h-[96px] text-[12px] bg-background p-2.5 rounded-md border leading-relaxed resize-y font-normal"
                        value={draft}
                        placeholder="Enter each item on a new line..."
                        disabled={saving}
                        onChange={(e) => setDraft(e.target.value)}
                        autoFocus
                    />
                    <div className="flex items-center justify-end gap-1.5 pt-1">
                        <Button
                            size="sm"
                            onClick={() => void commit()}
                            disabled={saving}
                            className="h-6 px-2.5 text-[11px] font-medium"
                        >
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setEditing(false); setDraft(currentLines.join('\n')); setError(null); }}
                            disabled={saving}
                            className="h-6 px-2 text-[11px] font-medium"
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            ) : currentLines.length ? (
                <div className="space-y-1.5 text-[12px] leading-relaxed text-foreground/90 flex-1 font-normal">
                    {currentLines.map((line, index) => (
                        <div key={index} className="flex items-start gap-2">
                            <span className={cn('mt-2 h-1.5 w-1.5 rounded-full shrink-0', isTone ? 'bg-emerald-500' : 'bg-muted-foreground/60')} />
                            <div className="flex-1 min-w-0"><Markdown className="text-[12px]">{line}</Markdown></div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-[12px] italic text-muted-foreground flex-1 font-normal">
                    Not analysed for this case
                </p>
            )}

            {error && (
                <p className="mt-1 flex items-start gap-1 text-[11px] text-destructive">
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                    {error}
                </p>
            )}
        </div>
    );
}

export function IsBoxWidget({ value, disciplineID, fieldKey, readOnly = false }: { value: unknown; disciplineID?: string; fieldKey?: string; readOnly?: boolean }) {
    return <IsIsNotBox heading="Is" value={value} disciplineID={disciplineID} fieldKey={fieldKey} tone="is" readOnly={readOnly} />;
}

export function IsNotBoxWidget({ value, disciplineID, fieldKey, readOnly = false }: { value: unknown; disciplineID?: string; fieldKey?: string; readOnly?: boolean }) {
    return <IsIsNotBox heading="Is Not" value={value} disciplineID={disciplineID} fieldKey={fieldKey} tone="isNot" readOnly={readOnly} />;
}

export function IsNotBasisWidget({
    value,
    disciplineID,
    fieldKey = 'problem.isIsNotBasis',
    readOnly = false,
}: {
    value: unknown;
    disciplineID?: string;
    fieldKey?: string;
    readOnly?: boolean;
}) {
    const rawText = String(value ?? '').trim();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(rawText);
    const [current, setCurrent] = useState(rawText);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const text = String(value ?? '').trim();
        setCurrent(text);
        if (!editing) {
            setDraft(text);
        }
    }, [value, editing]);

    const commit = async () => {
        if (!disciplineID || !fieldKey) return;
        setSaving(true);
        setError(null);
        try {
            await saveDisciplineField(disciplineID, fieldKey, draft.trim());
            setCurrent(draft.trim());
            setEditing(false);
            toast.success('Updated Is / Is-Not basis.');
        } catch (e: unknown) {
            const detail = (e as { response?: { data?: { error?: { message?: string } } } })
                ?.response?.data?.error?.message;
            setError(detail || (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="h-full rounded-xl border bg-card p-3.5 shadow-xs transition-all flex flex-col justify-start hover:border-border border-border/80">
            <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-border/50">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        <FileText className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[13px] font-semibold uppercase tracking-wider text-foreground/90">
                        Is / Is-Not Comparison Basis & Reasoning
                    </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {!readOnly && disciplineID && fieldKey && !editing && (
                        <button
                            type="button"
                            onClick={() => { setDraft(current); setEditing(true); }}
                            className="text-[11px] font-medium text-primary hover:underline hover:bg-primary/10 rounded px-1.5 py-0.5 transition-colors shrink-0 cursor-pointer"
                        >
                            Edit
                        </button>
                    )}
                </div>
            </div>

            {editing && !readOnly ? (
                <div className="space-y-2 flex-1 flex flex-col justify-between pt-1">
                    <Textarea
                        className="w-full min-h-[96px] text-[12px] bg-background p-2.5 rounded-md border leading-relaxed resize-y font-normal"
                        value={draft}
                        disabled={saving}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Enter Is / Is-Not reasoning and comparison basis..."
                        autoFocus
                    />
                    <div className="flex items-center justify-between gap-2 pt-1">
                        {error ? (
                            <p className="flex items-center gap-1 text-xs text-destructive">
                                <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                                <span>{error}</span>
                            </p>
                        ) : <span />}
                        <div className="flex items-center gap-1.5">
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setEditing(false); setDraft(current); setError(null); }}
                                disabled={saving}
                                className="h-7 px-2.5 text-xs font-medium"
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => void commit()}
                                disabled={saving || draft.trim() === current}
                                className="h-7 px-3 text-xs font-medium"
                            >
                                {saving ? 'Saving…' : 'Save'}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="min-w-0 flex-1 text-[12px] leading-relaxed text-foreground/90 font-normal">
                    {current ? (
                        <Markdown className="text-[12px]">{current}</Markdown>
                    ) : (
                        <p className="italic text-muted-foreground font-normal">
                            No Is / Is-Not comparison recorded in the case. Problem boundary is undefined; no comparable acceptable condition has been documented.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

function getPath(root: unknown, path: string): unknown {
    let current = root;
    for (const segment of path.split('.')) {
        if (Array.isArray(current)) {
            const index = Number(segment);
            if (!Number.isInteger(index)) return undefined;
            current = current[index];
        } else if (current && typeof current === 'object') current = (current as Record<string, unknown>)[segment];
        else return undefined;
    }
    return current;
}

export const W2H_FIELD_KEYS = [
    'problem.what',
    'problem.where',
    'problem.when',
    'problem.who',
    'problem.how',
    'problem.extent',
] as const;

export function W2hSectionWidget({
    data,
    disciplineID,
    readOnly = false,
}: {
    data: Record<string, unknown>;
    disciplineID?: string;
    readOnly?: boolean;
}) {
    return (
        <div className="col-span-12 min-w-0 space-y-2.5">
            <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 break-words text-[14px] font-bold text-foreground tracking-tight">
                    5W2H Problem Analysis
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <W2hCellWidget label="What" value={getPath(data, 'problem.what')} disciplineID={disciplineID} fieldKey="problem.what" readOnly={readOnly} />
                <W2hCellWidget label="Where" value={getPath(data, 'problem.where')} disciplineID={disciplineID} fieldKey="problem.where" readOnly={readOnly} />
                <W2hCellWidget label="When" value={getPath(data, 'problem.when')} disciplineID={disciplineID} fieldKey="problem.when" readOnly={readOnly} />
                <W2hCellWidget label="Who" value={getPath(data, 'problem.who')} disciplineID={disciplineID} fieldKey="problem.who" readOnly={readOnly} />
                <W2hCellWidget label="How" value={getPath(data, 'problem.how')} disciplineID={disciplineID} fieldKey="problem.how" readOnly={readOnly} />
                <W2hCellWidget label="How Many" value={getPath(data, 'problem.extent')} disciplineID={disciplineID} fieldKey="problem.extent" readOnly={readOnly} />
            </div>
        </div>
    );
}

export const IS_NOT_FIELD_KEYS = [
    'problem.is',
    'problem.isNot',
    'problem.isIsNotBasis',
] as const;

export function IsIsNotSectionWidget({
    data,
    disciplineID,
    readOnly = false,
}: {
    data: Record<string, unknown>;
    disciplineID?: string;
    readOnly?: boolean;
}) {
    return (
        <div className="col-span-12 min-w-0 space-y-2.5">
            <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 break-words text-[14px] font-bold text-foreground tracking-tight">
                    Is / Is-Not Problem Boundaries
                </span>
            </div>

            <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <IsBoxWidget value={getPath(data, 'problem.is')} disciplineID={disciplineID} fieldKey="problem.is" readOnly={readOnly} />
                    <IsNotBoxWidget value={getPath(data, 'problem.isNot')} disciplineID={disciplineID} fieldKey="problem.isNot" readOnly={readOnly} />
                </div>
                <IsNotBasisWidget value={getPath(data, 'problem.isIsNotBasis')} disciplineID={disciplineID} fieldKey="problem.isIsNotBasis" readOnly={readOnly} />
            </div>
        </div>
    );
}
