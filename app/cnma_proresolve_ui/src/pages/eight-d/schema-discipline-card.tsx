import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge, Card,
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn,
} from '@cnma/react-ui';
import { AlertCircle, AlertTriangle, CheckCircle2, Link2 } from 'lucide-react';
import type { Discipline8D } from '@/services/eightd-service';
import { Markdown } from './markdown';

interface SnapshotField { key: string; label: string; widget: string; visible?: boolean; colSpan?: number; rowSpan?: number }
interface SnapshotGroup { id: string; label: string; fieldKeys: string[]; order?: number }
interface SnapshotSchema { fields: SnapshotField[]; groups?: SnapshotGroup[] }
interface Violation { ruleId: string; path: string; severity: 'error' | 'warning' | 'info'; message: string }
interface ValidationSnapshot { violations?: Violation[] }

const COLUMN_SPANS: Record<number, string> = {
    1: 'col-span-12 md:col-span-1', 2: 'col-span-12 md:col-span-2', 3: 'col-span-12 md:col-span-3',
    4: 'col-span-12 md:col-span-4', 5: 'col-span-12 md:col-span-5', 6: 'col-span-12 md:col-span-6',
    7: 'col-span-12 md:col-span-7', 8: 'col-span-12 md:col-span-8', 9: 'col-span-12 md:col-span-9',
    10: 'col-span-12 md:col-span-10', 11: 'col-span-12 md:col-span-11', 12: 'col-span-12',
};
const ROW_SPANS: Record<number, string> = { 2: 'row-span-2', 3: 'row-span-3', 4: 'row-span-4' };

function parseObject<T>(value: string | null | undefined): T | null {
    if (!value) return null;
    try { const parsed = JSON.parse(value) as unknown; return parsed && typeof parsed === 'object' ? parsed as T : null; } catch { return null; }
}

