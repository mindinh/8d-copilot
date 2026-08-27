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
type PartnerRole = typeof PARTNER_ROLES[number];

/** Mot dong sap them vao bang, kem vai tro 8D ma AI de xuat (neu co). */
interface RosterAddition {
    partnerId: string;
    /** `assigned8DRole` cua dong AI. Free text, nen phai chuan hoa truoc khi dung. */
    suggestedRole?: string;
}

/**
 * Doi vai tro AI de xuat ve dung mot gia tri cua bang quyet dinh.
 *
 * Schema backend khai `assigned8DRole` la `type: 'string'` khong kem enum, nen
 * khong the tin no lun tra dung chuoi. Thuc te no tra dung "8D Team Leader" /
 * "8D Team Member", nhung mot lan doi prompt hay doi model la co the thanh
 * "Team Leader" hay "Champion" — nen bat ca bien the, va tra `null` khi khong
 * chac de cho phia goi tu quyet dinh thay vi doan bua.
 */
function normalize8DRole(raw: string | undefined): PartnerRole | null {
    const text = (raw ?? '').trim().toLowerCase();
    if (!text) return null;
    const exact = PARTNER_ROLES.find((role) => role.toLowerCase() === text);
    if (exact) return exact;
    if (/leader|lead\b|champion/.test(text)) return PARTNER_ROLES[0];
    if (/member|participant/.test(text)) return PARTNER_ROLES[1];
    return null;
}

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
    return rows.map(asRecord).filter(Boolean).map((row) => {
        const partnerId = String(row!.partnerId ?? '');
        const partnerName = String(row!.partnerName ?? '') || partnerId;
        const slug = partnerName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
        const digits = partnerId.replace(/\D/g, '').padStart(4, '0').slice(-4);
        return {
            partnerId,
            partnerName,
            functionTitle: String(row!.functionTitle ?? ''),
            email: (row!.email as string | null) || (slug ? `${slug}@proresolve.com` : `${partnerId.toLowerCase()}@proresolve.com`),
            phone: (row!.phone as string | null) || `+49 89 2018 ${digits}`,
        };
    }).filter((entry) => entry.partnerId);
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
    readOnly?: boolean;
    lookup: (partnerId: string) => PartnerDirectoryEntry | null;
    onTeam: (partnerId: string | null) => boolean;
    addOne: (addition: RosterAddition) => void;
    addMany: (additions: RosterAddition[]) => void;
    addEmpty: () => void;
    patch: (key: string, next: Partial<WorkingRow>) => void;
    remove: (key: string) => void;
    save: () => Promise<void>;
}

const TeamRosterContext = createContext<TeamRosterState | null>(null);

