import { Check } from 'lucide-react';
import { cn } from '@cnma/react-ui';
import { reviewStatusOf, type Discipline8D, type ReviewStatus } from '@/services/eightd-service';

/**
 * Cột trái: tiến độ tám bước và điều hướng giữa chúng.
 *
 * ── Vì sao dọc chứ không phải tab ngang ──
 * 8D là một QUY TRÌNH có thứ tự, không phải tám ngăn ngang hàng. Tab ngang nói
 * "chọn cái nào cũng được"; danh sách dọc kèm trạng thái nói "đi từ trên xuống,
 * còn mấy bước nữa". Nó cũng là chỗ duy nhất trên trang trả lời được câu hỏi đầu
 * tiên của người mở case: còn bao nhiêu bước chưa ký.
 */

/**
 * Nhãn ngắn cho từng bước.
 *
 * Không dùng `discipline.title` từ dữ liệu: tiêu đề đầy đủ ("Interim Containment
 * Actions") dài gấp ba chiều rộng cột và bị cắt cụt. Cột này để quét, không để đọc.
 */
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
}: {
    disciplines: Discipline8D[];
    active: string;
    onSelect: (code: string) => void;
}) {
    const total = disciplines.length || 8;
    const approved = disciplines.filter((d) => reviewStatusOf(d) === 'Approved').length;
    const pct = total > 0 ? (approved / total) * 100 : 0;

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
                {disciplines.map((discipline, index) => {
                    const status = reviewStatusOf(discipline);
                    const isActive = discipline.code === active;
                    const done = status === 'Approved';

                    return (
                        <button
                            key={discipline.ID}
                            type="button"
                            onClick={() => onSelect(discipline.code)}
                            className={cn(
                                'flex w-full min-w-0 items-start gap-2.5 px-3 py-2.5 text-left transition-colors',
                                // Vạch dọc bên trái đánh dấu bước đang mở — cùng ngôn ngữ
                                // với thanh điều hướng của SAP Fiori.
                                isActive
                                    ? 'border-l-2 border-l-primary bg-primary/[0.06]'
                                    : 'border-l-2 border-l-transparent hover:bg-muted/60',
                            )}
                        >
                            <span
                                className={cn(
                                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                                    done && 'bg-success text-success-foreground',
                                    !done && status === 'ChangeRequested' && 'bg-warning text-warning-foreground',
                                    !done && status === 'Draft' && 'border border-border text-muted-foreground',
                                )}
                            >
                                {done ? <Check className="h-3 w-3" /> : index + 1}
                            </span>

                            <span className="min-w-0">
                                <span
                                    className={cn(
                                        'block truncate text-[13px]',
                                        isActive ? 'font-semibold text-foreground' : 'font-medium',
                                    )}
                                >
                                    {discipline.code} · {STEP_LABELS[discipline.code] ?? discipline.title}
                                </span>
                                <span
                                    className={cn(
                                        'block text-[11px]',
                                        done ? 'text-success'
                                            : status === 'ChangeRequested' ? 'text-warning'
                                                : 'text-muted-foreground',
                                    )}
                                >
                                    {STATUS_TEXT[status]}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}
