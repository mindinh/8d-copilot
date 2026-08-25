import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
    Badge,
    Button,
    Card,
    Spinner,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    cn,
} from '@cnma/react-ui';
import { Check, ClipboardList, Info, PlusCircle, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import {
    eightDService,
    originShort,
    type Report8D,
} from '@/services/eightd-service';
import { ReportStatusBadge } from './status-badge';
import { AnalyzeDialog } from './analyze-dialog';
import { CreateDefectDialog } from '../create-defect';

/**
 * Danh sách báo cáo 8D.
 *
 * ── Vì sao có polling ──
 * Phân tích chạy ở nền và mất 60-90 giây. Bảng này tự làm mới mỗi 4 giây CHỪNG
 * NÀO còn ít nhất một report ở trạng thái `Analyzing`, rồi tự dừng. Poll vô điều
 * kiện sẽ gọi API mãi mãi dù chẳng có gì thay đổi.
 */

const POLL_INTERVAL_MS = 4_000;

function formatEur(value: number | null): string {
    if (value == null) return '—';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
    }).format(value);
}

function formatDateTime(value: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
}

/** Màu theo nhánh Ishikawa — cùng một nguyên nhân gốc luôn cùng màu ở mọi nơi. */
const ROOT_CAUSE_STYLES: Record<string, string> = {
    Man: 'bg-warning/10 text-warning border-warning/20',
    Machine: 'bg-info/10 text-info border-info/20',
    Method: 'bg-primary/10 text-primary border-primary/20',
    Material: 'bg-warning/15 text-warning border-warning/30',
    Measurement: 'bg-info/15 text-info border-info/30',
    Environment: 'bg-success/10 text-success border-success/20',
};

function RootCauseBadge({ category }: { category: string | null }) {
    if (!category) return <span className="text-muted-foreground">—</span>;
    return (
        <Badge
            variant="outline"
            className={cn('font-medium', ROOT_CAUSE_STYLES[category] ?? 'bg-muted text-muted-foreground')}
        >
            {category}
        </Badge>
    );
}

/**
 * Kết luận của AI khi chưa thấy đáp án, kèm dấu trùng/lệch.
 *
 * Lệch được tô nổi hơn trùng: trùng chỉ xác nhận điều đã biết, còn lệch là lúc
 * cần người đọc để mắt tới.
 */
function AiVerdictCell({ report }: { report: Report8D }) {
    if (!report.aiRootCause) return <span className="text-muted-foreground text-xs">—</span>;

    const agrees = report.aiAgreesWithRecord === true;

    return (
        <div className="flex items-center gap-1.5">
            {agrees ? (
                <Check className="w-3.5 h-3.5 text-success shrink-0" />
            ) : (
                <TriangleAlert className="w-3.5 h-3.5 text-warning shrink-0" />
            )}
            <Badge
                variant="outline"
                className={cn(
                    'font-medium text-xs',
                    agrees
                        ? ROOT_CAUSE_STYLES[report.aiRootCause] ?? 'bg-muted'
                        : 'bg-warning/10 text-warning border-warning/30',
                )}
            >
                {report.aiRootCause}
            </Badge>
            {report.aiConfidence != null && (
                <span className="text-xs text-muted-foreground tabular-nums">
                    {Math.round(report.aiConfidence * 100)}%
                </span>
            )}
        </div>
    );
}

function RunningSpinner() {
    return (
        <div className="flex items-center gap-1.5 text-primary">
            <Spinner className="w-3.5 h-3.5" />
            <span className="text-xs">Analyzing…</span>
        </div>
    );
}

