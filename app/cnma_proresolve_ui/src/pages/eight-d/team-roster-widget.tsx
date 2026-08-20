import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn,
} from '@cnma/react-ui';
import { TriangleAlert } from 'lucide-react';
import {
    getPartnerDirectory, saveTeamRoster,
    type AssignedTeamRow, type PartnerDirectoryEntry,
} from '@/services/eightd-service';

/**
 * Nhom 8D cua D1, tach thanh HAI field doc lap tren Form Editor:
 *
 *   - `team.roster`         -> "AI suggest"    -> <AiSuggestWidget>
 *   - `team.assignedRoster` -> "Decision table" -> <DecisionTableWidget>
 *
 * -- Vi sao tach --
 * Hai thu nay tra loi hai cau hoi khac nhau: "may de xuat ai" va "nguoi that su
 * chot ai". Gop mot o thi khong the bo mot nua di, ma nhieu bao cao chi can mot
 * nua - vi du ban gui khach hang thi khong ai muon thay phan nhap cua may.
 * Tach ra thi moi cai keo vao/ra layout group doc lap.
 *
 * -- Vi sao van dung chung mot state --
 * "Accept all suggested" nam o khoi AI nhung lai them nguoi vao BANG. Hai field
 * giu state rieng thi nut do khong con cho nao de tac dong. Nen trang thai nhom
 * song trong context o day, hai widget chi la hai cua so nhin vao no.
 *
 * -- Vi sao sua xong phai bam Save --
 * `Disciplines` la `@readonly`; duong ghi duy nhat la action `saveTeamRoster`,
 * va no chi ghi dung khoa `team.assignedRoster`. Ket luan cua AI khong bao gio
 * bi ghi de boi mot thao tac tren man hinh nay.
 */

/** Mot dong trong `team.roster` do AI sinh. */
export interface RosterRow {
    name?: string;
    organizationalRole?: string;
    assigned8DRole?: string;
    caseResponsibility?: string;
    selectionReason?: string;
    sourceType?: string;
    sourcePath?: string;
    sourceCase?: string;
}

interface WorkingRow {
    /** Khoa on dinh cho React - KHONG dung index, vi xoa dong giua se doi index. */
    key: string;
    partnerId: string;
    partnerRole: string;
}

const PARTNER_ROLES = ['8D Team Leader', '8D Team Member'] as const;

/** Radix Select khong nhan `value=""`, nen dong chua gan nguoi can mot gia tri canh rieng. */
const UNASSIGNED = '__unassigned__';

let keyCounter = 0;
const nextKey = () => `row-${++keyCounter}`;

