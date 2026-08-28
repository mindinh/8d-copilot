import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    cn,
} from '@cnma/react-ui';
import { Lock, LockOpen } from 'lucide-react';
import { toast } from 'sonner';
import {
    reviewDiscipline,
    reviewStatusOf,
    setDisciplineWorkState,
    type Discipline8D,
    type ReviewDecision,
    type ReviewStatus,
} from '@/services/eightd-service';

/**
 * Duyệt từng bước 8D.
 */

const STATUS_STYLE: Record<ReviewStatus, { label: string; dot: string; text: string }> = {
    Draft: { label: 'Draft', dot: 'bg-muted-foreground/50', text: 'text-muted-foreground' },
    Approved: { label: 'Complete', dot: 'bg-success', text: 'text-success' },
    ChangeRequested: { label: 'Change requested', dot: 'bg-warning', text: 'text-warning' },
};

export function ReviewStatusDot({ status, className }: { status: ReviewStatus; className?: string }) {
    return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', STATUS_STYLE[status].dot, className)} />;
}

/** Dải tổng quan đầu trang: đã duyệt mấy bước, cái gì đang chặn đóng case. */
export function ClosureGateBar({ disciplines }: { disciplines: Discipline8D[] }) {
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
                    {approved} of {prerequisites.length} disciplines complete
                </span>

                <div className="h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-border">
                    <div
                        className={cn('h-full rounded-full transition-all', canClose ? 'bg-success' : 'bg-primary')}
                        style={{ width: `${pct}%` }}
                    />
                </div>

                <span className="text-xs text-muted-foreground">
                    {canClose
                        ? 'D1–D7 completed — the case can be closed.'
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

/** Ô quyết định và trạng thái nằm dưới nội dung của một bước. */
export function DisciplineReviewBox({
    discipline,
}: {
    discipline: Discipline8D;
    liveFormSchemaJson?: string | null;
}) {
    const queryClient = useQueryClient();
    const isApproved = reviewStatusOf(discipline) === 'Approved';
    const currentStatus: 'NotStarted' | 'InProgress' | 'Completed' = isApproved
        ? 'Completed'
        : (discipline.workState === 'InProgress' ? 'InProgress' : 'NotStarted');

    const submit = useMutation({
        mutationFn: ({ decision, text }: { decision: ReviewDecision; text?: string }) =>
            reviewDiscipline(discipline.ID, decision, text),
        onSuccess: (result) => {
            toast.success(`${result.code} — ${result.toStatus === 'Approved' ? 'Complete' : 'In process'}`, {
                description: result.gate.reason,
            });
            void queryClient.invalidateQueries({ queryKey: ['8d'] });
        },
        onError: (e: any) => {
            toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Could not save the review.');
        },
    });

    const busy = submit.isPending;

    const handleStatusChange = async (value: 'NotStarted' | 'InProgress' | 'Completed') => {
        if (value === currentStatus) return;

        try {
            if (value === 'Completed') {
                submit.mutate({ decision: 'approve' });
            } else {
                if (isApproved) {
                    await reviewDiscipline(discipline.ID, 'reopen');
                }
                await setDisciplineWorkState(discipline.ID, value);
                toast.success(`Status: ${value === 'InProgress' ? 'In process' : 'Not started'}`);
                void queryClient.invalidateQueries({ queryKey: ['8d'] });
            }
        } catch (err: any) {
            toast.error(err?.response?.data?.error?.message ?? err?.message ?? 'Could not update status.');
        }
    };

    return (
        <div className="mt-4 rounded-lg border bg-muted/20 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold tracking-tight text-foreground">
                            {discipline.code} — {discipline.title}
                        </span>
                    </div>

                    {discipline.reviewedBy && discipline.reviewedAt && currentStatus === 'Completed' ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Completed by <strong className="font-medium text-foreground">{discipline.reviewedBy}</strong>
                            {' · '}
                            {new Date(discipline.reviewedAt).toLocaleString()}
                        </p>
                    ) : (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {currentStatus === 'InProgress'
                                ? 'Discipline investigation and actions are currently in progress'
                                : 'Discipline work has not been started yet'}
                        </p>
                    )}
                </div>

                <div className="flex shrink-0 items-center gap-2.5">
                    <Select
                        value={currentStatus}
                        disabled={busy}
                        onValueChange={(val) => handleStatusChange(val as 'NotStarted' | 'InProgress' | 'Completed')}
                    >
                        <SelectTrigger className="h-8 w-[130px] px-2.5 text-xs font-semibold bg-background">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="NotStarted">
                                <div className="flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                                    <span>Not started</span>
                                </div>
                            </SelectItem>
                            <SelectItem value="InProgress">
                                <div className="flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                    <span>In process</span>
                                </div>
                            </SelectItem>
                            <SelectItem value="Completed">
                                <div className="flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                                    <span>Complete</span>
                                </div>
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>
    );
}
