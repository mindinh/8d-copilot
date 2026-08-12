import { Badge, cn } from '@cnma/react-ui';
import { Loader2 } from 'lucide-react';
import type { ReportStatus } from '@/services/eightd-service';

/**
 * Huy hiệu trạng thái của một report 8D.
 *
 * Không dùng `StatusBadge` của thư viện vì nó ánh xạ theo từ vựng nghiệp vụ
 * chung (Approved / In Progress / …). Bộ trạng thái ở đây là của pipeline —
 * Analyzing, Analyzed, Failed — nên tự khai màu cho đúng nghĩa.
 */

const STYLES: Record<ReportStatus, string> = {
    Draft: 'bg-muted text-muted-foreground border-border',
    Analyzing: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    Analyzed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    Failed: 'bg-destructive/10 text-destructive border-destructive/20',
    Closed: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
};

export function ReportStatusBadge({
    status,
    className,
}: {
    status: ReportStatus;
    className?: string;
}) {
    const style = STYLES[status] ?? STYLES.Draft;

    return (
        <Badge variant="outline" className={cn('gap-1.5 font-medium', style, className)}>
            {status === 'Analyzing' && <Loader2 className="h-3 w-3 animate-spin" />}
            {status}
        </Badge>
    );
}
