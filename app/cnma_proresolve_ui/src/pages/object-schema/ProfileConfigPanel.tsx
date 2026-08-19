import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
    Badge, Button, Input, Label, ScrollArea, Tooltip, TooltipContent, TooltipTrigger, cn,
} from '@cnma/react-ui';
import {
    Boxes, Check, CheckCircle2, Code2, Copy, GripVertical, LayoutGrid, Sigma, SlidersHorizontal,
    Sparkles, Trash2, Users, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    STEP_CODES, type ProfileCriterion, type SourceFieldInfo,
} from '@/services/retrieval-service';
import type { ProfileDraft } from '@/hooks/use-object-schema';

/**
 * Panel 2 — Profile configuration, criteria management, and JSON View.
 */

const STEP_METADATA: Record<string, { title: string; subtitle: string }> = {
    D1: { title: 'Team Formation', subtitle: 'Team members & expert roles' },
    D2: { title: 'Problem Description', subtitle: 'Defect symptoms & scope' },
    D3: { title: 'Containment Actions', subtitle: 'Interim containment actions' },
    D4: { title: 'Root Cause Analysis', subtitle: 'Ishikawa & 5-Why analysis' },
    D5: { title: 'Corrective Actions', subtitle: 'Permanent corrective action plan' },
    D6: { title: 'Implementation', subtitle: 'Action verification & audit' },
    D7: { title: 'Preventive Actions', subtitle: 'FMEA & process prevention' },
    D8: { title: 'Team Recognition', subtitle: 'Case closure & lessons learned' },
};

