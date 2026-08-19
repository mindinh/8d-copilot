import {
    Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Switch,
} from '@cnma/react-ui';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { resetRetrievalConfig, updateProfile } from '@/services/retrieval-service';
import type { RetrievalConfigState } from '@/hooks/use-retrieval-config';

/** Ngưỡng điểm, số tiền lệ lấy ra, và nút khôi phục mặc định. */
export function ThresholdSection({ cfg }: { cfg: RetrievalConfigState }) {
    const { settings, busy, run, maxScore, profileKey } = cfg;
    const maxLimit = maxScore || 16;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Retrieval Thresholds & Result Limits</CardTitle>
                <CardDescription>
                    Set the minimum match score threshold and maximum number of historical cases passed to the AI.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-start gap-8">
                <div className="space-y-1.5">
                    <Label htmlFor="minScore" className="text-xs font-semibold">Minimum Score (Threshold)</Label>
                    <div className="flex items-center gap-2">
                        <Input
                            id="minScore" type="number" min={0} max={maxLimit} step={0.5}
                            className="h-9 w-28"
                            defaultValue={settings?.minScore ?? 3}
                            disabled={busy !== null}
                            onBlur={(e) => {
                                let v = Number(e.target.value);
                                if (!Number.isFinite(v)) v = 0;
                                v = Math.max(0, Math.min(v, maxLimit));
                                e.target.value = String(v);
                                if (v !== settings?.minScore) {
                                    void run('settings', () => updateProfile(profileKey, { minScore: v }));
                                }
                            }}
                        />
                        <span className="text-xs text-muted-foreground font-mono">/ {maxLimit} max</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Cases scoring below this threshold are ignored.</p>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="topN" className="text-xs font-semibold">Max Precedents (Top N)</Label>
                    <div className="flex items-center gap-2">
                        <Input
                            id="topN" type="number" min={1} max={20} step={1}
                            className="h-9 w-28"
                            defaultValue={settings?.topN ?? 3}
                            disabled={busy !== null}
                            onBlur={(e) => {
                                let v = Math.round(Number(e.target.value));
                                if (!Number.isFinite(v)) v = 1;
                                v = Math.max(1, Math.min(v, 20));
                                e.target.value = String(v);
                                if (v !== settings?.topN) {
                                    void run('settings', () => updateProfile(profileKey, { topN: v }));
                                }
                            }}
                        />
                        <span className="text-xs text-muted-foreground">cases</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Max top-scoring cases sent to AI context.</p>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Precedent Filter</Label>
                    <div className="flex items-center gap-2.5 h-9">
                        <Switch
                            id="closedOnly"
                            checked={settings?.closedOnly ?? true}
                            disabled={busy !== null}
                            onCheckedChange={(v) => void run('settings', () => updateProfile(profileKey, { closedOnly: v }))}
                        />
                        <Label htmlFor="closedOnly" className="cursor-pointer text-xs font-medium">
                            Closed Cases Only
                        </Label>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Only use cases with confirmed resolution.</p>
                </div>

                <div className="ml-auto pt-5">
                    <Button
                        variant="outline" size="sm"
                        disabled={busy !== null}
                        onClick={() => {
                            if (!window.confirm('Discard every change to the pipeline and thresholds?')) return;
                            void run('settings', async () => {
                                await resetRetrievalConfig('profiles');
                                toast.success('Restored the measured defaults');
                            });
                        }}
                    >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Restore Defaults
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
