import { Badge, cn } from '@cnma/react-ui';
import { Star } from 'lucide-react';

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

export function WhyChainWidget({ value }: { value: unknown }) {
    const rows: WhyStep[] = Array.isArray(value) ? (value as WhyStep[]) : [];

    if (rows.length === 0) {
        return (
            <p className="text-sm italic text-muted-foreground">
                No 5-Why chain recorded for this case yet.
            </p>
        );
    }

    return (
        <div className="divide-y">
            {rows.map((row, index) => {
                const root = isRootStep(row, index, rows.length);
                const cite = row.evidence ?? row.evidenceCitation;
                return (
                    <div key={index} className="flex gap-3 py-2.5">
                        <span
                            className={cn(
                                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                                root ? 'bg-destructive text-destructive-foreground' : 'bg-foreground text-background',
                            )}
                        >
                            {stepNumber(row, index)}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-semibold">{row.question ?? row.why ?? '—'}</p>
                            <p className="mt-0.5 break-words text-[13px]">{row.answer ?? '—'}</p>
                            {cite && (
                                <p className="mt-1 break-words text-xs italic text-muted-foreground">
                                    Cited: {cite}
                                </p>
                            )}
                            {root && (
                                <span className="mt-1.5 inline-block text-[10px] font-bold uppercase tracking-wide text-destructive">
                                    ★ Root cause
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}
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
}

function truthy(value: unknown): boolean {
    return value === true || String(value ?? '').trim().toUpperCase() === 'Y';
}

/**
 * Sau nhanh Ishikawa, nhanh duoc chon to do.
 *
 * Doc tu `caseContext.ishikawa` chu khong tu `resultJson`: day la du lieu SAP da
 * ghi, khong phai ket luan AI viet ra. Bat AI chep lai sau dong nay vao output
 * chi tao them mot ban sao co the lech voi ban goc.
 *
 * Nhanh KHONG co du lieu van ve o, ghi "Not assessed" — sau o luon day du thi
 * nguoi doc thay ngay dieu tra con thung cho nao. An o trong di la giau mat.
 */
export function IshikawaGridWidget({ context }: { context: unknown }) {
    const root = context && typeof context === 'object' ? (context as Record<string, unknown>) : null;
    const raw = root?.ishikawa;
    const rows: CauseRow[] = Array.isArray(raw) ? (raw as CauseRow[]) : [];

    if (rows.length === 0) {
        return (
            <p className="text-sm italic text-muted-foreground">
                No Ishikawa assessment recorded for this case.
            </p>
        );
    }

    const byCategory = new Map(
        rows.map((r) => [String(r.category ?? '').trim().toLowerCase(), r]),
    );

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SIX_M.map((category) => {
                const row = byCategory.get(category.toLowerCase());
                const isRoot = row ? truthy(row.isRootCause) : false;
                const text = row?.description ?? row?.finding;
                const metric = row?.metricValue ?? row?.metric;

                return (
                    <div
                        key={category}
                        className={cn(
                            'min-w-0 rounded-lg border p-3',
                            isRoot ? 'border-destructive bg-destructive/[0.05]' : 'border-border bg-card',
                        )}
                    >
                        <h4 className="text-sm font-semibold">{category}</h4>
                        <p className={cn(
                            'mt-1 break-words text-[12.5px]',
                            text ? 'text-foreground' : 'italic text-muted-foreground',
                        )}>
                            {text || 'Not assessed'}
                        </p>
                        {metric && (
                            <span className="mt-2 inline-block rounded-full border bg-muted px-2 py-0.5 text-[11px]">
                                {metric}
                            </span>
                        )}
                        {isRoot && (
                            <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-destructive">
                                <Star className="h-3 w-3 fill-current" />
                                Root cause
                            </div>
                        )}
                    </div>
                );
            })}
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

/**
 * Trang thai nao la da xong that.
 *
 * `Verified` khac `Done`: lam xong khong dong nghia da chung minh la hieu qua.
 * Ca D6 ton tai de giu dung khac biet do, nen mau sac o day khong duoc xoa no.
 */
function statusTone(status: string): string {
    const s = status.trim().toLowerCase();
    if (s === 'verified') return 'bg-success/10 text-success border-success/30';
    if (s === 'done' || s === 'complete' || s === 'completed') return 'bg-primary/10 text-primary border-primary/30';
    if (s === 'in process' || s === 'in progress') return 'bg-warning/10 text-warning border-warning/30';
    return 'bg-muted text-muted-foreground border-border';
}

export function ActionCardsWidget({ value, emptyLabel = 'No action logged yet.' }: {
    value: unknown;
    emptyLabel?: string;
}) {
    const rows: ActionRow[] = Array.isArray(value) ? (value as ActionRow[]) : [];

    if (rows.length === 0) {
        return <p className="text-sm italic text-muted-foreground">{emptyLabel}</p>;
    }

    return (
        <div className="space-y-2.5">
            {rows.map((row, index) => {
                const status = String(row.status ?? '').trim();
                const text = row.action ?? row.actionText ?? '—';
                return (
                    <div
                        key={index}
                        className="flex min-w-0 items-start justify-between gap-3 rounded-lg border bg-card p-3"
                    >
                        <div className="min-w-0">
                            {/* `origin` phan biet action DA GHI voi de xuat dua tren tien le —
                                khac biet quan trong nhat cua D3, khong duoc chim vao than bai. */}
                            {row.origin && (
                                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                    {row.origin}
                                </div>
                            )}
                            <p className="break-words text-[13px]">{text}</p>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                {row.owner && <span>Owner: {row.owner}</span>}
                                {row.protection && <span>Protects: {row.protection}</span>}
                            </div>
                        </div>
                        {status && (
                            <Badge variant="outline" className={cn('shrink-0 whitespace-nowrap', statusTone(status))}>
                                {status}
                            </Badge>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
