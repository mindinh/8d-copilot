import { useQuery } from '@tanstack/react-query';
import {
    Badge, Card, Separator, Spinner,
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@cnma/react-ui';
import { GitBranch, Info, Search, Users } from 'lucide-react';
import { eightDService, type Precedent, type PrecedentResult } from '@/services/eightd-service';

/**
 * Case tiền lệ của một hồ sơ, và gợi ý nhóm 8D rút ra từ chúng.
 *
 * ── Vì sao panel này quan trọng hơn vẻ ngoài ──
 * Với một sự vụ vừa được ghi nhận, đây là NGUỒN DUY NHẤT có thật: case đó chưa
 * có nguyên nhân, chưa có hành động, chưa có nhóm. Mọi thứ khác trên trang lúc
 * đó đều là suy luận. Phần này là dữ liệu.
 *
 * ── Vì sao gọi riêng thay vì chờ báo cáo ──
 * `findPrecedents` chỉ cần `caseContext`, có ngay khi hồ sơ vừa tạo. Nó chạy
 * khoảng hai giây, trong khi bước AI viết báo cáo mất hơn một phút. Chờ chung
 * nghĩa là giấu mất phần có sớm nhất và hữu ích nhất.
 */

const LEVEL_STYLE: Record<string, string> = {
    exact: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    fallback: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    none: 'bg-muted text-muted-foreground',
};

const ACTION_STYLE: Record<string, string> = {
    Containment: 'text-blue-700 dark:text-blue-300',
    Corrective: 'text-emerald-700 dark:text-emerald-300',
    Preventive: 'text-violet-700 dark:text-violet-300',
};

function eur(n: number | null) {
    return n == null ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

/**
 * Gợi ý D1 — đếm thuần, KHÔNG phải AI đoán.
 *
 * Cố ý tính ở đây thay vì đọc từ báo cáo: nó có ngay lúc tìm xong tiền lệ, và
 * nó là con số kiểm chứng được. Đoạn D1 do AI viết ở dưới trang phải khớp với
 * bảng này — lệch nhau là dấu hiệu model đang thêm người.
 */
function tally(precedents: Precedent[]) {
    const people = new Map<string, { name: string; fn: string; n: number; cases: string[]; ledCount: number }>();
    const roles = new Map<string, number>();

    for (const p of precedents) {
        for (const t of p.team) {
            const e = people.get(t.partnerId)
                ?? { name: t.partnerName, fn: t.functionTitle, n: 0, cases: [] as string[], ledCount: 0 };
            e.n++;
            e.cases.push(p.notificationId);
            if (t.partnerRole?.includes('Leader')) e.ledCount++;
            people.set(t.partnerId, e);
            roles.set(t.functionTitle, (roles.get(t.functionTitle) ?? 0) + 1);
        }
    }

    return {
        people: [...people.values()].sort((a, b) => b.n - a.n || b.ledCount - a.ledCount),
        roles: [...roles.entries()].sort((a, b) => b[1] - a[1]),
    };
}

function PrecedentCard({ p, rank }: { p: Precedent; rank: number }) {
    const pct = p.maxScore ? Math.round((p.score / p.maxScore) * 100) : 0;

    return (
        <Card className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">#{rank}</Badge>
                <span className="font-medium">{p.notificationId}</span>
                <Badge variant="secondary" className="text-[11px]">{p.sapStatus}</Badge>

                <span className="ml-auto flex items-baseline gap-1.5">
                    <span className="text-lg font-semibold tabular-nums">{p.score}</span>
                    <span className="text-xs text-muted-foreground">/ {p.maxScore}</span>
                </span>
            </div>

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>

            <p className="text-sm text-muted-foreground">{p.symptomShortText}</p>

            {/* Vì sao case này được chọn — không để người đọc phải tin suông */}
            <div className="flex flex-wrap gap-1.5">
                {p.breakdown.map((b) => (
                    <span
                        key={b.criterionKey}
                        className={`rounded px-1.5 py-0.5 text-[11px] ${LEVEL_STYLE[b.level]}`}
                        title={b.matchedOn ?? 'no match'}
                    >
                        {b.label} +{b.points}
                        {b.matchedOn && b.points > 0 && (
                            <span className="ml-1 opacity-70">· {b.matchedOn}</span>
                        )}
                    </span>
                ))}
            </div>

            <Separator />

            <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div>
                    <span className="text-xs text-muted-foreground">Confirmed root cause</span>
                    <p className="font-medium">{p.rootCauseCategory ?? 'not recorded'}</p>
                </div>
                <div>
                    <span className="text-xs text-muted-foreground">Cost of poor quality</span>
                    <p className="font-medium">{eur(p.copqEur)}</p>
                </div>
                <div className="sm:col-span-2">
                    <span className="text-xs text-muted-foreground">Where</span>
                    <p>{p.workCenterDesc} · {p.materialDesc}</p>
                </div>
            </div>

            {p.team.length > 0 && (
                <div>
                    <span className="text-xs text-muted-foreground">Team that solved it</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                        {p.team.map((t) => (
                            <Badge key={t.partnerId} variant="outline" className="text-[11px] font-normal">
                                {t.partnerName}
                                <span className="ml-1 text-muted-foreground">{t.functionTitle}</span>
                                {t.partnerRole?.includes('Leader') && <span className="ml-1">★</span>}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            {p.actions.length > 0 && (
                <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">What they did</span>
                    {p.actions.map((a) => (
                        <p key={a.lineNo} className="text-xs leading-relaxed">
                            <span className={`font-medium ${ACTION_STYLE[a.actionType] ?? ''}`}>{a.actionType}</span>
                            <span className="text-muted-foreground"> · {a.actionText}</span>
                        </p>
                    ))}
                </div>
            )}
        </Card>
    );
}

export function PrecedentPanel({ reportID }: { reportID: string }) {
    const { data, isLoading, error } = useQuery<PrecedentResult>({
        queryKey: ['precedents', reportID],
        queryFn: () => eightDService.findPrecedents(reportID),
        // Tiền lệ chỉ đổi khi kho hoặc cấu hình chấm điểm đổi — không phải mỗi
        // lần render. Nhưng cũng không cache mãi: admin vừa chỉnh trọng số xong
        // mở lại hồ sơ thì phải thấy kết quả mới.
        staleTime: 60_000,
    });

    if (isLoading) {
        return (
            <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
                <Spinner className="h-4 w-4" />
                Searching past cases…
            </Card>
        );
    }

    if (error || !data) {
        return (
            <Card className="p-5 text-sm text-muted-foreground">
                Could not search past cases: {(error as Error)?.message ?? 'unknown error'}
            </Card>
        );
    }

    const { people, roles } = tally(data.precedents);

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" />
                <h2 className="font-medium">Similar past cases</h2>
                <Badge variant="secondary" className="text-[11px]">
                    {data.precedents.length} of {data.candidatesScored} scored
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                    library {data.libraryCount} · threshold {data.settings.minScore}/{data.maxScore}
                    {data.semanticUsed && (
                        <span className="ml-2 inline-flex items-center gap-1">
                            <Search className="h-3 w-3" /> semantic on
                        </span>
                    )}
                </span>
            </div>

            {/* ── Không có tiền lệ ──
                Hiện đầy đủ lý do chứ không phải một ô trống: "chưa nạp kho" và
                "đã tìm nhưng không đủ điểm" nhìn giống nhau mà xử lý khác hẳn. */}
            {!data.precedents.length ? (
                <Card className="flex items-start gap-3 border-dashed p-5">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="space-y-1">
                        <p className="text-sm font-medium">No comparable case found</p>
                        <p className="text-xs text-muted-foreground">{data.reason}</p>
                        <p className="text-xs text-muted-foreground">
                            Nothing is shown rather than a weak match — a precedent that does not hold
                            still gets cited in the report as if it did.
                        </p>
                    </div>
                </Card>
            ) : (
                <>
                    {/* ── Gợi ý nhóm 8D ── */}
                    <Card className="space-y-3 p-4">
                        <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-primary" />
                            <span className="font-medium">Suggested team (D1)</span>
                            <Badge variant="outline" className="text-[10px]">counted, not generated</Badge>
                        </div>

                        <div>
                            <span className="text-xs text-muted-foreground">Functions these cases needed</span>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                                {roles.map(([fn, n]) => (
                                    <Badge key={fn} variant="secondary" className="text-[11px] font-normal">
                                        {fn}{n > 1 && <span className="ml-1 font-medium">×{n}</span>}
                                    </Badge>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">People, ranked by how often they worked a matching case</span>
                            {people.map((p) => (
                                <div key={p.name} className="flex items-baseline gap-2 text-sm">
                                    <span className="w-8 shrink-0 text-right font-mono text-xs text-muted-foreground">
                                        {p.n}×
                                    </span>
                                    <span className="font-medium">{p.name}</span>
                                    {p.ledCount > 0 && (
                                        <Badge variant="outline" className="text-[10px]">led {p.ledCount}</Badge>
                                    )}
                                    <span className="text-muted-foreground">{p.fn}</span>
                                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                                        {p.cases.join(', ')}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <p className="text-xs text-muted-foreground">
                            These names come from the teams of the cases below — nothing here is
                            inferred. The D1 draft further down should not contain a name that is
                            missing from this list.
                        </p>
                    </Card>

                    {/* ── Từng case ── */}
                    <Accordion type="single" collapsible defaultValue="p0">
                        {data.precedents.map((p, i) => (
                            <AccordionItem key={p.notificationId} value={`p${i}`} className="border-none">
                                <AccordionTrigger className="rounded-lg px-3 py-2 text-sm hover:bg-muted/50 hover:no-underline">
                                    <span className="flex flex-1 items-center gap-2 pr-3 text-left">
                                        <Badge variant="outline" className="font-mono text-[10px]">#{i + 1}</Badge>
                                        <span className="font-medium">{p.notificationId}</span>
                                        <span className="truncate text-muted-foreground">{p.explanation}</span>
                                    </span>
                                </AccordionTrigger>
                                <AccordionContent className="pt-1">
                                    <PrecedentCard p={p} rank={i + 1} />
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </>
            )}
        </div>
    );
}
