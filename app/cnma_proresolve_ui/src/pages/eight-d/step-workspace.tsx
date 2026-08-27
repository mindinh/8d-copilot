import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Badge, Button, Card, Spinner,
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn,
} from '@cnma/react-ui';
import { Check, ChevronDown, Info, Sparkles, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
    eightDService,
    type Discipline8D,
    type StepActivity,
    type StepDecision,
} from '@/services/eightd-service';
import { STEP_SUGGESTIONS, suggestionsOf, type StepSuggestionConfig } from './step-suggestion-config';

/**
 * Vùng làm việc của một bước D: gợi ý → người chốt → bảng kết quả.
 *
 * ── Vì sao thay cho cách đổ hết field ra màn hình ──
 * Bản trước render mọi trường của form schema thành một chồng khối văn, nên
 * người dùng phải đọc cả trang để tìm ra mình cần bấm gì. Một bước 8D chỉ hỏi
 * đúng một câu — "nhận cái này chứ?" — nên màn hình cũng chỉ nên hỏi đúng câu đó.
 *
 * Lý do đặt gợi ý và bảng kết quả CẠNH NHAU, không phải hai chỗ: chốt một gợi ý
 * là hành động giao việc, và người ta cần thấy ngay việc vừa được giao. Đó cũng
 * là hành vi của bản cũ mà nhóm muốn giữ.
 *
 * ── Bảng kết quả không có bảng riêng dưới DB ──
 * Nó được dựng lại từ các dòng `accepted` trong SuggestionAudit. Một nguồn sự
 * thật: không thể có chuyện roster nói một đằng còn vết kiểm toán nói một nẻo.
 */

interface Props {
    discipline: Discipline8D;
    reportID: string;
    activity: StepActivity | null;
    readOnly?: boolean;
}

function parse<T>(value: string | null | undefined): T | null {
    if (!value) return null;
    try { return JSON.parse(value) as T; } catch { return null; }
}

function decisionMap(activity: StepActivity | null): Map<string, StepDecision> {
    return new Map((activity?.decisions ?? []).map((decision) => [decision.suggestionKey, decision]));
}

