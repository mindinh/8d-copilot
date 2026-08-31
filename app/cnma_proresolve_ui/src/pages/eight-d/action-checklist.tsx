import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    Card,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    cn,
} from '@cnma/react-ui';
import { CircleDashed, CircleDot, CircleCheck, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
    saveDisciplineField,
    type Discipline8D,
} from '@/services/eightd-service';
import {
    normalizeActionStatus,
} from '../../../../../shared/action-task';

export interface CaseActionRow {
    id?: string;
    lineNo: number;
    actionType?: string;
    actionText: string;
    status: string;
    owner?: string;
    targetDate?: string;
    originDisciplineCode?: 'D3' | 'D5' | 'D7';
    originDisciplineID?: string;
}

export interface CaseActions {
    containment?: CaseActionRow[];
    corrective?: CaseActionRow[];
    preventive?: CaseActionRow[];
}

/** 3 nhóm theo đúng thứ tự 8D — containment (D3), corrective (D5), preventive (D7). */
const GROUPS: { key: keyof CaseActions; label: string; step: 'D3' | 'D5' | 'D7' }[] = [
    { key: 'containment', label: 'Containment Actions', step: 'D3' },
    { key: 'corrective', label: 'Permanent Corrective Actions', step: 'D5' },
    { key: 'preventive', label: 'Preventive Actions', step: 'D7' },
];

/**
 * Trạng thái thực thi → Visual Badge & Icon phân biệt rõ ràng.
 */
function statusStyle(status: string): { icon: typeof CircleDot; className: string } {
    const s = normalizeActionStatus(status);
    if (s === 'Verified') return { icon: ShieldCheck, className: 'text-emerald-600 dark:text-emerald-400' };
    if (s === 'Done') return { icon: CircleCheck, className: 'text-indigo-600 dark:text-indigo-400' };
    if (s === 'In Progress') return { icon: CircleDot, className: 'text-sky-600 dark:text-sky-400' };
    return { icon: CircleDashed, className: 'text-slate-500 dark:text-slate-400' };
}

