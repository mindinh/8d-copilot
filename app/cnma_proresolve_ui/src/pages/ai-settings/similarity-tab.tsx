import { useState } from 'react';
import {
    Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Textarea,
} from '@cnma/react-ui';
import { Code, LayoutList } from 'lucide-react';
import { useRetrievalConfig } from '@/hooks/use-retrieval-config';
import { CriteriaPipelineSection } from './sections/criteria-pipeline';
import { ThresholdSection } from './sections/threshold-settings';
import { EmbeddingSection } from './sections/embedding-status';
import { ScorePreviewSection } from './sections/score-preview';

/**
 * Cấu hình cách hệ thống tìm case tiền lệ — gom theo chủ đề.
 *
 * Trang Workflow trình bày CÙNG những mảnh này nhưng theo thứ tự quy trình. Cả
 * hai dùng chung `useRetrievalConfig` và chung các section, nên không thể lệch
 * nhau.
 */
export function SimilarityTab() {
    const cfg = useRetrievalConfig();
    const [view, setView] = useState<'form' | 'json'>('form');

    if (cfg.loading) {
        return (
            <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                Loading retrieval configuration…
            </div>
        );
    }

    return (
        <div className="space-y-5">
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
                    <span className="font-mono font-medium text-foreground">{cfg.maxScore}</span>
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
                            value={JSON.stringify({ settings: cfg.settings, criteria: cfg.criteria }, null, 2)}
                        />
                    </CardContent>
                </Card>
            ) : (
                <>
                    <CriteriaPipelineSection cfg={cfg} />
                    <ThresholdSection cfg={cfg} />
                    <EmbeddingSection cfg={cfg} />
                </>
            )}

            <ScorePreviewSection cfg={cfg} />
        </div>
    );
}
