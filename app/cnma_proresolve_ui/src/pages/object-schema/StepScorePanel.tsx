import { useEffect, useState } from 'react';
import {
    Badge, Button, Label, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger,
    SelectValue, Spinner, cn,
} from '@cnma/react-ui';
import { CheckCircle2, FlaskConical, Play, Sparkles, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
    embedLibrary, getLibraryCases, previewScore,
    type LibraryCase, type ScorePreview,
} from '@/services/retrieval-service';

/**
 * Panel 3 — what the current settings actually do.
 *
 * Weights and thresholds are abstract until you see them applied. This scores
 * two real cases from the library with the profile as configured and says, in
 * one line, whether this step would have been shown that case at all.
 */

const LEVEL_STYLE: Record<string, string> = {
    exact: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
    fallback: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
    none: 'border-border text-muted-foreground',
};

interface StepScorePanelProps {
    stepCode: string;
    profileKey: string;
    minScore: number;
    maxScore: number;
    /** Unsaved edits are not what the server scores with — say so. */
    dirty: boolean;
}

export function StepScorePanel({
    stepCode, profileKey, minScore, maxScore, dirty,
}: StepScorePanelProps) {
    const [cases, setCases] = useState<LibraryCase[]>([]);
    const [caseA, setCaseA] = useState('');
    const [caseB, setCaseB] = useState('');
    const [result, setResult] = useState<ScorePreview | null>(null);
    const [running, setRunning] = useState(false);
    const [embedding, setEmbedding] = useState(false);

    const loadCases = () => getLibraryCases()
        .then((rows) => {
            setCases(rows);
            setCaseA((current) => current || rows[0]?.notificationId || '');
            setCaseB((current) => current || rows[1]?.notificationId || '');
        })
        .catch((e: any) => toast.error(`Could not load case library: ${e.message}`));

    useEffect(() => { void loadCases(); }, []);

    const embedded = cases.filter((c) => c.embeddingModel);
    const notEmbedded = cases.length - embedded.length;
    const qualifies = result && !result.error && result.score >= minScore;

    return (
        <aside className="flex w-80 shrink-0 flex-col border-l bg-card">
            <div className="border-b p-3.5">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FlaskConical className="h-4 w-4" />
                    </div>
                    <span className="text-sm">Test Configuration</span>
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="space-y-4 p-3.5">
                    {dirty && (
                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                            Scores below use the <span className="font-semibold">saved</span> profile.
                            Save to test your current edits.
                        </div>
                    )}

                    {([['Case A', caseA, setCaseA], ['Case B', caseB, setCaseB]] as const).map(
                        ([label, value, setValue]) => (
                            <div key={label} className="space-y-1.5">
                                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {label}
                                </Label>
                                <Select value={value} onValueChange={setValue}>
                                    <SelectTrigger className="h-8.5 font-mono text-xs">
                                        <SelectValue placeholder="Select a case" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {cases.map((c) => (
                                            <SelectItem key={c.notificationId} value={c.notificationId} className="font-mono text-xs">
                                                {c.notificationId}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ),
                    )}

                    <Button
                        size="sm"
                        className="w-full gap-1.5"
                        disabled={!caseA || !caseB || caseA === caseB || running}
                        onClick={async () => {
                            setRunning(true);
                            try {
                                setResult(await previewScore(caseA, caseB, profileKey));
                            } catch (e: any) {
                                toast.error(`Scoring failed: ${e?.response?.data?.error?.message ?? e.message}`);
                            } finally {
                                setRunning(false);
                            }
                        }}
                    >
                        {running ? <Spinner className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        Score this pair
                    </Button>

                    {result?.error && (
                        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
                            {result.error}
                        </p>
                    )}

                    {result && !result.error && (
                        <div className="space-y-3">
                            <div
                                className={cn(
                                    'rounded-xl border p-3 text-center',
                                    qualifies
                                        ? 'border-emerald-500/40 bg-emerald-500/5'
                                        : 'border-border bg-muted/40',
                                )}
                            >
                                <div className="font-mono text-3xl font-bold text-foreground">
                                    {result.score}
                                    <span className="text-lg text-muted-foreground">/{result.maxScore}</span>
                                </div>
                                <div
                                    className={cn(
                                        'mt-1.5 flex items-center justify-center gap-1.5 text-xs font-medium',
                                        qualifies
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : 'text-muted-foreground',
                                    )}
                                >
                                    {qualifies
                                        ? <><CheckCircle2 className="h-3.5 w-3.5" /> {stepCode} would see this case</>
                                        : <><XCircle className="h-3.5 w-3.5" /> Below threshold {minScore} — {stepCode} would not</>}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                {result.breakdown.map((b) => (
                                    <div
                                        key={b.criterionKey}
                                        className="flex items-center gap-2 rounded-lg border bg-background p-2 text-[11px]"
                                    >
                                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                                            {b.label}
                                        </span>
                                        <Badge variant="outline" className={cn('h-4 px-1', LEVEL_STYLE[b.level])}>
                                            {b.level}
                                        </Badge>
                                        <span className="w-10 shrink-0 text-right font-mono font-semibold">
                                            {b.points}/{b.maxPoints}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {result.breakdown.some((b) => b.matchedOn) && (
                                <div className="space-y-1 rounded-lg bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
                                    {result.breakdown.filter((b) => b.matchedOn).map((b) => (
                                        <div key={b.criterionKey} className="truncate">
                                            <span className="font-medium text-foreground">{b.label}:</span>{' '}
                                            {b.matchedOn}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </ScrollArea>

            <div className="space-y-2 border-t p-3.5">
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Embeddings</span>
                    <span className="font-mono font-medium text-foreground">
                        {embedded.length}/{cases.length}
                    </span>
                </div>
                {notEmbedded > 0 && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        {notEmbedded} case{notEmbedded === 1 ? '' : 's'} cannot be matched by meaning yet.
                    </p>
                )}
                <Button
                    size="sm" variant="outline"
                    className="w-full gap-1.5 text-xs"
                    disabled={embedding || cases.length === 0}
                    onClick={async () => {
                        setEmbedding(true);
                        try {
                            const report = await embedLibrary(false);
                            toast.success(
                                `Embedded ${report.embedded}, skipped ${report.skipped}, failed ${report.failed}.`,
                            );
                            await loadCases();
                        } catch (e: any) {
                            toast.error(`Embedding failed: ${e?.response?.data?.error?.message ?? e.message}`);
                        } finally {
                            setEmbedding(false);
                        }
                    }}
                >
                    {embedding ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Embed missing cases
                </Button>
                <div className="text-[11px] text-muted-foreground">
                    Reachable score <span className="font-mono font-semibold text-foreground">{maxScore}</span>
                    {' · '}threshold <span className="font-mono font-semibold text-foreground">{minScore}</span>
                </div>
            </div>
        </aside>
    );
}