function getPath(root: unknown, path: string): unknown {
    let current = root;
    for (const segment of path.split('.')) {
        const match = segment.match(/^([^#]+)#(\d+)$/);
        if (match) {
            current = current && typeof current === 'object' ? (current as Record<string, unknown>)[match[1]] : undefined;
            current = Array.isArray(current) ? current[Number(match[2]) - 1] : undefined;
        } else current = current && typeof current === 'object' ? (current as Record<string, unknown>)[segment] : undefined;
    }
    return current;
}

function humanize(value: string): string { return value.replace(/#(\d+)/g, ' $1').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function compactValue(value: unknown): string {
    if (value == null) return 'Source exists but has no value';
    if (typeof value !== 'object') return String(value);
    if (Array.isArray(value)) return `${value.length} record${value.length === 1 ? '' : 's'}`;
    const record = value as Record<string, unknown>;
    const summary = ['partnerName', 'name', 'actionText', 'description', 'answer', 'measuredValue', 'symptomShortText'].map((key) => record[key]).find((item) => typeof item === 'string' && item);
    return summary ? String(summary) : Object.entries(record).slice(0, 3).map(([key, item]) => `${humanize(key)}: ${String(item ?? '-')}`).join(' · ');
}

function ObjectTable({ rows }: { rows: Array<Record<string, unknown>> }) {
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    if (!rows.length) return <span className="text-sm italic text-muted-foreground">No rows returned</span>;
    return (
        <div className="max-w-full overflow-x-auto rounded-lg border bg-card">
            <Table className="table-auto">
                <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-transparent">
                        {columns.map((column) => (
                            <TableHead
                                key={column}
                                className="min-w-32 whitespace-nowrap px-4 py-3 align-middle font-semibold"
                            >
                                {humanize(column)}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row, index) => (
                        <TableRow key={index}>
                            {columns.map((column) => (
                                <TableCell
                                    key={column}
                                    className="align-top whitespace-normal break-words px-4 py-3"
                                >
                                    {String(row[column] ?? '-')}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function EvidenceList({ paths, context }: { paths: string[]; context: Record<string, unknown> | null }) {
    return <div className="space-y-2">{paths.map((path) => {
        const value = context ? getPath(context, path) : undefined;
        const description = value === undefined && path.startsWith('precedents#') ? 'Similar completed case retrieved during analysis' : value === undefined && path.startsWith('derivedFacts') ? 'Derived from verified case measurements during enrichment' : compactValue(value);
        return <div key={path} className="flex min-w-0 items-start gap-3 rounded-lg border bg-muted/20 p-3"><div className="shrink-0 rounded-full bg-info-bg p-1.5 text-info"><Link2 className="h-3.5 w-3.5" /></div><div className="min-w-0"><div className="break-words text-sm font-medium">{humanize(path)}</div><div className="break-words text-xs text-muted-foreground">{description}</div><code className="mt-1 block break-all text-xs text-muted-foreground/70">{path}</code></div></div>;
    })}</div>;
}

function FieldValue({ field, value, context }: { field: SnapshotField; value: unknown; context: Record<string, unknown> | null }) {
    if (value === undefined || value === null || value === '') return <span className="text-sm italic text-muted-foreground">Not provided</span>;
    if (field.widget === 'evidence-list' && Array.isArray(value)) return <EvidenceList paths={value.map(String)} context={context} />;
    if (field.widget === 'markdown' || field.widget === 'textarea') return <Markdown>{String(value)}</Markdown>;
    if (field.widget === 'status') return <Badge variant={/ready|agree|complete|verified|effective/i.test(String(value)) ? 'success' : 'secondary'} className="max-w-full whitespace-normal break-words text-left leading-relaxed">{String(value)}</Badge>;
    if (typeof value === 'boolean') return <Badge variant={value ? 'success' : 'secondary'}>{value ? 'Yes' : 'No'}</Badge>;
    if (Array.isArray(value)) {
        if (value.every((item) => item && typeof item === 'object' && !Array.isArray(item))) return <ObjectTable rows={value as Array<Record<string, unknown>>} />;
        if (field.widget === 'warning-list') return <div className="space-y-2">{value.length ? value.map((item, index) => <div key={index} className="flex gap-2 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span className="break-words">{String(item)}</span></div>) : <div className="flex gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" />No open gaps</div>}</div>;
        return <div className="flex flex-wrap gap-1.5">{value.map((item, index) => <Badge key={`${String(item)}-${index}`} variant="outline" className="max-w-full whitespace-normal break-words">{String(item)}</Badge>)}</div>;
    }
    if (typeof value === 'object') return <pre className="max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{JSON.stringify(value, null, 2)}</pre>;
    return <span className="break-words whitespace-pre-wrap text-sm leading-relaxed">{String(value)}</span>;
}

function FieldBlock({ field, value, violations, context }: { field: SnapshotField; value: unknown; violations: Violation[]; context: Record<string, unknown> | null }) {
    const hasError = violations.some((item) => item.severity === 'error');
    const hasWarning = violations.some((item) => item.severity === 'warning');
    return <div className={cn('min-w-0 overflow-hidden rounded-xl p-3', COLUMN_SPANS[Math.min(12, Math.max(1, field.colSpan ?? 12))], ROW_SPANS[field.rowSpan ?? 1], field.widget === 'callout' && 'border-l-4 border-l-info bg-info-bg/40 p-4', hasError && 'border border-destructive/40 bg-error-bg/40', hasWarning && !hasError && 'border border-warning/40 bg-warning-bg/30', !hasError && !hasWarning && field.widget !== 'callout' && 'border border-transparent')}><div className="mb-2 flex min-w-0 items-start gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span className="min-w-0 break-words">{field.label || humanize(field.key)}</span>{hasError && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />}{hasWarning && !hasError && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />}</div><div className="min-w-0 overflow-hidden"><FieldValue field={field} value={value} context={context} /></div>{violations.map((item) => <span key={item.ruleId} className={cn('mt-2 block break-words border-t pt-2 text-xs leading-relaxed', item.severity === 'error' ? 'border-destructive/20 text-destructive' : 'border-warning/20 text-warning')}>{item.message}</span>)}</div>;
}

export function SchemaDisciplineCard({ discipline, caseContext }: { discipline: Discipline8D; caseContext?: string }) {
    const schema = parseObject<SnapshotSchema>(discipline.formSchemaJson);
    const data = parseObject<Record<string, unknown>>(discipline.resultJson);
    const context = parseObject<Record<string, unknown>>(caseContext);
    const validation = parseObject<ValidationSnapshot>(discipline.validationJson);
    if (!schema || !data) return null;
    const fieldMap = new Map(schema.fields.map((field) => [field.key, field]));
    const groups = [...(schema.groups ?? [])].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
    const visibleGroups = groups.length ? groups : [{ id: 'result', label: discipline.title, fieldKeys: schema.fields.map((field) => field.key) }];
    const violations = validation?.violations ?? [];
    const errorCount = violations.filter((item) => item.severity === 'error').length;
    const warningCount = violations.filter((item) => item.severity === 'warning').length;
    return <div className="min-w-0 space-y-3"><Card className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-border/70 px-5 py-4"><div className="flex min-w-0 items-center gap-3"><Badge variant="outline">{discipline.code}</Badge><div className="min-w-0"><div className="break-words font-semibold">{discipline.title}</div><div className="text-xs text-muted-foreground">Schema-driven result</div></div></div><div className="flex flex-wrap items-center gap-2"><Badge variant={discipline.dataBacked ? 'success' : 'warning'}>{discipline.dataBacked ? 'Data backed' : 'Inference / incomplete data'}</Badge><Badge variant="outline">{Math.round(Number(discipline.confidence ?? 0) * 100)}% confidence</Badge>{errorCount > 0 ? <Badge variant="destructive">{errorCount} errors</Badge> : warningCount > 0 ? <Badge variant="warning">{warningCount} warnings</Badge> : <Badge variant="success"><CheckCircle2 className="h-3.5 w-3.5" />Validation passed</Badge>}</div></Card><Accordion type="multiple" defaultValue={visibleGroups.map((item) => item.id)} className="space-y-3">{visibleGroups.map((group) => <AccordionItem key={group.id} value={group.id} className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm"><AccordionTrigger className="min-w-0 px-4 py-3 hover:no-underline"><span className="break-words text-left text-sm font-semibold">{group.label}</span></AccordionTrigger><AccordionContent className="border-t px-4 py-4"><div className="grid min-w-0 grid-flow-dense grid-cols-12 gap-4">{group.fieldKeys.map((key) => { const field = fieldMap.get(key); if (!field || field.visible === false) return null; const fieldViolations = violations.filter((item) => item.path === `data.${key}` || item.path === key); return <FieldBlock key={key} field={field} value={getPath(data, key)} violations={fieldViolations} context={context} />; })}</div></AccordionContent></AccordionItem>)}</Accordion></div>;
}
