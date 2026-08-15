import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Badge, Button, ScrollArea, cn } from '@cnma/react-ui';
import { GripVertical, Layers, List } from 'lucide-react';
import type { FormFieldConfig } from '../types';

function PaletteField({ field, selected, onSelect }: { field: FormFieldConfig; selected: boolean; onSelect: () => void }) {
    const drag = useDraggable({ id: `field-${field.key}` });
    return <div ref={drag.setNodeRef} className={cn('flex cursor-pointer items-center gap-1.5 rounded border bg-background p-1.5 text-xs transition-all', selected ? 'border-info bg-info-bg shadow-sm' : 'border-border hover:border-info/30 hover:bg-accent', drag.isDragging && 'opacity-30')} onClick={onSelect}>
        <span {...drag.attributes} {...drag.listeners} className="cursor-grab text-muted-foreground"><GripVertical className="h-3 w-3" /></span>
        <span className="min-w-0 flex-1 truncate font-medium">{field.label ?? field.key}</span>
        <Badge variant="outline" className="shrink-0">{field.widget}</Badge>
    </div>;
}

interface LayoutFieldsPanelProps {
    fields: FormFieldConfig[];
    selectedField: string | null;
    isDragging: boolean;
    overId: string | null;
    onSelect: (key: string) => void;
    onAddGroup: () => void;
}

export function LayoutFieldsPanel({ fields, selectedField, isDragging, overId, onSelect, onAddGroup }: LayoutFieldsPanelProps) {
    const unassigned = useDroppable({ id: 'unassigned' });
    const isOver = unassigned.isOver || overId === 'unassigned';
    return <aside className="flex w-64 shrink-0 flex-col border-r bg-card">
        <div className="border-b p-3"><div className="flex items-center gap-2 text-sm font-semibold"><List className="h-4 w-4" /> Available Fields</div><p className="mt-1 text-xs text-muted-foreground">Drag fields into layout groups.</p></div>
        <ScrollArea className="flex-1"><div ref={unassigned.setNodeRef} className={cn('m-2 min-h-24 space-y-1 rounded border border-dashed p-2 transition-colors', isOver && 'border-info bg-info-bg/50 ring-2 ring-info/30', isDragging && !isOver && 'bg-muted/30')}>{fields.map((field) => <PaletteField key={field.key} field={field} selected={selectedField === field.key} onSelect={() => onSelect(field.key)} />)}{!fields.length && <div className="flex min-h-20 items-center justify-center text-center text-xs text-muted-foreground">Drop here to unassign<br />or all fields are assigned.</div>}</div></ScrollArea>
        <div className="border-t p-3"><Button size="sm" className="w-full justify-start" onClick={onAddGroup}><Layers className="h-4 w-4" /> Add group</Button></div>
    </aside>;
}