export function EightDListPage() {
    const navigate = useNavigate();
    const [analyzeOpen, setAnalyzeOpen] = useState(false);
    const [createDefectOpen, setCreateDefectOpen] = useState(false);

    const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
        queryKey: ['8d', 'reports'],
        queryFn: () => eightDService.list(),
        // Chỉ quay vòng khi thật sự có việc đang chạy.
        refetchInterval: (query) => {
            const rows = query.state.data?.value ?? [];
            return rows.some((r: Report8D) => r.status === 'Analyzing') ? POLL_INTERVAL_MS : false;
        },
    });

    const rows = data?.value ?? [];
    const running = rows.filter((r) => r.status === 'Analyzing').length;

    return (
        <div className="p-6 md:p-8 w-full min-w-0 space-y-6">
            {/* ── Tiêu đề & thanh thao tác ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                        <ClipboardList className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-foreground">8D Reports</h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            AI-generated eight disciplines problem solving reports from SAP QM defect cases
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                        <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
                        Refresh
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCreateDefectOpen(true)} className="gap-1.5">
                        <PlusCircle className="w-4 h-4 text-primary" />
                        Record Defect (SAP UI5)
                    </Button>
                    <Button size="sm" onClick={() => setAnalyzeOpen(true)}>
                        <Sparkles className="w-4 h-4" />
                        Analyze from JSON
                    </Button>
                </div>
            </div>

            {running > 0 && (
                <div className="flex items-center gap-2 text-xs text-info bg-info/5 border border-info/20 rounded-lg px-3 py-2">
                    <Spinner className="w-3.5 h-3.5" />
                    {running} analysis running — this page refreshes automatically. Each run takes 60–90 seconds.
                </div>
            )}

            {/* ── Banner giải thích ── */}
            <Card className="p-4 bg-muted/40 border border-border/60">
                <div className="flex items-start gap-3 text-xs text-muted-foreground">
                    <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div>
                        <span className="font-semibold text-foreground">Why AI, unaided is highlighted when it disagrees:</span>{' '}
                        TheCopilot runs an independent diagnosis without seeing the recorded 5-Why chain or root cause flag.
                        Same conclusion confirms what you know; different conclusion points to a case worth double-checking.
                    </div>
                </div>
            </Card>

            {/* ── Trạng thái tải / lỗi / rỗng ── */}
            {isLoading && (
                <div className="flex justify-center p-12">
                    <Spinner className="w-6 h-6 text-primary" />
                </div>
            )}

            {isError && (
                <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-sm">
                    Failed to load reports: {(error as Error).message}
                </div>
            )}

            {!isLoading && !isError && rows.length === 0 && (
                <Card className="p-12 text-center text-muted-foreground">
                    <p className="text-base font-semibold">No 8D reports yet</p>
                    <p className="text-xs mt-1">
                        Use <strong className="text-foreground">Record Defect (SAP UI5)</strong> to create an SAP defect notification, or click <strong className="text-foreground">Analyze from JSON</strong> to start an analysis.
                    </p>
                </Card>
            )}

            {/* ── Bảng dữ liệu chính ── */}
            {!isLoading && !isError && rows.length > 0 && (
                <Card className="overflow-hidden border border-border/70 shadow-sm">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/40">
                                <TableHead className="w-[120px]">Notification</TableHead>
                                <TableHead className="w-[70px]">Origin</TableHead>
                                <TableHead className="min-w-[220px]">Symptom</TableHead>
                                <TableHead className="w-[110px]">Material</TableHead>
                                <TableHead className="w-[110px]">Work Center</TableHead>
                                <TableHead className="min-w-[160px]">Root Cause</TableHead>
                                <TableHead className="w-[130px]">AI, unaided</TableHead>
                                <TableHead className="w-[100px]">CoPQ</TableHead>
                                <TableHead className="w-[100px]">Status</TableHead>
                                <TableHead className="w-[120px]">AI Models</TableHead>
                                <TableHead className="w-[120px]">Analyzed</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((r) => (
                                <TableRow
                                    key={r.ID}
                                    onClick={() => navigate(`/8d/${r.ID}`)}
                                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                                >
                                    <TableCell className="font-mono font-medium text-xs">
                                        {r.notificationId}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                'text-[10px] px-1.5 py-0 font-mono font-semibold uppercase',
                                                originShort(r.origin) === 'Q1' && 'border-destructive/40 text-destructive bg-destructive/5',
                                                originShort(r.origin) === 'Q2' && 'border-warning/40 text-warning bg-warning/5',
                                                originShort(r.origin) === 'Q3' && 'border-info/40 text-info bg-info/5',
                                                originShort(r.origin) === 'Q4' && 'border-primary/40 text-primary bg-primary/5',
                                            )}
                                        >
                                            {originShort(r.origin)}
                                        </Badge>
                                    </TableCell>

                                    <TableCell className="max-w-xs">
                                        <div className="truncate text-xs font-medium text-foreground">{r.symptomShortText}</div>
                                        {r.defectText && (
                                            <div className="text-[11px] text-muted-foreground truncate">{r.defectText}</div>
                                        )}
                                    </TableCell>

                                    <TableCell>
                                        <div className="text-xs font-mono">{r.materialId ?? '—'}</div>
                                        {r.materialDesc && (
                                            <div className="text-[11px] text-muted-foreground truncate">
                                                {r.materialDesc}
                                            </div>
                                        )}
                                    </TableCell>

                                    <TableCell className="text-xs font-mono">{r.workCenterId ?? '—'}</TableCell>

                                    <TableCell>
                                        {r.status === 'Analyzing' ? (
                                            <RunningSpinner />
                                        ) : (
                                            <RootCauseBadge category={r.rootCauseCategory} />
                                        )}
                                    </TableCell>

                                    <TableCell>
                                        <AiVerdictCell report={r} />
                                    </TableCell>

                                    <TableCell className="text-right text-xs tabular-nums font-mono">
                                        {formatEur(r.copqEur)}
                                    </TableCell>

                                    <TableCell>
                                        <ReportStatusBadge status={r.status} />
                                    </TableCell>

                                    <TableCell>
                                        {r.aiModelAnalyze ? (
                                            <div className="flex flex-col gap-0.5 max-w-xs">
                                                <Badge
                                                    variant="secondary"
                                                    className="font-mono text-xs truncate justify-start"
                                                    title={`Analyze: ${r.aiModelAnalyze}`}
                                                >
                                                    {r.aiModelAnalyze}
                                                </Badge>
                                                {r.aiModelParse && r.aiModelParse !== r.aiModelAnalyze && (
                                                    <span
                                                        className="text-xs text-muted-foreground font-mono truncate"
                                                        title={`Parse: ${r.aiModelParse}`}
                                                    >
                                                        P: {r.aiModelParse}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground text-xs">—</span>
                                        )}
                                    </TableCell>

                                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                        {formatDateTime(r.analyzedAt)}
                                        {r.durationMs != null && (
                                            <div className="text-xs opacity-70">
                                                {(r.durationMs / 1000).toFixed(0)}s
                                                {r.tokensUsed != null &&
                                                    ` · ${(r.tokensUsed / 1000).toFixed(1)}k tok`}
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            )}

            <AnalyzeDialog
                open={analyzeOpen}
                onOpenChange={setAnalyzeOpen}
                onScheduled={(reportID) => navigate(`/8d/${reportID}`)}
            />

            <CreateDefectDialog
                open={createDefectOpen}
                onOpenChange={setCreateDefectOpen}
                onCreated={(reportID: string) => navigate(`/8d/${reportID}`)}
            />
        </div>
    );
}

export default EightDListPage;
