import { useState } from 'react';
import { Textarea, cn } from '@cnma/react-ui';
import { TriangleAlert } from 'lucide-react';
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

    const parts = [customer.complaintReference, customer.plantContact, customer.slaResponseDue]
        .map((item) => String(item ?? '').trim())
        .filter(Boolean);
    if (!parts.length) return null;

    return (
        <div className="grid grid-cols-[170px_1fr] gap-2.5 border-b py-2.5 text-[13px]">
            <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                Complaint reference
            </span>
            <span>{parts.join(' · ')}</span>
        </div>
    );
}

// ── Problem statement (AI draft + sua tay) ──────────────────────────────────

export function ProblemStatementWidget({ statement, override, disciplineID }: {
    statement: unknown;
    /** Ban ky su tu sua. Co gia tri => hien no thay cho ban AI. */
    override: unknown;
    disciplineID: string;
}) {
    const aiText = String(statement ?? '').trim();
    const savedOverride = String(override ?? '').trim();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(savedOverride || aiText);
    const [current, setCurrent] = useState(savedOverride);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
            <div className="relative mt-3 rounded-lg border border-primary/20 bg-primary/[0.04] px-4 py-4">
                <span className="absolute -top-2.5 left-3.5 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                    AI Draft
                </span>

                {editing ? (
                    <Textarea
                        className="mt-1 min-h-32 bg-card text-[13px] leading-relaxed"
                        value={draft}
                        disabled={saving}
                        onChange={(event) => setDraft(event.target.value)}
                    />
                ) : (
                    <p className="mt-1 text-[13px] leading-relaxed">
                        {shown}
                        {current && (
                            <span className="ml-1.5 italic text-muted-foreground">(edited by you)</span>
                        )}
                    </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {editing ? (
                        <>
                            <button
                                type="button"
                                onClick={() => void commit(draft.trim())}
                                disabled={saving || !draft.trim() || draft.trim() === shown}
                                className="rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                            >
                                {saving ? 'Saving…' : 'Save description'}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setEditing(false); setDraft(shown); setError(null); }}
                                disabled={saving}
                                className="rounded-md border border-input bg-card px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/60 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => { setDraft(shown); setEditing(true); }}
                                className="rounded-md border border-input bg-card px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/60"
                            >
                                Edit description
                            </button>
                            {current && (
                                <button
                                    type="button"
                                    onClick={() => void commit(null)}
                                    disabled={saving}
                                    className="rounded-md px-3 py-2 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:bg-muted/60 disabled:opacity-50"
                                >
                                    Revert to AI draft
                                </button>
                            )}
                        </>
                    )}
                </div>
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

export function W2hCellWidget({ label, value }: { label: string; value: unknown }) {
    const text = Array.isArray(value)
        ? value.map(String).join(', ')
        : String(value ?? '').trim();
    return (
        <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {label}
            </div>
            <div className={cn('text-[13px]', text ? 'text-foreground' : 'italic text-muted-foreground')}>
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
    return (
        <div className={cn(
            'rounded-lg border p-3.5',
            // IS dung mau thanh cong vi no la ket luan da khoanh vung duoc; IS NOT
            // trung tinh - no khong phai "xau", chi la vung da loai tru.
            tone === 'is' ? 'border-success/30 bg-success-bg' : 'border-border bg-muted/40',
        )}>
            <h4 className={cn(
                'mb-1.5 text-[13px] font-semibold uppercase tracking-wide',
                tone === 'is' ? 'text-success' : 'text-muted-foreground',
            )}>
                {heading}
            </h4>
            {lines.length ? (
                <div className="space-y-1 text-[13px] leading-relaxed">
                    {lines.map((line, index) => <Markdown key={index}>{line}</Markdown>)}
                </div>
            ) : (
                <p className="text-[13px] italic text-muted-foreground">Not analysed for this case</p>
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
