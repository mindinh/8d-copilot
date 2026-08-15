import { useState } from 'react';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cnma/react-ui';
import { Plus } from 'lucide-react';
import type { DataType } from '../types';

export function AddSchemaFieldForm({ existingKeys, onAdd }: { existingKeys: string[]; onAdd: (key: string, type: DataType, description: string) => void }) {
    const [key, setKey] = useState(''); const [type, setType] = useState<DataType>('string'); const [description, setDescription] = useState('');
    const valid = /^[a-z][a-zA-Z0-9]*$/.test(key) && !existingKeys.includes(key);
    return <div className="space-y-2 rounded-lg border bg-muted/20 p-3"><div className="grid gap-2 md:grid-cols-[1fr_9rem_auto]"><Input placeholder="fieldKey" value={key} onChange={(event) => setKey(event.target.value)} /><Select value={type} onValueChange={(value) => setType(value as DataType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['string', 'number', 'integer', 'boolean', 'date', 'object', 'array'].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select><Button disabled={!valid} onClick={() => { onAdd(key, type, description); setKey(''); setDescription(''); }}><Plus className="h-4 w-4" /> Add field</Button></div><Input placeholder="Field description" value={description} onChange={(event) => setDescription(event.target.value)} />{key && !valid && <p className="text-xs text-destructive">Use a unique camelCase key.</p>}</div>;
}