const METHOD_STYLE: Record<string, { label: string; className: string }> = {
    exact: { label: 'Exact Match', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
    keyword: { label: 'Keyword Match', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' },
    family: { label: 'Family Group', className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30' },
    cosine: { label: 'Vector (Cosine)', className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30' },
};

function FieldCard({
    criterion: c, field, onRemove,
}: {
    criterion: ProfileCriterion;
    field: SourceFieldInfo | undefined;
    onRemove: () => void;
}) {
    const drag = useDraggable({
        id: `criterion-${c.criterionKey}`,
        data: { criterionKey: c.criterionKey },
    });
    const methodKey = c.matchType || 'exact';
    const methodInfo = METHOD_STYLE[methodKey] ?? { label: methodKey, className: 'bg-muted text-muted-foreground' };
    const labelText = field?.label || c.label || c.sourceField;

    return (
        <div
            ref={drag.setNodeRef}
            className={cn(
                'group relative flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-xs transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm',
                drag.isDragging && 'opacity-30 scale-98 ring-2 ring-primary/40',
            )}
        >
            <div className="flex items-center gap-2">
                <span
                    {...drag.attributes}
                    {...drag.listeners}
                    className="flex h-7 w-5 cursor-grab items-center justify-center text-muted-foreground/60 transition-colors hover:text-foreground active:cursor-grabbing"
                    title="Drag to reorder or remove"
                >
                    <GripVertical className="h-4 w-4" />
                </span>

                {/* Non-editable clean title label */}
                <div className="min-w-0 flex-1 px-1 py-0.5">
                    <span className="text-xs font-bold text-foreground">
                        {labelText}
                    </span>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                    {/* Method Badge */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Badge className={cn('border px-2 py-0.5 font-medium text-[11px]', methodInfo.className)}>
                                {methodInfo.label}
                            </Badge>
                        </TooltipTrigger>
                        <TooltipContent
                            side="bottom"
                            className="max-w-72 border border-red-200 bg-white p-3 text-xs text-slate-800 shadow-xl dark:border-red-200 dark:bg-white dark:text-slate-800"
                        >
                            Match method and weights are configured in each 8D step's <span className="font-bold text-red-600">Similarity Search</span> settings.
                        </TooltipContent>
                    </Tooltip>

                    {/* Weight indicator */}
                    <Badge variant="outline" className="h-6 font-mono text-[11px] font-semibold text-foreground">
                        +{c.weight ?? 0} pts
                    </Badge>

                    {!c.enabled && (
                        <Badge variant="secondary" className="h-6 text-[10px] uppercase text-muted-foreground">
                            Disabled
                        </Badge>
                    )}

                    {/* Delete button */}
                    <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        onClick={onRemove}
                        title="Remove criterion from profile"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            {/* Path Sub-header */}
            <div className="flex items-center justify-between pl-7 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="text-muted-foreground/70">Field Path:</span>
                    <span className="rounded bg-muted/70 px-1.5 py-0.5 text-foreground">{c.sourceField}</span>
                    {field?.indexed && (
                        <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-sans text-[10px] font-medium" title="SQL Indexed">
                            <Zap className="h-3 w-3" /> Indexed
                        </span>
                    )}
                    {field?.multiValued && (
                        <span className="inline-flex items-center gap-0.5 text-sky-600 dark:text-sky-400 font-sans text-[10px] font-medium" title="Multi-valued collection">
                            <Sigma className="h-3 w-3" /> Array
                        </span>
                    )}
                </div>

                {field?.note && (
                    <span className="max-w-xs truncate text-[11px] text-muted-foreground/80">
                        {field.note}
                    </span>
                )}
            </div>

            {!field && (
                <div className="mt-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                    Field <span className="font-mono font-semibold">{c.sourceField}</span> is not found in database catalog — this criterion will produce no score match.
                </div>
            )}
        </div>
    );
}

interface ProfileConfigPanelProps {
    draft: ProfileDraft;
    profileKey: string;
    fieldByPath: Map<string, SourceFieldInfo>;
    ownerByStep: Record<string, string>;
    profileLabelOf: (profileKey: string) => string;
    isDragging: boolean;
    onChange: (patch: Partial<ProfileDraft>) => void;
}

export function ProfileConfigPanel({
    draft, profileKey, fieldByPath, ownerByStep, profileLabelOf, isDragging, onChange,
}: ProfileConfigPanelProps) {
    const [activeTab, setActiveTab] = useState<'visual' | 'json'>('visual');
    const [copied, setCopied] = useState(false);
    const drop = useDroppable({ id: 'profile-fields' });

    const toggleStep = (code: string) => onChange({
        steps: draft.steps.includes(code)
            ? draft.steps.filter((s) => s !== code)
            : [...draft.steps, code].sort(),
    });

    const jsonSchemaObject = {
        profileKey,
        label: draft.label,
        description: draft.description,
        assignedSteps: draft.steps,
        criteriaCount: draft.fields.length,
        criteria: draft.fields.map((c) => ({
            criterionKey: c.criterionKey,
            label: c.label,
            sourceField: c.sourceField,
            sourceTable: c.sourceTable,
            matchType: c.matchType || 'exact',
            weight: c.weight ?? 1,
            enabled: Boolean(c.enabled),
            minSimilarity: c.minSimilarity ?? null,
        })),
    };

    const jsonString = JSON.stringify(jsonSchemaObject, null, 2);

    const handleCopyJson = () => {
        void navigator.clipboard.writeText(jsonString);
        setCopied(true);
        toast.success('JSON schema copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <main className="flex min-w-0 flex-1 flex-col bg-muted/20">
            {/* Header with Visual / JSON Tab Switcher */}
            <div className="border-b bg-card p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 font-semibold text-foreground">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Boxes className="h-4 w-4" />
                            </div>
                            <span className="text-sm">Profile Configuration & 8D Binding</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Define similarity criteria for this profile and bind it to specific 8D methodology steps.
                        </p>
                    </div>

                    {/* Tab Switcher */}
                    <div className="flex items-center gap-1 rounded-lg bg-muted/80 p-1 text-xs font-medium">
                        <button
                            type="button"
                            onClick={() => setActiveTab('visual')}
                            className={cn(
                                'flex items-center gap-1.5 rounded-md px-3 py-1 transition-all',
                                activeTab === 'visual'
                                    ? 'bg-background text-foreground shadow-xs font-semibold'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-background/40',
                            )}
                        >
                            <LayoutGrid className="h-3.5 w-3.5" />
                            Visual Editor
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('json')}
                            className={cn(
                                'flex items-center gap-1.5 rounded-md px-3 py-1 transition-all',
                                activeTab === 'json'
                                    ? 'bg-background text-foreground shadow-xs font-semibold'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-background/40',
                            )}
                        >
                            <Code2 className="h-3.5 w-3.5" />
                            JSON Schema
                        </button>
                    </div>
                </div>
            </div>

            {/* TAB CONTENT: JSON VIEW */}
            {activeTab === 'json' ? (
                <div className="flex flex-1 flex-col overflow-hidden p-4">
                    <div className="flex items-center justify-between rounded-t-xl border border-b-0 bg-card px-4 py-2.5">
                        <div className="flex items-center gap-2">
                            <Code2 className="h-4 w-4 text-primary" />
                            <span className="text-xs font-semibold text-foreground">
                                Profile JSON Schema ({profileKey}.json)
                            </span>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCopyJson}
                            className="h-7 gap-1.5 text-xs font-medium"
                        >
                            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                            {copied ? 'Copied' : 'Copy JSON'}
                        </Button>
                    </div>
                    <ScrollArea className="flex-1 rounded-b-xl border bg-slate-950 p-4 font-mono text-xs text-slate-100 dark:bg-slate-900">
                        <pre className="whitespace-pre-wrap leading-relaxed">{jsonString}</pre>
                    </ScrollArea>
                </div>
            ) : (
                /* TAB CONTENT: VISUAL EDITOR */
                <ScrollArea className="flex-1">
                    <div className="space-y-5 p-4">
                        {/* Metadata Section */}
                        <div className="grid gap-3 rounded-xl border bg-card p-3.5 shadow-xs sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Profile Name
                                </Label>
                                <Input
                                    value={draft.label}
                                    className="h-8.5 text-sm font-medium"
                                    placeholder="e.g. Root Cause Analysis Profile"
                                    onChange={(e) => onChange({ label: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Description
                                </Label>
                                <Input
                                    value={draft.description}
                                    className="h-8.5 text-sm"
                                    placeholder="Describe the purpose or domain of this profile..."
                                    onChange={(e) => onChange({ description: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* ── 8D Steps Binding Section ── */}
                        <div className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
                            <div className="flex items-center justify-between border-b pb-2.5">
                                <div className="flex items-center gap-2">
                                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                                        <Users className="h-3.5 w-3.5" />
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                                            Assigned 8D Steps ({draft.steps.length} of 8 steps)
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            Click steps below to bind or unbind them with this retrieval profile.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Interactive 8D Step Grid */}
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {STEP_CODES.map((code) => {
                                    const selected = draft.steps.includes(code);
                                    const owner = ownerByStep[code];
                                    const meta = STEP_METADATA[code] ?? { title: code, subtitle: '' };
                                    const isOwnedByOther = owner && owner !== profileKey;
                                    const stolenFrom = selected && isOwnedByOther ? owner : null;

                                    return (
                                        <Tooltip key={code}>
                                            <TooltipTrigger asChild>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleStep(code)}
                                                    className={cn(
                                                        'group relative flex flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition-all duration-150',
                                                        selected
                                                            ? 'border-primary/60 bg-primary/10 shadow-xs ring-1 ring-primary/30'
                                                            : 'border-border/70 bg-card hover:border-primary/40 hover:bg-primary/5',
                                                        stolenFrom && 'border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-500/30',
                                                    )}
                                                >
                                                    <div className="flex w-full items-center justify-between">
                                                        <Badge
                                                            variant={selected ? 'default' : 'outline'}
                                                            className={cn(
                                                                'h-5 px-1.5 font-mono text-xs font-bold',
                                                                selected ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                                                            )}
                                                        >
                                                            {code}
                                                        </Badge>
                                                        {selected && (
                                                            <CheckCircle2 className="h-4 w-4 text-primary" />
                                                        )}
                                                    </div>

                                                    <span className="mt-0.5 line-clamp-1 text-xs font-semibold text-foreground">
                                                        {meta.title}
                                                    </span>

                                                    <span className="line-clamp-1 text-[10px] text-muted-foreground">
                                                        {stolenFrom
                                                            ? `Reassigns from ${profileLabelOf(stolenFrom)}`
                                                            : selected
                                                                ? 'Bound to this profile'
                                                                : owner ? `Uses ${profileLabelOf(owner)}` : 'Uses Default'}
                                                    </span>
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent
                                                side="bottom"
                                                className="max-w-72 space-y-1 border border-red-200 bg-white p-3 text-xs text-slate-800 shadow-xl dark:border-red-200 dark:bg-white dark:text-slate-800"
                                            >
                                                <p className="font-bold text-red-600">{code}: {meta.title}</p>
                                                <p className="text-slate-600">{meta.subtitle}</p>
                                                <p className="border-t border-red-100 pt-1 font-semibold text-red-700">
                                                    {stolenFrom
                                                        ? `Currently bound to "${profileLabelOf(stolenFrom)}". Saving will reassign ${code} to this profile.`
                                                        : selected
                                                            ? `${code} uses this profile.`
                                                            : `Click to assign ${code} to this profile (currently uses "${profileLabelOf(owner)}").`}
                                                </p>
                                            </TooltipContent>
                                        </Tooltip>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ── Criteria List Dropzone ── */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        Profile Criteria ({draft.fields.length})
                                    </span>
                                </div>
                                <span className="text-[11px] text-muted-foreground">
                                    Drag fields from left catalog to add • Drag out to remove
                                </span>
                            </div>

                            <div
                                ref={drop.setNodeRef}
                                className={cn(
                                    'min-h-72 space-y-2.5 rounded-xl border-2 border-dashed p-3.5 transition-all duration-150',
                                    drop.isOver
                                        ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                                        : isDragging
                                            ? 'border-primary/40 bg-primary/5'
                                            : 'border-border/70 bg-card/60',
                                )}
                            >
                                {draft.fields.map((c) => (
                                    <FieldCard
                                        key={c.criterionKey}
                                        criterion={c}
                                        field={fieldByPath.get(c.sourceField ?? '')}
                                        onRemove={() => onChange({
                                            fields: draft.fields.filter((f) => f.criterionKey !== c.criterionKey),
                                        })}
                                    />
                                ))}

                                {!draft.fields.length && (
                                    <div className="flex min-h-60 flex-col items-center justify-center text-center text-muted-foreground">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                            <Sparkles className="h-6 w-6" />
                                        </div>
                                        <p className="mt-3 text-sm font-semibold text-foreground">No criteria in profile</p>
                                        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                                            Drag fields from the left <span className="font-medium text-foreground">Source Field Catalog</span> into this area to configure similarity matching criteria.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Pro Tip Note */}
                        <div className="flex items-start gap-2.5 rounded-xl border bg-card p-3 text-xs text-muted-foreground shadow-xs">
                            <SlidersHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <div className="space-y-0.5">
                                <p className="font-medium text-foreground">Tip for fine-tuning step scoring:</p>
                                <p className="text-[11px] leading-relaxed">
                                    Newly added fields start <span className="font-semibold text-foreground">disabled</span> with a default weight of +1. Open the <span className="font-semibold text-primary">Similarity Search</span> editor in the AI Settings page for each 8D step to fine-tune weights, thresholds, and match rules for specific disciplines.
                                </p>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            )}
        </main>
    );
}


