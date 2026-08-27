import { useEffect, useState } from 'react';
import { Button, Textarea, cn } from '@cnma/react-ui';
import {
    Calendar,
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
            <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-info/15 text-xs font-bold uppercase tracking-wider text-info">
                <FileText className="h-3.5 w-3.5" />
                Customer Complaint Reference
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
                <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-primary/10">
                    <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Sparkles className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wide text-primary">
                            {current ? 'Problem Statement (Engineer Override)' : 'AI Drafted Problem Statement'}
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
                        className="mt-2 min-h-28 bg-background text-[13.5px] leading-relaxed"
                        value={draft}
                        disabled={saving}
                        onChange={(event) => setDraft(event.target.value)}
                    />
                ) : (
                    <p className="text-[13.5px] leading-relaxed text-foreground font-normal">
                        {shown}
                    </p>
                )}

                {!readOnly && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-primary/10">
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
        return { icon: HelpCircle, colorClass: 'text-blue-600 dark:text-blue-400', bgClass: 'bg-blue-500/10', title: 'What (Defect Description)' };
    }
    if (l.includes('where')) {
        return { icon: MapPin, colorClass: 'text-emerald-600 dark:text-emerald-400', bgClass: 'bg-emerald-500/10', title: 'Where (Work Center / Line)' };
    }
    if (l.includes('when')) {
        return { icon: Calendar, colorClass: 'text-amber-600 dark:text-amber-400', bgClass: 'bg-amber-500/10', title: 'When (Occurred Date)' };
    }
    if (l.includes('who')) {
        return { icon: User, colorClass: 'text-purple-600 dark:text-purple-400', bgClass: 'bg-purple-500/10', title: 'Who (Discovered By / Role)' };
    }
    if (l.includes('how many') || l.includes('extent')) {
        return { icon: Hash, colorClass: 'text-indigo-600 dark:text-indigo-400', bgClass: 'bg-indigo-500/10', title: 'How Many (Affected Extent)' };
    }
    if (l.includes('how')) {
        return { icon: Wrench, colorClass: 'text-orange-600 dark:text-orange-400', bgClass: 'bg-orange-500/10', title: 'How (Surfaced Mechanism)' };
    }
    return { icon: FileText, colorClass: 'text-muted-foreground', bgClass: 'bg-muted', title: label };
}

export function W2hCellWidget({ label, value }: { label: string; value: unknown }) {
    const text = Array.isArray(value)
        ? value.map(String).join(', ')
        : String(value ?? '').trim();
    const meta = getW2hMeta(label);
    const Icon = meta.icon;

    return (
        <div className="h-full rounded-xl border border-border/80 bg-card p-3.5 shadow-xs transition-all flex flex-col justify-start hover:border-border">
            <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-border/50">
                <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md', meta.bgClass, meta.colorClass)}>
                    <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                    {meta.title}
                </span>
            </div>
            <div className={cn('text-[13px] leading-relaxed flex-1', text ? 'font-medium text-foreground' : 'italic text-muted-foreground')}>
                {text || 'Not tracked in current dataset'}
            </div>
        </div>
    );
}

// ── Is / Is-Not ─────────────────────────────────────────────────────────────

function IsIsNotBox({ heading, lines, tone }: {
    heading: string;
    lines: string[];
    tone: 'is' | 'isNot';
}) {
    const isTone = tone === 'is';
    return (
        <div className={cn(
            'h-full rounded-xl border p-4 shadow-xs transition-all flex flex-col justify-start',
            isTone
                ? 'border-emerald-500/30 bg-emerald-500/[0.03]'
                : 'border-border/90 bg-muted/25',
        )}>
            <div className={cn(
                'flex items-center gap-2 mb-2.5 pb-2 border-b',
                isTone ? 'border-emerald-500/20' : 'border-border/70',
            )}>
                <span className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs',
                    isTone ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
                )}>
                    {isTone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                </span>
                <h4 className={cn(
                    'text-xs font-bold uppercase tracking-wider',
                    isTone ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
                )}>
                    {heading || (isTone ? 'Is' : 'Is Not')} — {isTone ? 'Affected Scope & Condition' : 'Excluded Scope & Condition'}
                </h4>
            </div>

            {lines.length ? (
                <div className="space-y-1.5 text-[13px] leading-relaxed text-foreground flex-1">
                    {lines.map((line, index) => (
                        <div key={index} className="flex items-start gap-2">
                            <span className={cn('mt-2 h-1.5 w-1.5 rounded-full shrink-0', isTone ? 'bg-emerald-500' : 'bg-muted-foreground/60')} />
                            <div className="flex-1 min-w-0"><Markdown>{line}</Markdown></div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-[12.5px] italic text-muted-foreground flex-1">
                    Not analysed for this case
                </p>
            )}
        </div>
    );
}

export function IsBoxWidget({ value }: { value: unknown }) {
    return <IsIsNotBox heading="Is" lines={asLines(value)} tone="is" />;
}

export function IsNotBoxWidget({ value }: { value: unknown }) {
    return <IsIsNotBox heading="Is Not" lines={asLines(value)} tone="isNot" />;
}
