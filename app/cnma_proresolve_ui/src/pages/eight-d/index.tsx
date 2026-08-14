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
import { AlertCircle, Check, ClipboardList, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
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
    Man: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
    Machine: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
    Method: 'bg-violet-500/10 text-violet-700 border-violet-500/20',
    Material: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
    Measurement: 'bg-teal-500/10 text-teal-700 border-teal-500/20',
    Environment: 'bg-lime-500/10 text-lime-700 border-lime-500/20',
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
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : (
                <TriangleAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            )}
            <Badge
                variant="outline"
                className={cn(
                    'font-medium text-[11px]',
                    agrees
                        ? ROOT_CAUSE_STYLES[report.aiRootCause] ?? 'bg-muted'
                        : 'bg-amber-500/10 text-amber-800 border-amber-500/30',
                )}
            >
                {report.aiRootCause}
            </Badge>
            {report.aiConfidence != null && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
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
        <div className="p-6 md:p-8 max-w-[1400px] mx-auto space-y-6">

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
                    <Button size="sm" onClick={() => setAnalyzeOpen(true)}>
                        <Sparkles className="w-4 h-4" />
                        Analyze from JSON
                    </Button>
                </div>
            </div>

            {running > 0 && (
                <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-500/5 border border-blue-500/20 rounded-lg px-3 py-2">
                    <Spinner className="w-3.5 h-3.5" />
                    {running} analysis running — this page refreshes automatically. Each run takes 60–90 seconds.
                </div>
            )}

            {/* ── Bảng ── */}
            <Card className="p-0 overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                        <Spinner className="w-4 h-4" /> Loading reports…
                    </div>
                ) : isError ? (
                    <div className="flex flex-col items-center gap-2 py-16 px-6 text-center">
                        <AlertCircle className="w-8 h-8 text-destructive" />
                        <p className="text-sm font-medium">Could not load reports</p>
                        <p className="text-xs text-muted-foreground max-w-md">
                            {(error as Error)?.message ?? 'Unknown error'}
                        </p>
                        <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
                            Retry
                        </Button>
                    </div>
                ) : reports.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-16 px-6 text-center">
                        <ClipboardList className="w-8 h-8 text-muted-foreground" />
                        <p className="text-sm font-medium">No reports yet</p>
                        <p className="text-xs text-muted-foreground max-w-md">
                            Paste the JSON of a defect case to generate the eight disciplines.
                        </p>
                        <Button size="sm" className="mt-2" onClick={() => setAnalyzeOpen(true)}>
                            <Sparkles className="w-4 h-4" />
                            Analyze from JSON
                        </Button>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[130px]">Notification</TableHead>
                                <TableHead className="w-[60px]">Origin</TableHead>
                                <TableHead>Symptom</TableHead>
                                <TableHead className="w-[150px]">Material</TableHead>
                                <TableHead className="w-[120px]">Work Center</TableHead>
                                <TableHead className="w-[130px]">Root Cause</TableHead>
                                <TableHead className="w-[150px]">AI, unaided</TableHead>
                                <TableHead className="w-[100px] text-right">CoPQ</TableHead>
                                <TableHead className="w-[110px]">Status</TableHead>
                                <TableHead className="w-[140px]">AI Models</TableHead>
                                <TableHead className="w-[130px]">Analyzed</TableHead>
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
                                                'font-mono text-[10px]',
                                                originShort(r.origin) === 'Q1'
                                                    ? 'bg-rose-500/10 text-rose-700 border-rose-500/20'
                                                    : 'bg-slate-500/10 text-slate-600 border-slate-500/20',
                                            )}
                                        >
                                            {originShort(r.origin)}
                                        </Badge>
                                    </TableCell>

                                    <TableCell className="max-w-[320px]">
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

                                    {/* Chẩn đoán mù: AI chọn gì khi không thấy đáp án. */}
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
                                            <div className="flex flex-col gap-0.5 max-w-[130px]">
                                                <Badge
                                                    variant="secondary"
                                                    className="font-mono text-[10px] truncate justify-start"
                                                    title={`Analyze: ${r.aiModelAnalyze}`}
                                                >
                                                    {r.aiModelAnalyze}
                                                </Badge>
                                                {r.aiModelParse && r.aiModelParse !== r.aiModelAnalyze && (
                                                    <span
                                                        className="text-[9px] text-muted-foreground font-mono truncate"
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
                                            <div className="text-[10px] opacity-70">
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
                )}
            </Card>

            {reports.length > 0 && (
                <p className="text-xs text-muted-foreground">
                    {reports.length} report{reports.length === 1 ? '' : 's'}
                </p>
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
