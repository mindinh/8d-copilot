import { useState } from 'react';
import { Badge, Button, Card, cn } from '@cnma/react-ui';
import {
    Brain, Check, ChevronDown, HelpCircle, Scale, TriangleAlert, X,
} from 'lucide-react';
import type { IndependentAnalysis } from '@/services/eightd-service';

/**
 * Chẩn đoán độc lập của AI.
 *
 * ── Vì sao panel này đứng trên cùng trang chi tiết ──
 * Phần còn lại của báo cáo, dù viết tốt đến đâu, vẫn có thể bị hoài nghi là
 * "AI chỉ định dạng lại dữ liệu có sẵn". Panel này là chỗ duy nhất chứng minh
 * điều ngược lại: kết luận ở đây được rút ra khi chuỗi 5-Why, cờ nguyên nhân
 * gốc, action khắc phục và FMEA đều đã bị cắt khỏi input. Không có gì để chép.
 *
 * ── Vì sao LỆCH được làm nổi hơn TRÙNG ──
 * Trùng nhau chỉ xác nhận điều đã biết. Lệch nhau mới là lúc công cụ tạo ra giá
 * trị: hoặc AI sai và ta học được giới hạn của nó, hoặc kỹ sư sai và ta vừa
 * tránh được một hành động khắc phục nhắm sai chỗ. Cả hai đều đáng nhìn kỹ hơn
 * là một dấu tích màu xanh.
 */

const CATEGORY_STYLES: Record<string, string> = {
    Man: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
    Machine: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
    Method: 'bg-violet-500/10 text-violet-700 border-violet-500/20',
    Material: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
    Measurement: 'bg-teal-500/10 text-teal-700 border-teal-500/20',
    Environment: 'bg-lime-500/10 text-lime-700 border-lime-500/20',
};

function CategoryChip({ category, className }: { category: string | null; className?: string }) {
    if (!category) return <span className="text-muted-foreground text-sm">—</span>;
    return (
        <Badge
            variant="outline"
            className={cn(
                'font-semibold text-sm px-2.5 py-0.5',
                CATEGORY_STYLES[category] ?? 'bg-muted text-muted-foreground',
                className,
            )}
        >
            {category}
        </Badge>
    );
}

export function ReasoningPanel({ analysis }: { analysis: IndependentAnalysis }) {
    const [open, setOpen] = useState(false);
    const { finding, verdict, leaks } = analysis;
    const agrees = verdict.agrees;

    return (
        <Card
            className={cn(
                'p-0 overflow-hidden border-2',
                agrees ? 'border-emerald-500/30' : 'border-amber-500/50',
            )}
        >
            {/* ── Đầu panel ── */}
            <div className={cn('px-5 py-4', agrees ? 'bg-emerald-500/[0.04]' : 'bg-amber-500/[0.06]')}>
                <div className="flex items-start gap-3">
                    <div
                        className={cn(
                            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                            agrees ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700',
                        )}
                    >
                        <Brain className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="font-semibold text-sm">Independent diagnosis</h2>
                            <Badge variant="outline" className="text-[10px] font-normal">
                                answer withheld from the model
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            The recorded 5-Why chain, root cause flag, corrective actions and FMEA link were
                            removed before this analysis ran. The conclusion below was reached from the raw
                            measurements and investigation findings alone.
                        </p>
                    </div>
                </div>

                {/* ── Đối chiếu ── */}
                <div className="flex items-center gap-3 md:gap-5 mt-4 flex-wrap">
                    <div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                            Quality engineer
                        </div>
                        <CategoryChip category={verdict.recordedCategory} />
                    </div>

                    <div
                        className={cn(
                            'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
                            agrees
                                ? 'bg-emerald-500/10 text-emerald-700'
                                : 'bg-amber-500/15 text-amber-800',
                        )}
                    >
                        {agrees ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        {agrees ? 'Same conclusion' : 'Different conclusion'}
                    </div>

                    <div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                            AI, unaided
                        </div>
                        <CategoryChip category={finding.rootCauseCategory} />
                    </div>

                    <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                            confidence{' '}
                            <span className="font-semibold text-foreground tabular-nums">
                                {Math.round(finding.confidence * 100)}%
                            </span>
                        </span>
                        <span>
                            5-Why depth{' '}
                            <span className="font-semibold text-foreground tabular-nums">
                                {verdict.aiStepCount}
                            </span>{' '}
                            vs {verdict.recordedStepCount}
                        </span>
                    </div>
                </div>

                <p className="text-sm mt-3 leading-relaxed">{finding.rootCauseStatement}</p>

                {!agrees && (
                    <div className="flex items-start gap-2 mt-3 text-xs text-amber-800 bg-amber-500/10 rounded-lg px-3 py-2">
                        <Scale className="w-4 h-4 shrink-0 mt-px" />
                        <span>
                            A disagreement is not proof that either side is wrong. Read the reasoning below and
                            the evidence it cites before deciding which conclusion the data supports.
                        </span>
                    </div>
                )}

                {/*
                  Rò đáp án nghĩa là bài kiểm tra độc lập không còn độc lập, và
                  mọi kết luận phía trên mất giá trị. Phải nói thẳng, không giấu.
                */}
                {leaks?.length > 0 && (
                    <div className="flex items-start gap-2 mt-3 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                        <TriangleAlert className="w-4 h-4 shrink-0 mt-px" />
                        <span>
                            The blind evidence check found {leaks.length} leak
                            {leaks.length === 1 ? '' : 's'}: {leaks.join(' ')} This diagnosis may not be
                            independent.
                        </span>
                    </div>
                )}

                <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 -ml-2"
                    onClick={() => setOpen((v) => !v)}
                >
                    <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
                    {open ? 'Hide reasoning' : 'Show reasoning'}
                </Button>
            </div>

            {/* ── Chi tiết ── */}
            {open && (
                <div className="px-5 py-5 space-y-5 border-t border-border/60">

                    <section>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                            5-Why chain the AI built itself
                        </h3>
                        <ol className="space-y-3">
                            {finding.derivedFiveWhy.map((step) => (
                                <li key={step.stepNo} className="flex gap-3">
                                    <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center mt-0.5">
                                        {step.stepNo}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium">{step.question}</p>
                                        <p className="text-sm text-foreground/80 mt-0.5">{step.answer}</p>
                                        <p className="text-xs text-muted-foreground mt-1 italic">
                                            {step.evidence}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </section>

                    <section>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                            Branches ruled out
                        </h3>
                        <div className="space-y-2">
                            {finding.ruledOut.map((r) => (
                                <div key={r.category} className="flex gap-3 items-start">
                                    <CategoryChip category={r.category} className="shrink-0 opacity-60" />
                                    <p className="text-sm text-foreground/80">{r.reason}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {finding.runnerUpCategory && (
                        <section>
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                Next most likely, and what would change the verdict
                            </h3>
                            <div className="flex gap-3 items-start">
                                <CategoryChip category={finding.runnerUpCategory} className="shrink-0" />
                                <p className="text-sm text-foreground/80">{finding.runnerUpReason}</p>
                            </div>
                        </section>
                    )}

                    {finding.evidenceGaps.length > 0 && (
                        <section>
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                                <HelpCircle className="w-3.5 h-3.5" />
                                Evidence the AI would ask for
                            </h3>
                            <ul className="space-y-1.5">
                                {finding.evidenceGaps.map((g, i) => (
                                    <li key={i} className="flex gap-2 text-sm text-foreground/80">
                                        <span className="text-muted-foreground">·</span>
                                        <span>{g}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
            )}
        </Card>
    );
}
