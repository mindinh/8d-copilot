import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Spinner, cn } from '@cnma/react-ui';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ClipboardList, Info, PlusCircle, RefreshCw, Sparkles } from 'lucide-react';
import {
    eightDService,
    isCustomerComplaint,
    reviewStatusOf,
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

/**
 * Tiến độ duyệt của một case: x/8 bước đã được ký.
 *
 * ── Vì sao cột này đáng giá hơn tất cả những cột đã bỏ ──
 * Bản mockup flagship đặt nó ở cuối worklist, và đúng: người mở danh sách 8D
 * không hỏi "nguyên nhân gốc là gì" — họ hỏi "case nào còn dở". Một thanh tiến
 * độ trả lời câu đó trong một cái liếc, còn nguyên nhân gốc thì phải đọc.
 *
 * Đếm theo `reviewStatus = 'Approved'`, tức chữ ký thật của con người, không
 * phải "AI đã sinh ra chữ". Report phân tích trước khi có cột duyệt đọc lên là
 * null và tính là chưa duyệt — xem `reviewStatusOf`.
 */
function CompletenessCell({ report }: { report: Report8D }) {
    const steps = report.disciplines ?? [];
    const approved = steps.filter((d) => reviewStatusOf(d) === 'Approved').length;
    const done = approved === TOTAL_STEPS;

    return (
        <div className="min-w-0">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                    className={cn('h-full rounded-full transition-all', done ? 'bg-success' : 'bg-primary')}
                    style={{ width: `${(approved / TOTAL_STEPS) * 100}%` }}
                />
            </div>
            <span className="mt-1 block text-[10.5px] tabular-nums text-muted-foreground">
                {approved}/{TOTAL_STEPS} steps
            </span>
        </div>
    );
}

const TOTAL_STEPS = 8;

/**
 * Khai báo cột của bảng 8D Reports.
 *
 * ── Vì sao là một mảng chứ không phải JSX ──
 * Nhãn, bề rộng và cách vẽ của một cột nằm CÙNG một chỗ. Bản viết tay trước đây
 * tách header và ô ra hai nơi, nên sửa một cột phải sửa hai chỗ — và đó đúng là
 * cách cột CoPQ trôi thành canh phải ở dưới mà canh trái ở trên.
 *
 * ── Vì sao còn tám cột ──
 * `Origin` gộp vào `Notification` (cùng trả lời "case nào"). `AI, unaided` gộp
 * vào `Root cause` — hai cột cạnh nhau vốn hiện cùng một bộ sáu từ Ishikawa.
 * `AI Models` bỏ hẳn: đó là siêu dữ liệu của LẦN CHẠY, không phải thông tin về
 * case, và trang chi tiết đã có sẵn.
 *
 * `labelKey` đi qua i18n; khoá không có bản dịch thì `t()` trả lại chính chuỗi
 * đó, nên viết thẳng tiếng Anh ở đây là an toàn.
 */
const REPORT_COLUMNS: DataTableColumn<Report8D>[] = [
    {
        key: 'notificationId',
        labelKey: 'Case',
        width: 150,
        minWidth: 130,
        className: 'font-mono text-xs font-semibold',
    },
    {
        key: 'origin',
        labelKey: 'Origin',
        width: 170,
        minWidth: 140,
        renderType: 'custom',
        // Chu day du, khong phai ma Q1/Q3. Nguoi doc worklist khong phai ai cung
        // thuoc bang ma phan loai thong bao cua SAP — ban mockup viet thang ra, va
        // do la lua chon dung.
        render: (_v, row) => {
            const q1 = isCustomerComplaint(row.origin);
            return (
                <span
                    className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-[11px] font-medium',
                        q1 ? 'bg-destructive/10 text-destructive' : 'bg-info/10 text-info',
                    )}
                >
                    {q1 ? 'Customer Complaint' : 'Internal Defect'}
                </span>
            );
        },
    },
    {
        key: 'materialDesc',
        labelKey: 'Material',
        width: 190,
        minWidth: 140,
        renderType: 'custom',
        // Mo ta truoc, ma sau va nho hon: "Bracket Housing X240" noi duoc voi nguoi
        // doc, con "MAT-10247" thi chi noi duoc voi he thong.
        render: (_v, row) => (
            <div className="min-w-0">
                <div className="text-xs">{row.materialDesc || row.materialId || '-'}</div>
                {row.materialDesc && row.materialId && (
                    <div className="font-mono text-[10.5px] text-muted-foreground">{row.materialId}</div>
                )}
            </div>
        ),
    },
    {
        key: 'symptomShortText',
        labelKey: 'Symptom',
        width: 340,
        minWidth: 220,
        renderType: 'custom',
        render: (_v, row) => (
            <span className="text-xs">{row.symptomShortText || '-'}</span>
        ),
    },
    {
        key: 'status',
        labelKey: 'Status',
        width: 130,
        minWidth: 110,
        renderType: 'custom',
        render: (_v, row) => (
            row.status === 'Analyzing' ? <RunningSpinner /> : <ReportStatusBadge status={row.status} />
        ),
    },
    {
        key: 'disciplines',
        labelKey: 'Completeness',
        width: 150,
        minWidth: 130,
        renderType: 'custom',
        render: (_v, row) => <CompletenessCell report={row} />,
    },
    {
        key: 'createdBy',
        labelKey: 'Created By',
        width: 160,
        minWidth: 140,
        renderType: 'custom',
        render: (_v, row) => (
            <div className="min-w-0">
                <div className="text-xs font-medium text-foreground truncate">
                    {row.createdBy || 'System'}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                    {formatDateTime(row.createdAt)}
                </div>
            </div>
        ),
    },
    {
        key: 'modifiedBy',
        labelKey: 'Last Updated By',
        width: 160,
        minWidth: 140,
        renderType: 'custom',
        render: (_v, row) => (
            <div className="min-w-0">
                <div className="text-xs font-medium text-foreground truncate">
                    {row.modifiedBy || row.createdBy || 'System'}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                    {formatDateTime(row.modifiedAt || row.createdAt)}
                </div>
            </div>
        ),
    },
];

