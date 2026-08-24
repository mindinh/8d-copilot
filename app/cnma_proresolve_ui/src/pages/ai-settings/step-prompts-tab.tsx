import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Label, Spinner, Switch, Textarea } from '@cnma/react-ui';
import { ArrowLeft, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { getStepPrompts, resetRetrievalConfig, updateStepPrompt, type StepPrompt } from '@/services/retrieval-service';
import { ConstraintsEditor } from './step-prompt-editor/ConstraintsEditor';
import { DataSchemaEditor } from './step-prompt-editor/DataSchemaEditor';
import { FormMappingEditor } from './step-prompt-editor/FormMappingEditor';
import { normalizeDataSchema, normalizeFormSchema, parseConfig, stringifyConfig } from './step-prompt-editor/json';
import { RawConfigEditor } from './step-prompt-editor/RawConfigEditor';
import { StepEditorTabNavigation, type StepEditorTab } from './step-prompt-editor/StepEditorTabNavigation';
import { StepObjectSchemaEditor } from '../object-schema/StepObjectSchemaEditor';
import type { ConstraintsConfig, FormSchemaConfig } from './step-prompt-editor/types';

type ConfigField = 'inputSchemaJson' | 'combinedPrompt' | 'formSchemaJson' | 'constraintsJson';
const CONFIG_FIELDS: ConfigField[] = ['inputSchemaJson', 'combinedPrompt', 'formSchemaJson', 'constraintsJson'];

/** Bước có editor prompt cấu trúc. D5–D8 chỉ có tab tìm tiền lệ. */
const ENRICHED_STEPS = ['D1', 'D2', 'D3', 'D4'];
const ALL_TABS: readonly StepEditorTab[] = ['schema', 'data', 'prompt', 'form', 'constraints'];
const SCHEMA_ONLY: readonly StepEditorTab[] = ['schema'];

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Unexpected error'; }

export function StepPromptEditorPage() {
    const navigate = useNavigate();
    const { stepCode = 'D1' } = useParams();
    const [prompts, setPrompts] = useState<StepPrompt[]>([]);
    const [active, setActive] = useState(stepCode.toUpperCase());
    const [draft, setDraft] = useState<Record<ConfigField, string>>({ inputSchemaJson: '', combinedPrompt: '', formSchemaJson: '', constraintsJson: '' });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<StepEditorTab>('schema');
    const current = prompts.find((prompt) => prompt.stepCode === active) ?? null;

    const loadDraft = useCallback((prompt: StepPrompt) => setDraft({
        inputSchemaJson: prompt.inputSchemaJson ?? '', combinedPrompt: prompt.combinedPrompt ?? prompt.systemPrompt ?? '',
        formSchemaJson: prompt.formSchemaJson ?? '', constraintsJson: prompt.constraintsJson ?? '',
    }), []);
    const reload = useCallback(async (selected = active) => {
        const rows = await getStepPrompts(); setPrompts(rows);
        const next = rows.find((row) => row.stepCode === selected) ?? rows[0];
        if (next) { setActive(next.stepCode); loadDraft(next); }
    }, [active, loadDraft]);
    useEffect(() => { reload(stepCode.toUpperCase()).catch((error: unknown) => toast.error(errorMessage(error))).finally(() => setLoading(false)); }, [stepCode]);

    const dirty = current ? CONFIG_FIELDS.some((field) => draft[field] !== (current[field] ?? (field === 'combinedPrompt' ? current.systemPrompt : '') ?? '')) : false;
    const input = useMemo(() => { const parsed = parseConfig<unknown>(draft.inputSchemaJson, {}); return { value: normalizeDataSchema(parsed.value), error: parsed.error }; }, [draft.inputSchemaJson]);
    const form = useMemo(() => { const parsed = parseConfig<FormSchemaConfig>(draft.formSchemaJson, { fields: [] }); return { ...parsed, value: normalizeFormSchema(parsed.value, current?.stepCode) }; }, [draft.formSchemaJson, current?.stepCode]);
    const constraints = useMemo(() => parseConfig<ConstraintsConfig>(draft.constraintsJson, { enabled: true, rules: [] }), [draft.constraintsJson]);
    const setField = (field: ConfigField, value: string) => setDraft((previous) => ({ ...previous, [field]: value }));
    async function save() {
        if (!current || input.error || form.error || constraints.error) { toast.error('Fix invalid JSON before saving'); return; }
        setSaving(true);
        try {
            await updateStepPrompt(current.stepCode, { ...draft, systemPrompt: draft.combinedPrompt, version: current.version + 1 });
            await reload(current.stepCode); toast.success(`${current.stepCode} configuration saved`);
        } catch (error: unknown) { toast.error(errorMessage(error)); }
        finally { setSaving(false); }
    }

    async function restoreStep() {
        if (!current || !window.confirm(`Restore only ${current.stepCode} to the shipped defaults?`)) return;
        setSaving(true);
        try { await resetRetrievalConfig(`prompt:${current.stepCode}`); await reload(current.stepCode); toast.success(`${current.stepCode} defaults restored. Other steps were not changed.`); }
        catch (error: unknown) { toast.error(errorMessage(error)); }
        finally { setSaving(false); }
    }

    if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground"><Spinner className="mr-2 h-5 w-5" /> Loading step prompt...</div>;
    if (!current) return <div className="flex min-h-screen flex-col items-center justify-center gap-4"><p className="text-muted-foreground">No configuration found for this step.</p><Button variant="outline" onClick={() => navigate('/ai-settings')}><ArrowLeft className="h-4 w-4" /> Back to AI Settings</Button></div>;
    // D5–D8 chưa có editor prompt cấu trúc, nhưng CHÚNG VẪN TÌM TIỀN LỆ — chặn
    // khỏi cả trang nghĩa là bốn bước đó không cấu hình được thứ quyết định chúng
    // nhìn thấy case nào.
    const enriched = ENRICHED_STEPS.includes(current.stepCode);
    const availableTabs = enriched ? ALL_TABS : SCHEMA_ONLY;
    const shownTab = availableTabs.includes(activeTab) ? activeTab : 'schema';
    return <div className="flex h-screen min-w-0 flex-col overflow-hidden bg-background">
        <header className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-4 border-b bg-card px-6 py-4">
            <div className="flex min-w-0 items-center gap-4"><Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate('/ai-settings')}><ArrowLeft className="h-5 w-5" /></Button><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-xl font-bold">{current.stepCode} - {current.label}</h1><Badge variant="outline">v{current.version}</Badge></div><p className="truncate text-sm text-muted-foreground">{current.description}</p></div></div>
            <div className="flex items-center gap-3">{dirty && <><Badge variant="secondary">Unsaved changes</Badge><Button variant="ghost" size="sm" onClick={() => loadDraft(current)}>Discard</Button></>}<div className="flex items-center gap-2"><Switch id="step-enabled" checked={current.enabled} onCheckedChange={async (enabled) => { await updateStepPrompt(current.stepCode, { enabled }); await reload(current.stepCode); }} /><Label htmlFor="step-enabled">Enabled</Label></div><Button variant="outline" disabled={saving} onClick={restoreStep}><RotateCcw className="h-4 w-4" /> Restore {current.stepCode}</Button><Button disabled={!dirty || saving || draft.combinedPrompt.split(/\r?\n/).length > 80 || Boolean(input.error || form.error || constraints.error)} onClick={save}>{saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save changes</Button></div>
        </header>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <StepEditorTabNavigation activeTab={shownTab} onTabChange={setActiveTab} availableTabs={availableTabs} />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {shownTab === 'data' && (input.error ? <RawConfigEditor value={draft.inputSchemaJson} error={input.error} onChange={(value) => setField('inputSchemaJson', value)} /> : <DataSchemaEditor stepCode={current.stepCode} value={input.value} onChange={(value) => setField('inputSchemaJson', stringifyConfig(value))} />)}
                {shownTab === 'prompt' && <div className="mx-auto w-full max-w-5xl space-y-6 overflow-y-auto p-6"><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-medium">{current.stepCode} agent guide</h3><p className="text-sm text-muted-foreground">Define the AI instructions for {current.label}.</p></div><Badge variant={draft.combinedPrompt.split(/\r?\n/).length > 80 ? 'destructive' : 'secondary'}>{draft.combinedPrompt.split(/\r?\n/).length}/80 lines</Badge></div><div className="rounded-xl border bg-card p-6 shadow-sm"><Textarea className="min-h-96 font-mono text-sm leading-relaxed" value={draft.combinedPrompt} onChange={(event) => setField('combinedPrompt', event.target.value)} /></div></div>}
                {shownTab === 'form' && (form.error ? <RawConfigEditor value={draft.formSchemaJson} error={form.error} onChange={(value) => setField('formSchemaJson', value)} /> : <FormMappingEditor stepCode={current.stepCode} value={form.value} onChange={(value) => setField('formSchemaJson', stringifyConfig(value))} />)}
                {shownTab === 'constraints' && (constraints.error ? <RawConfigEditor value={draft.constraintsJson} error={constraints.error} onChange={(value) => setField('constraintsJson', value)} /> : <ConstraintsEditor stepCode={current.stepCode} value={constraints.value} onChange={(value) => setField('constraintsJson', stringifyConfig(value))} />)}
                {shownTab === 'schema' && <StepObjectSchemaEditor stepCode={current.stepCode} stepLabel={current.label} />}
            </div>
        </main>
    </div>;
}
