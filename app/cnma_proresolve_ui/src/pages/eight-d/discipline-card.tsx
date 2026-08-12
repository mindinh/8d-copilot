import { useState } from 'react';
import { Badge, Card, cn } from '@cnma/react-ui';
import { ChevronDown, TriangleAlert } from 'lucide-react';
import { parseList, type Discipline8D } from '@/services/eightd-service';
import { Markdown } from './markdown';

/**
 * Một discipline trong dòng thời gian 8D.
 *
 * ── Vì sao `dataBacked` được nhấn mạnh đến thế ──
 * Dataset không có dữ liệu verification, nên D6 luôn là ĐỀ XUẤT chứ không phải
 * sự thật đã kiểm chứng; case thiếu preventive action thì D7 cũng vậy. Nếu giao
 * diện hiển thị chúng giống hệt các discipline có dữ liệu thật, người đọc sẽ
 * tưởng đó là chuyện đã xảy ra. Đó là kiểu hiểu sai nguy hiểm nhất mà một công
 * cụ như thế này có thể gây ra, nên nó được đánh dấu ở cả viền, huy hiệu lẫn
 * dòng chú thích.
 */

function confidenceStyle(score: number): string {
    if (score >= 0.8) return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
    if (score >= 0.5) return 'bg-amber-500/10 text-amber-700 border-amber-500/20';
    return 'bg-destructive/10 text-destructive border-destructive/20';
}

export function DisciplineCard({ discipline }: { discipline: Discipline8D }) {
    const [open, setOpen] = useState(false);

    const actionItems = parseList(discipline.actionItems);
    const sources = parseList(discipline.sources);
    const inferred = !discipline.dataBacked;

    return (
        <Card
            className={cn(
                'p-0 overflow-hidden transition-colors',
                inferred && 'border-amber-500/40 bg-amber-500/[0.02]',
            )}
        >
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full text-left p-4 flex items-start gap-3 hover:bg-muted/40 transition-colors"
            >
                {/* Mã discipline */}
                <div
                    className={cn(
                        'shrink-0 w-11 h-11 rounded-lg flex items-center justify-center font-bold text-sm',
                        inferred
                            ? 'bg-amber-500/15 text-amber-700'
                            : 'bg-primary/10 text-primary',
                    )}
                >
                    {discipline.code}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm text-foreground">{discipline.title}</h3>

                        <Badge
                            variant="outline"
                            className={cn('text-[10px] tabular-nums', confidenceStyle(discipline.confidence))}
                        >
                            {Math.round(discipline.confidence * 100)}%
                        </Badge>

                        {inferred && (
                            <Badge
                                variant="outline"
                                className="text-[10px] gap-1 bg-amber-500/10 text-amber-700 border-amber-500/30"
                            >
                                <TriangleAlert className="w-3 h-3" />
                                No source data
                            </Badge>
                        )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        {discipline.summary}
                    </p>

                    {inferred && (
                        <p className="text-[11px] text-amber-700/90 mt-1.5">
                            Proposed by AI — the dataset holds no evidence for this discipline.
                        </p>
                    )}
                </div>

                <ChevronDown
                    className={cn(
                        'w-4 h-4 shrink-0 text-muted-foreground transition-transform mt-1',
                        open && 'rotate-180',
                    )}
                />
            </button>

            {open && (
                <div className="px-4 pb-4 pt-0 space-y-4 border-t border-border/60">
                    <div className="pt-4">
                        <Markdown>{discipline.content}</Markdown>
                    </div>

                    {actionItems.length > 0 && (
                        <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                Action items
                            </h4>
                            <ul className="space-y-1.5">
                                {actionItems.map((item, i) => (
                                    <li key={i} className="flex gap-2 text-sm">
                                        <span className="text-primary mt-0.5">→</span>
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/*
                      Nguồn là cơ chế chống bịa của cả tính năng: mỗi khẳng định
                      phải truy được về một fact trong dataset. Backend đã loại
                      những đường dẫn không giải được, nên thứ hiện ở đây đều tồn
                      tại thật.
                    */}
                    <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                            Sources
                        </h4>
                        {sources.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">
                                No source data — this discipline is a proposal.
                            </p>
                        ) : (
                            <div className="flex flex-wrap gap-1.5">
                                {sources.map((s, i) => (
                                    <code
                                        key={i}
                                        className="px-2 py-0.5 rounded bg-muted text-[11px] font-mono text-muted-foreground"
                                    >
                                        {s}
                                    </code>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Card>
    );
}
