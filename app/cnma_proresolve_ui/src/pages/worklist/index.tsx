import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
import {
    ArrowUpRight, FolderSync, Inbox, Info, RefreshCw, Sparkles,
} from 'lucide-react';
import { worklistService, type WorklistItem } from '@/services/worklist-service';
import { originShort } from '@/services/eightd-service';

/**
 * Worklist sự vụ mới đến.
 *
 * Luồng nghiệp vụ: kỹ sư ghi nhận defect bên SAP (Record Defects / Create
 * Quality Notification) → bấm "Sync from SAP" để kéo sự vụ về đây → từ một dòng,
 * bấm "Create 8D" để mở case và chạy pipeline AI. Dòng đã mở 8D thì nút đổi
 * thành "Open 8D" trỏ về report — một sự vụ chỉ có một case, không mở bản thứ hai.
 */

function formatDate(value: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

function SourceSystemBadge({ item }: { item: WorklistItem }) {
    if (!item.sourceSystem) return <span className="text-muted-foreground">—</span>;
    const isQ1 = originShort(item.origin) === 'Q1';
    return (
        <Badge
            variant="outline"
            className={cn(
                'text-xs font-medium',
                isQ1
                    ? 'bg-destructive/10 text-destructive border-destructive/20'
                    : 'bg-info/10 text-info border-info/20',
            )}
        >
            {item.sourceSystem}
        </Badge>
    );
}

export function WorklistPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    /** Dòng đang mở 8D — khoá đúng MỘT nút, không khoá cả bảng. */
    const [creatingID, setCreatingID] = useState<string | null>(null);

    const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
        queryKey: ['worklist', 'items'],
        queryFn: () => worklistService.list(),
    });

    const syncMutation = useMutation({
        mutationFn: () => worklistService.sync(),
        onSuccess: (report) => {
            queryClient.invalidateQueries({ queryKey: ['worklist'] });
            if (report.synced > 0) {
                toast.success(`Synced ${report.synced} new defect${report.synced > 1 ? 's' : ''} from SAP`, {
                    description: report.skipped > 0 ? `${report.skipped} already in the worklist.` : undefined,
                });
            } else {
                toast.info('Worklist is up to date', {
                    description: `No new defects found. ${report.skipped} already synced.`,
                });
            }
            if (report.failed > 0) {
                toast.warning(`${report.failed} record(s) could not be read`, {
                    description: report.messages.slice(1).join(' '),
                });
            }
        },
        onError: (e: any) => {
            toast.error('Sync failed', { description: e?.response?.data?.error?.message ?? e.message });
        },
    });

    const createMutation = useMutation({
        mutationFn: (itemID: string) => worklistService.createEightD(itemID),
        onMutate: (itemID) => setCreatingID(itemID),
        onSettled: () => setCreatingID(null),
        onSuccess: (reportID) => {
            queryClient.invalidateQueries({ queryKey: ['worklist'] });
            toast.success('8D case created — AI analysis started');
            navigate(`/8d/${reportID}`);
        },
        onError: (e: any) => {
            toast.error('Could not create 8D', {
                description: e?.response?.data?.error?.message ?? e.message,
            });
        },
    });

    const items = data?.value ?? [];
    const newCount = items.filter((i) => i.status === 'New').length;

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">

            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Inbox className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-foreground">Defect Worklist</h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Defects raised in SAP Record Defects (Q3) and Create Quality Notification (Q1), waiting for an 8D case
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                        <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
                        Refresh
                    </Button>
                    <Button size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                        {syncMutation.isPending
                            ? <Spinner className="w-4 h-4" />
                            : <FolderSync className="w-4 h-4" />}
                        Sync from SAP
                    </Button>
                </div>
            </div>

            {/* ── Banner giải thích ── */}
            <Card className="p-4 bg-muted/40 border border-border/60">
                <div className="flex items-start gap-3 text-xs text-muted-foreground">
                    <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div>
                        <span className="font-semibold text-foreground">How this list is fed:</span>{' '}
                        whenever an engineer records a defect in SAP, it appears here after a sync — with only the
                        symptom and context, no investigation yet. Click <span className="font-semibold text-foreground">Create 8D</span> on
                        a row to open the case: the Copilot then drafts D1–D8 from the defect data and the precedent library.
                        In this POC the sync reads a simulated SAP feed; the live OData connection is a separate task.
                    </div>
                </div>
            </Card>

            {/* ── Bảng worklist ── */}
            {isLoading ? (
                <Card className="p-12 items-center text-center">
                    <Spinner className="w-6 h-6 text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">Loading worklist…</p>
                </Card>
            ) : isError ? (
                <Card className="p-6 border-destructive/50 text-destructive text-sm">
                    Failed to load worklist: {(error as Error)?.message}
                </Card>
            ) : items.length === 0 ? (
                <Card className="p-12 items-center text-center space-y-3">
                    <Inbox className="w-10 h-10 text-muted-foreground" />
                    <div>
                        <p className="text-sm font-medium">Worklist is empty</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Click "Sync from SAP" to pull defects recorded in Record Defects / Create Quality Notification.
                        </p>
                    </div>
                    <Button size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                        {syncMutation.isPending
                            ? <Spinner className="w-4 h-4" />
                            : <FolderSync className="w-4 h-4" />}
                        Sync from SAP
                    </Button>
                </Card>
            ) : (
                <>
                    {newCount > 0 && (
                        <p className="text-xs text-muted-foreground">
                            {newCount} defect{newCount > 1 ? 's' : ''} waiting for an 8D case.
                        </p>
                    )}
                    <Card className="p-0 overflow-hidden">
                        <Table containerClassName="overflow-x-auto overflow-y-hidden">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-32">Notification</TableHead>
                                    <TableHead className="w-16">Origin</TableHead>
                                    <TableHead>Symptom</TableHead>
                                    <TableHead className="w-36">Material</TableHead>
                                    <TableHead className="w-32">Work Center</TableHead>
                                    <TableHead className="w-28">Found</TableHead>
                                    <TableHead className="w-28">Quantity</TableHead>
                                    <TableHead className="w-44">Source (SAP)</TableHead>
                                    <TableHead className="w-36 text-right">8D Case</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {items.map((item) => {
                                    const created = item.status === 'EightDCreated' && item.report_ID;
                                    const isCreating = creatingID === item.ID;
                                    return (
                                        <TableRow key={item.ID}>
                                            <TableCell className="font-mono text-xs font-medium">
                                                {item.notificationId}
                                            </TableCell>

                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={cn(
                                                        'font-mono text-xs',
                                                        originShort(item.origin) === 'Q1'
                                                            ? 'bg-destructive/10 text-destructive border-destructive/20'
                                                            : 'bg-muted text-muted-foreground border-border',
                                                    )}
                                                >
                                                    {originShort(item.origin)}
                                                </Badge>
                                            </TableCell>

                                            <TableCell className="max-w-xs">
                                                <div className="truncate text-sm">{item.symptomShortText}</div>
                                                {item.defectText && (
                                                    <div className="truncate text-xs text-muted-foreground mt-0.5">
                                                        {item.defectCode} · {item.defectText}
                                                    </div>
                                                )}
                                            </TableCell>

                                            <TableCell>
                                                <div className="text-xs font-mono">{item.materialId ?? '—'}</div>
                                                <div className="text-xs text-muted-foreground truncate">
                                                    {item.materialDesc}
                                                </div>
                                            </TableCell>

                                            <TableCell>
                                                <div className="text-xs font-mono">{item.workCenterId ?? '—'}</div>
                                                <div className="text-xs text-muted-foreground truncate">
                                                    {item.workCenterDesc}
                                                </div>
                                            </TableCell>

                                            <TableCell className="text-xs text-muted-foreground">
                                                {formatDate(item.foundDate)}
                                            </TableCell>

                                            <TableCell className="text-xs text-muted-foreground">
                                                {item.quantityExtent ?? '—'}
                                            </TableCell>

                                            <TableCell>
                                                <SourceSystemBadge item={item} />
                                            </TableCell>

                                            <TableCell className="text-right">
                                                {created ? (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => navigate(`/8d/${item.report_ID}`)}
                                                    >
                                                        <ArrowUpRight className="w-3.5 h-3.5" />
                                                        Open 8D
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => createMutation.mutate(item.ID)}
                                                        disabled={createMutation.isPending}
                                                    >
                                                        {isCreating
                                                            ? <Spinner className="w-3.5 h-3.5" />
                                                            : <Sparkles className="w-3.5 h-3.5" />}
                                                        Create 8D
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </Card>
                </>
            )}
        </div>
    );
}

export default WorklistPage;