function resolvePath(root: unknown, path: string): unknown {
    let current = root;
    for (const segment of path.split('.')) {
        const indexed = segment.match(/^([^#]+)#(\d+)$/);
        if (indexed) {
            current = current && typeof current === 'object'
                ? (current as Record<string, unknown>)[indexed[1]] : undefined;
            current = Array.isArray(current) ? current[Number(indexed[2]) - 1] : undefined;
        } else {
            current = current && typeof current === 'object'
                ? (current as Record<string, unknown>)[segment] : undefined;
        }
    }
    return current;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown> : null;
}

function currentCaseMembers(context: Record<string, unknown> | null): PartnerDirectoryEntry[] {
    const team = asRecord(context?.team);
    if (!team) return [];
    const rows = [team.leader, ...(Array.isArray(team.members) ? team.members : [])];
    return rows.map(asRecord).filter(Boolean).map((row) => ({
        partnerId: String(row!.partnerId ?? ''),
        partnerName: String(row!.partnerName ?? ''),
        functionTitle: String(row!.functionTitle ?? ''),
        email: null,
        phone: null,
    })).filter((entry) => entry.partnerId);
}

/**
 * Tim `partnerId` cho mot dong AI de xuat.
 *
 * Thu `sourcePath` truoc vi do la duong dan AI tu khai va no tro thang vao ban
 * ghi that. Chi khi duong do khong giai duoc - dien hinh la `precedents#N.team#M`
 * vi precedents khong nam trong CaseContext da luu - moi do theo ten trong danh ba.
 */
function resolveRosterPartnerId(
    row: RosterRow,
    context: Record<string, unknown> | null,
    directory: PartnerDirectoryEntry[],
): string | null {
    if (row.sourcePath && context) {
        const resolved = asRecord(resolvePath(context, row.sourcePath));
        const partnerId = resolved?.partnerId;
        if (typeof partnerId === 'string' && partnerId) return partnerId;
    }
    const name = (row.name ?? '').trim().toLowerCase();
    if (!name || name === 'unassigned') return null;
    return directory.find((entry) => entry.partnerName.trim().toLowerCase() === name)?.partnerId ?? null;
}

// ── State dung chung cua hai widget ─────────────────────────────────────────

interface TeamRosterState {
    rows: WorkingRow[];
    directory: PartnerDirectoryEntry[];
    directoryError: string | null;
    dirty: boolean;
    saving: boolean;
    saveError: string | null;
    savedLabel: string | null;
    caseContext: Record<string, unknown> | null;
    lookup: (partnerId: string) => PartnerDirectoryEntry | null;
    onTeam: (partnerId: string | null) => boolean;
    addOne: (partnerId: string) => void;
    addMany: (partnerIds: string[]) => void;
    addEmpty: () => void;
    patch: (key: string, next: Partial<WorkingRow>) => void;
    remove: (key: string) => void;
    save: () => Promise<void>;
}

const TeamRosterContext = createContext<TeamRosterState | null>(null);

export function TeamRosterProvider({ disciplineID, caseContext, savedRoster, children }: {
    disciplineID: string;
    caseContext: Record<string, unknown> | null;
    savedRoster: unknown;
    children: ReactNode;
}) {
    const [directory, setDirectory] = useState<PartnerDirectoryEntry[]>([]);
    const [directoryError, setDirectoryError] = useState<string | null>(null);
    const [rows, setRows] = useState<WorkingRow[] | null>(null);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [savedLabel, setSavedLabel] = useState<string | null>(null);

    const caseMembers = useMemo(() => currentCaseMembers(caseContext), [caseContext]);

    // Danh ba = kho lich su + nguoi cua chinh case nay. Nguoi lan dau tham gia 8D
    // chua co dong nao trong `HistoricalTeamMembers`, ma van phai chon duoc.
    useEffect(() => {
        let alive = true;
        getPartnerDirectory()
            .then((historical) => {
                if (!alive) return;
                const merged = new Map<string, PartnerDirectoryEntry>();
                for (const entry of [...historical, ...caseMembers]) {
                    const existing = merged.get(entry.partnerId);
                    merged.set(entry.partnerId, existing
                        ? { ...entry, email: entry.email ?? existing.email, phone: entry.phone ?? existing.phone }
                        : entry);
                }
                setDirectory([...merged.values()].sort((a, b) => a.partnerName.localeCompare(b.partnerName)));
            })
            .catch((error: unknown) => {
                if (!alive) return;
                setDirectoryError(error instanceof Error ? error.message : String(error));
                setDirectory(caseMembers);
            });
        return () => { alive = false; };
    }, [caseMembers]);

    // Da luu lan truoc => nap lai dung thu do. Chi khi CHUA tung luu moi roi ve
    // nhom ghi nhan tren case: neu khong, mot lan luu nhom rong se bi nhom goc de
    // lai ngay o lan mo tiep theo.
    useEffect(() => {
        if (rows !== null) return;
        const persisted = Array.isArray(savedRoster) ? savedRoster : null;
        if (persisted) {
            setRows(persisted.filter((item) => item && typeof item === 'object').map((item) => {
                const row = item as Record<string, unknown>;
                return {
                    key: nextKey(),
                    partnerId: String(row.partnerId ?? ''),
                    partnerRole: String(row.partnerRole ?? PARTNER_ROLES[1]),
                };
            }));
            return;
        }
        setRows(caseMembers.map((member, index) => ({
            key: nextKey(),
            partnerId: member.partnerId,
            partnerRole: index === 0 ? PARTNER_ROLES[0] : PARTNER_ROLES[1],
        })));
    }, [caseMembers, rows, savedRoster]);

    const workingRows = rows ?? [];
    const mutate = (next: WorkingRow[]) => { setRows(next); setDirty(true); };
    const lookup = (partnerId: string) =>
        directory.find((entry) => entry.partnerId === partnerId) ?? null;
    const onTeam = (partnerId: string | null) =>
        Boolean(partnerId) && workingRows.some((row) => row.partnerId === partnerId);

    const addMany = (partnerIds: string[]) => {
        const additions: WorkingRow[] = [];
        for (const partnerId of partnerIds) {
            // `additions` phai duoc tinh vao: hai de xuat cung tro mot nguoi se tao
            // hai dong trung neu chi kiem tra `workingRows`.
            if (!partnerId) continue;
            if (workingRows.some((row) => row.partnerId === partnerId)) continue;
            if (additions.some((row) => row.partnerId === partnerId)) continue;
            additions.push({
                key: nextKey(),
                partnerId,
                partnerRole: workingRows.length + additions.length === 0
                    ? PARTNER_ROLES[0] : PARTNER_ROLES[1],
            });
        }
        if (additions.length) mutate([...workingRows, ...additions]);
    };

    const persistableRows = (): AssignedTeamRow[] => workingRows
        .filter((row) => row.partnerId)
        .map((row) => {
            const partner = lookup(row.partnerId);
            return {
                partnerId: row.partnerId,
                partnerName: partner?.partnerName ?? row.partnerId,
                functionTitle: partner?.functionTitle ?? '',
                partnerRole: row.partnerRole,
            };
        });

    const value: TeamRosterState = {
        rows: workingRows, directory, directoryError, dirty, saving, saveError, savedLabel,
        caseContext, lookup, onTeam, addMany,
        addOne: (partnerId) => addMany([partnerId]),
        addEmpty: () => mutate([...workingRows, { key: nextKey(), partnerId: '', partnerRole: PARTNER_ROLES[1] }]),
        patch: (key, next) => mutate(workingRows.map((row) => (row.key === key ? { ...row, ...next } : row))),
        remove: (key) => mutate(workingRows.filter((row) => row.key !== key)),
        save: async () => {
            setSaving(true);
            setSaveError(null);
            try {
                const count = await saveTeamRoster(disciplineID, persistableRows());
                setDirty(false);
                setSavedLabel(`${count} member${count === 1 ? '' : 's'}`);
            } catch (error: unknown) {
                // Giu `dirty` = true khi that bai: bao da luu trong khi chua luu duoc
                // la cach chac chan nhat de nguoi dung dong tab va mat viec vua lam.
                const detail = (error as { response?: { data?: { error?: { message?: string } } } })
                    ?.response?.data?.error?.message;
                setSaveError(detail || (error instanceof Error ? error.message : String(error)));
            } finally {
                setSaving(false);
            }
        },
    };

    return <TeamRosterContext.Provider value={value}>{children}</TeamRosterContext.Provider>;
}

// ── Field 1: AI suggest ─────────────────────────────────────────────────────

export function AiSuggestWidget({ roster }: { roster: RosterRow[] }) {
    const ctx = useContext(TeamRosterContext);
    if (!ctx || !roster.length) return null;

    const suggestions = roster.map((row) => ({
        row,
        partnerId: resolveRosterPartnerId(row, ctx.caseContext, ctx.directory),
    }));
    const pending = suggestions.filter((item) => item.partnerId && !ctx.onTeam(item.partnerId));
    const suggestedRoles = [...new Set(roster
        .map((row) => (row.organizationalRole ?? '').trim()).filter(Boolean))];
    const basedOn = [...new Set(suggestions
        .map((item) => (item.row.sourceCase ?? '').trim()).filter(Boolean))];

    return (
        <div className="relative mt-3 rounded-lg border border-primary/20 bg-primary/[0.04] px-4 py-4">
            <span className="absolute -top-2.5 left-3.5 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                AI Draft
            </span>

            {suggestedRoles.length > 0 && (
                <p className="mb-2 mt-1 text-[13px] leading-relaxed">
                    <span className="font-semibold">Suggested roles</span>
                    {basedOn.length > 0 && (
                        <> — based on similar case{basedOn.length > 1 ? 's' : ''} {basedOn.join(', ')}</>
                    )}
                    : {suggestedRoles.join(', ')}
                </p>
            )}

            <p className="mb-1.5 text-[12.5px] font-semibold">Suggested individuals:</p>
            <ul className="mb-2.5 ml-4 list-disc space-y-1">
                {suggestions.map(({ row, partnerId }, index) => (
                    <li key={`${row.name ?? 'row'}-${index}`} className="text-[12.5px] leading-relaxed">
                        <span className="font-medium">{row.name || 'Unassigned'}</span>
                        {row.organizationalRole && <> ({row.organizationalRole})</>}
                        {row.caseResponsibility && (
                            <span className="text-muted-foreground"> — {row.caseResponsibility}</span>
                        )}
                        {ctx.onTeam(partnerId) ? (
                            <span className="ml-1.5 text-[11px] font-medium text-success">✓ on team</span>
                        ) : partnerId ? (
                            <button
                                type="button"
                                onClick={() => ctx.addOne(partnerId)}
                                className="ml-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/10"
                            >
                                + Add
                            </button>
                        ) : (
                            // Khong noi duoc ve mot Business Partner that thi KHONG cho
                            // them: bang quyet dinh chi chua nguoi co ID tra cuu duoc.
                            <span className="ml-1.5 inline-flex items-center gap-1 text-[11px] text-warning">
                                <TriangleAlert className="h-3 w-3" /> no matching business partner
                            </span>
                        )}
                    </li>
                ))}
            </ul>

            {pending.length > 0 ? (
                <button
                    type="button"
                    onClick={() => ctx.addMany(pending.map((item) => item.partnerId!))}
                    className="rounded-md border border-input bg-card px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/60"
                >
                    ✓ Accept all suggested ({pending.length})
                </button>
            ) : (
                <span className="text-[12.5px] text-success">
                    ✓ All suggested members added — remove any from the table below if not needed
                </span>
            )}
        </div>
    );
}

// ── Field 2: Decision table ─────────────────────────────────────────────────

export function DecisionTableWidget() {
    const ctx = useContext(TeamRosterContext);
    if (!ctx) return null;

    // Chu cai dau cho avatar - o vuong bo goc mau xanh, giong mockup.
    const initials = (name: string) => name.split(' ').filter(Boolean)
        .map((word) => word[0]).join('').slice(0, 2).toUpperCase() || '?';

    return (
        <div className="min-w-0 space-y-2">
            <div className="rounded-lg border bg-card px-3.5 py-3">
                <div className="mb-2 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={ctx.addEmpty}
                        disabled={ctx.saving}
                        className="rounded-md border border-input bg-card px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/60 disabled:opacity-50"
                    >
                        Add
                    </button>
                    <button
                        type="button"
                        onClick={() => void ctx.save()}
                        // Chua sua gi thi khong co gi de luu.
                        disabled={ctx.saving || !ctx.dirty}
                        className="rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                        {ctx.saving ? 'Saving…' : 'Save'}
                    </button>
                </div>

                <div className="max-w-full overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr>
                                {['', 'Partner', 'Partner Role', 'E-Mail Address', 'Telephone number', ''].map((label, index) => (
                                    <th key={index} className="border-b px-2.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        {label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {ctx.rows.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-2.5 py-5 text-center text-[12.5px] text-muted-foreground">
                                        No team members assigned yet.
                                    </td>
                                </tr>
                            ) : ctx.rows.map((row) => {
                                const partner = ctx.lookup(row.partnerId);
                                return (
                                    <tr key={row.key}>
                                        <td className="border-b px-2.5 py-2 align-middle">
                                            <div className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-[#0a6ed1] text-[10.5px] font-bold text-white">
                                                {partner ? initials(partner.partnerName) : '?'}
                                            </div>
                                        </td>
                                        <td className="border-b px-2.5 py-2 align-middle">
                                            <Select
                                                value={row.partnerId || UNASSIGNED}
                                                onValueChange={(value) => ctx.patch(row.key, {
                                                    partnerId: value === UNASSIGNED ? '' : value,
                                                })}
                                            >
                                                <SelectTrigger className="h-8 max-w-[220px] text-[12.5px]">
                                                    <SelectValue placeholder="— select partner —" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={UNASSIGNED}>— select partner —</SelectItem>
                                                    {ctx.directory.map((entry) => (
                                                        <SelectItem key={entry.partnerId} value={entry.partnerId}>
                                                            {entry.partnerId} — {entry.partnerName}
                                                            {entry.functionTitle ? ` (${entry.functionTitle})` : ''}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </td>
                                        <td className="border-b px-2.5 py-2 align-middle">
                                            <Select
                                                value={row.partnerRole}
                                                onValueChange={(value) => ctx.patch(row.key, { partnerRole: value })}
                                            >
                                                <SelectTrigger className="h-8 max-w-[190px] text-[12.5px]"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {PARTNER_ROLES.map((role) => (
                                                        <SelectItem key={role} value={role}>{role}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </td>
                                        {/* E-mail va dien thoai KHONG go tay: chung den tu ban ghi
                                            Business Partner. Kho hien seed `null` cho ca hai (mock
                                            data khong co), nen hien dau gach cho toi khi co du lieu
                                            that - khong bia ra dia chi trong nhu that. */}
                                        <td className="border-b px-2.5 py-2 align-middle text-[12.5px] text-muted-foreground">
                                            {partner?.email || '—'}
                                        </td>
                                        <td className="border-b px-2.5 py-2 align-middle text-[12.5px] text-muted-foreground">
                                            {partner?.phone || '—'}
                                        </td>
                                        <td className="border-b px-2.5 py-2 text-right align-middle">
                                            <button
                                                type="button"
                                                onClick={() => ctx.remove(row.key)}
                                                className="rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-primary transition-colors hover:bg-muted/60"
                                            >
                                                Remove
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {ctx.saveError && (
                <p className="flex items-start gap-1.5 text-[11px] text-destructive">
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                    Could not save: {ctx.saveError}
                </p>
            )}
            <p className={cn('border-t pt-3 text-[11px] leading-relaxed', ctx.dirty ? 'text-warning' : 'text-muted-foreground')}>
                {ctx.dirty
                    ? 'Unsaved changes — click Save to store this team on the report.'
                    : ctx.savedLabel
                        ? `Team saved to the report (${ctx.savedLabel}). It will still be here after a reload.`
                        : 'Partner and role are assigned manually, matching the Business Partner (BP) assignment in SAP’s Resolve Internal Problems app. E-mail and telephone are queried automatically from the BP master record — never typed by hand.'}
            </p>
            {ctx.directoryError && (
                <p className="flex items-start gap-1.5 text-[11px] text-warning">
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                    Partner directory could not be loaded ({ctx.directoryError}) — only people already on this case are selectable.
                </p>
            )}
        </div>
    );
}
