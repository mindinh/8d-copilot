import { useState } from 'react';
import {
    DndContext, DragOverlay, KeyboardSensor, PointerSensor,
    useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
    Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
    DialogTitle, Input, Label, Spinner, Textarea, TooltipProvider,
} from '@cnma/react-ui';
import { AlertTriangle, Plus, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { useObjectSchema } from '@/hooks/use-object-schema';
import {
    cloneRetrievalProfile, deleteRetrievalProfile,
    type ProfileCriterion, type SourceFieldInfo,
} from '@/services/retrieval-service';
import { SourceFieldsPanel } from './SourceFieldsPanel';
import { ProfileConfigPanel } from './ProfileConfigPanel';
import { ProfileListPanel } from './ProfileListPanel';

/**
 * Object Schema — Defines similarity matching rules per 8D step.
 */

function criterionKeyFor(path: string, taken: Set<string>): string {
    const base = path
        .replace(/\[\]/g, '')
        .split('.')
        .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join('')
        .replace(/[^A-Za-z0-9]/g, '')
        .slice(0, 36) || 'criterion';
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}${n}`)) n++;
    return `${base}${n}`;
}

function newCriterionFrom(
    field: SourceFieldInfo,
    profileKey: string,
    taken: Set<string>,
): ProfileCriterion {
    const method = field.methods[0] ?? 'exact';
    return {
        profile_profileKey: profileKey,
        criterionKey: criterionKeyFor(field.path, taken),
        label: field.label,
        description: field.note,
        sourceTable: field.sourceTable,
        sourceField: field.path,
        matchType: method,
        weight: 1,
        fallbackField: null,
        fallbackMatch: null,
        fallbackWeight: null,
        minSimilarity: method === 'cosine' ? 0.7 : null,
        enabled: false,
        sortOrder: 0,
    };
}

function CloneProfileDialog({
    open, onOpenChange, sourceLabel, taken, onSubmit, busy,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sourceLabel: string;
    taken: Set<string>;
    onSubmit: (input: { profileKey: string; label: string; description: string }) => void;
    busy: boolean;
}) {
    const [label, setLabel] = useState('');
    const [description, setDescription] = useState('');
    const profileKey = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '').slice(0, 40);
    const clash = Boolean(profileKey) && taken.has(profileKey);

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                onOpenChange(next);
                if (!next) { setLabel(''); setDescription(''); }
            }}
        >
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>New Profile from "{sourceLabel}"</DialogTitle>
                    <DialogDescription>
                        Duplicates all fields and settings from "{sourceLabel}". The new profile will initially be unassigned to any 8D steps.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Profile Name</Label>
                        <Input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="e.g. Root Cause Analysis Profile"
                            className="h-9"
                        />
                        {profileKey && (
                            <p className={`font-mono text-xs ${clash ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                                Key: {profileKey}{clash ? ' — Already exists' : ''}
                            </p>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Description</Label>
                        <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            placeholder="Specify which steps will use this profile and why its criteria differ..."
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        disabled={!profileKey || clash || busy}
                        onClick={() => onSubmit({ profileKey, label: label.trim(), description })}
                    >
                        {busy ? <Spinner className="mr-1.5 h-4 w-4" /> : null}
                        Create Profile
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function ObjectSchemaPage() {
    const state = useObjectSchema();
    const { draft, activeProfile, activeProfileKey, availableFields, fieldByPath } = state;

    const [dragging, setDragging] = useState<SourceFieldInfo | null>(null);
    const [cloneOpen, setCloneOpen] = useState(false);
    const [cloning, setCloning] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const usedPaths = new Set((draft?.fields ?? []).map((c) => c.sourceField ?? ''));

    const onDragStart = ({ active }: DragStartEvent) => {
        setDragging((active.data.current?.field as SourceFieldInfo) ?? null);
    };

    const onDragEnd = ({ active, over }: DragEndEvent) => {
        setDragging(null);
        if (!draft) return;

        const criterionKey = active.data.current?.criterionKey as string | undefined;
        if (criterionKey) {
            if (over?.id === 'source-fields') {
                state.setDraft({ fields: draft.fields.filter((c) => c.criterionKey !== criterionKey) });
            }
            return;
        }

        if (over?.id !== 'profile-fields') return;
        const field = active.data.current?.field as SourceFieldInfo | undefined;
        if (!field || usedPaths.has(field.path)) return;

        const taken = new Set(draft.fields.map((c) => c.criterionKey));
        state.setDraft({
            fields: [...draft.fields, newCriterionFrom(field, activeProfileKey, taken)],
        });
    };

    if (state.loading) {
        return (
            <div className="flex h-96 items-center justify-center p-6">
                <div className="flex items-center rounded-xl border bg-card p-6 text-sm text-muted-foreground shadow-xs">
                    <Spinner className="mr-2.5 h-5 w-5 text-primary" /> Loading object schema catalog...
                </div>
            </div>
        );
    }

    const busy = state.saving || cloning;

    return (
        <TooltipProvider>
            <div className="flex h-[calc(100vh-3.5rem)] min-w-0 flex-col bg-background">
                {/* Header */}
                <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-4 shadow-xs">
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold tracking-tight text-foreground">Object Schema</h1>
                        <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
                            Define similarity matching rules for historical cases. Each 8D step runs an assigned retrieval profile to discover the most relevant precedents.
                        </p>
                    </div>

                    <div className="flex items-center gap-2.5">
                        {state.blockingError && (
                            <div className="flex max-w-md items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                <span>{state.blockingError}</span>
                            </div>
                        )}
                        {state.dirty && (
                            <>
                                <Badge variant="secondary" className="font-mono text-xs text-amber-600 dark:text-amber-400">
                                    Unsaved changes
                                </Badge>
                                <Button variant="ghost" size="sm" disabled={busy} onClick={state.discard}>
                                    <X className="mr-1 h-4 w-4" /> Discard
                                </Button>
                            </>
                        )}
                        <Button
                            disabled={!state.dirty || busy || Boolean(state.blockingError)}
                            onClick={() => void state.save()}
                            className="gap-1.5 font-medium"
                        >
                            {state.saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                            Save Changes
                        </Button>
                    </div>
                </header>

                <DndContext
                    sensors={sensors}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDragCancel={() => setDragging(null)}
                >
                    <div className="flex min-h-0 flex-1">
                        <SourceFieldsPanel
                            fields={availableFields}
                            caseCount={state.catalogCaseCount}
                            usedPaths={usedPaths}
                        />

                        {draft ? (
                            <ProfileConfigPanel
                                draft={draft}
                                profileKey={activeProfileKey}
                                fieldByPath={fieldByPath}
                                ownerByStep={state.ownerByStep}
                                profileLabelOf={(key) =>
                                    state.profiles.find((p) => p.profileKey === key)?.label ?? key}
                                isDragging={dragging !== null}
                                onChange={state.setDraft}
                            />
                        ) : (
                            <main className="flex min-w-0 flex-1 items-center justify-center bg-muted/20 text-sm text-muted-foreground">
                                Select a profile from the right panel to edit.
                            </main>
                        )}

                        <ProfileListPanel
                            profiles={state.profiles}
                            activeProfileKey={activeProfileKey}
                            ownerByStep={state.ownerByStep}
                            draftSteps={draft?.steps ?? []}
                            fieldCountByProfile={state.fieldCountByProfile}
                            dirty={state.dirty}
                            busy={busy}
                            onSelect={state.selectProfile}
                            onClone={() => setCloneOpen(true)}
                            onDelete={() => {
                                if (!activeProfile) return;
                                const using = draft?.steps.length
                                    ? `\n\nThe following steps will revert to Default profile: ${draft.steps.join(', ')}.`
                                    : '';
                                if (!window.confirm(`Delete profile "${activeProfile.label}"?${using}`)) return;
                                void (async () => {
                                    try {
                                        const { rebound } = await deleteRetrievalProfile(activeProfileKey);
                                        if (rebound.length) {
                                            toast.info(`Steps (${rebound.join(', ')}) reverted to Default profile.`);
                                        }
                                        await state.reload();
                                    } catch (e: any) {
                                        toast.error(e?.response?.data?.error?.message ?? e.message);
                                    }
                                })();
                            }}
                        />
                    </div>

                    <DragOverlay>
                        {dragging && (
                            <div className="flex items-center gap-2 rounded-lg border border-primary/50 bg-card p-2 text-xs shadow-xl ring-2 ring-primary/30">
                                <Plus className="h-4 w-4 text-primary" />
                                <span className="font-semibold text-foreground">{dragging.label}</span>
                                <span className="font-mono text-muted-foreground">{dragging.path}</span>
                            </div>
                        )}
                    </DragOverlay>
                </DndContext>

                <CloneProfileDialog
                    open={cloneOpen}
                    onOpenChange={setCloneOpen}
                    sourceLabel={activeProfile?.label ?? activeProfileKey}
                    taken={new Set(state.profiles.map((p) => p.profileKey))}
                    busy={cloning}
                    onSubmit={({ profileKey, label, description }) => {
                        setCloning(true);
                        void (async () => {
                            try {
                                await cloneRetrievalProfile({
                                    sourceKey: activeProfileKey, profileKey, label, description,
                                });
                                setCloneOpen(false);
                                await state.reload(profileKey);
                                toast.success(`Created profile "${label}".`);
                            } catch (e: any) {
                                toast.error(e?.response?.data?.error?.message ?? e.message);
                            } finally {
                                setCloning(false);
                            }
                        })();
                    }}
                />
            </div>
        </TooltipProvider>
    );
}

export default ObjectSchemaPage;

