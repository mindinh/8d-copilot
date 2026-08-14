import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Badge,
    Button,
    Card,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    Spinner,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    cn,
} from '@cnma/react-ui';

import {
    AlertCircle, ArrowLeft, Braces, Cpu, RefreshCw, TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    eightDService,
    isCustomerComplaint,
    parseFinding,
    type Report8D,
} from '@/services/eightd-service';
import { DisciplineCard } from './discipline-card';
import { ReportStatusBadge } from './status-badge';
import { ReasoningPanel } from './reasoning-panel';
import { PrecedentPanel } from './precedent-panel';

/**
 * Chi tiết một báo cáo 8D.
 *
 * Trong lúc report còn ở `Analyzing`, trang tự làm mới mỗi 4 giây rồi dừng khi
 * xong — cùng cơ chế với trang danh sách. Phân tích chạy ở nền trên server nên
 * đây là cách duy nhất để biết đã xong hay chưa.
 */

const POLL_INTERVAL_MS = 4_000;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="text-sm mt-0.5">{children ?? '—'}</div>
        </div>
    );
}

function formatEur(v: number | null) {
    if (v == null) return '—';
    return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
    }).format(v);
}

export function EightDDetailPage() {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [showPayload, setShowPayload] = useState(false);

    const { data: report, isLoading, isError, error } = useQuery({
        queryKey: ['8d', 'report', id],
        queryFn: () => eightDService.getWithDisciplines(id),
        enabled: !!id,
        refetchInterval: (query) =>
            (query.state.data as Report8D | undefined)?.status === 'Analyzing'
                ? POLL_INTERVAL_MS
                : false,
    });

    const reanalyze = useMutation({
        mutationFn: () => eightDService.reanalyze(id),
        onSuccess: () => {
            toast.success('Re-analysis scheduled', {
                description: 'This takes 60–90 seconds. The page updates automatically.',
            });
            queryClient.invalidateQueries({ queryKey: ['8d'] });
        },
        onError: (e: any) => {
            toast.error(
                e?.response?.data?.error?.message ?? e?.message ?? 'Could not re-run the analysis.',
            );
        },
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
                <Spinner className="w-4 h-4" /> Loading report…
            </div>
        );
    }

    if (isError || !report) {
        return (
            <div className="flex flex-col items-center gap-3 py-24 px-6 text-center">
                <AlertCircle className="w-8 h-8 text-destructive" />
                <p className="text-sm font-medium">Could not load this report</p>
                <p className="text-xs text-muted-foreground max-w-md">
                    {(error as Error)?.message ?? 'It may have been deleted.'}
                </p>
                <Button variant="outline" size="sm" onClick={() => navigate('/8d')}>
                    Back to list
                </Button>
            </div>
        );
    }

    const disciplines = [...(report.disciplines ?? [])].sort((a, b) => a.sequence - b.sequence);
    const customerFacing = isCustomerComplaint(report.origin);
    const inferredCount = disciplines.filter((d) => !d.dataBacked).length;
    const running = report.status === 'Analyzing';
    const independent = parseFinding(report.aiFinding);

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">

            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="min-w-0">
                    <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={() => navigate('/8d')}>
                        <ArrowLeft className="w-4 h-4" />
                        8D Reports
                    </Button>

                    <div className="flex items-center gap-2.5 flex-wrap">
                        <h1 className="text-xl font-bold font-mono">{report.notificationId}</h1>
                        <ReportStatusBadge status={report.status} />
                    </div>

                    <p className="text-sm text-muted-foreground mt-1">{report.symptomShortText}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => setShowPayload(true)}>
                        <Braces className="w-4 h-4" />
                        Source JSON
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={running || reanalyze.isPending}
                        onClick={() => reanalyze.mutate()}
                    >
                        <RefreshCw className={cn('w-4 h-4', reanalyze.isPending && 'animate-spin')} />
                        Re-analyze
                    </Button>
                </div>
            </div>

            {/* ── Đang chạy ── */}
            {running && (
                <div className="flex items-center gap-2 text-sm text-info bg-info/5 border border-info/20 rounded-lg px-4 py-3">
                    <Spinner className="w-4 h-4" />
                    Analysis in progress — extracting facts, then drafting the eight disciplines.
                    This page updates automatically.
                </div>
            )}

            {/* ── Thất bại ── */}
            {report.status === 'Failed' && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-4 py-3">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-medium">Analysis failed</p>
                        <p className="text-xs mt-1 break-words">{report.errorMessage}</p>
                    </div>
                </div>
            )}

            {/* ── Case tiền lệ ──
                Đặt NGAY ĐẦU, trên cả chẩn đoán độc lập. Với một sự vụ vừa được
                ghi nhận thì đây là phần duy nhất dựa trên dữ liệu có thật — mọi
                thứ khác trên trang lúc đó đều là suy luận.
                Nó cũng có sớm nhất: khoảng hai giây, trong khi báo cáo mất hơn
                một phút. */}
            <PrecedentPanel reportID={report.ID} />

            {/* ── Chẩn đoán độc lập ──
                Đặt TRÊN thông tin case có chủ đích: đây là thứ phân biệt công cụ
                này với một trình định dạng dữ liệu, nên nó phải là điều đầu tiên
                người đọc nhìn thấy sau phần đầu trang. */}
            {independent && <ReasoningPanel analysis={independent} />}

            {/* ── Thông tin case ── */}
            <Card className="p-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Field label="Origin">{report.origin}</Field>
                    <Field label="SAP status">{report.sapStatus}</Field>
                    <Field label="Found">{report.foundDate ?? '—'}</Field>
                    <Field label="Extent">{report.quantityExtent}</Field>

                    <Field label="Material">
                        <span className="font-mono text-xs">{report.materialId}</span>
                        <div className="text-xs text-muted-foreground">{report.materialDesc}</div>
                    </Field>
                    <Field label="Batch"><span className="font-mono text-xs">{report.batchId}</span></Field>
                    <Field label="Defect">
                        <span className="font-mono text-xs">{report.defectCode}</span>
                        <div className="text-xs text-muted-foreground">{report.defectText}</div>
                    </Field>
                    <Field label="Work center">
                        <span className="font-mono text-xs">{report.workCenterId}</span>
                        <div className="text-xs text-muted-foreground">{report.workCenterDesc}</div>
                    </Field>

                    <Field label="Root cause">{report.rootCauseCategory ?? '—'}</Field>
                    <Field label="Cost of poor quality">{formatEur(report.copqEur)}</Field>
                    <Field label="FMEA">{report.fmeaId ?? '—'}</Field>
                    <Field label="Team size">{report.teamSize ?? '—'}</Field>
                </div>
            </Card>

            {/* ── Tóm tắt ── */}
            {(report.internalSummary || report.customerSummary) && (
                <Tabs defaultValue="internal">
                    <TabsList>
                        <TabsTrigger value="internal">Internal summary</TabsTrigger>
                        {customerFacing && (
                            <TabsTrigger value="customer">Customer summary</TabsTrigger>
                        )}
                    </TabsList>

                    <TabsContent value="internal" className="mt-3">
                        <Card className="p-5 text-sm leading-relaxed">
                            {report.internalSummary ?? '—'}
                        </Card>
                    </TabsContent>

                    {customerFacing && (
                        <TabsContent value="customer" className="mt-3">
                            <Card className="p-5 text-sm leading-relaxed">
                                {report.customerSummary ?? '—'}
                                <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                                    Written for the customer — no employee names, equipment IDs or cost figures.
                                </p>
                            </Card>
                        </TabsContent>
                    )}
                </Tabs>
            )}

            {/* ── 8 discipline ── */}
            {disciplines.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            Eight disciplines
                        </h2>

                        {inferredCount > 0 && (
                            <span className="flex items-center gap-1.5 text-xs text-warning">
                                <TriangleAlert className="w-3.5 h-3.5" />
                                {inferredCount} of {disciplines.length} have no source data in the dataset
                            </span>
                        )}
                    </div>

                    {disciplines.map((d) => (
                        <DisciplineCard key={d.ID} discipline={d} />
                    ))}
                </div>
            )}

            {/* ── Vết chạy & Model AI ── */}
            {report.analyzedAt && (
                <Card className="p-4 bg-muted/30 border border-border/60">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-foreground flex items-center gap-1.5">
                                <Cpu className="w-3.5 h-3.5 text-primary" />
                                AI Models Used:
                            </span>
                            {report.aiModelParse && (
                                <Badge variant="secondary" className="font-mono text-xs gap-1">
                                    <span className="text-xs text-muted-foreground font-sans">Parse:</span>
                                    {report.aiModelParse}
                                </Badge>
                            )}
                            {report.aiModelAnalyze && (
                                <Badge variant="secondary" className="font-mono text-xs gap-1">
                                    <span className="text-xs text-muted-foreground font-sans">Analyze:</span>
                                    {report.aiModelAnalyze}
                                </Badge>
                            )}
                        </div>

                        <div className="flex items-center gap-3 shrink-0 text-xs">
                            <span>Generated: <strong className="font-normal text-foreground">{new Date(report.analyzedAt).toLocaleString('en-GB')}</strong></span>
                            <span>·</span>
                            <span>Tokens: <strong className="font-normal text-foreground">{report.tokensUsed?.toLocaleString()}</strong></span>
                            {report.durationMs != null && (
                                <>
                                    <span>·</span>
                                    <span>Duration: <strong className="font-normal text-foreground">{(report.durationMs / 1000).toFixed(0)}s</strong></span>
                                </>
                            )}
                        </div>
                    </div>
                </Card>
            )}

            {/* ── JSON gốc ── */}
            <Dialog open={showPayload} onOpenChange={setShowPayload}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>Source dataset — {report.notificationId}</DialogTitle>
                    </DialogHeader>
                    <PayloadViewer reportID={report.ID} />
                </DialogContent>
            </Dialog>
        </div>
    );
}

/**
 * Tải `sourcePayload` theo yêu cầu.
 *
 * Cột này nặng ~50 KB nên không nằm trong truy vấn chính — kéo về mỗi lần mở
 * trang chi tiết, và mỗi 4 giây khi đang poll, là lãng phí.
 */
function PayloadViewer({ reportID }: { reportID: string }) {
    const { data, isLoading } = useQuery({
        queryKey: ['8d', 'payload', reportID],
        queryFn: () => eightDService.getById(reportID),
        staleTime: Infinity,
    });

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
                <Spinner className="w-4 h-4" /> Loading…
            </div>
        );
    }

    let pretty = data?.sourcePayload ?? '';
    try {
        pretty = JSON.stringify(JSON.parse(pretty), null, 2);
    } catch {
        /* hiện nguyên trạng nếu không parse được */
    }

    return (
        <pre className="text-xs font-mono bg-muted rounded-lg p-4 overflow-auto max-h-[65vh]">
            {pretty}
        </pre>
    );
}

export default EightDDetailPage;
