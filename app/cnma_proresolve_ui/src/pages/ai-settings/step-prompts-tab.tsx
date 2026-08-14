import { useEffect, useState } from 'react';
import {
    Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
    Label, Separator, Spinner, Switch, Textarea,
} from '@cnma/react-ui';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
    getStepPrompts, resetRetrievalConfig, updateStepPrompt, type StepPrompt,
} from '@/services/retrieval-service';

/**
 * Sửa hướng dẫn của từng discipline.
 *
 * ── Ô này điều khiển đúng cái gì ──
 * Pipeline sinh cả tám discipline trong MỘT lời gọi model. Prompt của lời gọi đó
 * gồm hai phần:
 *
 *   phần LUẬT     grounding, bắt buộc trích nguồn, thành thật về chỗ thiếu dữ
 *                 liệu, D6 luôn dataBacked = false. Nằm trong code, KHÔNG sửa
 *                 được ở đây — đó là cơ chế chống bịa, cho sửa trên UI nghĩa là
 *                 cho phép tắt nó bằng vài cú gõ.
 *
 *   phần HƯỚNG DẪN  "D4 nên nhấn cái gì", "D8 nên tóm tắt thế nào". Đây là quyết
 *                   định nghiệp vụ, thay đổi theo nhà máy — và đây là thứ trang
 *                   này sửa.
 *
 * Nội dung được seed sẵn bằng chính bản đang chạy, nên mở lên là thấy ngay prompt
 * thật chứ không phải ô rỗng.
 */

export function StepPromptsTab() {
    const [prompts, setPrompts] = useState<StepPrompt[]>([]);
    const [active, setActive] = useState<string>('D1');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [systemPrompt, setSystemPrompt] = useState('');

    const current = prompts.find((p) => p.stepCode === active) ?? null;
    const dirty = current !== null && systemPrompt !== (current.systemPrompt ?? '');

    async function reload(keep = active) {
        const list = await getStepPrompts();
        setPrompts(list);
        const sel = list.find((p) => p.stepCode === keep) ?? list[0] ?? null;
        if (sel) {
            setActive(sel.stepCode);
            setSystemPrompt(sel.systemPrompt ?? '');
        }
        return list;
    }

    useEffect(() => {
        (async () => {
            try {
                await reload('D1');
            } catch (e: any) {
                toast.error(`Could not load step prompts: ${e.message}`);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    function select(step: StepPrompt) {
        if (dirty && !window.confirm('Discard unsaved changes to this step?')) return;
        setActive(step.stepCode);
        setSystemPrompt(step.systemPrompt ?? '');
    }

    async function save() {
        if (!current) return;
        setSaving(true);
        try {
            await updateStepPrompt(current.stepCode, {
                // Rỗng → null: backend hiểu là "chưa cấu hình" và rơi về hằng số
                // trong code. Lưu chuỗi rỗng sẽ thành hướng dẫn rỗng, tức là
                // discipline đó chạy không có chỉ dẫn nào.
                systemPrompt: systemPrompt.trim() || null,
                version: (current.version ?? 1) + 1,
            });
            await reload(current.stepCode);
            toast.success(`${current.stepCode} prompt saved`);
        } catch (e: any) {
            toast.error(`Save failed: ${e?.response?.data?.error?.message ?? e.message}`);
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                Loading step prompts…
            </div>
        );
    }

    return (
        <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
            <Card className="h-fit">
                <CardHeader>
                    <CardTitle className="text-base">Discipline</CardTitle>
                    <CardDescription>Pick a step to edit its prompt.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                    {prompts.map((p) => {
                        const configured = Boolean(p.systemPrompt || p.userTemplate);
                        return (
                            <Button
                                key={p.stepCode}
                                type="button"
                                variant="ghost"
                                onClick={() => select(p)}
                                className={`flex w-full items-center justify-start gap-2 rounded-md px-2.5 py-2 text-left text-sm h-auto transition-colors
                                    ${p.stepCode === active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
                            >
                                <span className="w-7 shrink-0 font-mono text-xs text-muted-foreground">
                                    {p.stepCode}
                                </span>
                                <span className="flex-1 truncate text-left">{p.label}</span>
                                {configured && (
                                    <span
                                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                                        title="Custom prompt configured"
                                    />
                                )}
                            </Button>
                        );
                    })}
                </CardContent>
            </Card>

            {current && (
                <Card>
                    <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    {current.stepCode} — {current.label}
                                    {!current.systemPrompt && (
                                        <Badge variant="secondary" className="text-xs">empty — using code default</Badge>
                                    )}
                                    <Badge variant="outline" className="text-xs">v{current.version}</Badge>
                                </CardTitle>
                                <CardDescription className="mt-1">{current.description}</CardDescription>
                            </div>
                            <div className="flex shrink-0 items-center gap-2 pt-1">
                                <Switch
                                    id="enabled"
                                    checked={current.enabled}
                                    disabled={saving}
                                    onCheckedChange={async (v) => {
                                        await updateStepPrompt(current.stepCode, { enabled: v });
                                        await reload(current.stepCode);
                                    }}
                                />
                                <Label htmlFor="enabled" className="cursor-pointer text-xs">Enabled</Label>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="system">Guidance for this discipline</Label>
                            <p className="text-xs text-muted-foreground">
                                What the model should emphasise when writing this discipline. It is
                                inserted into the report prompt under <span className="font-mono">DISCIPLINE GUIDE</span>.
                                The rules that stop the model inventing facts — grounding, citing
                                sources, admitting gaps — live in the code and are not editable here.
                            </p>
                            <Textarea
                                id="system"
                                rows={12}
                                className="font-mono text-xs"
                                placeholder="Empty — the guidance from srv/src/domain/eightd/prompts.ts is used."
                                value={systemPrompt}
                                onChange={(e) => setSystemPrompt(e.target.value)}
                                disabled={saving}
                            />
                        </div>

                        <Separator />

                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline" size="sm"
                                disabled={saving}
                                onClick={async () => {
                                    if (!window.confirm('Restore every step to the guidance shipped in the code?')) return;
                                    setSaving(true);
                                    try {
                                        await resetRetrievalConfig('prompts');
                                        await reload(current.stepCode);
                                        toast.success('All steps restored to the code defaults');
                                    } catch (e: any) {
                                        toast.error(`Reset failed: ${e.message}`);
                                    } finally {
                                        setSaving(false);
                                    }
                                }}
                            >
                                <RotateCcw className="w-4 h-4" />
                                Restore code defaults
                            </Button>

                            <div className="ml-auto flex items-center gap-2">
                                {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
                                <Button
                                    variant="ghost" size="sm"
                                    disabled={saving || !dirty}
                                    onClick={() => {
                                        setSystemPrompt(current.systemPrompt ?? '');
                                    }}
                                >
                                    Discard
                                </Button>
                                <Button size="sm" disabled={saving || !dirty} onClick={save}>
                                    {saving && <Spinner className="w-4 h-4" />}
                                    {saving ? 'Saving…' : 'Save prompt'}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
