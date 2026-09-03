/**
 * Tab Code Catalogues — hai danh mục mã của QM, đặt cạnh nhau.
 *
 * ── Vì sao tab này tồn tại ──
 * Trước Phase 4, danh mục mã lỗi CÓ thật nhưng không ai nhìn thấy được: nó sống
 * trong `ValueHelpList` và chỉ ló ra qua ô gợi ý của form. Hệ quả là câu "add it
 * in Master Data first" trong cảnh báo F4 cứng chỉ tới một chỗ không tồn tại.
 * Tab này là chỗ đó.
 *
 * ── Vì sao chỉ đọc ──
 * Cả hai danh mục là dữ liệu chủ của SAP: mã lỗi là catalog type 9, mã nhiệm vụ
 * là type 2. Ngày nối S/4, chúng đổi `sourceType` sang 'external' và nguồn sự
 * thật nằm ngoài app này. Mở đường ghi ở đây là hứa một thứ sẽ phải rút lại —
 * và tệ hơn, là tạo ra một bản danh mục thứ hai lệch với bản của SAP. Đường sửa
 * đúng là sửa danh mục nguồn rồi seeder đối chiếu lại.
 *
 * ── Vì sao có cột "Used in closed cases" ──
 * Đó là toàn bộ lý do Phase 4 mã hoá nhiệm vụ. Câu hỏi "lần trước gặp chuyện này
 * chúng ta đã làm gì" trước đây phải đọc 78 câu văn mới trả lời được; có mã thì
 * nó là một phép đếm. Cột này là bằng chứng nhìn thấy được rằng phép đếm đó chạy
 * — và một mã đếm ra 0 nói đúng một điều có ích: chưa case đóng nào dùng tới nó.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Badge,
    Card,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Spinner,
    cn,
} from '@cnma/react-ui';
import { Info, Search, Tags } from 'lucide-react';
import { useValueHelp } from '@/hooks/use-value-help';
import { VALUE_HELP_IDS, type ValueHelpEntry } from '@/services/value-help-service';
import axiosInstance from '@/services/core/axios-instance';

type CatalogueKey = 'task' | 'defect';

const CATALOGUES = {
    task: {
        label: 'Task Codes',
        catalogType: 'Catalog type 2 — quality tasks',
        caption:
            'The coded vocabulary behind every D3 / D5 / D7 action. A task keeps its own sentence; '
            + 'the code is what makes "what did we do last time this happened" a count instead of a read.',
        codeId: VALUE_HELP_IDS.taskCode,
        groupId: VALUE_HELP_IDS.taskCodeGroup,
        usageLabel: 'Used in closed cases',
    },
    defect: {
        label: 'Defect Codes',
        catalogType: 'Catalog type 9 — defects',
        caption:
            'The coded vocabulary for what went wrong. Recording a defect requires one of these — '
            + 'an off-catalogue code scores zero on precedent retrieval without ever showing an error.',
        codeId: VALUE_HELP_IDS.defectCode,
        groupId: VALUE_HELP_IDS.defectCodeGroup,
        usageLabel: 'Closed cases with this code',
    },
} as const;

const ALL_GROUPS = '__ALL__';

/**
 * Đếm mã đã dùng trong kho case đã đóng.
 *
 * Lấy hết rồi đếm ở client chứ không `$apply=groupby`: kho có cỡ trăm dòng, và
 * một truy vấn gộp của OData sẽ im lặng trả về rỗng trên vài adapter thay vì báo
 * lỗi — một cột toàn số 0 trông y hệt "chưa ai dùng mã nào".
 */
function useCodeUsage(path: string, column: string) {
    return useQuery({
        queryKey: ['master-data', 'code-usage', path, column],
        queryFn: async () => {
            const res = await axiosInstance.get<{ value: Array<Record<string, unknown>> }>(
                `api/cnma/EIGHTD_SRV/${path}?$select=${column}&$top=5000`,
            );
            const counts = new Map<string, number>();
            for (const row of res.data?.value ?? []) {
                const code = String(row?.[column] ?? '').trim().toUpperCase();
                if (!code) continue;
                counts.set(code, (counts.get(code) ?? 0) + 1);
            }
            return counts;
        },
        staleTime: 5 * 60 * 1000,
    });
}

