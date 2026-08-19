import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Spinner,
} from '@cnma/react-ui';
import { Boxes, Scissors, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useRetrievalConfig } from '@/hooks/use-retrieval-config';
import {
    cloneRetrievalProfile, getProfiles, getStepBindings, updateStepBinding,
    type RetrievalProfile, type StepBinding,
} from '@/services/retrieval-service';
import { CriteriaPipelineSection } from '../sections/criteria-pipeline';
import { EmbeddingSection } from '../sections/embedding-status';
import { ScorePreviewSection } from '../sections/score-preview';
import { ThresholdSection } from '../sections/threshold-settings';

/**
 * Tab "Similarity search" của MỘT bước D.
 *
 * ── Vì sao dùng lại đúng các section của Training Center ──
 * Training Center có tab "Precedent Search & Similarity" nói về profile mặc định.
 * Màn hình này hỏi cùng một câu, chỉ khác profile. Viết một bộ section thứ hai là
 * hai bản sao của cùng một màn hình, và chúng sẽ lệch nhau ngay lần đầu ai đó sửa
 * một bên. `useRetrievalConfig(profileKey)` là chỗ duy nhất khác nhau.
 *
 * ── Vì sao KHÔNG có nút "Add step" ở đây ──
 * Bộ field của một profile được dựng ở trang Object Schema, nơi có cả danh mục
 * field SAP quét từ kho thật. Tab này chỉ cấu hình những field đã được định
 * nghĩa ở đó — trọng số, cách so, ngưỡng. Xem `allowAdd` trong
 * `CriteriaPipelineSection`.
 */

/** `D4` → khoá profile riêng cho bước đó, ổn định và đọc được. */
function detachedKeyFor(stepCode: string, taken: Set<string>): string {
    const base = stepCode.toLowerCase();
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
}

export function StepSimilarityEditor({ stepCode, stepLabel }: { stepCode: string; stepLabel: string }) {
    const [profiles, setProfiles] = useState<RetrievalProfile[]>([]);
    const [bindings, setBindings] = useState<StepBinding[]>([]);
    const [loading, setLoading] = useState(true);
    const [switching, setSwitching] = useState(false);

    const loadBindings = useCallback(async () => {
        const [p, b] = await Promise.all([getProfiles(), getStepBindings()]);
        setProfiles(p);
        setBindings(b);
    }, []);

    useEffect(() => {
        loadBindings()
            .catch((e: any) => toast.error(`Could not load profiles: ${e.message}`))
            .finally(() => setLoading(false));
    }, [loadBindings]);

    const boundKey = bindings.find((b) => b.stepCode === stepCode)?.profile_profileKey ?? 'default';
    const cfg = useRetrievalConfig(boundKey);
    const profile = profiles.find((p) => p.profileKey === boundKey) ?? null;

    // Bước KHÁC đang dùng chung profile này. Không nói ra thì chỉnh trọng số ở
    // đây sẽ âm thầm đổi kết quả của những bước đó.
    const sharedWith = bindings
        .filter((b) => b.profile_profileKey === boundKey && b.stepCode !== stepCode)
        .map((b) => b.stepCode)
        .sort();

    const rebind = async (profileKey: string) => {
        setSwitching(true);
        try {
            await updateStepBinding(stepCode, profileKey);
            // Chỉ nạp lại ràng buộc. `useRetrievalConfig` theo dõi `boundKey` và
            // tự nạp profile mới — gọi `cfg.reload()` ở đây sẽ nạp bằng khoá CŨ,
            // vì state chưa kịp cập nhật trong cùng lượt render.
            await loadBindings();
        } catch (e: any) {
            toast.error(e?.response?.data?.error?.message ?? e.message);
        } finally {
            setSwitching(false);
        }
    };

    if (loading || cfg.loading) {
        return (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                <Spinner className="mr-2 h-4 w-4" /> Loading similarity configuration…
            </div>
        );
    }

    const busy = switching || cfg.busy !== null;

    return (
        <div className="mx-auto w-full max-w-5xl space-y-6 overflow-y-auto p-6">
            <div>
                <h2 className="text-lg font-semibold tracking-tight">
                    Precedent Search &amp; Similarity — {stepCode}
                </h2>
                <p className="text-xs text-muted-foreground">
                    {stepCode} chấm kho case bằng bộ trọng số riêng của nó. Đây là thứ quyết định{' '}
                    {stepLabel} nhìn thấy case nào — một prompt hoàn hảo trên ba tiền lệ sai vẫn cho
                    ra kết quả sai.
                </p>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <CardTitle className="flex items-center gap-1.5">
                                <Boxes size={16} className="text-primary" />
                                Profile của {stepCode}
                            </CardTitle>
                            <CardDescription className="mt-1">
                                {profile?.description
                                    || 'Bộ trọng số quyết định thứ hạng tiền lệ của bước này.'}
                            </CardDescription>
                        </div>
                        <Button asChild size="sm" variant="outline" className="h-8">
                            <Link to="/object-schema">Thêm / bớt field</Link>
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-56 flex-1 space-y-1.5">
                            <span className="text-xs font-semibold uppercase text-muted-foreground">
                                Profile đang dùng
                            </span>
                            <Select value={boundKey} disabled={busy} onValueChange={(v) => void rebind(v)}>
                                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {profiles.map((p) => (
                                        <SelectItem key={p.profileKey} value={p.profileKey}>
                                            {p.label}
                                            {p.isSystem && (
                                                <Badge variant="outline" className="ml-2 h-4 px-1 text-xs">
                                                    system
                                                </Badge>
                                            )}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Button
                            variant="outline" size="sm" className="h-9 gap-1.5"
                            disabled={busy}
                            onClick={() => {
                                const key = detachedKeyFor(stepCode, new Set(profiles.map((p) => p.profileKey)));
                                setSwitching(true);
                                void (async () => {
                                    try {
                                        await cloneRetrievalProfile({
                                            sourceKey: boundKey,
                                            profileKey: key,
                                            label: `${stepCode} — ${stepLabel}`,
                                            description:
                                                `Bộ trọng số riêng của ${stepCode}, tách từ "${profile?.label ?? boundKey}". `
                                                + 'Chỉnh ở đây không ảnh hưởng bước nào khác.',
                                        });
                                        await updateStepBinding(stepCode, key);
                                        await loadBindings();
                                        toast.success(`${stepCode} giờ chạy profile riêng của nó.`);
                                    } catch (e: any) {
                                        toast.error(e?.response?.data?.error?.message ?? e.message);
                                    } finally {
                                        setSwitching(false);
                                    }
                                })();
                            }}
                        >
                            <Scissors size={14} /> Tách profile riêng cho {stepCode}
                        </Button>
                    </div>

                    {sharedWith.length > 0 && (
                        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-2.5 text-xs">
                            <Users size={14} className="mt-0.5 shrink-0 text-warning" />
                            <span>
                                <span className="font-medium">{sharedWith.join(', ')}</span> đang dùng
                                chung profile này. Mọi thay đổi bên dưới sẽ đổi kết quả của cả những
                                bước đó. Cần trọng số riêng cho {stepCode} thì bấm{' '}
                                <span className="font-medium">Tách profile riêng</span>.
                            </span>
                        </div>
                    )}
                </CardContent>
            </Card>

            <ThresholdSection cfg={cfg} />
            {/* Bộ field do trang Object Schema dựng — ở đây chỉ chỉnh trọng số. */}
            <CriteriaPipelineSection cfg={cfg} allowAdd={false} />
            <EmbeddingSection cfg={cfg} />
            <ScorePreviewSection cfg={cfg} />
        </div>
    );
}
