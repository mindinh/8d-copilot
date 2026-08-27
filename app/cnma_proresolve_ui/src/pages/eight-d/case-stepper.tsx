import { Check, Loader2 } from 'lucide-react';
import { cn } from '@cnma/react-ui';
import { reviewStatusOf, type Discipline8D, type ReviewStatus } from '@/services/eightd-service';
import { blockedBy, stepProgress, type StepCode } from '../../../../../shared/step-status';

/**
 * Cột trái: tiến độ tám bước và điều hướng giữa chúng.
 * Hiển thị toàn bộ 8D steps D1..D8 từ đầu và cập nhật trạng thái thời gian thực.
 */
const STEP_CODES = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'] as const;

const STEP_LABELS: Record<string, string> = {
    D1: 'Team',
    D2: 'Problem',
    D3: 'Containment',
    D4: 'Root Cause',
    D5: 'Corrective',
    D6: 'Implement',
    D7: 'Preventive',
    D8: 'Closure',
};

const STATUS_TEXT: Record<ReviewStatus, string> = {
    Approved: 'Complete',
    ChangeRequested: 'Changes requested',
    Draft: 'Not started',
};

export function CaseStepper({
    disciplines,
    active,
    onSelect,
    isAnalyzing = false,
}: {
    disciplines: Discipline8D[];
    active: string;
    onSelect: (code: string) => void;
    isAnalyzing?: boolean;
}) {
    const total = 8;
    const approved = disciplines.filter((d) => reviewStatusOf(d) === 'Approved').length;
    const pct = (approved / total) * 100;
    const byCode = new Map(disciplines.map((d) => [d.code, d]));
    const completedCodes = new Set(disciplines.map((d) => d.code));

    return (
        <div className="min-w-0">
            <div className="px-3 pb-3">
                <div className="text-xs font-medium text-muted-foreground">Completeness</div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
                    <div
                        className={cn(
                            'h-full rounded-full transition-all',
                            approved === total ? 'bg-success' : 'bg-primary',
                        )}
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <div className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                    {approved}/{total} steps complete
                </div>
            </div>

            <nav className="min-w-0">
                {STEP_CODES.map((code, index) => {
                    const discipline = byCode.get(code);
                    const isActive = code === active;

                    let statusText = 'Pending';
                    let done = false;
                    let isCurrentAnalyzing = false;

                    if (discipline) {
                        const revStatus = reviewStatusOf(discipline);
                        done = revStatus === 'Approved';
                        statusText = STATUS_TEXT[revStatus];
                    } else if (isAnalyzing) {
                        // Backend sinh theo ĐỢT song song, nên bước về đích không
                        // theo thứ tự D1..D8 và không phải bước nào chưa có dữ
                        // liệu cũng đang chạy. Suy trạng thái từ chính đồ thị phụ
                        // thuộc: bước đã đủ tiền đề mới là đang sinh, còn lại là
                        // đang chờ — và nói rõ chờ ai.
                        const progress = stepProgress(code as StepCode, completedCodes, true);
                        isCurrentAnalyzing = progress === 'generating';
                        statusText = isCurrentAnalyzing
                            ? 'Generating...'
                            : `Waiting for ${blockedBy(code as StepCode, completedCodes).join(', ')}`;
                    }

                    return (
                        <button
                            key={code}
                            type="button"
                            onClick={() => onSelect(code)}
                            className={cn(
                                'flex w-full min-w-0 items-start gap-2.5 px-3 py-2.5 text-left transition-colors',
                                isActive
                                    ? 'border-l-2 border-l-primary bg-primary/[0.06]'
                                    : 'border-l-2 border-l-transparent hover:bg-muted/60',
                            )}
                        >
                            <span
                                className={cn(
                                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                                    done && 'bg-success text-success-foreground',
                                    !done && discipline && reviewStatusOf(discipline) === 'ChangeRequested' && 'bg-warning text-warning-foreground',
                                    !done && discipline && reviewStatusOf(discipline) === 'Draft' && 'border border-border text-muted-foreground',
                                    !discipline && isCurrentAnalyzing && 'border border-info text-info bg-info/10',
                                    !discipline && !isCurrentAnalyzing && 'border border-border/50 text-muted-foreground/50',
                                )}
                            >
                                {done ? (
                                    <Check className="h-3 w-3" />
                                ) : isCurrentAnalyzing ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                    index + 1
                                )}
                            </span>

                            <span className="min-w-0">
                                <span
                                    className={cn(
                                        'block truncate text-[13px]',
                                        isActive ? 'font-semibold text-foreground' : 'font-medium',
                                        !discipline && !isCurrentAnalyzing && 'text-muted-foreground/70',
                                    )}
                                >
                                    {code} · {STEP_LABELS[code]}
                                </span>
                                <span
                                    className={cn(
                                        'block text-[11px]',
                                        done ? 'text-success'
                                            : discipline && reviewStatusOf(discipline) === 'ChangeRequested' ? 'text-warning'
                                                : isCurrentAnalyzing ? 'text-info font-medium'
                                                    : 'text-muted-foreground',
                                    )}
                                >
                                    {statusText}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}
