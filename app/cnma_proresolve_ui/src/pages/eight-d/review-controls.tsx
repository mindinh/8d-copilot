import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Textarea, cn } from '@cnma/react-ui';
import { Check, Lock, LockOpen, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    reviewDiscipline,
    reviewStatusOf,
    type Discipline8D,
    type ReviewDecision,
    type ReviewStatus,
} from '@/services/eightd-service';

/**
 * Duyệt từng bước 8D.
 *
 * ── Vì sao tồn tại ──
 * AI chỉ soạn nháp. Không bước nào được coi là chốt cho tới khi một kỹ sư chất
 * lượng bấm duyệt, và case chỉ đóng được khi D1-D7 đều đã duyệt. Trước khi có
 * màn hình này, báo cáo là một tài liệu để đọc; giờ nó là việc để làm, và câu
 * hỏi đầu tiên của mọi cuộc audit — "ai duyệt, lúc nào" — có câu trả lời.
 *
 * Server mới là nơi quyết định: nó lấy danh tính người bấm từ ngữ cảnh xác thực,
 * bắt buộc có lý do khi trả lại, và tự tính lại cổng đóng case. Ở đây chỉ hiển
 * thị và gửi đi.
 */

const STATUS_STYLE: Record<ReviewStatus, { label: string; dot: string; text: string }> = {
    Draft: { label: 'Draft', dot: 'bg-muted-foreground/50', text: 'text-muted-foreground' },
    Approved: { label: 'Approved', dot: 'bg-success', text: 'text-success' },
    ChangeRequested: { label: 'Change requested', dot: 'bg-warning', text: 'text-warning' },
};

export function ReviewStatusDot({ status, className }: { status: ReviewStatus; className?: string }) {
    return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', STATUS_STYLE[status].dot, className)} />;
}

/** Dải tổng quan đầu trang: đã duyệt mấy bước, cái gì đang chặn đóng case. */
export function ClosureGateBar({ disciplines }: { disciplines: Discipline8D[] }) {
    // Tính tại chỗ từ dữ liệu đã tải: server cũng trả `gate` sau mỗi lần bấm,
    // nhưng dải này phải đúng ngay khi mở trang, trước khi ai bấm gì.
    const prerequisites = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];
    const byCode = new Map(disciplines.map((d) => [d.code, reviewStatusOf(d)]));
    const blocking = prerequisites.filter((code) => byCode.get(code) !== 'Approved');
    const approved = prerequisites.length - blocking.length;
    const canClose = blocking.length === 0;
    const pct = Math.round((approved / prerequisites.length) * 100);

    return (
        <div className={cn(
            'rounded-lg border px-4 py-3',
            canClose ? 'border-success/30 bg-success/[0.04]' : 'border-border bg-muted/20',
        )}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {canClose
                    ? <LockOpen className="h-4 w-4 shrink-0 text-success" />
                    : <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />}

                <span className="text-sm font-semibold">
                    {approved} of {prerequisites.length} disciplines approved
                </span>

                <div className="h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-border">
                    <div
                        className={cn('h-full rounded-full transition-all', canClose ? 'bg-success' : 'bg-primary')}
                        style={{ width: `${pct}%` }}
                    />
                </div>

                <span className="text-xs text-muted-foreground">
                    {canClose
                        ? 'D1–D7 signed off — the case can be closed.'
                        : <>Closure blocked by <strong className="font-medium text-foreground">{blocking.join(', ')}</strong></>}
                </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
                {disciplines.map((d) => {
                    const status = reviewStatusOf(d);
                    return (
                        <span
                            key={d.ID}
                            title={`${d.code} — ${STATUS_STYLE[status].label}`}
                            className={cn(
                                'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium',
                                status === 'Approved' && 'border-success/30 text-success',
                                status === 'ChangeRequested' && 'border-warning/40 text-warning',
                                status === 'Draft' && 'border-border text-muted-foreground',
                            )}
                        >
                            <ReviewStatusDot status={status} />
                            {d.code}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}

/** Ô quyết định nằm dưới nội dung của một bước. */
export function DisciplineReviewBox({ discipline }: { discipline: Discipline8D }) {
    const queryClient = useQueryClient();
    const status = reviewStatusOf(discipline);
    const [noteOpen, setNoteOpen] = useState(false);
    const [note, setNote] = useState('');

    const submit = useMutation({
        mutationFn: ({ decision, text }: { decision: ReviewDecision; text?: string }) =>
            reviewDiscipline(discipline.ID, decision, text),
        onSuccess: (result) => {
            setNoteOpen(false);
            setNote('');
            toast.success(`${result.code} — ${STATUS_STYLE[result.toStatus].label}`, {
                description: result.gate.reason,
            });
            void queryClient.invalidateQueries({ queryKey: ['8d'] });
        },
        onError: (e: any) => {
            toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Could not save the review.');
        },
    });

    const busy = submit.isPending;

    return (
        <div className="mt-4 rounded-lg border bg-muted/20 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className={cn('flex items-center gap-1.5 text-sm font-semibold', STATUS_STYLE[status].text)}>
                        <ReviewStatusDot status={status} />
                        {STATUS_STYLE[status].label}
                    </div>
                    {discipline.reviewedBy && discipline.reviewedAt && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {status === 'Draft' ? 'Reopened' : status === 'Approved' ? 'Approved' : 'Returned'} by{' '}
                            <strong className="font-medium text-foreground">{discipline.reviewedBy}</strong>
                            {' · '}
                            {new Date(discipline.reviewedAt).toLocaleString()}
                        </p>
                    )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {status === 'Approved' ? (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => submit.mutate({ decision: 'reopen' })}
                        >
                            <Undo2 className="h-4 w-4" />
                            Reopen
                        </Button>
                    ) : (
                        <>
                            <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => submit.mutate({ decision: 'approve' })}
                            >
                                <Check className="h-4 w-4" />
                                Complete
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Lý do trả lại đã ghi lần trước — người sửa cần đọc nó, không phải đi tìm. */}
            {status === 'ChangeRequested' && discipline.reviewNote && !noteOpen && (
                <p className="mt-2 rounded border border-warning/30 bg-warning/[0.06] px-3 py-2 text-xs">
                    <strong className="font-semibold">Change requested:</strong> {discipline.reviewNote}
                </p>
            )}

            {noteOpen && (
                <div className="mt-3 space-y-2">
                    <Textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={500}
                        disabled={busy}
                        placeholder="What has to change before this discipline can be approved?"
                        className="h-20 text-xs"
                    />
                    <div className="flex items-center gap-2">
                        {/* Server cũng chặn note rỗng — chặn ở đây chỉ để khỏi mất một vòng mạng. */}
                        <Button
                            size="sm"
                            disabled={busy || !note.trim()}
                            onClick={() => submit.mutate({ decision: 'request-change', text: note.trim() })}
                        >
                            Send back
                        </Button>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setNoteOpen(false)}>
                            Cancel
                        </Button>
                        <span className="ml-auto text-[11px] text-muted-foreground">{note.length}/500</span>
                    </div>
                </div>
            )}
        </div>
    );
}
