import { ChevronDown, ChevronUp, GripVertical, Search, Trash2 } from 'lucide-react';
import {
    Badge, Button, Card, CardContent, Input, Label, Separator, Switch,
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@cnma/react-ui';
import {
    COMPARABLE_FIELDS, MATCH_METHODS, type SimilarityCriterion,
} from '@/services/retrieval-service';

/**
 * Một bước trong pipeline chấm điểm tương đồng.
 *
 * Dựng theo khuôn `MatchingStepCard` của CLAIR2 (Enrichment → Matching
 * Pipeline): mỗi bước là một card có thứ tự, chọn phương pháp, và CHỈ hiện
 * những ô mà phương pháp đó dùng tới. Khuôn đó hợp ở đây vì cùng một bài toán —
 * ghép hai bản ghi bằng nhiều cách khác nhau, mỗi cách có tham số riêng.
 *
 * Một chỗ CỐ Ý khác CLAIR2: ở CLAIR2 thứ tự là thác nước — bước 1 khớp thì dừng.
 * Ở đây MỌI bước đều được chấm và cộng dồn, nên thứ tự chỉ đổi cách đọc bảng
 * phân tích chứ không đổi điểm. Card nói thẳng điều đó thay vì để người dùng
 * suy ra một hành vi không có thật.
 */

const METHOD_STYLE: Record<string, string> = {
    exact: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
    keyword: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300',
    cosine: 'bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-300',
};

/** Phương pháp có mức dự phòng. Cosine thì không — nó đã cho điểm liên tục rồi. */
const SUPPORTS_FALLBACK = new Set(['exact', 'keyword']);

export interface CriterionStepCardProps {
    criterion: SimilarityCriterion;
    index: number;
    isFirst: boolean;
    isLast: boolean;
    busy: boolean;
    onPatch: (patch: Partial<SimilarityCriterion>) => void;
    onRemove: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
}

export function CriterionStepCard({
    criterion: c, index, isFirst, isLast, busy, onPatch, onRemove, onMoveUp, onMoveDown,
}: CriterionStepCardProps) {
    const method = c.matchType || 'exact';
    const isVector = method === 'cosine';
    const hasFallback = Boolean(c.fallbackMatch);

    return (
        <Card className={`relative border-border transition-colors hover:border-primary/30 ${c.enabled ? '' : 'opacity-60'}`}>
            <CardContent className="space-y-4 p-4">
                {/* ── Hàng đầu: thứ tự · tên · phương pháp · trọng số · xoá ── */}
                <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-0.5">
                        {!isFirst && (
                            <Button
                                variant="ghost" size="icon" type="button" disabled={busy}
                                onClick={onMoveUp}
                                className="h-auto w-auto p-0.5 text-muted-foreground hover:text-foreground"
                            >
                                <ChevronUp size={12} />
                            </Button>
                        )}
                        <GripVertical size={14} className="text-muted-foreground/40" />
                        {!isLast && (
                            <Button
                                variant="ghost" size="icon" type="button" disabled={busy}
                                onClick={onMoveDown}
                                className="h-auto w-auto p-0.5 text-muted-foreground hover:text-foreground"
                            >
                                <ChevronDown size={12} />
                            </Button>
                        )}
                    </div>

                    <Badge variant="outline" className="shrink-0 font-mono text-xs">
                        Step {index + 1}
                    </Badge>

                    <Input
                        defaultValue={c.label}
                        placeholder="e.g. Work centre"
                        disabled={busy}
                        className="h-8 flex-1 text-sm font-medium"
                        onBlur={(e) => e.target.value !== c.label && onPatch({ label: e.target.value })}
                    />

                    <Select
                        value={method}
                        disabled={busy}
                        onValueChange={(v) => onPatch({
                            matchType: v,
                            // Đổi sang cosine mà không đặt sàn thì nền ~0.6 cho
                            // điểm mọi cặp. Đặt sẵn mức đã đo được.
                            ...(v === 'cosine' && c.minSimilarity == null ? { minSimilarity: 0.7 } : {}),
                            // Cosine không có mức dự phòng — dọn luôn để bảng
                            // không còn dữ liệu chết.
                            ...(v === 'cosine' ? { fallbackMatch: null, fallbackField: null, fallbackWeight: null } : {}),
                        })}
                    >
                        <SelectTrigger className="h-8 w-[118px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {MATCH_METHODS.map((m) => (
                                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Badge className={`border px-1.5 py-0.5 text-xs ${METHOD_STYLE[method] ?? METHOD_STYLE.exact}`}>
                        {method.toUpperCase()}
                    </Badge>

                    <div className="flex items-center gap-1.5">
                        <Label className="text-xs text-muted-foreground">Weight</Label>
                        <Input
                            type="number" min={0} max={99}
                            defaultValue={c.weight}
                            disabled={busy}
                            className="h-8 w-16 text-right"
                            onBlur={(e) => {
                                const v = Number(e.target.value);
                                if (Number.isFinite(v) && v !== c.weight) onPatch({ weight: v });
                            }}
                        />
                    </div>

                    <Switch
                        checked={c.enabled}
                        disabled={busy}
                        onCheckedChange={(v) => onPatch({ enabled: v })}
                    />

                    <Button
                        variant="ghost" size="icon" type="button" disabled={busy}
                        onClick={onRemove}
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    >
                        <Trash2 size={14} />
                    </Button>
                </div>

                <Separator />

                {/* ── Cột đem ra so ── */}
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs uppercase text-muted-foreground">
                            Compare field <span className="normal-case">(on both cases)</span>
                        </Label>
                        <Select
                            value={c.sourceField ?? ''}
                            disabled={busy}
                            onValueChange={(v) => onPatch({ sourceField: v })}
                        >
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Pick a column" /></SelectTrigger>
                            <SelectContent>
                                {COMPARABLE_FIELDS.map((f) => (
                                    <SelectItem key={f.field} value={f.field}>
                                        {f.label} <span className="text-muted-foreground">· {f.field}</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground/70">
                            {MATCH_METHODS.find((m) => m.value === method)?.hint}
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs uppercase text-muted-foreground">
                            Reads from <span className="normal-case">(shown on the criteria list)</span>
                        </Label>
                        <Input
                            defaultValue={c.sourceTable ?? ''}
                            placeholder="e.g. HistoricalCases · GD 4 WorkCenters"
                            disabled={busy}
                            className="h-8 text-sm"
                            onBlur={(e) => e.target.value !== c.sourceTable && onPatch({ sourceTable: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground/70">
                            Free text — it tells the next person which data this step depends on.
                        </p>
                    </div>
                </div>

                {/* ── Riêng cho vector ── */}
                {isVector && (
                    <div className="space-y-2 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
                        <Label className="flex items-center gap-1.5 text-xs uppercase text-violet-700 dark:text-violet-300">
                            <Search size={12} />
                            Semantic threshold
                        </Label>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Minimum cosine (0–1)</Label>
                                <Input
                                    type="number" min={0} max={1} step={0.01}
                                    defaultValue={c.minSimilarity ?? 0.7}
                                    disabled={busy}
                                    className="h-8 bg-card text-sm"
                                    onBlur={(e) => {
                                        const v = Number(e.target.value);
                                        if (Number.isFinite(v) && v !== c.minSimilarity) onPatch({ minSimilarity: v });
                                    }}
                                />
                            </div>
                            <p className="self-end text-xs text-muted-foreground">
                                Two unrelated manufacturing write-ups already sit around 0.60 — they are
                                all English defect narratives. A floor below that scores every pair and
                                lets the baseline decide the ranking. Measure before changing it:
                                <code className="ml-1 rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                                    npx tsx scripts/measure-similarity.mjs
                                </code>
                            </p>
                        </div>
                    </div>
                )}

                {/* ── Mức dự phòng ── */}
                {SUPPORTS_FALLBACK.has(method) && (
                    <div className="space-y-2 rounded-lg border border-dashed p-3">
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={hasFallback}
                                disabled={busy}
                                onCheckedChange={(v) => onPatch(v
                                    ? { fallbackMatch: 'exact', fallbackField: c.sourceField, fallbackWeight: 1 }
                                    : { fallbackMatch: null, fallbackField: null, fallbackWeight: null })}
                            />
                            <Label className="cursor-pointer text-xs uppercase text-muted-foreground">
                                Fallback when the main match misses
                            </Label>
                        </div>

                        {hasFallback ? (
                            <div className="grid gap-3 md:grid-cols-3">
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Method</Label>
                                    <Select
                                        value={c.fallbackMatch ?? 'exact'}
                                        disabled={busy}
                                        onValueChange={(v) => onPatch({ fallbackMatch: v })}
                                    >
                                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="exact">Exact</SelectItem>
                                            <SelectItem value="keyword">Keyword</SelectItem>
                                            <SelectItem value="family">Family (same group)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Field</Label>
                                    <Select
                                        value={c.fallbackField ?? ''}
                                        disabled={busy}
                                        onValueChange={(v) => onPatch({ fallbackField: v })}
                                    >
                                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Pick a column" /></SelectTrigger>
                                        <SelectContent>
                                            {COMPARABLE_FIELDS.map((f) => (
                                                <SelectItem key={f.field} value={f.field}>{f.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Weight</Label>
                                    <Input
                                        type="number" min={0} max={99}
                                        defaultValue={c.fallbackWeight ?? 1}
                                        disabled={busy}
                                        className="h-8 text-right text-sm"
                                        onBlur={(e) => {
                                            const v = Number(e.target.value);
                                            if (Number.isFinite(v) && v !== c.fallbackWeight) onPatch({ fallbackWeight: v });
                                        }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground/70">
                                Off — this step scores its full weight or nothing.
                            </p>
                        )}

                        {hasFallback && (
                            <p className="text-xs text-muted-foreground/70">
                                The fallback is only tried when the main match fails. The two never add
                                up — that would break the maximum score.
                            </p>
                        )}
                    </div>
                )}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{c.criterionKey}</span>
                    <span>·</span>
                    <span>{c.description || 'No description'}</span>
                </div>
            </CardContent>
        </Card>
    );
}
