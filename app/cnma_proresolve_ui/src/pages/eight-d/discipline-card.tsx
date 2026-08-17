import { useState } from 'react';
import { Badge, Button, Card, cn } from '@cnma/react-ui';
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
    if (score >= 0.8) return 'bg-success/10 text-success border-success/20';
    if (score >= 0.5) return 'bg-warning/10 text-warning border-warning/20';
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
                'min-w-0 overflow-hidden p-0 transition-colors',
                inferred && 'border-warning/40 bg-warning/[0.02]',
            )}
        >
            <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen((v) => !v)}
                className="flex h-auto w-full min-w-0 items-start justify-start gap-3 whitespace-normal p-4 text-left transition-colors hover:bg-muted/40"
            >
                {/* Mã discipline */}
                <div
                    className={cn(
                        'shrink-0 w-11 h-11 rounded-lg flex items-center justify-center font-bold text-sm',
                        inferred
                            ? 'bg-warning/15 text-warning'
                            : 'bg-primary/10 text-primary',
                    )}
                >
                    {discipline.code}
                </div>

                <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm text-foreground">{discipline.title}</h3>

                        <Badge
                            variant="outline"
                            className={cn('text-xs tabular-nums', confidenceStyle(discipline.confidence))}
                        >
                            {Math.round(discipline.confidence * 100)}%
                        </Badge>

                        {inferred && (
                            <Badge
                                variant="outline"
                                className="text-xs gap-1 bg-warning/10 text-warning border-warning/30"
                            >
                                <TriangleAlert className="w-3 h-3" />
                                No source data
                            </Badge>
                        )}
                    </div>

                    <p className="mt-1.5 max-w-full break-words text-xs font-normal leading-relaxed text-muted-foreground">
                        {discipline.summary}
                    </p>

                    {inferred && (
                        <p className="mt-1.5 break-words text-xs font-normal text-warning">
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
            </Button>

            {open && (
                <div className="min-w-0 space-y-4 border-t border-border/60 px-4 pb-4 pt-0">
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
                                    <li key={i} className="flex min-w-0 gap-2 text-sm">
                                        <span className="text-primary mt-0.5">→</span>
                                        <span className="min-w-0 break-words">{item}</span>
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
                                        className="max-w-full break-all rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground"
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
