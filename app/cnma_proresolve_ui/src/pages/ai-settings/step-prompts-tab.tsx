import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Label, Spinner, Switch, Textarea } from '@cnma/react-ui';
import { ArrowLeft, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { getStepPrompts, hasStructuredConfig, resetRetrievalConfig, updateStepPrompt, validateStepConfiguration, type StepPrompt } from '@/services/retrieval-service';
import { ConstraintsEditor } from './step-prompt-editor/ConstraintsEditor';
import { DataSchemaEditor } from './step-prompt-editor/DataSchemaEditor';
import { FormMappingEditor } from './step-prompt-editor/FormMappingEditor';
import { normalizeDataSchema, normalizeFormSchema, parseConfig, stringifyConfig } from './step-prompt-editor/json';
import { RawConfigEditor } from './step-prompt-editor/RawConfigEditor';
import { StepEditorTabNavigation, type StepEditorTab } from './step-prompt-editor/StepEditorTabNavigation';
import { StepSimilarityEditor } from './step-prompt-editor/StepSimilarityEditor';
import type { ConstraintsConfig, FormSchemaConfig } from './step-prompt-editor/types';

type ConfigField = 'inputSchemaJson' | 'combinedPrompt' | 'formSchemaJson' | 'constraintsJson';
const CONFIG_FIELDS: ConfigField[] = ['inputSchemaJson', 'combinedPrompt', 'formSchemaJson', 'constraintsJson'];

const ALL_TABS: readonly StepEditorTab[] = ['data', 'prompt', 'form', 'constraints', 'similarity'];
const SIMILARITY_ONLY: readonly StepEditorTab[] = ['similarity'];

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Unexpected error'; }

export function StepPromptEditorPage() {
    const navigate = useNavigate();
    const { stepCode = 'D1' } = useParams();
    const [prompts, setPrompts] = useState<StepPrompt[]>([]);
    const [active, setActive] = useState(stepCode.toUpperCase());
    const [draft, setDraft] = useState<Record<ConfigField, string>>({ inputSchemaJson: '', combinedPrompt: '', formSchemaJson: '', constraintsJson: '' });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<StepEditorTab>('data');
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

    // ── Kiểm tra ngang hàng với service (R3.2) ──
    // Luật ở server, không chép lại ở đây: một bộ luật thì UI không thể cho Save
    // đúng thứ service chặn. Hoãn 500ms vì mỗi phím gõ là một round-trip.
    const [serverError, setServerError] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const localJsonError = input.error || form.error || constraints.error;
    useEffect(() => {
        if (!current) return;
        // JSON còn hỏng cú pháp thì lỗi tại chỗ đã cụ thể hơn; đừng hỏi server
        // để rồi ghi đè bằng một câu chung chung hơn.
        if (localJsonError) { setServerError(null); setChecking(false); return; }
        setChecking(true);
        const timer = setTimeout(() => {
            validateStepConfiguration(current.stepCode, {
                inputSchemaJson: draft.inputSchemaJson,
                formSchemaJson: draft.formSchemaJson,
                constraintsJson: draft.constraintsJson,
            })
                .then((result) => setServerError(result.valid ? null : result.error))
                // Không chặn Save khi chính lời gọi kiểm tra hỏng: lúc đó ta
                // không biết cấu hình sai hay mạng sai, và service vẫn kiểm lại
                // lúc Save. Chặn ở đây là để người dùng mắc kẹt vì một sự cố
                // chẳng liên quan gì tới cấu hình họ vừa sửa.
                .catch(() => setServerError(null))
                .finally(() => setChecking(false));
        }, 500);
        return () => clearTimeout(timer);
    }, [current?.stepCode, draft.inputSchemaJson, draft.formSchemaJson, draft.constraintsJson, localJsonError]);
    async function save() {
        if (!current || localJsonError) { toast.error('Fix invalid JSON before saving'); return; }
        if (serverError) { toast.error(serverError); return; }
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
    // Bước chưa có cấu hình cấu trúc VẪN TÌM TIỀN LỆ — chặn khỏi cả trang nghĩa
    // là bước đó không cấu hình được thứ quyết định nó nhìn thấy case nào.
    const enriched = hasStructuredConfig(current);
    const availableTabs = enriched ? ALL_TABS : SIMILARITY_ONLY;
    // D6 không gọi model (R2.6.1) — nội dung của nó được tính thuần ở
    // `d6Verification.ts`. Tab Prompt guide bị khoá KÈM LÝ DO chứ không ẩn: ẩn
    // đi thì trông như tính năng còn thiếu, và ai đó sẽ đi làm lại nó.
    const disabledTabs = current.stepCode === 'D6'
        ? { prompt: 'D6 makes no model call — its checklist is computed from recorded action status. There is no prompt to guide.' }
        : undefined;
    const shownTab = availableTabs.includes(activeTab) && !disabledTabs?.[activeTab as 'prompt']
        ? activeTab
        : (enriched ? 'data' : 'similarity');
    return <div className="flex h-screen min-w-0 flex-col overflow-hidden bg-background">
        <header className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-4 border-b bg-card px-6 py-4">
            <div className="flex min-w-0 items-center gap-4"><Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate('/ai-settings')}><ArrowLeft className="h-5 w-5" /></Button><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-xl font-bold">{current.stepCode} - {current.label}</h1><Badge variant="outline">v{current.version}</Badge></div><p className="truncate text-sm text-muted-foreground">{current.description}</p></div></div>
            <div className="flex items-center gap-3">{dirty && <><Badge variant="secondary">Unsaved changes</Badge><Button variant="ghost" size="sm" onClick={() => loadDraft(current)}>Discard</Button></>}<div className="flex items-center gap-2"><Switch id="step-enabled" checked={current.enabled} onCheckedChange={async (enabled) => { await updateStepPrompt(current.stepCode, { enabled }); await reload(current.stepCode); }} /><Label htmlFor="step-enabled">Enabled</Label></div><Button variant="outline" disabled={saving} onClick={restoreStep}><RotateCcw className="h-4 w-4" /> Restore {current.stepCode}</Button><Button disabled={!dirty || saving || checking || draft.combinedPrompt.split(/\r?\n/).length > 80 || Boolean(localJsonError) || Boolean(serverError)} onClick={save}>{saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save changes</Button></div>
        </header>
        {/* Hiện đúng câu mà Save sẽ báo, ngay lúc gõ — không bắt người dùng bấm
            Save để mới biết mình sai ở đâu. */}
        {serverError && <div className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-6 py-2.5 text-sm text-destructive">
            <span className="font-medium">Cannot save:</span> {serverError}
        </div>}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <StepEditorTabNavigation activeTab={shownTab} onTabChange={setActiveTab} availableTabs={availableTabs} disabledTabs={disabledTabs} />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {shownTab === 'data' && (input.error ? <RawConfigEditor value={draft.inputSchemaJson} error={input.error} onChange={(value) => setField('inputSchemaJson', value)} /> : <DataSchemaEditor stepCode={current.stepCode} value={input.value} onChange={(value) => setField('inputSchemaJson', stringifyConfig(value))} />)}
                {shownTab === 'prompt' && <div className="mx-auto w-full max-w-5xl space-y-6 overflow-y-auto p-6"><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-medium">{current.stepCode} agent guide</h3><p className="text-sm text-muted-foreground">Define the AI instructions for {current.label}.</p></div><Badge variant={draft.combinedPrompt.split(/\r?\n/).length > 80 ? 'destructive' : 'secondary'}>{draft.combinedPrompt.split(/\r?\n/).length}/80 lines</Badge></div><div className="rounded-xl border bg-card p-6 shadow-sm"><Textarea className="min-h-96 font-mono text-sm leading-relaxed" value={draft.combinedPrompt} onChange={(event) => setField('combinedPrompt', event.target.value)} /></div></div>}
                {shownTab === 'form' && (form.error ? <RawConfigEditor value={draft.formSchemaJson} error={form.error} onChange={(value) => setField('formSchemaJson', value)} /> : <FormMappingEditor stepCode={current.stepCode} value={form.value} onChange={(value) => setField('formSchemaJson', stringifyConfig(value))} />)}
                {shownTab === 'constraints' && (constraints.error ? <RawConfigEditor value={draft.constraintsJson} error={constraints.error} onChange={(value) => setField('constraintsJson', value)} /> : <ConstraintsEditor stepCode={current.stepCode} value={constraints.value} onChange={(value) => setField('constraintsJson', stringifyConfig(value))} />)}
                {shownTab === 'similarity' && <StepSimilarityEditor stepCode={current.stepCode} stepLabel={current.label} />}
            </div>
        </main>
    </div>;
}
