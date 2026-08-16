import { useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { AlertCircle, FileJson, Pencil } from 'lucide-react';
import { Alert, AlertDescription } from '@cnma/react-ui';
import { EditorModeToolbar } from './EditorModeToolbar';
import { AddSchemaFieldForm } from './data-schema/AddSchemaFieldForm';
import { SchemaFieldDetailPanel } from './data-schema/SchemaFieldDetailPanel';
import { SchemaFieldRow } from './data-schema/SchemaFieldRow';
import type { DataSchemaConfig, DataSchemaField, DataType } from './types';

export function DataSchemaEditor({ stepCode, value, onChange }: { stepCode: string; value: DataSchemaConfig; onChange: (value: DataSchemaConfig) => void }) {
    const [mode, setMode] = useState<'form' | 'json'>('form');
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [jsonText, setJsonText] = useState(() => JSON.stringify(value, null, 2));
    const [jsonError, setJsonError] = useState<string | null>(null);
    const schema = value?.properties ? value : { type: 'object' as const, properties: {}, required: [], additionalProperties: false };
    const selected = selectedKey ? schema.properties[selectedKey] : null;
    const keys = useMemo(() => Object.keys(schema.properties), [schema.properties]);

    const updateField = (key: string, patch: Partial<DataSchemaField>) => onChange({ ...schema, properties: { ...schema.properties, [key]: { ...schema.properties[key], ...patch } } });
    const renameField = (oldKey: string, nextKey: string) => {
        if (!nextKey || nextKey === oldKey || schema.properties[nextKey]) return;
        const properties = { ...schema.properties }; properties[nextKey] = properties[oldKey]; delete properties[oldKey];
        onChange({ ...schema, properties, required: (schema.required ?? []).map((key) => key === oldKey ? nextKey : key) }); setSelectedKey(nextKey);
    };
    const addField = (key: string, type: DataType, description: string) => {
        const field: DataSchemaField = type === 'array'
            ? { type, title: key, description, 'x-source': 'manual_input', items: { type: 'object', properties: {} } }
            : type === 'object' ? { type, title: key, description, 'x-source': 'manual_input', properties: {} }
                : { type, title: key, description, 'x-source': 'manual_input' };
        onChange({ ...schema, properties: { ...schema.properties, [key]: field } }); setSelectedKey(key);
    };
    const removeField = (key: string) => { const properties = { ...schema.properties }; delete properties[key]; onChange({ ...schema, properties, required: (schema.required ?? []).filter((item) => item !== key) }); if (selectedKey === key) setSelectedKey(null); };
    const setRequired = (key: string, required: boolean) => onChange({ ...schema, required: required ? [...new Set([...(schema.required ?? []), key])] : (schema.required ?? []).filter((item) => item !== key) });
    const switchToJson = () => { setJsonText(JSON.stringify(schema, null, 2)); setJsonError(null); setMode('json'); };

    return <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        <EditorModeToolbar mode={mode} onVisual={() => setMode('form')} onJson={switchToJson} />
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-card">{mode === 'form' ? <div className="grid h-full min-h-0 gap-4 overflow-hidden p-4 lg:grid-cols-2">
            <section className="flex min-h-0 flex-col overflow-hidden"><div className="flex-1 space-y-1 overflow-y-auto pb-4 p-2">{keys.length ? keys.map((key) => <SchemaFieldRow key={key} fieldKey={key} field={schema.properties[key]} required={(schema.required ?? []).includes(key)} selected={selectedKey === key} onSelect={() => setSelectedKey(key)} onRemove={() => removeField(key)} />) : <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground"><FileJson className="mb-4 h-12 w-12 opacity-20" /><h3 className="mb-1 text-lg font-medium text-foreground">No fields yet</h3><p>Start by adding the first {stepCode} input field.</p></div>}</div><div className="sticky bottom-0 border-t bg-background pt-3"><AddSchemaFieldForm existingKeys={keys} onAdd={addField} /></div></section>
            <section>{selectedKey && selected ? <SchemaFieldDetailPanel fieldKey={selectedKey} field={selected} required={(schema.required ?? []).includes(selectedKey)} onChange={(patch) => updateField(selectedKey, patch)} onRename={(nextKey) => renameField(selectedKey, nextKey)} onRequiredChange={(required) => setRequired(selectedKey, required)} onClose={() => setSelectedKey(null)} /> : <div className="sticky top-4 rounded-xl border bg-card shadow-sm"><div className="flex flex-col items-center justify-center px-6 py-16 text-center text-muted-foreground"><Pencil className="mb-3 h-8 w-8 opacity-30" /><p className="text-sm font-medium">No field selected</p><p className="mt-1 text-xs">Select a field to edit its schema configuration.</p></div></div>}</section>
        </div> : <div className="relative h-full min-h-0 overflow-hidden">{jsonError && <Alert variant="destructive" className="absolute bottom-4 right-4 z-10 w-auto"><AlertCircle className="h-4 w-4" /><AlertDescription>{jsonError}</AlertDescription></Alert>}<Editor height="100%" language="json" value={jsonText} onChange={(text) => { const next = text ?? ''; setJsonText(next); try { const parsed = JSON.parse(next) as DataSchemaConfig; setJsonError(null); onChange(parsed); } catch (error) { setJsonError(error instanceof Error ? error.message : 'Invalid JSON'); } }} options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true }} /></div>}</div>
    </div>;
}
