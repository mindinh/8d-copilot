import { useEffect, useRef, useState } from 'react';
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
 * Nhận JSON của một case defect rồi xếp lịch phân tích.
 *
 * ── Vì sao validate ở phía client ──
 * Không phải để thay backend — backend mới là nơi quyết định. Chỉ là JSON hỏng
 * cú pháp hoặc dán nhầm file thì bắt ngay tại chỗ rẻ hơn nhiều so với đi một
 * vòng server, và thông báo cũng cụ thể hơn.
 *
 * ⚠️ Kiểm tra dưới đây phải KHÔNG chặt hơn `extractDeepCase` ở
 * `srv/src/domain/eightd/caseMapper.ts`. Chặt hơn thì UI từ chối đúng những file
 * mà backend xử lý được — đó chính là lỗi đã xảy ra khi mock data chuyển sang
 * Deep Structure còn hàm này vẫn chỉ tìm `data.notifications`.
 */

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Gọi khi report đã được xếp lịch; nhận ID để điều hướng sang trang chi tiết. */
    onScheduled: (reportID: string) => void;
}

/**
 * Bóc lớp bọc của OData (`value: [ … ]`). Export SAP thật luôn có lớp này; file
 * viết tay thì không, nên phải chịu được cả hai.
 */
function unwrapOData(raw: any): any {
    if (!raw || typeof raw !== 'object' || !('value' in raw)) return raw;
    if (Array.isArray(raw.value)) return raw.value[0] ?? null;
    if (raw.value && typeof raw.value === 'object') return raw.value;
    return raw;
}

/** Kiểm tra nhanh xem chuỗi có phải một case 8D không, và lấy mã case. */
function inspect(text: string): { ok: true; caseId: string } | { ok: false; reason: string } {
    if (!text.trim()) return { ok: false, reason: 'Paste or upload a JSON case file first.' };

    let parsed: any;
    try {
        parsed = JSON.parse(text);
    } catch (e: any) {
        return { ok: false, reason: `Not valid JSON — ${e.message}` };
    }

    const obj = unwrapOData(parsed);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return { ok: false, reason: 'Expected a JSON object describing one defect case.' };
    }

    // Deep Structure Business JSON — định dạng chính hiện nay.
    const nid = obj.notificationId ?? obj.notification_id ?? obj.notification ?? obj.ID ?? obj.document;
    if (nid || obj.symptomShortText || obj.symptom_short_text) {
        return { ok: true, caseId: String(nid ?? 'unknown') };
    }

    // Golden Dataset cũ — vẫn nhận, bộ mock-data/beta còn ở định dạng này.
    if (Array.isArray(obj.data?.notifications) && obj.data.notifications.length > 0) {
        return { ok: true, caseId: String(obj.data.notifications[0]?.notification_id ?? 'unknown') };
    }
    if (obj.nested_case_view?.notification_id) {
        return { ok: true, caseId: String(obj.nested_case_view.notification_id) };
    }

    return {
        ok: false,
        reason:
            'This is valid JSON but not a defect case — expected a top-level "notificationId", ' +
            'or a "data.notifications" block.',
    };
}

/**
 * Sự vụ mẫu gói theo bundle UI.
 *
 * Có mặt vì bắt người dùng đi tìm file JSON trên máy là không demo được, và
 * người thử app cũng không có repo. Danh sách do `scripts/bundle-library.mjs`
 * sinh ra từ `mock-data/incoming/`.
 */
interface SampleIssue {
    file: string;
    notificationId: string;
    origin: string;
    symptom: string;
    workCenter: string | null;
    material: string | null;
    investigated: boolean;
}

export function AnalyzeDialog({ open, onOpenChange, onScheduled }: Props) {
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [samples, setSamples] = useState<SampleIssue[]>([]);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open || samples.length) return;
        // Không có mẫu cũng không sao — dán tay vẫn là đường chính.
        fetch('samples/index.json')
            .then((r) => (r.ok ? r.json() : []))
            .then(setSamples)
            .catch(() => setSamples([]));
    }, [open, samples.length]);

    async function loadSample(s: SampleIssue) {
        setError(null);
        try {
            const res = await fetch(`samples/${s.file}`);
            if (!res.ok) throw new Error(`${res.status}`);
            setText(JSON.stringify(await res.json(), null, 2));
        } catch (e: any) {
            setError(`Could not load the sample: ${e.message}`);
        }
    }

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
                        Paste the JSON of one SAP QM defect case. The AI extracts the verified facts
                        and drafts all eight disciplines.
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

                    {samples.length > 0 && (
                        <div className="rounded-lg border border-dashed p-3">
                            <p className="text-xs font-medium">Or start from an incoming issue</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Freshly logged cases — symptom and context only, no root cause, no
                                actions, no team. That is what the Copilot is for.
                            </p>
                            <div className="mt-2 space-y-1">
                                {samples.map((s) => (
                                    <button
                                        key={s.file}
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void loadSample(s)}
                                        className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted disabled:opacity-50"
                                    >
                                        <span className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                                            {s.notificationId}
                                        </span>
                                        <span className="flex-1">
                                            <span className="block text-xs">{s.symptom}</span>
                                            <span className="block text-[11px] text-muted-foreground">
                                                {s.origin.startsWith('Q1') ? 'Customer complaint' : 'Internal defect'}
                                                {s.workCenter && ` · ${s.workCenter}`}
                                                {s.material && ` · ${s.material}`}
                                            </span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <Textarea
                        value={text}
                        onChange={(e) => { setText(e.target.value); setError(null); }}
                        disabled={busy}
                        placeholder='{ "notificationId": "8D-10048412", "symptomShortText": "…", "inspections": [ … ] }'
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
