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
import { Check, ClipboardList, FileSpreadsheet, Info, PlusCircle, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import {
    eightDService,
    originShort,
    type Report8D,
} from '@/services/eightd-service';
import { ReportStatusBadge } from './status-badge';
import { AnalyzeDialog } from './analyze-dialog';

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

export function EightDListPage() {
    const navigate = useNavigate();
    const [analyzeOpen, setAnalyzeOpen] = useState(false);

    const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
        queryKey: ['8d', 'reports'],
        queryFn: () => eightDService.list(),
        // Chỉ quay vòng khi thật sự có việc đang chạy.
        refetchInterval: (query) => {
            const rows = query.state.data?.value ?? [];
            return rows.some((r: Report8D) => r.status === 'Analyzing') ? POLL_INTERVAL_MS : false;
        },
    });

    const reports = data?.value ?? [];
    const running = reports.filter((r) => r.status === 'Analyzing').length;

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">

            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <ClipboardList className="w-5 h-5 text-primary" />
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
                    <Button variant="outline" size="sm" onClick={() => navigate('/create-defect')} className="gap-1.5">
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

            {/* ── Bảng danh sách ── */}
            {isLoading ? (
                <Card className="p-12 items-center text-center">
                    <Spinner className="w-6 h-6 text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">Loading cases…</p>
                </Card>
            ) : isError ? (
                <Card className="p-6 border-destructive/50 text-destructive text-sm">
                    Failed to load 8D cases: {(error as Error)?.message}
                </Card>
            ) : reports.length === 0 ? (
                <Card className="p-12 items-center text-center space-y-3">
                    <FileSpreadsheet className="w-10 h-10 text-muted-foreground" />
                    <div>
                        <p className="text-sm font-medium">No 8D reports yet</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Click "Analyze new case" to start from an incoming complaint or defect record.
                        </p>
                    </div>
                    <Button size="sm" onClick={() => setAnalyzeOpen(true)}>
                        <Sparkles className="w-4 h-4" />
                        Analyze new case
                    </Button>
                </Card>
            ) : (
                <Card className="p-0 overflow-hidden">
                    <Table containerClassName="overflow-x-auto overflow-y-hidden">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-32">Notification</TableHead>
                                <TableHead className="w-16">Origin</TableHead>
                                <TableHead>Symptom</TableHead>
                                <TableHead className="w-36">Material</TableHead>
                                <TableHead className="w-32">Work Center</TableHead>
                                <TableHead className="w-32">Root Cause</TableHead>
                                <TableHead className="w-36">AI, unaided</TableHead>
                                <TableHead className="w-24 text-right">CoPQ</TableHead>
                                <TableHead className="w-28">Status</TableHead>
                                <TableHead className="w-36">AI Models</TableHead>
                                <TableHead className="w-32">Analyzed</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {reports.map((r) => (
                                <TableRow
                                    key={r.ID}
                                    onClick={() => navigate(`/8d/${r.ID}`)}
                                    className="cursor-pointer"
                                >
                                    <TableCell className="font-mono text-xs font-medium">
                                        {r.notificationId}
                                    </TableCell>

                                    <TableCell>
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                'font-mono text-xs',
                                                originShort(r.origin) === 'Q1'
                                                    ? 'bg-destructive/10 text-destructive border-destructive/20'
                                                    : 'bg-muted text-muted-foreground border-border',
                                            )}
                                        >
                                            {originShort(r.origin)}
                                        </Badge>
                                    </TableCell>

                                    <TableCell className="max-w-xs">
                                        <div className="truncate text-sm">{r.symptomShortText}</div>
                                        {r.status === 'Failed' && r.errorMessage && (
                                            <div className="truncate text-xs text-destructive mt-0.5">
                                                {r.errorMessage}
                                            </div>
                                        )}
                                    </TableCell>

                                    <TableCell>
                                        <div className="text-xs font-mono">{r.materialId}</div>
                                        <div className="text-xs text-muted-foreground truncate">
                                            {r.materialDesc}
                                        </div>
                                    </TableCell>

                                    <TableCell className="text-xs font-mono">{r.workCenterId}</TableCell>

                                    <TableCell>
                                        <RootCauseBadge category={r.rootCauseCategory} />
                                    </TableCell>

                                    <TableCell>
                                        <AiVerdictCell report={r} />
                                    </TableCell>

                                    <TableCell className="text-right text-xs tabular-nums">
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

                                    <TableCell className="text-xs text-muted-foreground">
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
        </div>
    );
}

export default EightDListPage;
