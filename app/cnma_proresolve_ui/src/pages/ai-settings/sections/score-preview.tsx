import { useEffect, useState } from 'react';
import {
    Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
    Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, Spinner,
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@cnma/react-ui';
import { Play } from 'lucide-react';
import { toast } from 'sonner';
import { previewScore, type ScorePreview } from '@/services/retrieval-service';
import type { RetrievalConfigState } from '@/hooks/use-retrieval-config';

const LEVEL_STYLE: Record<string, string> = {
    exact: 'bg-success/15 text-success border border-success/30',
    fallback: 'bg-warning/15 text-warning border border-warning/30',
    none: 'bg-muted text-muted-foreground',
};

/**
 * Chấm thử hai case với cấu hình hiện tại.
 *
 * Có mặt để người chỉnh trọng số thấy ngay hệ quả. Không có nó thì cách duy nhất
 * để biết một thay đổi làm gì là chạy cả một lượt phân tích mất hơn một phút.
 */
export function ScorePreviewSection({ cfg }: { cfg: RetrievalConfigState }) {
    const { cases, settings } = cfg;
    const [caseA, setCaseA] = useState('');
    const [caseB, setCaseB] = useState('');
    const [result, setResult] = useState<ScorePreview | null>(null);
    const [running, setRunning] = useState(false);

    useEffect(() => {
        // Chọn sẵn hai case đầu để dùng được ngay, không phải đi tra mã ở màn khác.
        if (!caseA && cases[0]) setCaseA(cases[0].notificationId);
        if (!caseB && cases[1]) setCaseB(cases[1].notificationId);
    }, [cases, caseA, caseB]);

    // Đổi cấu hình thì kết quả cũ không còn đúng nữa — bỏ đi thay vì để người
    // dùng đọc một con số đã lỗi thời.
    useEffect(() => { setResult(null); }, [cfg.maxScore, cfg.enabledCount]);

    const threshold = settings?.minScore ?? 3;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Score two cases</CardTitle>
                <CardDescription>
                    Runs the pipeline against two cases from the library, without starting an analysis.
                    Use it to see what a weight change actually does.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                    {([['Case A', caseA, setCaseA], ['Case B', caseB, setCaseB]] as const).map(([label, val, set]) => (
                        <div key={label} className="space-y-1.5">
                            <Label>{label}</Label>
                            <Select value={val} onValueChange={set}>
                                <SelectTrigger className="h-9 w-56">
                                    <SelectValue placeholder="Pick a case" />
                                </SelectTrigger>
                                <SelectContent>
                                    {cases.map((c) => (
                                        <SelectItem key={c.notificationId} value={c.notificationId}>
                                            {c.notificationId}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ))}
                    <Button
                        size="sm"
                        disabled={!caseA || !caseB || caseA === caseB || running}
                        onClick={async () => {
                            setRunning(true);
                            try {
                                setResult(await previewScore(caseA, caseB));
                            } catch (e: any) {
                                toast.error(`Scoring failed: ${e.message}`);
                            } finally {
                                setRunning(false);
                            }
                        }}
                    >
                        {running ? <Spinner className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        Score
                    </Button>
                </div>

                {result && (
                    <>
                        <Separator />
                        {result.error ? (
                            <p className="text-sm text-destructive">{result.error}</p>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-baseline gap-3">
                                    <span className="text-2xl font-semibold tabular-nums">
                                        {result.score}
                                        <span className="text-base font-normal text-muted-foreground">
                                            {' '}/ {result.maxScore}
                                        </span>
                                    </span>
                                    <Badge variant={result.score >= threshold ? 'default' : 'secondary'}>
                                        {result.score >= threshold
                                            ? 'would be shown as a precedent'
                                            : 'below threshold — not shown'}
                                    </Badge>
                                </div>

                                <Table containerClassName="overflow-x-auto overflow-y-hidden">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Step</TableHead>
                                            <TableHead>Match</TableHead>
                                            <TableHead>Matched on</TableHead>
                                            <TableHead className="text-right">Points</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {result.breakdown.map((b) => (
                                            <TableRow key={b.criterionKey}>
                                                <TableCell>{b.label}</TableCell>
                                                <TableCell>
                                                    <span className={`rounded px-1.5 py-0.5 text-xs ${LEVEL_STYLE[b.level]}`}>
                                                        {b.level}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-muted-foreground">
                                                    {b.matchedOn ?? '—'}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {b.points} <span className="text-muted-foreground">/ {b.maxPoints}</span>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
