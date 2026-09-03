import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Checkbox,
    Label,
} from '@cnma/react-ui';
import { Check, Database, GitFork, Loader2, Network, Sparkles, ShieldCheck } from 'lucide-react';
import {
    getGraphRetrievalSettings,
    updateGraphRetrievalSettings,
    type GraphRetrievalSettings,
} from '@/services/retrieval-service';

export function RetrievalEngineSection() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<GraphRetrievalSettings>({
        ID: 'GLOBAL',
        engine: 'graph',
        maxKeywords: 30,
        fallbackEnabled: true,
    });

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const s = await getGraphRetrievalSettings();
                if (mounted && s) {
                    setSettings(s);
                }
            } catch (err: any) {
                // If API fails or entity empty, default remains 'graph'
                console.warn('Could not load graph settings:', err);
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    const handleSelectEngine = (engine: 'graph' | 'scoring') => {
        setSettings((prev) => ({ ...prev, engine }));
    };

    const handleToggleFallback = (checked: boolean) => {
        setSettings((prev) => ({ ...prev, fallbackEnabled: checked }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateGraphRetrievalSettings({
                engine: settings.engine,
                fallbackEnabled: settings.fallbackEnabled,
            });
            toast.success(
                settings.engine === 'graph'
                    ? 'Switched to SAP HANA Knowledge Graph Engine'
                    : 'Switched to Vector Search & Heuristic Scoring',
            );
        } catch (err: any) {
            toast.error(`Failed to update retrieval engine: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Card className="p-4 flex items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading Precedent Retrieval Engine configuration…
            </Card>
        );
    }

    const isGraph = settings.engine === 'graph';

    return (
        <Card className="border-border/80 shadow-sm overflow-hidden">
            <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <Network className="h-5 w-5" />
                        </div>
                        <div>
                            <CardTitle className="text-base font-semibold">
                                Precedent Retrieval Engine (D1 – D8)
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Choose how the 8D Copilot searches and surfaces past closed cases across all eight disciplines.
                            </CardDescription>
                        </div>
                    </div>
                    <Badge
                        variant="outline"
                        className={
                            isGraph
                                ? 'border-primary/40 bg-primary/10 text-primary font-medium w-fit'
                                : 'border-muted-foreground/30 bg-muted text-muted-foreground font-medium w-fit'
                        }
                    >
                        Active: {isGraph ? 'HANA Knowledge Graph' : 'Vector Search & Scoring'}
                    </Badge>
                </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-0">
                {/* 2 Engine Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Option 1: Knowledge Graph (Default / Recommended) */}
                    <div
                        onClick={() => handleSelectEngine('graph')}
                        className={`relative cursor-pointer rounded-xl border p-4 transition-all duration-200 flex flex-col justify-between ${
                            isGraph
                                ? 'border-primary bg-primary/[0.04] shadow-sm ring-2 ring-primary/20'
                                : 'border-border bg-card hover:bg-muted/40'
                        }`}
                    >
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <GitFork className={`h-4 w-4 ${isGraph ? 'text-primary' : 'text-muted-foreground'}`} />
                                    <span className="font-semibold text-sm">HANA Knowledge Graph</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0 font-medium">
                                        Default · Recommended
                                    </Badge>
                                    {isGraph && (
                                        <div className="h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                            <Check className="h-3 w-3" />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Uses <strong>SAP HANA Graph Engine</strong> and <strong>OpenCypher</strong> to traverse verified relationships
                                across Defects, Materials, Work Centers, FMEA and Actions.
                            </p>
                            <ul className="text-[11px] text-muted-foreground/90 space-y-1 pt-1 border-t border-border/50">
                                <li className="flex items-center gap-1.5">
                                    <Sparkles className="h-3 w-3 text-primary shrink-0" />
                                    <span>Exact, auditable evidence paths (no hallucinated citations)</span>
                                </li>
                                <li className="flex items-center gap-1.5">
                                    <Sparkles className="h-3 w-3 text-primary shrink-0" />
                                    <span>Zero embedding latency and zero vector token costs</span>
                                </li>
                                <li className="flex items-center gap-1.5">
                                    <Sparkles className="h-3 w-3 text-primary shrink-0" />
                                    <span>Specific relation weights tailored per discipline (D1 – D8)</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* Option 2: Vector Search & Scoring (Legacy) */}
                    <div
                        onClick={() => handleSelectEngine('scoring')}
                        className={`relative cursor-pointer rounded-xl border p-4 transition-all duration-200 flex flex-col justify-between ${
                            !isGraph
                                ? 'border-primary bg-primary/[0.04] shadow-sm ring-2 ring-primary/20'
                                : 'border-border bg-card hover:bg-muted/40'
                        }`}
                    >
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Database className={`h-4 w-4 ${!isGraph ? 'text-primary' : 'text-muted-foreground'}`} />
                                    <span className="font-semibold text-sm">Vector Search & Heuristic Scoring</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                                        Legacy
                                    </Badge>
                                    {!isGraph && (
                                        <div className="h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                            <Check className="h-3 w-3" />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Uses <strong>Cosine similarity on text embeddings</strong> combined with multi-attribute
                                scoring tables (0–16 scale) configured in Retrieval Profiles.
                            </p>
                            <ul className="text-[11px] text-muted-foreground/90 space-y-1 pt-1 border-t border-border/50">
                                <li className="flex items-center gap-1.5">
                                    <ShieldCheck className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <span>Keyword tokenization + AI Core embedding models</span>
                                </li>
                                <li className="flex items-center gap-1.5">
                                    <ShieldCheck className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <span>Subjective score accumulation across fields</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Fallback option & Action Footer */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-border/60">
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="fallback-enabled"
                            checked={settings.fallbackEnabled}
                            onCheckedChange={(c) => handleToggleFallback(Boolean(c))}
                        />
                        <div className="grid gap-0.5 leading-none">
                            <Label htmlFor="fallback-enabled" className="text-xs font-medium cursor-pointer">
                                Automatic fallback to Scoring if Graph is unavailable
                            </Label>
                            <p className="text-[11px] text-muted-foreground">
                                Recommended. Ensures analysis runs smoothly on non-HANA environments (like local SQLite).
                            </p>
                        </div>
                    </div>

                    <Button size="sm" onClick={handleSave} disabled={saving} className="self-end sm:self-auto text-xs px-4">
                        {saving ? (
                            <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                Saving…
                            </>
                        ) : (
                            'Save Engine Configuration'
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
