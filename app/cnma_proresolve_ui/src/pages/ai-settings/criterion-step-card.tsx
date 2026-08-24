import { ChevronDown, ChevronUp, GripVertical, Search, Trash2 } from 'lucide-react';
import {
    Badge, Button, Card, CardContent, Input, Label, Separator, Switch,
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@cnma/react-ui';
import {
    AVAILABLE_SOURCE_TABLES, COMPARABLE_FIELDS, MATCH_METHODS, type SimilarityCriterion,
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
    exact: 'bg-success/15 text-success border-success/30',
    keyword: 'bg-warning/15 text-warning border-warning/30',
    cosine: 'bg-primary/15 text-primary border-primary/30',
};

/** Phương pháp có mức dự phòng. Cosine thì không — nó đã cho điểm liên tục rồi. */
const SUPPORTS_FALLBACK = new Set(['exact', 'keyword']);

export interface CriterionStepCardProps {
    criterion: SimilarityCriterion;
    /**
     * Khoá phần ĐỊNH NGHĨA field: cột đem ra so, bảng nguồn, và nút xoá.
     *
     * Bật ở tab Similarity của từng bước D. Ở đó bộ field đã được trang Object
     * Schema dựng từ danh mục field SAP quét trên kho thật; ô chọn cột ở đây chỉ
     * có một danh sách viết cứng, nên để mở là tạo ra đường thứ hai định nghĩa
     * field, với một bộ lựa chọn khác. Trọng số, cách so và mức dự phòng vẫn sửa
     * được — đó mới là thứ khác nhau giữa các bước.
     */
    fieldsLocked?: boolean;
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
    criterion: c, index, isFirst, isLast, busy, fieldsLocked = false,
    onPatch, onRemove, onMoveUp, onMoveDown,
}: CriterionStepCardProps) {
    const method = c.matchType || 'exact';
    const isVector = method === 'cosine';
    const hasFallback = Boolean(c.fallbackMatch);

    /**
     * Khi field bị khoá (đến từ Object Schema), 2 Select "Compare field"/
     * "Reads from" không còn dùng được — danh sách của chúng chỉ có đúng bộ
     * field cũ (`COMPARABLE_FIELDS`/`AVAILABLE_SOURCE_TABLES`), trong khi
     * Object Schema có thể tạo ra bất kỳ `sourceField`/`sourceTable` nào quét
     * được từ payload SAP thật. Giá trị thật VẪN có trên `c`, chỉ là Select
     * không tìm được item khớp nên hiện trống — trông như thiếu dữ liệu dù
     * không phải vậy. Ở đây tính sẵn chuỗi để hiển thị thô, khớp thì dùng
     * nhãn đẹp, không khớp thì hiện đúng giá trị thật thay vì im lặng.
     */
    const compareMatch = COMPARABLE_FIELDS.find((f) => f.field === c.sourceField);
    const compareFieldDisplay = c.sourceField
        ? (compareMatch ? `${compareMatch.label} · ${compareMatch.field}` : c.sourceField)
        : '—';
    const tableMatch = AVAILABLE_SOURCE_TABLES.find((t) => t.value === c.sourceTable);
    const readsFromDisplay = c.sourceTable
        ? (tableMatch ? tableMatch.label : c.sourceTable)
        : '—';

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
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
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

                    {!fieldsLocked && (
                        <Button
                            variant="ghost" size="icon" type="button" disabled={busy}
                            onClick={onRemove}
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        >
                            <Trash2 size={14} />
                        </Button>
                    )}
                </div>

                <Separator />

                {/* ── Cột đem ra so ── */}
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs uppercase text-muted-foreground">
                            Compare field <span className="normal-case font-normal">(DB field to compare)</span>
                        </Label>
                        {fieldsLocked ? (
                            <div
                                className="flex h-8 items-center truncate rounded-md border border-input bg-muted/40 px-3 text-sm text-foreground/80"
                                title={compareFieldDisplay}
                            >
                                {compareFieldDisplay}
                            </div>
                        ) : (
                            <Select
                                value={c.sourceField ?? ''}
                                disabled={busy}
                                onValueChange={(v) => {
                                    const matched = COMPARABLE_FIELDS.find((f) => f.field === v);
                                    onPatch({
                                        sourceField: v,
                                        sourceTable: matched?.sourceTable ?? c.sourceTable,
                                    });
                                }}
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
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs uppercase text-muted-foreground">
                            Reads from <span className="normal-case font-normal">(Metadata)</span>
                        </Label>
                        {fieldsLocked ? (
                            <div
                                className="flex h-8 items-center truncate rounded-md border border-input bg-muted/40 px-3 text-sm text-foreground/80"
                                title={readsFromDisplay}
                            >
                                {readsFromDisplay}
                            </div>
                        ) : (
                            <Select
                                value={c.sourceTable ?? ''}
                                disabled={busy}
                                onValueChange={(v) => onPatch({ sourceTable: v })}
                            >
                                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select SAP source table" /></SelectTrigger>
                                <SelectContent>
                                    {AVAILABLE_SOURCE_TABLES.map((t) => (
                                        <SelectItem key={t.value} value={t.value}>
                                            {t.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                </div>

                {/* ── Riêng cho vector ── */}
                {isVector && (
                    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                        <Label className="flex items-center gap-1.5 text-xs uppercase text-primary font-semibold">
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
                        ) : null}
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
