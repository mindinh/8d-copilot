import { useEffect, useState } from 'react';
import {
    Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
    Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
    Separator, Spinner, Switch, Textarea,
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@cnma/react-ui';
import {
    Code, GitBranch, LayoutList, Play, Plus, RotateCcw, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    createCriterion, deleteCriterion, embedLibrary, getCriteria, getLibraryCases,
    getSettings, previewScore, resetRetrievalConfig, swapCriterionOrder,
    updateCriterion, updateSettings,
    type LibraryCase, type RetrievalSettings, type ScorePreview, type SimilarityCriterion,
} from '@/services/retrieval-service';
import { CriterionStepCard } from './criterion-step-card';

/**
 * Cấu hình cách hệ thống tìm case tiền lệ.
 *
 * Dựng theo khuôn Enrichment của CLAIR2: pipeline các bước so khớp, thêm/xoá/đổi
 * thứ tự được, mỗi bước chọn phương pháp và chỉ hiện tham số của phương pháp đó;
 * kèm nút chuyển giữa trình soạn trực quan và JSON thô.
 *
 * Khác một điểm quan trọng so với CLAIR2, và trang này nói thẳng ra: ở CLAIR2
 * thứ tự là THÁC NƯỚC — bước nào khớp trước thì dừng. Ở đây mọi bước đều được
 * chấm và cộng dồn, nên thứ tự chỉ đổi cách đọc bảng phân tích, không đổi điểm.
 */

const LEVEL_STYLE: Record<string, string> = {
    exact: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    fallback: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    none: 'bg-muted text-muted-foreground',
};

/** Biến nhãn thành khoá kỹ thuật ổn định cho bước mới. */
function slugify(label: string, taken: Set<string>): string {
    const base = label
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
        .split(' ').filter(Boolean)
        .map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1)))
        .join('') || 'criterion';
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}${n}`)) n++;
    return `${base}${n}`;
}

export function SimilarityTab() {
    const [criteria, setCriteria] = useState<SimilarityCriterion[]>([]);
    const [settings, setSettings] = useState<RetrievalSettings | null>(null);
    const [cases, setCases] = useState<LibraryCase[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [view, setView] = useState<'form' | 'json'>('form');

    const [caseA, setCaseA] = useState('');
    const [caseB, setCaseB] = useState('');
    const [preview, setPreview] = useState<ScorePreview | null>(null);

    async function reload() {
        const [c, s, l] = await Promise.all([getCriteria(), getSettings(), getLibraryCases()]);
        setCriteria(c);
        setSettings(s);
        setCases(l);
        return { c, l };
    }

    useEffect(() => {
        (async () => {
            try {
                const { l } = await reload();
                if (l[0]) setCaseA(l[0].notificationId);
                if (l[1]) setCaseB(l[1].notificationId);
            } catch (e: any) {
                toast.error(`Could not load retrieval configuration: ${e.message}`);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    /** Ghi rồi nạp lại — trần điểm phụ thuộc mọi bước nên phải đọc lại cả danh sách. */
    async function run(key: string, fn: () => Promise<unknown>) {
        setBusy(key);
        try {
            await fn();
            await reload();
            setPreview(null);
        } catch (e: any) {
            toast.error(`Save failed: ${e?.response?.data?.error?.message ?? e.message}`);
            await reload();
        } finally {
            setBusy(null);
        }
    }

    const maxScore = criteria.filter((c) => c.enabled).reduce((s, c) => s + (c.weight ?? 0), 0);
    const notEmbedded = cases.filter((c) => !c.embeddingModel).length;
    const vectorSteps = criteria.filter((c) => c.matchType === 'cosine' && c.enabled);

    if (loading) {
        return (
            <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                Loading retrieval configuration…
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* ── Thanh chuyển chế độ xem ── */}
            <div className="flex items-center gap-2 rounded-lg border bg-card p-2">
                <Button
                    variant={view === 'form' ? 'secondary' : 'ghost'} size="sm" type="button"
                    onClick={() => setView('form')} className="gap-2"
                >
                    <LayoutList size={16} /> Visual editor
                </Button>
                <Button
                    variant={view === 'json' ? 'secondary' : 'ghost'} size="sm" type="button"
                    onClick={() => setView('json')} className="gap-2"
                >
                    <Code size={16} /> JSON
                </Button>
                <span className="ml-auto text-xs text-muted-foreground">
                    Maximum reachable score{' '}
                    <span className="font-mono font-medium text-foreground">{maxScore}</span>
                </span>
            </div>

            {view === 'json' ? (
                <Card>
                    <CardHeader>
                        <CardTitle>Configuration as JSON</CardTitle>
                        <CardDescription>
                            Read-only. Useful for pasting into a ticket or comparing two environments —
                            edit through the visual editor so every change goes through validation.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Textarea
                            readOnly rows={22}
                            className="font-mono text-xs"
                            value={JSON.stringify({ settings, criteria }, null, 2)}
                        />
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* ── Pipeline ── */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <CardTitle className="flex items-center gap-1.5">
                                        <GitBranch size={16} className="text-primary" />
                                        Matching pipeline
                                    </CardTitle>
                                    <CardDescription className="mt-1">
                                        Every past case is scored against the open one, step by step.
                                        Unlike a waterfall, <em>all</em> steps run and their points add
                                        up — order only changes how the breakdown reads.
                                    </CardDescription>
                                </div>
                                <Button
                                    size="sm" className="h-8 shrink-0 gap-1"
                                    disabled={busy !== null}
                                    onClick={() => {
                                        const taken = new Set(criteria.map((c) => c.criterionKey));
                                        const label = 'New criterion';
                                        void run('new', () => createCriterion({
                                            criterionKey: slugify(label, taken),
                                            label,
                                            description: '',
                                            sourceTable: 'HistoricalCases',
                                            sourceField: 'workCenterId',
                                            matchType: 'exact',
                                            weight: 1,
                                            enabled: false,
                                            sortOrder: (criteria.at(-1)?.sortOrder ?? 0) + 10,
                                        }));
                                    }}
                                >
                                    <Plus size={12} /> Add step
                                </Button>
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-3">
                            {criteria.length === 0 ? (
                                <div className="rounded-xl border-2 border-dashed py-8 text-center text-muted-foreground">
                                    <GitBranch className="mx-auto mb-2 opacity-20" size={28} />
                                    <p className="text-sm font-medium">No matching steps</p>
                                    <p className="mt-1 text-xs">
                                        Without a step nothing scores, and no precedent is ever shown.
                                    </p>
                                </div>
                            ) : (
                                criteria.map((c, i) => (
                                    <CriterionStepCard
                                        key={c.criterionKey}
                                        criterion={c}
                                        index={i}
                                        isFirst={i === 0}
                                        isLast={i === criteria.length - 1}
                                        busy={busy !== null}
                                        onPatch={(patch) => void run(c.criterionKey, () => updateCriterion(c.criterionKey, patch))}
                                        onRemove={() => {
                                            if (!window.confirm(`Remove the step "${c.label}"?`)) return;
                                            void run(c.criterionKey, () => deleteCriterion(c.criterionKey));
                                        }}
                                        onMoveUp={() => void run(c.criterionKey, () => swapCriterionOrder(c, criteria[i - 1]))}
                                        onMoveDown={() => void run(c.criterionKey, () => swapCriterionOrder(c, criteria[i + 1]))}
                                    />
                                ))
                            )}

                            <p className="text-xs text-muted-foreground">
                                Turning a step off lowers the maximum score too, not just the score —
                                so 5 out of 8 still reads as a strong match.
                            </p>
                        </CardContent>
                    </Card>

                    {/* ── Ngưỡng ── */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Threshold and result size</CardTitle>
                            <CardDescription>
                                Below the threshold nothing is shown at all. That is deliberate: a weak
                                precedent is worse than none, because it gets cited as if it meant something.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-wrap items-end gap-6">
                            <div className="space-y-1.5">
                                <Label htmlFor="minScore">Minimum score</Label>
                                <Input
                                    id="minScore" type="number" min={0} step={0.5}
                                    className="h-9 w-28"
                                    defaultValue={settings?.minScore ?? 3}
                                    disabled={busy !== null}
                                    onBlur={(e) => {
                                        const v = Number(e.target.value);
                                        if (Number.isFinite(v) && v !== settings?.minScore) {
                                            void run('settings', () => updateSettings({ minScore: v }));
                                        }
                                    }}
                                />
                                <p className="text-xs text-muted-foreground">out of {maxScore}</p>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="topN">Precedents to show</Label>
                                <Input
                                    id="topN" type="number" min={1} max={20}
                                    className="h-9 w-28"
                                    defaultValue={settings?.topN ?? 3}
                                    disabled={busy !== null}
                                    onBlur={(e) => {
                                        const v = Number(e.target.value);
                                        if (Number.isFinite(v) && v !== settings?.topN) {
                                            void run('settings', () => updateSettings({ topN: v }));
                                        }
                                    }}
                                />
                            </div>

                            <div className="flex items-center gap-3 pb-2">
                                <Switch
                                    id="closedOnly"
                                    checked={settings?.closedOnly ?? true}
                                    disabled={busy !== null}
                                    onCheckedChange={(v) => void run('settings', () => updateSettings({ closedOnly: v }))}
                                />
                                <Label htmlFor="closedOnly" className="cursor-pointer">
                                    Closed cases only
                                    <span className="block text-xs font-normal text-muted-foreground">
                                        An open case has no verified outcome to learn from
                                    </span>
                                </Label>
                            </div>

                            <Button
                                variant="outline" size="sm" className="ml-auto"
                                disabled={busy !== null}
                                onClick={() => {
                                    if (!window.confirm('Discard every change to the pipeline and thresholds?')) return;
                                    void run('settings', async () => {
                                        await resetRetrievalConfig('criteria');
                                        await resetRetrievalConfig('settings');
                                        toast.success('Restored the measured defaults');
                                    });
                                }}
                            >
                                <RotateCcw className="h-4 w-4" />
                                Restore defaults
                            </Button>
                        </CardContent>
                    </Card>

                    {/* ── Vector ── */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Embeddings</CardTitle>
                            <CardDescription>
                                A vector step can only score cases that have been embedded. Everything
                                else keeps working without them.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-wrap items-center gap-4">
                            <div className="text-sm">
                                <span className="font-medium">{cases.length - notEmbedded}</span>
                                <span className="text-muted-foreground"> of {cases.length} cases embedded</span>
                                {cases.find((c) => c.embeddingModel) && (
                                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                                        {cases.find((c) => c.embeddingModel)!.embeddingModel}
                                    </span>
                                )}
                            </div>

                            {notEmbedded > 0 && vectorSteps.length > 0 && (
                                <Badge variant="destructive" className="text-[11px]">
                                    {notEmbedded} case{notEmbedded === 1 ? '' : 's'} cannot be matched by the vector step
                                </Badge>
                            )}
                            {vectorSteps.length === 0 && (
                                <Badge variant="secondary" className="text-[11px]">
                                    No vector step enabled — embeddings are not used right now
                                </Badge>
                            )}

                            <div className="ml-auto flex gap-2">
                                <Button
                                    variant="outline" size="sm" disabled={busy !== null}
                                    onClick={() => void run('embed', async () => {
                                        const r = await embedLibrary(false);
                                        toast.success(`Embedded ${r.embedded}, skipped ${r.skipped}`
                                            + (r.failed ? `, ${r.failed} failed` : ''));
                                    })}
                                >
                                    {busy === 'embed' ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                                    Embed missing
                                </Button>
                                <Button
                                    variant="ghost" size="sm" disabled={busy !== null}
                                    onClick={() => void run('embed', async () => {
                                        const r = await embedLibrary(true);
                                        toast.success(`Re-embedded ${r.embedded} case(s) with ${r.model}`);
                                    })}
                                >
                                    Re-embed all
                                </Button>
                            </div>

                            <p className="w-full text-xs text-muted-foreground">
                                Re-embed everything after changing the embedding model or the text the
                                embedding is built from — vectors from two different models are not
                                comparable, and mixing them produces plausible but meaningless scores.
                            </p>
                        </CardContent>
                    </Card>
                </>
            )}

            {/* ── Chấm thử ── */}
            <Card>
                <CardHeader>
                    <CardTitle>Score two cases</CardTitle>
                    <CardDescription>
                        Runs the pipeline above against two cases from the library, without starting an
                        analysis. Use it to see what a weight change actually does.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="space-y-1.5">
                            <Label>Case A</Label>
                            <Select value={caseA} onValueChange={setCaseA}>
                                <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Pick a case" /></SelectTrigger>
                                <SelectContent>
                                    {cases.map((c) => (
                                        <SelectItem key={c.notificationId} value={c.notificationId}>
                                            {c.notificationId}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Case B</Label>
                            <Select value={caseB} onValueChange={setCaseB}>
                                <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Pick a case" /></SelectTrigger>
                                <SelectContent>
                                    {cases.map((c) => (
                                        <SelectItem key={c.notificationId} value={c.notificationId}>
                                            {c.notificationId}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            size="sm"
                            disabled={!caseA || !caseB || caseA === caseB || busy !== null}
                            onClick={async () => {
                                setBusy('preview');
                                try {
                                    setPreview(await previewScore(caseA, caseB));
                                } catch (e: any) {
                                    toast.error(`Scoring failed: ${e.message}`);
                                } finally {
                                    setBusy(null);
                                }
                            }}
                        >
                            {busy === 'preview' ? <Spinner className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            Score
                        </Button>
                    </div>

                    {preview && (
                        <>
                            <Separator />
                            {preview.error ? (
                                <p className="text-sm text-destructive">{preview.error}</p>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex items-baseline gap-3">
                                        <span className="text-2xl font-semibold tabular-nums">
                                            {preview.score}
                                            <span className="text-base font-normal text-muted-foreground">
                                                {' '}/ {preview.maxScore}
                                            </span>
                                        </span>
                                        <Badge variant={preview.score >= (settings?.minScore ?? 3) ? 'default' : 'secondary'}>
                                            {preview.score >= (settings?.minScore ?? 3)
                                                ? 'would be shown as a precedent'
                                                : 'below threshold — not shown'}
                                        </Badge>
                                    </div>

                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Step</TableHead>
                                                <TableHead>Match</TableHead>
                                                <TableHead>Matched on</TableHead>
                                                <TableHead className="text-right">Points</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {preview.breakdown.map((b) => (
                                                <TableRow key={b.criterionKey}>
                                                    <TableCell>{b.label}</TableCell>
                                                    <TableCell>
                                                        <span className={`rounded px-1.5 py-0.5 text-[11px] ${LEVEL_STYLE[b.level]}`}>
                                                            {b.level}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs text-muted-foreground">
                                                        {b.matchedOn ?? '—'}
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">
                                                        {b.points} <span className="text-muted-foreground">/ {b.maxPoints}</span>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
