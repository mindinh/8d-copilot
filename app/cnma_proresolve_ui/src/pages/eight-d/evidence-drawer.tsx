import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    cn,
} from '@cnma/react-ui';
import { Search, TriangleAlert } from 'lucide-react';
import { resolveEvidencePath } from '../../../../../shared/evidence-path';

/**
 * Bấm vào một nguồn để xem đúng mẩu dữ liệu đứng sau nó.
 *
 * ── Vì sao cần ──
 * Mọi discipline đều liệt kê nguồn dạng `fiveWhy#2`, `ishikawa.Machine`. Với
 * người viết code thì đó là đường dẫn; với kỹ sư chất lượng đang ngồi audit thì
 * đó là một chuỗi ký tự vô nghĩa. Chừng nào chưa bấm ra được giá trị thật thì
 * "mọi khẳng định đều truy được về dữ liệu" vẫn chỉ là một lời hứa in trên màn
 * hình — thứ khách SAP nghe nhiều rồi.
 *
 * Không gọi API: `caseContext` đã nằm sẵn trên report, và `shared/evidence-path`
 * là ĐÚNG bộ luật backend dùng để loại đường dẫn không giải được — nên thứ hiện
 * ở đây khớp với thứ backend đã kiểm.
 */

/** Hiện giá trị đã giải: chuỗi/số để trần, object thì format JSON cho đọc được. */
function EvidenceValue({ value }: { value: unknown }) {
    if (value === null) return <span className="italic text-muted-foreground">null</span>;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return <span className="break-words">{String(value)}</span>;
    }
    const record = value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

    // Object phẳng hiện thành bảng khoá/giá trị — dễ đọc hơn hẳn JSON thô, và
    // phần lớn bằng chứng ở đây đều là object phẳng.
    if (record && Object.values(record).every((v) => v === null || typeof v !== 'object')) {
        return (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                {Object.entries(record).map(([k, v]) => (
                    <div key={k} className="contents">
                        <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
                        <dd className="break-words text-xs">
                            {v === null || v === '' ? <span className="italic text-muted-foreground">empty</span> : String(v)}
                        </dd>
                    </div>
                ))}
            </dl>
        );
    }
    return (
        <pre className="max-h-80 overflow-auto rounded bg-muted/60 p-3 text-xs leading-relaxed">
            {JSON.stringify(value, null, 2)}
        </pre>
    );
}

export function EvidenceDrawer({
    path,
    caseContext,
    onClose,
}: {
    path: string | null;
    caseContext: string | null | undefined;
    onClose: () => void;
}) {
    if (!path) return null;

    let root: unknown = null;
    let parseError: string | null = null;
    try {
        root = caseContext ? JSON.parse(caseContext) : null;
    } catch (e: any) {
        parseError = e?.message ?? 'caseContext is not valid JSON.';
    }

    const resolved = parseError ? null : resolveEvidencePath(root, path);

    return (
        <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="w-[calc(100%-2rem)] sm:max-w-2xl md:max-w-3xl overflow-hidden">
                <DialogHeader>
                    <DialogTitle className="font-mono text-base break-all">{path}</DialogTitle>
                    <DialogDescription>
                        The exact record this discipline cites, read from the case context captured
                        at analysis time.
                    </DialogDescription>
                </DialogHeader>

                {parseError && (
                    <p className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        <TriangleAlert className="mt-px h-4 w-4 shrink-0" />
                        Case context could not be read: {parseError}
                    </p>
                )}

                {resolved && !resolved.found && (
                    <p className="flex items-start gap-2 rounded border border-warning/40 bg-warning/[0.06] px-3 py-2 text-xs">
                        <TriangleAlert className="mt-px h-4 w-4 shrink-0 text-warning" />
                        <span>
                            {/* Nói thẳng vì sao. Một trích dẫn không giải được là thông tin
                                thật về chất lượng báo cáo, không phải sự cố cần giấu. */}
                            <strong className="font-semibold">Not resolvable.</strong> {resolved.reason}
                        </span>
                    </p>
                )}

                {resolved?.found && (
                    <div className="min-w-0 rounded border bg-card px-4 py-3 text-sm">
                        <EvidenceValue value={resolved.value} />
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

/**
 * Danh sách chip nguồn, bấm được.
 *
 * Dùng `<button>` chứ không phải `<code>` có onClick: bàn phím tab tới được và
 * trình đọc màn hình biết đây là hành động.
 */
export function SourceChips({
    sources,
    caseContext,
    className,
}: {
    sources: string[];
    caseContext: string | null | undefined;
    className?: string;
}) {
    const [open, setOpen] = useState<string | null>(null);

    return (
        <>
            <div className={cn('flex flex-wrap gap-1.5', className)}>
                {sources.map((source, i) => (
                    <button
                        key={`${source}-${i}`}
                        type="button"
                        onClick={() => setOpen(source)}
                        title="Show the record behind this source"
                        className="group inline-flex max-w-full items-center gap-1 break-all rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    >
                        <Search className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                        {source}
                    </button>
                ))}
            </div>
            <EvidenceDrawer path={open} caseContext={caseContext} onClose={() => setOpen(null)} />
        </>
    );
}
