import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Spinner, cn } from '@cnma/react-ui';
import { Check, CheckCircle2, PenLine, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
    eightDService,
    type DerivedStepState,
    type StepActivity,
} from '@/services/eightd-service';

/**
 * Vỏ dùng chung cho mọi bước D: viên trạng thái + nút duyệt / mở lại.
 *
 * ── Vì sao một component cho cả tám bước ──
 * Trạng thái duyệt là cùng một khái niệm ở D1 và ở D8; dựng riêng cho từng bước
 * là tám nơi để chúng trông khác nhau và tám nơi phải sửa khi luật đổi. Các
 * slice sau chỉ cắm thêm phần nội dung riêng của bước, không dựng lại thanh này.
 *
 * ── 'In review' không phải một nút ──
 * Nó không do ai bấm mà được server suy ra từ vết accepted/edited. Ở đây chỉ
 * hiện, không bao giờ đặt — nếu UI đặt được nó thì nó đã là trạng thái lưu, và
 * ta cố tình không làm thế.
 */

const STATE_STYLE: Record<DerivedStepState, { label: string; className: string; icon: typeof Check }> = {
    Draft: {
        label: 'Draft',
        className: 'bg-muted text-muted-foreground border-border',
        icon: PenLine,
    },
    InReview: {
        label: 'In review',
        className: 'bg-info/10 text-info border-info/20',
        icon: PenLine,
    },
    Complete: {
        label: 'Complete',
        className: 'bg-success/10 text-success border-success/20',
        icon: CheckCircle2,
    },
};

export function StepStateBadge({ state, className }: { state: DerivedStepState; className?: string }) {
    const style = STATE_STYLE[state];
    const Icon = style.icon;
    return (
        <Badge variant="outline" className={cn('gap-1 text-xs font-medium', style.className, className)}>
            <Icon className="h-3 w-3" />
            {style.label}
        </Badge>
    );
}

interface Props {
    reportID: string;
    /** Dòng activity của bước này. `null` khi report chưa có (báo cáo cũ). */
    activity: StepActivity | null;
    /** Case đã đóng ⇒ khoá mọi thao tác duyệt. */
    readOnly?: boolean;
}

export function StepStatusBar({ reportID, activity, readOnly }: Props) {
    const queryClient = useQueryClient();

    const setStatus = useMutation({
        mutationFn: (status: 'Draft' | 'Complete') =>
            eightDService.setDisciplineStatus(activity!.disciplineID, status),
        onSuccess: (row) => {
            queryClient.invalidateQueries({ queryKey: ['8d', 'activity', reportID] });
            toast.success(
                row.stepStatus === 'Complete'
                    ? `${row.code} marked complete`
                    : `${row.code} reopened`,
            );
        },
        onError: (e: any) => {
            // Cổng D8 trả 409 kèm danh sách bước còn thiếu — hiện nguyên văn,
            // vì câu đó đã nói đúng cần làm gì tiếp theo.
            toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Could not change status');
        },
    });

    if (!activity) return null;
    const complete = activity.stepStatus === 'Complete';
    const { accepted, rejected, edited } = activity.counts;
    const handled = accepted + rejected + edited;

    return (
        <div className="flex flex-wrap items-center gap-2">
            <StepStateBadge state={activity.state} />

            {handled > 0 && (
                <span className="text-xs text-muted-foreground">
                    {accepted > 0 && `${accepted} accepted`}
                    {accepted > 0 && (rejected > 0 || edited > 0) && ' · '}
                    {edited > 0 && `${edited} edited`}
                    {edited > 0 && rejected > 0 && ' · '}
                    {rejected > 0 && `${rejected} rejected`}
                </span>
            )}

            {complete && activity.approvedBy && (
                <span className="text-xs text-muted-foreground">
                    by {activity.approvedBy}
                    {activity.approvedAt
                        && ` · ${new Date(activity.approvedAt).toLocaleDateString('en-GB')}`}
                </span>
            )}

            {!readOnly && (
                <Button
                    variant={complete ? 'ghost' : 'outline'}
                    size="sm"
                    className="ml-auto"
                    disabled={setStatus.isPending}
                    onClick={() => setStatus.mutate(complete ? 'Draft' : 'Complete')}
                >
                    {setStatus.isPending
                        ? <Spinner className="h-3.5 w-3.5" />
                        : complete
                            ? <RotateCcw className="h-3.5 w-3.5" />
                            : <Check className="h-3.5 w-3.5" />}
                    {complete ? 'Reopen' : 'Mark complete'}
                </Button>
            )}
        </div>
    );
}