export function TeamRosterProvider({ disciplineID, caseContext, savedRoster, readOnly = false, children }: {
    disciplineID: string;
    caseContext: Record<string, unknown> | null;
    savedRoster: unknown;
    readOnly?: boolean;
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
        if (rows === null) {
            setRows(caseMembers.map((member, index) => ({
                key: nextKey(),
                partnerId: member.partnerId,
                partnerRole: index === 0 ? PARTNER_ROLES[0] : PARTNER_ROLES[1],
            })));
        }
    }, [caseMembers, savedRoster]);

    const workingRows = rows ?? [];
    const persistableRows = (targetRows: WorkingRow[] = workingRows): AssignedTeamRow[] => targetRows
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

    const mutate = (next: WorkingRow[]) => {
        setRows(next);
        setDirty(false);
        const toSave = persistableRows(next);
        setSaving(true);
        saveTeamRoster(disciplineID, toSave)
            .then((count) => {
                setSavedLabel(`${count} member${count === 1 ? '' : 's'}`);
            })
            .catch((err) => {
                console.error('Failed to save team roster:', err);
                setDirty(true);
            })
            .finally(() => setSaving(false));
    };
    const lookup = (partnerId: string) =>
        directory.find((entry) => entry.partnerId === partnerId) ?? null;
    const onTeam = (partnerId: string | null) =>
        Boolean(partnerId) && workingRows.some((row) => row.partnerId === partnerId);

    /**
     * Them nguoi vao bang quyet dinh, GIU vai tro 8D ma AI da chi dinh.
     *
     * -- Loi cu --
     * Ham nay tung chi nhan `partnerId[]` va gan vai tro theo VI TRI: dong dau
     * tien thanh Team Leader, con lai thanh Team Member. `assigned8DRole` cua AI
     * bi vut di du man hinh van in no ra ngay canh ten.
     *
     * Hau qua khong phai truong hop hiem: bang duoc mo san bang nhom ghi tren
     * case (xem effect khoi tao), nen luc bam "Accept all suggested" thi
     * `workingRows.length` da khac 0 — va MOI nguoi AI de xuat deu thanh Team
     * Member, ke ca nguoi AI chi dinh lam truong nhom. Them tung nguoi mot bang
     * nut "+ Add" thi con lech kieu khac: ai duoc bam truoc thanh truong nhom.
     *
     * Vi tri chi con la duong lui khi AI khong noi gi hoac noi thu khong hieu
     * duoc.
     */
    const addMany = (entries: RosterAddition[]) => {
        const additions: WorkingRow[] = [];
        for (const { partnerId, suggestedRole } of entries) {
            // `additions` phai duoc tinh vao: hai de xuat cung tro mot nguoi se tao
            // hai dong trung neu chi kiem tra `workingRows`.
            if (!partnerId) continue;
            if (workingRows.some((row) => row.partnerId === partnerId)) continue;
            if (additions.some((row) => row.partnerId === partnerId)) continue;
            additions.push({
                key: nextKey(),
                partnerId,
                partnerRole: normalize8DRole(suggestedRole)
                    ?? (workingRows.length + additions.length === 0
                        ? PARTNER_ROLES[0] : PARTNER_ROLES[1]),
            });
        }
        if (!additions.length) return;

        // Mot nhom 8D chi co MOT truong nhom. AI tra free text nen ve nguyen tac
        // co the chi dinh hai nguoi; giu nguoi dau, ha phan con lai.
        let leaderSeen = false;
        for (const row of additions) {
            if (row.partnerRole !== PARTNER_ROLES[0]) continue;
            if (leaderSeen) row.partnerRole = PARTNER_ROLES[1];
            leaderSeen = true;
        }

        // Nguoi dung vua bam "chap nhan de xuat cua AI", nen truong nhom AI chi
        // dinh la truong nhom that. Truong nhom cu — thuong chi la nguoi dung dau
        // danh sach ghi tren case, khong phai mot quyet dinh cua ai ca — xuong lam
        // thanh vien thay vi de bang co hai truong nhom.
        const existing = leaderSeen
            ? workingRows.map((row) => (row.partnerRole === PARTNER_ROLES[0]
                ? { ...row, partnerRole: PARTNER_ROLES[1] } : row))
            : workingRows;

        mutate([...existing, ...additions]);
    };

    const value: TeamRosterState = {
        rows: workingRows, directory, directoryError, dirty, saving, saveError, savedLabel,
        caseContext, readOnly, lookup, onTeam, addMany,
        addOne: (addition) => addMany([addition]),
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

function buildFallbackRoster(context: Record<string, unknown> | null): RosterRow[] {
    if (!context || typeof context !== 'object') return [];
    const team = context.team as Record<string, unknown> | undefined;
    if (!team) return [];

    const rows: RosterRow[] = [];
    if (team.leader && typeof team.leader === 'object') {
        const l = team.leader as Record<string, unknown>;
        rows.push({
            name: String(l.partnerName ?? l.partnerId ?? 'Leader'),
            organizationalRole: String(l.functionTitle ?? 'Quality Engineer'),
            assigned8DRole: '8D Team Leader',
            caseResponsibility: String(l.functionTitle ?? 'Team Lead'),
            sourcePath: 'team.leader',
        });
    }
    if (Array.isArray(team.members)) {
        team.members.forEach((m, idx) => {
            if (m && typeof m === 'object') {
                const member = m as Record<string, unknown>;
                rows.push({
                    name: String(member.partnerName ?? member.partnerId ?? `Member ${idx + 1}`),
                    organizationalRole: String(member.functionTitle ?? 'Team Member'),
                    assigned8DRole: '8D Team Member',
                    caseResponsibility: String(member.functionTitle ?? 'Defect Analysis'),
                    sourcePath: `team.members#${idx + 1}`,
                });
            }
        });
    }
    return rows;
}

// ── Field 1: AI suggest ─────────────────────────────────────────────────────

export function AiSuggestWidget({ roster }: { roster: RosterRow[] }) {
    const ctx = useContext(TeamRosterContext);
    if (!ctx) return null;

    const activeRoster = (Array.isArray(roster) && roster.length > 0)
        ? roster
        : buildFallbackRoster(ctx.caseContext);
    if (!activeRoster.length) return null;

    const suggestions = activeRoster.map((row) => ({
        row,
        partnerId: resolveRosterPartnerId(row, ctx.caseContext, ctx.directory),
    }));
    const pending = suggestions.filter((item) => item.partnerId && !ctx.onTeam(item.partnerId));
    const suggestedRoles = [...new Set(activeRoster
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
                        ) : partnerId && !ctx.readOnly ? (
                            <button
                                type="button"
                                onClick={() => ctx.addOne({ partnerId, suggestedRole: row.assigned8DRole })}
                                className="ml-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/10"
                            >
                                + Add
                            </button>
                        ) : partnerId && ctx.readOnly ? (
                            <span className="ml-1.5 text-[11px] text-muted-foreground">not assigned</span>
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

            {!ctx.readOnly && pending.length > 0 && (
                <button
                    type="button"
                    onClick={() => ctx.addMany(pending.map((item) => ({
                        partnerId: item.partnerId!,
                        suggestedRole: item.row.assigned8DRole,
                    })))}
                    className="rounded-md border border-input bg-card px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/60"
                >
                    ✓ Accept all suggested ({pending.length})
                </button>
            )}
            {pending.length === 0 && (
                <span className="text-[12.5px] text-success">
                    ✓ All suggested members added
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
                {!ctx.readOnly && (
                    <div className="mb-2 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={ctx.addEmpty}
                            disabled={ctx.saving}
                            className="rounded-md border border-input bg-card px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/60 disabled:opacity-50"
                        >
                            Add
                        </button>
                    </div>
                )}

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
                                    <tr key={row.key} className={cn(ctx.readOnly && 'opacity-90')}>
                                        <td className="border-b px-2.5 py-2 align-middle">
                                            <div className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-[#0a6ed1] text-[10.5px] font-bold text-white">
                                                {partner ? initials(partner.partnerName) : '?'}
                                            </div>
                                        </td>
                                        <td className="border-b px-2.5 py-2 align-middle">
                                            <Select
                                                disabled={ctx.readOnly}
                                                value={row.partnerId || UNASSIGNED}
                                                onValueChange={(value) => ctx.patch(row.key, {
                                                    partnerId: value === UNASSIGNED ? '' : value,
                                                })}
                                            >
                                                <SelectTrigger className={cn('h-8 max-w-[220px] text-[12.5px]', ctx.readOnly && 'cursor-not-allowed opacity-75 bg-muted/40')}>
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
                                                disabled={ctx.readOnly}
                                                value={row.partnerRole}
                                                onValueChange={(value) => ctx.patch(row.key, { partnerRole: value })}
                                            >
                                                <SelectTrigger className={cn('h-8 max-w-[190px] text-[12.5px]', ctx.readOnly && 'cursor-not-allowed opacity-75 bg-muted/40')}><SelectValue /></SelectTrigger>
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
                                            {!ctx.readOnly && (
                                                <button
                                                    type="button"
                                                    onClick={() => ctx.remove(row.key)}
                                                    className="rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-primary transition-colors hover:bg-muted/60"
                                                >
                                                    Remove
                                                </button>
                                            )}
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