function parseJsonSafe(val: unknown): Record<string, any> | null {
    if (!val) return null;
    if (typeof val === 'object') return val as Record<string, any>;
    try {
        const parsed = JSON.parse(String(val));
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * Thu thập và hợp nhất toàn bộ action từ D3, D5, D7 (cả từ caseContext và các task đã được tạo trong từng discipline).
 */
export function getMergedCaseActions(
    caseContext: string | null | undefined,
    disciplines?: Discipline8D[],
): CaseActions {
    const result: CaseActions = {
        containment: [],
        corrective: [],
        preventive: [],
    };

    if (disciplines && disciplines.length > 0) {
        for (const d of disciplines) {
            // Chỉ khi nào step D3, D5, D7 ở trạng thái InProgress hoặc Approved thì mới đưa task vào D6
            const isStepActive = d.workState === 'InProgress' || d.reviewStatus === 'Approved';
            if (!isStepActive) continue;

            const parsed = parseJsonSafe(d.resultJson);
            if (!parsed) continue;

            const extractRows = (assignedVal: any) => {
                if (Array.isArray(assignedVal)) return assignedVal;
                return [];
            };

            if (d.code === 'D3') {
                const rows = extractRows(
                    parsed.containment?.assignedActions ?? parsed.assignedActions,
                );
                for (let i = 0; i < rows.length; i++) {
                    const r = rows[i];
                    const text = r?.name || r?.actionText || r?.action || r?.description;
                    if (text && !result.containment?.some((ex) => ex.actionText === String(text))) {
                        result.containment?.push({
                            id: r.id || `${d.code}-${i}`,
                            lineNo: (result.containment.length + 1),
                            actionType: 'Containment',
                            actionText: String(text),
                            status: normalizeActionStatus(r.status),
                            owner: r.assignee || r.owner || '',
                            originDisciplineCode: 'D3',
                            originDisciplineID: d.ID,
                        });
                    }
                }
            } else if (d.code === 'D5') {
                const rows = extractRows(
                    parsed.corrective?.assignedActions ?? parsed.assignedActions,
                );
                for (let i = 0; i < rows.length; i++) {
                    const r = rows[i];
                    const text = r?.name || r?.actionText || r?.action || r?.description;
                    if (text && !result.corrective?.some((ex) => ex.actionText === String(text))) {
                        result.corrective?.push({
                            id: r.id || `${d.code}-${i}`,
                            lineNo: (result.corrective.length + 1),
                            actionType: 'Corrective',
                            actionText: String(text),
                            status: normalizeActionStatus(r.status),
                            owner: r.assignee || r.owner || '',
                            originDisciplineCode: 'D5',
                            originDisciplineID: d.ID,
                        });
                    }
                }
            } else if (d.code === 'D7') {
                const rows = extractRows(
                    parsed.preventive?.assignedActions ?? parsed.assignedActions,
                );
                for (let i = 0; i < rows.length; i++) {
                    const r = rows[i];
                    const text = r?.name || r?.actionText || r?.action || r?.description;
                    if (text && !result.preventive?.some((ex) => ex.actionText === String(text))) {
                        result.preventive?.push({
                            id: r.id || `${d.code}-${i}`,
                            lineNo: (result.preventive.length + 1),
                            actionType: 'Preventive',
                            actionText: String(text),
                            status: normalizeActionStatus(r.status),
                            owner: r.assignee || r.owner || '',
                            originDisciplineCode: 'D7',
                            originDisciplineID: d.ID,
                        });
                    }
                }
            }
        }
    } else if (caseContext) {
        const directActions = parseCaseActions(caseContext) || {};
        result.containment = directActions.containment || [];
        result.corrective = directActions.corrective || [];
        result.preventive = directActions.preventive || [];
    }

    return result;
}

export function ActionChecklist({
    actions,
    disciplines,
}: {
    actions?: CaseActions | null;
    disciplines?: Discipline8D[];
}) {
    const queryClient = useQueryClient();
    const effectiveActions = (disciplines && disciplines.length > 0)
        ? getMergedCaseActions(undefined, disciplines)
        : actions;

    const groups = GROUPS.map((g) => ({ ...g, rows: effectiveActions?.[g.key] ?? [] }));
    const total = groups.reduce((sum, g) => sum + g.rows.length, 0);
    const verified = groups.reduce(
        (sum, g) => sum + g.rows.filter((r) => normalizeActionStatus(r.status) === 'Verified').length,
        0,
    );

    const [updatingKey, setUpdatingKey] = useState<string | null>(null);

    // Khi các bước D3, D5, D7 chưa InProgress hoặc chưa có action nào: Hiện hướng dẫn trực quan
    if (total === 0) {
        return (
            <Card className="p-6 text-center border-dashed bg-muted/20">
                <div className="flex flex-col items-center justify-center gap-2">
                    <CircleDashed className="w-8 h-8 text-muted-foreground/60" />
                    <p className="text-sm font-semibold text-foreground">No active actions in D3, D5, or D7 yet</p>
                    <p className="text-xs text-muted-foreground max-w-md">
                        Action tasks will automatically appear here for verification once containment (D3), corrective (D5), or preventive (D7) steps are switched to <strong className="text-foreground">In process</strong>.
                    </p>
                </div>
            </Card>
        );
    }

    const handleTaskStatusChange = async (
        row: CaseActionRow,
        newStatus: string,
    ) => {
        if (!row.originDisciplineID || !disciplines) return;
        const disc = disciplines.find((d) => d.ID === row.originDisciplineID);
        if (!disc) return;

        const parsed = parseJsonSafe(disc.resultJson) || {};
        const keyPrefix = disc.code === 'D3' ? 'containment' : disc.code === 'D5' ? 'corrective' : 'preventive';
        const assignedField = `${keyPrefix}.assignedActions`;

        let taskList = parsed[keyPrefix]?.assignedActions || parsed.assignedActions || [];
        if (!Array.isArray(taskList) || taskList.length === 0) {
            const rawActions = parsed[keyPrefix]?.actions || [];
            taskList = rawActions.map((a: any, i: number) => ({
                id: `${disc.code}-${i}`,
                name: a.name || a.action || a.actionText || a.description,
                description: a.description || '',
                assignee: a.assignee || a.owner || '',
                status: a.status || 'Planned',
            }));
        }

        const updatedList = taskList.map((t: any) => {
            const tText = t.name || t.action || t.actionText || t.description;
            if (tText === row.actionText || (row.id && t.id === row.id)) {
                return { ...t, status: newStatus };
            }
            return t;
        });

        try {
            setUpdatingKey(row.actionText);
            await saveDisciplineField(disc.ID, assignedField, updatedList);
            toast.success(`Action status updated: ${newStatus}`);
            void queryClient.invalidateQueries({ queryKey: ['8d'] });
        } catch (err: any) {
            const msg = err?.response?.data?.error?.message ?? err?.message ?? 'Could not update action status.';
            toast.error(msg);
        } finally {
            setUpdatingKey(null);
        }
    };

    return (
        <Card className="overflow-hidden bg-card border border-border shadow-xs">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
                <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                        Action Implementation & Verification Status (D6)
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                        Track execution and verify effectiveness of corrective actions.
                    </p>
                </div>
                <span className="text-xs text-muted-foreground">
                    <strong className="font-semibold text-foreground">{verified}</strong> of {total} verified
                </span>
            </div>

            <div className="divide-y divide-border/60">
                {groups.map((group) => {
                    if (group.rows.length === 0) return null;
                    return (
                        <div key={group.key} className="px-4 py-3">
                            <div className="mb-2 flex items-center gap-2">
                                <span className="text-xs font-semibold text-foreground">{group.label}</span>
                                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                    {group.step}
                                </span>
                            </div>

                            <ul className="space-y-2">
                                {group.rows.map((row) => {
                                    const { icon: Icon, className } = statusStyle(row.status);
                                    const isUpdating = updatingKey === row.actionText;
                                    const norm = normalizeActionStatus(row.status);

                                    return (
                                        <li
                                            key={`${group.key}-${row.lineNo}-${row.actionText}`}
                                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-muted/15"
                                        >
                                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', className)} />
                                                <div className="min-w-0 flex-1">
                                                    <p className="break-words text-xs font-medium text-foreground">
                                                        {row.actionText}
                                                    </p>
                                                    {row.owner && (
                                                        <p className="text-[11px] text-muted-foreground mt-0.5">
                                                            Owner: <span className="font-medium text-foreground/80">{row.owner}</span>
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                                <Select
                                                    value={norm}
                                                    disabled={isUpdating || !row.originDisciplineID}
                                                    onValueChange={(val) => handleTaskStatusChange(row, val)}
                                                >
                                                    <SelectTrigger
                                                        className={cn(
                                                            'h-7 w-[130px] px-2 text-[11px] font-semibold border transition-colors',
                                                            norm === 'Verified' && 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
                                                            norm === 'Done' && 'bg-indigo-50 text-indigo-700 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
                                                            norm === 'In Progress' && 'bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
                                                            norm === 'Planned' && 'bg-slate-100/90 text-slate-700 border-slate-300 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700',
                                                        )}
                                                    >
                                                        <SelectValue placeholder="Select status" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="Planned">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                                                <span>Planned</span>
                                                            </div>
                                                        </SelectItem>
                                                        <SelectItem value="In Progress">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                                                                <span>In Progress</span>
                                                            </div>
                                                        </SelectItem>
                                                        <SelectItem value="Done">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                                                                <span>Done</span>
                                                            </div>
                                                        </SelectItem>
                                                        <SelectItem value="Verified">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                                <span>Verified</span>
                                                            </div>
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                })}
            </div>

            <p className="border-t bg-muted/15 px-4 py-2 text-[11px] text-muted-foreground">
                Actions are defined and managed in D3 (Containment), D5 (Corrective Actions), and D7 (Preventive Actions).
            </p>
        </Card>
    );
}

/** Bóc `actions` khỏi chuỗi caseContext. Hỏng thì trả null chứ không làm vỡ trang. */
export function parseCaseActions(caseContext: string | null | undefined): CaseActions | null {
    if (!caseContext) return null;
    try {
        const parsed = JSON.parse(caseContext);
        const actions = parsed?.actions;
        return actions && typeof actions === 'object' && !Array.isArray(actions) ? actions : null;
    } catch {
        return null;
    }
}
