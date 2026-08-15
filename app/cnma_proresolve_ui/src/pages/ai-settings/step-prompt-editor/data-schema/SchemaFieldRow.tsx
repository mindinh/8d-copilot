import { Badge, Button, cn } from '@cnma/react-ui';
import { Braces, CalendarDays, GripVertical, Hash, List, ToggleLeft, Trash2, Type } from 'lucide-react';
import type { DataSchemaField } from '../types';

const icons = { string: Type, number: Hash, integer: Hash, boolean: ToggleLeft, date: CalendarDays, object: Braces, array: List };
export function SchemaFieldRow({ fieldKey, field, required, selected, onSelect, onRemove }: { fieldKey: string; field: DataSchemaField; required: boolean; selected: boolean; onSelect: () => void; onRemove: () => void }) {
    const Icon = icons[field.type] ?? Type;
    return <div className={cn('group flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50', selected && 'border-primary bg-primary/5 ring-1 ring-primary')} onClick={onSelect}><GripVertical className="h-4 w-4 text-muted-foreground" /><Icon className="h-4 w-4 text-primary" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate font-medium">{field.title || field.label || fieldKey}</p>{required && <Badge variant="secondary">Required</Badge>}</div><p className="truncate font-mono text-xs text-muted-foreground">{fieldKey} · {field.type} · {field['x-source'] ?? field.source ?? 'manual_input'}</p></div><Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100" onClick={(event) => { event.stopPropagation(); onRemove(); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>;
}