export function CodeCataloguesTab() {
    const [catalogue, setCatalogue] = useState<CatalogueKey>('task');
    const [search, setSearch] = useState('');
    const [group, setGroup] = useState<string>(ALL_GROUPS);

    const active = CATALOGUES[catalogue];
    const codesVh = useValueHelp(active.codeId);
    const groupsVh = useValueHelp(active.groupId);

    // Hai danh mục đếm trên hai bảng khác nhau: nhiệm vụ nằm ở từng HÀNH ĐỘNG của
    // case đã đóng, còn mã lỗi nằm ở chính CASE.
    const taskUsage = useCodeUsage('HistoricalActions', 'taskCode');
    const defectUsage = useCodeUsage('HistoricalCases', 'defectCode');
    const usage = catalogue === 'task' ? taskUsage : defectUsage;

    const groupText = useMemo(() => {
        const map = new Map<string, string>();
        for (const entry of groupsVh.entries) map.set(String(entry.key), String(entry.text ?? ''));
        return map;
    }, [groupsVh.entries]);

    const rows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return codesVh.entries
            .filter((entry: ValueHelpEntry) => {
                const codeGroup = String(entry.codeGroup ?? '');
                if (group !== ALL_GROUPS && codeGroup !== group) return false;
                if (!needle) return true;
                return `${entry.key} ${entry.text} ${codeGroup}`.toLowerCase().includes(needle);
            })
            .sort((a, b) => String(a.key).localeCompare(String(b.key)));
    }, [codesVh.entries, search, group]);

    const usedCount = (code: string): number =>
        usage.data?.get(String(code).trim().toUpperCase()) ?? 0;

    return (
        <div className="space-y-4">
            {/* Chọn danh mục + lọc */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 flex-wrap">
                <div className="inline-flex items-center rounded-xl border border-border/80 bg-muted/60 p-1 shadow-xs">
                    {(Object.keys(CATALOGUES) as CatalogueKey[]).map((key) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => { setCatalogue(key); setGroup(ALL_GROUPS); }}
                            className={cn(
                                'rounded-lg px-4 py-1.5 text-xs font-semibold transition-all cursor-pointer',
                                catalogue === key
                                    ? 'bg-background text-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {CATALOGUES[key].label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2.5 flex-1 min-w-[280px] max-w-xl">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search code or description..."
                            className="pl-8 text-xs h-9 bg-background"
                        />
                    </div>
                    <Select value={group} onValueChange={setGroup}>
                        <SelectTrigger className="w-52 text-xs h-9">
                            <SelectValue placeholder="Code group" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL_GROUPS}>All code groups</SelectItem>
                            {groupsVh.entries.map((entry) => (
                                <SelectItem key={String(entry.key)} value={String(entry.key)}>
                                    {String(entry.key)} — {String(entry.text ?? '')}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <p className="text-xs text-muted-foreground max-w-3xl leading-relaxed">
                {active.caption}
            </p>

            <Card className="overflow-hidden border border-border/80 shadow-xs">
                {codesVh.loading ? (
                    <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
                        <Spinner className="w-4 h-4" /> Loading the catalogue…
                    </div>
                ) : rows.length === 0 ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">
                        <Tags className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                        {codesVh.entries.length === 0
                            ? 'The catalogue could not be loaded. Codes can still be typed by hand on the forms.'
                            : 'No code matches these filters.'}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-border/80 bg-muted/50 font-semibold text-muted-foreground">
                                    <th className="py-3 px-4 w-32">Code</th>
                                    <th className="py-3 px-4 min-w-[280px]">Description</th>
                                    <th className="py-3 px-4 w-64">Code Group</th>
                                    {catalogue === 'defect' && <th className="py-3 px-4 w-24">Class</th>}
                                    <th className="py-3 px-4 w-44 text-right">{active.usageLabel}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {rows.map((entry) => {
                                    const code = String(entry.key);
                                    const codeGroup = String(entry.codeGroup ?? '');
                                    const used = usedCount(code);
                                    return (
                                        <tr key={code} className="hover:bg-muted/30 transition-colors">
                                            <td className="py-3 px-4 font-mono font-bold text-foreground">{code}</td>
                                            <td className="py-3 px-4 text-foreground">{String(entry.text ?? '')}</td>
                                            <td className="py-3 px-4">
                                                {codeGroup ? (
                                                    <>
                                                        <div className="font-mono text-foreground">{codeGroup}</div>
                                                        {groupText.get(codeGroup) && (
                                                            <div className="text-[10.5px] text-muted-foreground">
                                                                {groupText.get(codeGroup)}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </td>
                                            {catalogue === 'defect' && (
                                                <td className="py-3 px-4 text-muted-foreground">
                                                    {String(entry.defectClass ?? '—')}
                                                </td>
                                            )}
                                            <td className="py-3 px-4 text-right">
                                                {usage.isLoading ? (
                                                    <span className="text-muted-foreground">…</span>
                                                ) : used > 0 ? (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[10.5px] tabular-nums border-primary/30 bg-primary/5 text-primary"
                                                    >
                                                        {used}
                                                    </Badge>
                                                ) : (
                                                    // "0" chứ không phải "—": mã tồn tại và chưa từng được
                                                    // dùng là một sự thật, không phải một ô thiếu dữ liệu.
                                                    <span className="tabular-nums text-muted-foreground">0</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground max-w-3xl">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                    {active.catalogType}. Read-only: both catalogues are SAP master data, and when S/4 is
                    connected they are sourced from it rather than maintained here. To add a code, add it to
                    the catalogue source — the seeder reconciles new entries on the next start without
                    touching the ones already in use.
                </span>
            </p>
        </div>
    );
}

export default CodeCataloguesTab;