function formatDateTime(value?: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
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
    const queryClient = useQueryClient();
    const [analyzeOpen, setAnalyzeOpen] = useState(false);
    const [createDefectOpen, setCreateDefectOpen] = useState(false);

    /**
     * Report vừa được xếp lịch: BỎ cache của bảng trước khi rời trang.
     *
     * Không bỏ thì cache còn giữ danh sách chụp TRƯỚC khi report tồn tại. Lúc
     * người dùng bấm back, bảng dựng lại từ đúng bản chụp đó — thiếu hàng mới, và
     * vì thiếu nên `refetchInterval` không thấy ai đang `Analyzing` nên không bao
     * giờ bật polling. Bảng đứng im chứ không phải chậm.
     */
    const goToNewReport = (reportID: string) => {
        void queryClient.invalidateQueries({ queryKey: ['8d'] });
        navigate(`/8d/${reportID}`);
    };

    const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
        queryKey: ['8d', 'reports'],
        queryFn: () => eightDService.list(),
        // Mặc định toàn cục là staleTime 5 phút — SAI cho bảng này. Quay lại từ
        // trang chi tiết trong vòng 5 phút thì React Query coi cache còn tươi và
        // không hỏi lại, nên bảng thiếu hẳn report vừa tạo. Tệ hơn: thiếu hàng đó
        // thì `refetchInterval` dưới đây thấy không có ai `Analyzing` và tắt luôn
        // polling — bảng đứng im vĩnh viễn chứ không phải chậm vài giây.
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        // Chỉ quay vòng khi thật sự có việc đang chạy.
        refetchInterval: (query) => {
            const rows = query.state.data?.value ?? [];
            return rows.some((r: Report8D) => r.status === 'Analyzing') ? POLL_INTERVAL_MS : false;
        },
        // Một lượt phân tích mất 3-5 phút; không ai ngồi nhìn hết chừng đó. Mặc
        // định React Query dừng đếm giờ khi tab bị ẩn, nên đổi tab rồi quay lại
        // là thấy trạng thái cũ. Cho chạy tiếp cả khi tab ở nền.
        refetchIntervalInBackground: true,
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
                    {running} analysis running — this page refreshes automatically. Each run takes about 3 minutes.
                </div>
            )}

            {/* ── Banner giải thích ── */}
            <Card className="p-4 bg-muted/40 border border-border/60">
                <div className="flex items-start gap-3 text-xs text-muted-foreground">
                    <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div>
                        <span className="font-semibold text-foreground">Reading the root cause column:</span>{' '}
                        The Copilot runs an independent diagnosis without seeing the recorded 5-Why chain or root
                        cause flag. When it reaches the same conclusion, the column shows the root cause and nothing
                        else. When it reaches a different one, a line underneath says what it read instead, and that
                        case is worth a second look.
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

            {/*
              Bang chung DataTable, bung tu du an CLAIR2.

              Truoc day day la mot bang viet tay: header va o duoc khai o hai cho
              khac nhau, nen chinh mot cot phai sua hai noi va de lech - dung cach
              cot CoPQ tung canh phai o duoi ma canh trai o tren. Voi DataTable thi
              moi cot la MOT khai bao: nhan, be rong, cach ve. Sai lech kieu do
              khong con cho de xay ra.

              Kem theo mien phi: keo doi be rong cot, sap xep, loc, phan trang,
              trang thai loading/rong/loi - tat ca da duoc dung san o do.
            */}
            <DataTable<Report8D>
                data={rows}
                columns={REPORT_COLUMNS}
                isLoading={isLoading}
                error={isError ? (error as Error) : null}
                onRowClick={(row) => navigate(`/8d/${row.ID}`)}
                emptyMessageKey="No 8D reports yet. Use Record Defect (SAP UI5) to create an SAP defect notification, or click Analyze from JSON to start an analysis."
                errorMessageKey="Failed to load reports."
            />

            <AnalyzeDialog
                open={analyzeOpen}
                onOpenChange={setAnalyzeOpen}
                onScheduled={goToNewReport}
            />

            <CreateDefectDialog
                open={createDefectOpen}
                onOpenChange={setCreateDefectOpen}
                onCreated={goToNewReport}
            />
        </div>
    );
}

export default EightDListPage;