/** Một thẻ gợi ý: gọn một dòng, lý do giấu sau nút mở. */
function SuggestionRow({
    row, config, decision, readOnly, onDecide, pending,
}: {
    row: Record<string, any>;
    config: StepSuggestionConfig;
    decision: StepDecision | undefined;
    readOnly?: boolean;
    onDecide: (outcome: 'accepted' | 'rejected') => void;
    pending: boolean;
}) {
    const [open, setOpen] = useState(false);
    const reason = config.reason?.(row) ?? '';
    const accepted = decision?.outcome === 'accepted';
    const rejected = decision?.outcome === 'rejected';

    return (
        <div className={cn(
            'rounded-lg border px-3 py-2 transition-colors',
            accepted && 'border-success/30 bg-success/5',
            rejected && 'border-border bg-muted/30 opacity-60',
        )}>
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className={cn('truncate text-sm font-medium', rejected && 'line-through')}>
                            {config.title(row)}
                        </span>
                        {accepted && <Badge variant="outline" className="shrink-0 border-success/20 bg-success/10 text-xs text-success">Accepted</Badge>}
                        {rejected && <Badge variant="outline" className="shrink-0 text-xs">Rejected</Badge>}
                    </div>
                    {config.subtitle(row) && (
                        <div className="truncate text-xs text-muted-foreground">{config.subtitle(row)}</div>
                    )}
                </div>

                {reason && (
                    <Button
                        variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-muted-foreground"
                        title="Why the AI suggested this"
                        onClick={() => setOpen((previous) => !previous)}
                    >
                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
                    </Button>
                )}

                {!readOnly && (
                    <div className="flex shrink-0 items-center gap-1">
                        {pending && <Spinner className="h-3.5 w-3.5 text-muted-foreground" />}
                        {decision ? (
                            <Button
                                variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground"
                                title="Undo this decision"
                                disabled={pending}
                                onClick={() => onDecide(accepted ? 'rejected' : 'accepted')}
                            >
                                <Undo2 className="h-3.5 w-3.5" />
                            </Button>
                        ) : (
                            <>
                                <Button
                                    variant="ghost" size="sm" className="h-7 px-2 text-success hover:bg-success/10"
                                    title="Accept" disabled={pending} onClick={() => onDecide('accepted')}
                                >
                                    <Check className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-destructive"
                                    title="Reject" disabled={pending} onClick={() => onDecide('rejected')}
                                >
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Lý do là thứ cần khi người ta phân vân, không phải thứ đọc mỗi lần —
                nên nó nằm sau một cú bấm, không chiếm chỗ mặc định. */}
            {open && reason && (
                <p className="mt-2 border-t pt-2 text-xs leading-relaxed text-muted-foreground">{reason}</p>
            )}
        </div>
    );
}

export function StepWorkspace({ discipline, reportID, activity, readOnly }: Props) {
    const queryClient = useQueryClient();
    const [pendingKey, setPendingKey] = useState<string | null>(null);
    const [showRejected, setShowRejected] = useState(false);
    const config = STEP_SUGGESTIONS[discipline.code];
    const result = parse<Record<string, any>>(discipline.resultJson);
    const rows = suggestionsOf(discipline.code, result);
    const decisions = decisionMap(activity);

    const decide = useMutation({
        mutationFn: (input: { key: string; outcome: 'accepted' | 'rejected'; payload: unknown }) =>
            eightDService.recordSuggestionOutcome({
                reportID, stepCode: discipline.code,
                suggestionKey: input.key, outcome: input.outcome, payload: input.payload,
            }),
        onMutate: (input) => setPendingKey(input.key),
        onSettled: () => setPendingKey(null),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['8d', 'activity', reportID] }),
        onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Could not record that'),
    });

    const acceptAll = useMutation({
        mutationFn: async () => {
            // Tuần tự chứ không Promise.all: mỗi lượt là một INSERT trên cùng
            // một connection SQLite, bắn song song chỉ xếp hàng ở tầng dưới mà
            // còn làm lỗi khó truy hơn.
            for (const { row, key } of keyed) {
                if (decisions.get(key)?.outcome === 'accepted') continue;
                await eightDService.recordSuggestionOutcome({
                    reportID, stepCode: discipline.code,
                    suggestionKey: key, outcome: 'accepted', payload: row,
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['8d', 'activity', reportID] });
            toast.success(`All suggestions accepted for ${discipline.code}`);
        },
        onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Could not accept all'),
    });

    if (!config) return null;

    const accepted = (activity?.decisions ?? []).filter((decision) => decision.outcome === 'accepted');

    // Khoá tính MỘT lần rồi dùng lại: `config.key` phải cho cùng kết quả ở danh
    // sách, ở nút nhận-tất-cả và ở bảng đã chốt, nếu không thì một dòng nhận rồi
    // vẫn hiện như chưa quyết.
    const keyed = rows.map((row, index) => ({ row, key: config.key(row, index) }));
    const rejected = keyed.filter((item) => decisions.get(item.key)?.outcome === 'rejected');
    const visible = keyed.filter((item) => decisions.get(item.key)?.outcome !== 'rejected');
    const undecided = keyed.filter((item) => !decisions.has(item.key));

    return (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">

            {/* ── Gợi ý của AI ── */}
            <Card className="min-w-0 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        {config.suggestTitle}
                    </h3>
                    {!readOnly && config.acceptAllLabel && undecided.length > 1 && (
                        <Button size="sm" variant="outline" disabled={acceptAll.isPending} onClick={() => acceptAll.mutate()}>
                            {acceptAll.isPending ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                            {config.acceptAllLabel}
                        </Button>
                    )}
                </div>

                {rows.length === 0 ? (
                    <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {/* Câu này là một CÂU TRẢ LỜI, không phải một chỗ trống:
                            AI không tìm được gì khác hẳn với AI chưa chạy. */}
                        <span>{config.suggestEmpty}</span>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {visible.map(({ row, key }) => (
                            <SuggestionRow
                                key={key}
                                row={row} config={config}
                                decision={decisions.get(key)}
                                readOnly={readOnly}
                                pending={pendingKey === key && decide.isPending}
                                onDecide={(outcome) => decide.mutate({ key, outcome, payload: row })}
                            />
                        ))}

                        {/* Gợi ý đã từ chối rời khỏi danh sách chính nhưng KHÔNG
                            biến mất: danh sách phải ngắn dần khi người ta làm
                            xong, còn quyết định thì vẫn phải xem lại và rút lại
                            được. */}
                        {rejected.length > 0 && (
                            <div className="pt-1">
                                <button
                                    type="button"
                                    onClick={() => setShowRejected((previous) => !previous)}
                                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                                >
                                    {rejected.length} rejected · {showRejected ? 'hide' : 'show'}
                                </button>
                                {showRejected && (
                                    <div className="mt-2 space-y-2">
                                        {rejected.map(({ row, key }) => (
                                            <SuggestionRow
                                                key={key}
                                                row={row} config={config}
                                                decision={decisions.get(key)}
                                                readOnly={readOnly}
                                                pending={pendingKey === key && decide.isPending}
                                                onDecide={(outcome) => decide.mutate({ key, outcome, payload: row })}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </Card>

            {/* ── Kết quả đã chốt ── */}
            <Card className="min-w-0 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{config.confirmedTitle}</h3>
                    {accepted.length > 0 && (
                        <Badge variant="outline" className="text-xs">{accepted.length}</Badge>
                    )}
                </div>

                {accepted.length === 0 ? (
                    <p className="rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                        {config.confirmedEmpty}
                    </p>
                ) : (
                    <div className="max-w-full overflow-x-auto rounded-lg border">
                        <Table className="table-auto">
                            <TableHeader className="bg-muted/50">
                                <TableRow className="hover:bg-transparent">
                                    {config.columns.map((column) => (
                                        <TableHead key={column.field} className="whitespace-nowrap px-3 py-2 text-xs font-semibold">
                                            {column.label}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {accepted.map((decision) => {
                                    const row = (decision.payload ?? {}) as Record<string, any>;
                                    return (
                                        <TableRow key={decision.suggestionKey}>
                                            {config.columns.map((column) => (
                                                <TableCell key={column.field} className="px-3 py-2 align-top text-xs">
                                                    {String(row[column.field] ?? '—')}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </Card>
        </div>
    );
}
