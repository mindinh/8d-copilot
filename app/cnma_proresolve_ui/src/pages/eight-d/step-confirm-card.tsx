import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Spinner, cn } from '@cnma/react-ui';
import { Check, Info, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { eightDService, type Discipline8D, type StepActivity } from '@/services/eightd-service';
import { readPath, STEP_CONFIRMATIONS } from './step-suggestion-config';

/**
 * Chốt MỘT kết luận — dùng cho D2 và D4.
 *
 * Khác `StepWorkspace` ở chỗ không có gì để chọn giữa: chỉ một kết luận, và câu
 * hỏi là đồng ý hay không. Vẫn đi qua đúng đường ghi vết như mọi quyết định
 * khác, nên trạng thái "In review" và bảng kiểm toán không phải biết đây là ca
 * đặc biệt.
 *
 * ── Vì sao D4 đáng có nút riêng thay vì chỉ "Mark complete" ──
 * Xác nhận nguyên nhân gốc là phán quyết nặng nhất trong một 8D, và là điều mà
 * quy tắc cấm AI tự làm. Ghi nó thành một quyết định riêng, có tên người và mốc
 * thời gian, thì sau này còn trả lời được "ai đã đồng ý với kết luận này" —
 * "bước đã hoàn thành" không trả lời được câu đó.
 */

interface Props {
    discipline: Discipline8D;
    reportID: string;
    activity: StepActivity | null;
    readOnly?: boolean;
}

export function StepConfirmCard({ discipline, reportID, activity, readOnly }: Props) {
    const queryClient = useQueryClient();
    const config = STEP_CONFIRMATIONS[discipline.code];

    const decide = useMutation({
        mutationFn: (outcome: 'accepted' | 'rejected') =>
            eightDService.recordSuggestionOutcome({
                reportID, stepCode: discipline.code,
                suggestionKey: config.key, outcome, payload: { statement },
            }),
        onSuccess: (_rows, outcome) => {
            queryClient.invalidateQueries({ queryKey: ['8d', 'activity', reportID] });
            toast.success(outcome === 'accepted' ? `${config.title} confirmed` : `${config.title} rejected`);
        },
        onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Could not record that'),
    });

    if (!config) return null;

    let result: Record<string, any> | null = null;
    try { result = discipline.resultJson ? JSON.parse(discipline.resultJson) : null; } catch { result = null; }

    const statement = String(readPath(result, config.path) ?? '').trim();
    const decision = (activity?.decisions ?? []).find((item) => item.suggestionKey === config.key);
    const confirmed = decision?.outcome === 'accepted';
    const rejected = decision?.outcome === 'rejected';
    const meta = result ? config.meta?.(result) ?? '' : '';

    return (
        <Card className={cn(
            'min-w-0 p-4 transition-colors',
            confirmed && 'border-success/30 bg-success/5',
            rejected && 'border-destructive/30 bg-destructive/5',
        )}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{config.title}</h3>
                {confirmed && (
                    <Badge variant="outline" className="border-success/20 bg-success/10 text-xs text-success">
                        Confirmed{decision?.decidedBy ? ` by ${decision.decidedBy}` : ''}
                    </Badge>
                )}
                {rejected && <Badge variant="outline" className="text-xs">Rejected — needs rework</Badge>}
            </div>

            {statement ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{statement}</p>
            ) : (
                <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {/* Không có kết luận là một câu trả lời hợp lệ — với D4 nó
                        nghĩa là bằng chứng chưa đủ, không phải là màn hình lỗi. */}
                    <span>{config.empty}</span>
                </div>
            )}

            {meta && <p className="mt-2 text-xs text-muted-foreground">{meta}</p>}

            {!readOnly && statement && (
                <div className="mt-3 flex items-center gap-2 border-t pt-3">
                    {decide.isPending && <Spinner className="h-3.5 w-3.5 text-muted-foreground" />}
                    {decision ? (
                        <Button
                            variant="ghost" size="sm" disabled={decide.isPending}
                            onClick={() => decide.mutate(confirmed ? 'rejected' : 'accepted')}
                        >
                            <Undo2 className="h-3.5 w-3.5" />
                            {confirmed ? 'Withdraw confirmation' : 'Confirm after all'}
                        </Button>
                    ) : (
                        <>
                            <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate('accepted')}>
                                <Check className="h-3.5 w-3.5" />
                                {config.confirmLabel}
                            </Button>
                            <Button
                                variant="ghost" size="sm" disabled={decide.isPending}
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => decide.mutate('rejected')}
                            >
                                <X className="h-3.5 w-3.5" />
                                Reject
                            </Button>
                        </>
                    )}
                </div>
            )}
        </Card>
    );
}
