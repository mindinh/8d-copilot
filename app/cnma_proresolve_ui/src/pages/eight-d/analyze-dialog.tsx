import { useRef, useState } from 'react';
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Spinner,
    Textarea,
} from '@cnma/react-ui';
import { AlertCircle, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { eightDService } from '@/services/eightd-service';

/**
 * Nhận một Golden Dataset JSON rồi xếp lịch phân tích.
 *
 * ── Vì sao validate ở phía client ──
 * Không phải để thay backend — backend vẫn chạy đủ 13 ràng buộc toàn vẹn. Chỉ là
 * lỗi JSON hỏng cú pháp thì bắt ngay tại chỗ rẻ hơn nhiều so với đi một vòng
 * server, và thông báo cũng cụ thể hơn.
 */

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Gọi khi report đã được xếp lịch; nhận ID để điều hướng sang trang chi tiết. */
    onScheduled: (reportID: string) => void;
}

/** Kiểm tra nhanh xem chuỗi có phải Golden Dataset không. */
function inspect(text: string): { ok: true; caseId: string } | { ok: false; reason: string } {
    if (!text.trim()) return { ok: false, reason: 'Paste or upload a JSON dataset first.' };

    let parsed: any;
    try {
        parsed = JSON.parse(text);
    } catch (e: any) {
        return { ok: false, reason: `Not valid JSON — ${e.message}` };
    }

    const notifications = parsed?.data?.notifications ?? parsed?.nested_case_view?.notification_id;
    if (!notifications) {
        return {
            ok: false,
            reason: "This is valid JSON but not a Golden Dataset — no 'data.notifications' block found.",
        };
    }

    const caseId =
        parsed?.data?.notifications?.[0]?.notification_id ??
        parsed?.nested_case_view?.notification_id ??
        'unknown';

    return { ok: true, caseId };
}

export function AnalyzeDialog({ open, onOpenChange, onScheduled }: Props) {
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const check = text ? inspect(text) : null;

    const reset = () => {
        setText('');
        setError(null);
        setBusy(false);
    };

    async function handleFile(file: File) {
        setError(null);
        const content = await file.text();
        setText(content);
    }

    async function submit() {
        const result = inspect(text);
        if (!result.ok) {
            setError(result.reason);
            return;
        }

        setBusy(true);
        setError(null);

        try {
            const reportID = await eightDService.analyzeFromJson(text);
            toast.success(`Analysis scheduled for ${result.caseId}`, {
                description: 'This takes 60–90 seconds. The page updates automatically.',
            });
            reset();
            onOpenChange(false);
            onScheduled(reportID);
        } catch (e: any) {
            // Backend trả về lý do rất cụ thể khi dataset vi phạm ràng buộc —
            // hiện nguyên văn, đừng thay bằng "Something went wrong".
            const message =
                e?.response?.data?.error?.message ??
                e?.message ??
                'Could not schedule the analysis.';
            setError(message);
            setBusy(false);
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!busy) {
                    if (!v) reset();
                    onOpenChange(v);
                }
            }}
        >
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Analyze from JSON</DialogTitle>
                    <DialogDescription>
                        Paste a Golden Dataset describing one SAP QM defect case. The AI extracts the
                        verified facts and drafts all eight disciplines.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <input
                            ref={fileRef}
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void handleFile(f);
                                e.target.value = '';
                            }}
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => fileRef.current?.click()}
                        >
                            <Upload className="w-4 h-4" />
                            Upload file
                        </Button>

                        {text && (
                            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setText('')}>
                                Clear
                            </Button>
                        )}

                        {check?.ok && (
                            <span className="text-xs text-emerald-600 ml-auto">
                                Case {check.caseId} · {(text.length / 1024).toFixed(0)} KB
                            </span>
                        )}
                    </div>

                    <Textarea
                        value={text}
                        onChange={(e) => { setText(e.target.value); setError(null); }}
                        disabled={busy}
                        placeholder='{ "meta": { … }, "data": { "notifications": [ … ] } }'
                        className="font-mono text-xs h-56 resize-none"
                    />

                    {(error || (text && check && !check.ok)) && (
                        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                            <span className="break-words">
                                {error ?? (check && !check.ok ? check.reason : '')}
                            </span>
                        </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                        Sample datasets live in <code className="font-mono">mock-data/</code> in the repository.
                    </p>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => { reset(); onOpenChange(false); }}
                    >
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={busy || !check?.ok}>
                        {busy && <Spinner className="w-4 h-4" />}
                        {busy ? 'Scheduling…' : 'Analyze'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
