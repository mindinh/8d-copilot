import { useState } from 'react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label } from '@cnma/react-ui';

export function AddLayoutGroupDialog({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (open: boolean) => void; onAdd: (name: string) => void }) {
    const [name, setName] = useState('');
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Add layout group</DialogTitle><DialogDescription>Groups define sections on the generated D1 form.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="group-name">Group name</Label><Input id="group-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Team assignment" /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!name.trim()} onClick={() => { onAdd(name); setName(''); onOpenChange(false); }}>Add group</Button></DialogFooter></DialogContent></Dialog>;
}
