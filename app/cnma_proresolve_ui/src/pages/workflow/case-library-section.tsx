import {
    Badge, Card, CardContent, CardDescription, CardHeader, CardTitle,
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@cnma/react-ui';
import type { RetrievalConfigState } from '@/hooks/use-retrieval-config';

/**
 * Kho case đã đóng — nguyên liệu của mọi gợi ý.
 *
 * Chỉ đọc có chủ đích: một dòng ghi tay qua UI sẽ thiếu `defectKeywords` và
 * `materialFamily` (hai cột tính sẵn lúc nạp), nên nó lặng lẽ không bao giờ ăn
 * điểm. Nạp kho đi qua action `seedCaseLibrary`, và app tự bù case còn thiếu mỗi
 * lần khởi động.
 */
export function CaseLibrarySection({ cfg }: { cfg: RetrievalConfigState }) {
    const { cases, embeddedCount } = cfg;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Case library</CardTitle>
                <CardDescription>
                    Read-only here. Cases are loaded through the seed action so the derived columns —
                    the tokenised defect text and the material group — are always computed the same
                    way. A row typed in by hand would silently never score.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{cases.length} cases</Badge>
                    <Badge variant={embeddedCount === cases.length ? 'secondary' : 'destructive'}>
                        {embeddedCount} embedded
                    </Badge>
                </div>

                {cases.length === 0 ? (
                    <div className="rounded-xl border-2 border-dashed py-8 text-center text-sm text-muted-foreground">
                        <p className="font-medium">The library is empty</p>
                        <p className="mt-1 text-xs">
                            Until closed cases are loaded, every analysis can only answer
                            &quot;no comparable case found&quot;.
                        </p>
                    </div>
                ) : (
                    <div className="max-h-80 overflow-y-auto rounded-md border">
                        <Table containerClassName="overflow-x-auto overflow-y-hidden">
                            <TableHeader className="sticky top-0 bg-card">
                                <TableRow>
                                    <TableHead>Case</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Searchable by meaning</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {cases.map((c) => (
                                    <TableRow key={c.notificationId}>
                                        <TableCell>
                                            <span className="font-mono text-xs">{c.notificationId}</span>
                                            <span className="ml-2 text-muted-foreground">{c.symptomShortText}</span>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {(() => {
                                                const s = (c.sapStatus || 'Closed').trim();
                                                const sLower = s.toLowerCase();
                                                if (sLower === 'completed' || sLower === 'complete') {
                                                    return (
                                                        <Badge
                                                            variant="outline"
                                                            className="border-success/30 text-success bg-success/10 text-[10.5px] font-medium"
                                                        >
                                                            {s}
                                                        </Badge>
                                                    );
                                                }
                                                if (sLower.includes('progress') || sLower.includes('process') || sLower === 'open') {
                                                    return (
                                                        <Badge
                                                            variant="outline"
                                                            className="border-info/30 text-info bg-info/10 text-[10.5px] font-medium"
                                                        >
                                                            {s}
                                                        </Badge>
                                                    );
                                                }
                                                return (
                                                    <Badge
                                                        variant="secondary"
                                                        className="text-[10.5px] text-muted-foreground bg-muted border border-border/60 font-normal"
                                                    >
                                                        {s}
                                                    </Badge>
                                                );
                                            })()}
                                        </TableCell>
                                        <TableCell className="text-right text-xs">
                                            {c.embeddingModel
                                                ? <span className="text-success">yes</span>
                                                : <span className="text-warning">not embedded</span>}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
