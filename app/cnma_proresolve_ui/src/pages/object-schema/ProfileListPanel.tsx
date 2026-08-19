import {
    Badge, Button, ScrollArea, cn,
} from '@cnma/react-ui';
import { Copy, Layers, Trash2 } from 'lucide-react';
import { STEP_CODES, type RetrievalProfile } from '@/services/retrieval-service';

/**
 * Panel 3 — Profiles list and 8D step assignment summary.
 */

interface ProfileListPanelProps {
    profiles: RetrievalProfile[];
    activeProfileKey: string;
    ownerByStep: Record<string, string>;
    draftSteps: string[];
    fieldCountByProfile: Record<string, number>;
    dirty: boolean;
    busy: boolean;
    onSelect: (profileKey: string) => void;
    onClone: () => void;
    onDelete: () => void;
}

export function ProfileListPanel({
    profiles, activeProfileKey, ownerByStep, draftSteps, fieldCountByProfile, dirty, busy,
    onSelect, onClone, onDelete,
}: ProfileListPanelProps) {
    const active = profiles.find((p) => p.profileKey === activeProfileKey) ?? null;

    const stepsOf = (profileKey: string): string[] => (
        profileKey === activeProfileKey
            ? draftSteps
            : STEP_CODES.filter((code) => ownerByStep[code] === profileKey
                && !draftSteps.includes(code))
    );

    return (
        <aside className="flex w-72 shrink-0 flex-col border-l bg-card/50">
            {/* Header */}
            <div className="border-b p-3.5">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Layers className="h-4 w-4" />
                    </div>
                    <span className="text-sm">Retrieval Profiles</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                    Each 8D step runs exactly one retrieval profile. Click a profile to inspect or edit.
                </p>
            </div>

            {/* Profile List */}
            <ScrollArea className="flex-1">
                <div className="space-y-2 p-3">
                    {profiles.map((profile) => {
                        const isActive = profile.profileKey === activeProfileKey;
                        const steps = stepsOf(profile.profileKey);
                        const count = fieldCountByProfile[profile.profileKey] ?? 0;

                        return (
                            <button
                                key={profile.profileKey}
                                type="button"
                                onClick={() => onSelect(profile.profileKey)}
                                className={cn(
                                    'w-full rounded-xl border p-3 text-left transition-all duration-150',
                                    isActive
                                        ? 'border-primary/60 bg-primary/10 shadow-xs ring-1 ring-primary/30'
                                        : 'border-border/70 bg-card hover:border-primary/40 hover:bg-primary/5',
                                )}
                            >
                                <div className="flex items-center justify-between gap-1.5">
                                    <span className="truncate text-xs font-semibold text-foreground">
                                        {profile.label}
                                    </span>
                                    <div className="flex shrink-0 items-center gap-1">
                                        {isActive && dirty && (
                                            <Badge variant="secondary" className="h-4.5 px-1 font-mono text-[10px] text-amber-600 dark:text-amber-400">
                                                Unsaved
                                            </Badge>
                                        )}
                                        {profile.isSystem && (
                                            <Badge variant="outline" className="h-4.5 px-1 font-mono text-[10px]">
                                                System
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                {profile.description && (
                                    <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                                        {profile.description}
                                    </p>
                                )}

                                {/* Step badges */}
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {steps.length ? steps.map((code) => (
                                        <Badge
                                            key={code}
                                            variant="outline"
                                            className={cn(
                                                'h-5 px-1.5 font-mono text-[10px] font-semibold',
                                                isActive ? 'border-primary/50 text-primary bg-primary/5' : 'text-muted-foreground',
                                            )}
                                        >
                                            {code}
                                        </Badge>
                                    )) : (
                                        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                            Unassigned to any 8D step
                                        </span>
                                    )}
                                </div>

                                <div className="mt-2 flex items-center justify-between border-t pt-1.5 text-[11px] text-muted-foreground">
                                    <span>{count} {count === 1 ? 'criterion' : 'criteria'}</span>
                                    <span className="font-mono text-[10px]">{profile.profileKey}</span>
                                </div>
                            </button>
                        );
                    })}

                    {!profiles.length && (
                        <div className="flex min-h-32 flex-col items-center justify-center p-3 text-center text-xs text-muted-foreground">
                            No profiles available.
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Actions */}
            <div className="space-y-2 border-t bg-card/80 p-3">
                <Button
                    size="sm" variant="outline" className="w-full justify-start gap-2 text-xs font-medium"
                    disabled={busy || !active}
                    onClick={onClone}
                >
                    <Copy className="h-3.5 w-3.5 text-primary" /> Clone Active Profile
                </Button>
                <Button
                    size="sm" variant="outline"
                    className="w-full justify-start gap-2 text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={busy || !active || active.isSystem}
                    onClick={onDelete}
                >
                    <Trash2 className="h-3.5 w-3.5" /> Delete Profile
                </Button>
                {active?.isSystem && (
                    <p className="text-[11px] text-muted-foreground">
                        System profiles cannot be deleted because unassigned steps fallback to them.
                    </p>
                )}
            </div>
        </aside>
    );
}

