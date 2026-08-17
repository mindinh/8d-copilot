import {
    Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Spinner,
} from '@cnma/react-ui';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { embedLibrary } from '@/services/retrieval-service';
import type { RetrievalConfigState } from '@/hooks/use-retrieval-config';

/** Trạng thái nhúng của kho, và hai nút sinh vector. */
export function EmbeddingSection({ cfg }: { cfg: RetrievalConfigState }) {
    const { cases, busy, run, notEmbedded, embeddedCount, embeddingModel, hasVectorStep } = cfg;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Embeddings</CardTitle>
                <CardDescription>
                    A vector step can only score cases that have been embedded. Everything else keeps
                    working without them.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4">
                <div className="text-sm">
                    <span className="font-medium">{embeddedCount}</span>
                    <span className="text-muted-foreground"> of {cases.length} cases embedded</span>
                    {embeddingModel && (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{embeddingModel}</span>
                    )}
                </div>

                {notEmbedded > 0 && hasVectorStep && (
                    <Badge variant="destructive" className="text-xs">
                        {notEmbedded} case{notEmbedded === 1 ? '' : 's'} cannot be matched by the vector step
                    </Badge>
                )}
                {!hasVectorStep && (
                    <Badge variant="secondary" className="text-xs">
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
                    Re-embed everything after changing the embedding model or the text the embedding is
                    built from — vectors from two different models are not comparable, and mixing them
                    produces plausible but meaningless scores.
                </p>
            </CardContent>
        </Card>
    );
}
