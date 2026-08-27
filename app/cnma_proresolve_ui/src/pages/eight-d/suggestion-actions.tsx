import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Spinner, cn } from '@cnma/react-ui';
import { Check, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { eightDService, type SuggestionOutcome } from '@/services/eightd-service';

/**
 * Nút nhận / sửa / từ chối cho MỘT đề xuất.
 *
 * Dùng chung cho mọi bước: các slice sau (người ở D1, bài học ở D8) chỉ truyền
 * `suggestionKey` khác nhau, không dựng lại bộ nút.
 *
 * ── `suggestionKey` phải ổn định giữa hai lần vẽ ──
 * Nó là danh tính của đề xuất trong vết audit. Lấy theo chỉ số mảng thì chèn
 * một dòng ở đầu là mọi vết cũ trỏ sang đề xuất khác. Dùng thứ gì thuộc về bản
 * thân đề xuất — mã người, mã case, mã hành động.
 */

interface Props {
    reportID: string;
    stepCode: string;
    suggestionKey: string;
    /** Nội dung đề xuất tại thời điểm thao tác — lưu vào vết audit. */
    payload?: unknown;
    /** Thao tác gần nhất trên đề xuất này, để tô nút đang có hiệu lực. */
    current?: SuggestionOutcome | null;
    /** Bỏ nút Edit ở những chỗ không sửa tại chỗ được. */
    allowEdit?: boolean;
    readOnly?: boolean;
    onEdit?: () => void;
}

export function SuggestionActions({
    reportID, stepCode, suggestionKey, payload, current, allowEdit, readOnly, onEdit,
}: Props) {
    const queryClient = useQueryClient();

    const record = useMutation({
        mutationFn: (outcome: Exclude<SuggestionOutcome, 'shown'>) =>
            eightDService.recordSuggestionOutcome({ reportID, stepCode, suggestionKey, outcome, payload }),
        onSuccess: (_rows, outcome) => {
            queryClient.invalidateQueries({ queryKey: ['8d', 'activity', reportID] });
            toast.success(outcome === 'accepted' ? 'Suggestion accepted' : 'Suggestion rejected');
        },
        onError: (e: any) => {
            toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Could not record that');
        },
    });

    if (readOnly) return null;

    return (
        <div className="flex shrink-0 items-center gap-1">
            {record.isPending && <Spinner className="h-3.5 w-3.5 text-muted-foreground" />}

            <Button
                variant="ghost"
                size="sm"
                title="Accept this suggestion"
                disabled={record.isPending}
                className={cn('h-7 px-2', current === 'accepted' && 'bg-success/10 text-success')}
                onClick={() => record.mutate('accepted')}
            >
                <Check className="h-3.5 w-3.5" />
            </Button>

            {allowEdit && (
                <Button
                    variant="ghost"
                    size="sm"
                    title="Edit before accepting"
                    disabled={record.isPending}
                    className={cn('h-7 px-2', current === 'edited' && 'bg-info/10 text-info')}
                    onClick={onEdit}
                >
                    <Pencil className="h-3.5 w-3.5" />
                </Button>
            )}

            <Button
                variant="ghost"
                size="sm"
                title="Reject this suggestion"
                disabled={record.isPending}
                className={cn('h-7 px-2', current === 'rejected' && 'bg-destructive/10 text-destructive')}
                onClick={() => record.mutate('rejected')}
            >
                <X className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}
