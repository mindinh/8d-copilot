import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Badge,
    Button,
    Card,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Spinner,
    Textarea,
    cn,
} from '@cnma/react-ui';
import {
    AlertCircle,
    Edit,
    FileCode,
    FolderKanban,
    Plus,
    RefreshCw,
    Search,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    historicalCasesService,
    type HistoricalCaseItem,
} from '@/services/master-data-service';

export function HistoricalDefectsTab() {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const [jsonImportOpen, setJsonImportOpen] = useState(false);
    const [editItem, setEditItem] = useState<HistoricalCaseItem | null>(null);
    const [deleteItem, setDeleteItem] = useState<HistoricalCaseItem | null>(null);

    const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
        queryKey: ['master-data', 'historical-cases', search],
        queryFn: () => historicalCasesService.list({ search, top: 100 }),
    });

    const rows = data?.value ?? [];

    const createMutation = useMutation({
        mutationFn: (item: Partial<HistoricalCaseItem>) => historicalCasesService.create(item),
        onSuccess: () => {
            toast.success('Historical defect case created successfully.');
            setCreateOpen(false);
            void queryClient.invalidateQueries({ queryKey: ['master-data', 'historical-cases'] });
        },
        onError: (err: any) => {
            toast.error(err?.response?.data?.error?.message ?? err?.message ?? 'Failed to create case.');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, item }: { id: string; item: Partial<HistoricalCaseItem> }) =>
            historicalCasesService.update(id, item),
        onSuccess: () => {
            toast.success('Historical defect case updated successfully.');
            setEditItem(null);
            void queryClient.invalidateQueries({ queryKey: ['master-data', 'historical-cases'] });
        },
        onError: (err: any) => {
            toast.error(err?.response?.data?.error?.message ?? err?.message ?? 'Failed to update case.');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => historicalCasesService.delete(id),
        onSuccess: () => {
            toast.success('Case deleted successfully.');
            setDeleteItem(null);
            void queryClient.invalidateQueries({ queryKey: ['master-data', 'historical-cases'] });
        },
        onError: (err: any) => {
            toast.error(err?.response?.data?.error?.message ?? err?.message ?? 'Failed to delete case.');
        },
    });

    return (
        <div className="space-y-4">
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by Case ID, Material, Symptom, Defect..."
                        className="pl-8 text-xs h-9 bg-background"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="h-9 gap-1.5 text-xs"
                    >
                        <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
                        Refresh
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setJsonImportOpen(true)}
                        className="h-9 gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/5 font-medium"
                    >
                        <FileCode className="w-4 h-4" />
                        Import JSON
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => setCreateOpen(true)}
                        className="h-9 gap-1.5 text-xs bg-primary text-primary-foreground font-semibold"
                    >
                        <Plus className="w-4 h-4" />
                        Add Historical Case
                    </Button>
                </div>
            </div>

            {/* Content Table Card */}
            <Card className="overflow-hidden border border-border/80 shadow-xs">
                {isLoading ? (
                    <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
                        <Spinner className="w-4 h-4" /> Loading historical cases…
                    </div>
                ) : isError ? (
                    <div className="p-8 text-center text-sm text-destructive">
                        <AlertCircle className="w-6 h-6 mx-auto mb-2" />
                        Failed to load data: {(error as Error)?.message}
                    </div>
                ) : rows.length === 0 ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">
                        <FolderKanban className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                        No historical defect cases found.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-border/80 bg-muted/50 font-semibold text-muted-foreground">
                                    <th className="py-3 px-4 w-36">Case ID</th>
                                    <th className="py-3 px-4 w-36">Origin</th>
                                    <th className="py-3 px-4 min-w-[180px]">Material</th>
                                    <th className="py-3 px-4 min-w-[160px]">Work Center</th>
                                    <th className="py-3 px-4 min-w-[240px]">Symptom & Defect</th>
                                    <th className="py-3 px-4 w-32">Root Cause</th>
                                    <th className="py-3 px-4 w-28">Status</th>
                                    <th className="py-3 px-4 w-24 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {rows.map((row) => (
                                    <tr key={row.ID} className="hover:bg-muted/30 transition-colors">
                                        <td className="py-3 px-4 font-mono font-bold text-foreground">
                                            {row.notificationId}
                                        </td>
                                        <td className="py-3 px-4">
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    'text-[10.5px]',
                                                    row.origin?.includes('Customer') || row.origin?.startsWith('Q1')
                                                        ? 'border-destructive/30 text-destructive bg-destructive/5'
                                                        : 'border-info/30 text-info bg-info/5'
                                                )}
                                            >
                                                {row.origin?.includes('Customer') ? 'Customer (Q1)' : 'Internal (Q3)'}
                                            </Badge>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="font-medium text-foreground">{row.materialDesc || row.materialId}</div>
                                            {row.materialDesc && row.materialId && (
                                                <div className="font-mono text-[10.5px] text-muted-foreground">{row.materialId}</div>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="font-mono text-foreground font-semibold">{row.workCenterId || '—'}</div>
                                            <div className="text-[10.5px] text-muted-foreground">{row.workCenterDesc || ''}</div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="font-medium text-foreground line-clamp-1">{row.symptomShortText || '—'}</div>
                                            <div className="text-[10.5px] text-muted-foreground line-clamp-1">
                                                {row.defectCode ? `[${row.defectCode}] ` : ''}{row.defectText || ''}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            {row.rootCauseCategory ? (
                                                <Badge variant="secondary" className="text-[11px] font-normal">
                                                    {row.rootCauseCategory}
                                                </Badge>
                                            ) : '—'}
                                        </td>
                                        <td className="py-3 px-4">
                                            <Badge variant={row.sapStatus === 'Closed' ? 'success' : 'secondary'} className="text-[10.5px]">
                                                {row.sapStatus || 'Closed'}
                                            </Badge>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                    onClick={() => setEditItem(row)}
                                                >
                                                    <Edit className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                    onClick={() => setDeleteItem(row)}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Create Dialog */}
            <CaseFormDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                title="Add Historical Defect Case"
                isPending={createMutation.isPending}
                onSubmit={(values) => createMutation.mutate(values)}
            />

            {/* JSON Import Dialog */}
            <CaseJsonImportDialog
                open={jsonImportOpen}
                onOpenChange={setJsonImportOpen}
                onSuccess={() => void queryClient.invalidateQueries({ queryKey: ['master-data', 'historical-cases'] })}
            />

            {/* Edit Dialog */}
            {editItem && (
                <CaseFormDialog
                    open={Boolean(editItem)}
                    onOpenChange={(open) => !open && setEditItem(null)}
                    title={`Edit Case — ${editItem.notificationId}`}
                    initialValues={editItem}
                    isPending={updateMutation.isPending}
                    onSubmit={(values) => updateMutation.mutate({ id: editItem.ID, item: values })}
                />
            )}

            {/* Delete Confirmation */}
            {deleteItem && (
                <Dialog open={Boolean(deleteItem)} onOpenChange={(open) => !open && setDeleteItem(null)}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-base font-bold text-destructive flex items-center gap-2">
                                <AlertCircle className="w-5 h-5" />
                                Delete Historical Case
                            </DialogTitle>
                        </DialogHeader>
                        <p className="text-xs text-muted-foreground mt-2">
                            Are you sure you want to delete case <strong className="font-mono text-foreground">{deleteItem.notificationId}</strong>?
                            This action cannot be undone.
                        </p>
                        <DialogFooter className="gap-2 mt-4">
                            <Button variant="outline" size="sm" onClick={() => setDeleteItem(null)}>Cancel</Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                disabled={deleteMutation.isPending}
                                onClick={() => deleteMutation.mutate(deleteItem.ID)}
                            >
                                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

function CaseFormDialog({
    open,
    onOpenChange,
    title,
    initialValues,
    isPending,
    onSubmit,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    initialValues?: HistoricalCaseItem;
    isPending: boolean;
    onSubmit: (values: Partial<HistoricalCaseItem>) => void;
}) {
    const [notificationId, setNotificationId] = useState(initialValues?.notificationId || '');
    const [origin, setOrigin] = useState(initialValues?.origin || 'Q3 - Internal Defect');
    const [symptomShortText, setSymptomShortText] = useState(initialValues?.symptomShortText || '');
    const [materialId, setMaterialId] = useState(initialValues?.materialId || '');
    const [materialDesc, setMaterialDesc] = useState(initialValues?.materialDesc || '');
    const [materialFamily, setMaterialFamily] = useState(initialValues?.materialFamily || '');
    const [workCenterId, setWorkCenterId] = useState(initialValues?.workCenterId || '');
    const [workCenterDesc, setWorkCenterDesc] = useState(initialValues?.workCenterDesc || '');
    const [defectCode, setDefectCode] = useState(initialValues?.defectCode || '');
    const [defectText, setDefectText] = useState(initialValues?.defectText || '');
    const [rootCauseCategory, setRootCauseCategory] = useState(initialValues?.rootCauseCategory || 'Machine');
    const [copqEur, setCopqEur] = useState<string>(initialValues?.copqEur != null ? String(initialValues.copqEur) : '');
    const [sapStatus, setSapStatus] = useState(initialValues?.sapStatus || 'Closed');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!notificationId.trim() || !materialId.trim()) {
            toast.error('Case ID and Material ID are required.');
            return;
        }

        onSubmit({
            notificationId: notificationId.trim(),
            origin,
            symptomShortText: symptomShortText.trim(),
            materialId: materialId.trim(),
            materialDesc: materialDesc.trim() || null,
            materialFamily: materialFamily.trim() || null,
            workCenterId: workCenterId.trim() || null,
            workCenterDesc: workCenterDesc.trim() || null,
            defectCode: defectCode.trim() || null,
            defectText: defectText.trim() || null,
            rootCauseCategory: rootCauseCategory || null,
            copqEur: copqEur ? Number(copqEur) : null,
            sapStatus,
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] sm:max-w-4xl md:max-w-5xl !max-w-5xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
                <DialogHeader>
                    <DialogTitle className="text-base font-bold flex items-center gap-2">
                        <FolderKanban className="w-5 h-5 text-primary" />
                        {title}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Notification ID *</Label>
                            <Input
                                value={notificationId}
                                onChange={(e) => setNotificationId(e.target.value)}
                                placeholder="e.g. 8D-10048412"
                                className="font-mono text-xs"
                                required
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Origin</Label>
                            <Select value={origin} onValueChange={setOrigin}>
                                <SelectTrigger className="text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Q3 - Internal Defect">Q3 - Internal Defect</SelectItem>
                                    <SelectItem value="Q1 - Customer Complaint">Q1 - Customer Complaint</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">SAP Status</Label>
                            <Select value={sapStatus} onValueChange={setSapStatus}>
                                <SelectTrigger className="text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Closed">Closed</SelectItem>
                                    <SelectItem value="Completed">Completed</SelectItem>
                                    <SelectItem value="In Process">In Process</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Symptom Summary</Label>
                        <Textarea
                            value={symptomShortText}
                            onChange={(e) => setSymptomShortText(e.target.value)}
                            placeholder="e.g. Rough edge and flange burr detected on housing after CNC milling"
                            className="text-xs resize-y min-h-[60px]"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Material ID *</Label>
                            <Input
                                value={materialId}
                                onChange={(e) => setMaterialId(e.target.value)}
                                placeholder="e.g. MAT-10247"
                                className="font-mono text-xs"
                                required
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Material Description</Label>
                            <Input
                                value={materialDesc}
                                onChange={(e) => setMaterialDesc(e.target.value)}
                                placeholder="e.g. Bracket Housing X240"
                                className="text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Material Family (MATKL)</Label>
                            <Input
                                value={materialFamily}
                                onChange={(e) => setMaterialFamily(e.target.value)}
                                placeholder="e.g. CAST_BRACKET"
                                className="font-mono text-xs"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Work Center ID</Label>
                            <Input
                                value={workCenterId}
                                onChange={(e) => setWorkCenterId(e.target.value)}
                                placeholder="e.g. WC-MILL-07"
                                className="font-mono text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Work Center Description</Label>
                            <Input
                                value={workCenterDesc}
                                onChange={(e) => setWorkCenterDesc(e.target.value)}
                                placeholder="e.g. CNC Milling Line 7"
                                className="text-xs"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Defect Code</Label>
                            <Input
                                value={defectCode}
                                onChange={(e) => setDefectCode(e.target.value)}
                                placeholder="e.g. DEF-0489"
                                className="font-mono text-xs"
                            />
                        </div>
                        <div className="sm:col-span-2 space-y-1">
                            <Label className="text-xs font-semibold">Defect Description</Label>
                            <Input
                                value={defectText}
                                onChange={(e) => setDefectText(e.target.value)}
                                placeholder="e.g. Flange edge burr above limit"
                                className="text-xs"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Ishikawa Root Cause Category</Label>
                            <Select value={rootCauseCategory} onValueChange={setRootCauseCategory}>
                                <SelectTrigger className="text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Machine">Machine</SelectItem>
                                    <SelectItem value="Method">Method</SelectItem>
                                    <SelectItem value="Material">Material</SelectItem>
                                    <SelectItem value="Man">Man (Operator)</SelectItem>
                                    <SelectItem value="Measurement">Measurement</SelectItem>
                                    <SelectItem value="Milieu">Milieu (Environment)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Cost of Poor Quality (EUR)</Label>
                            <Input
                                type="number"
                                value={copqEur}
                                onChange={(e) => setCopqEur(e.target.value)}
                                placeholder="e.g. 14200"
                                className="text-xs"
                            />
                        </div>
                    </div>

                    <DialogFooter className="gap-2 pt-2 border-t">
                        <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" size="sm" disabled={isPending} className="bg-primary font-semibold">
                            {isPending ? <Spinner className="w-4 h-4 mr-1.5" /> : null}
                            Save Case
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function CaseJsonImportDialog({
    open,
    onOpenChange,
    onSuccess,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}) {
    const [jsonText, setJsonText] = useState('');
    const [importing, setImporting] = useState(false);
    const [parseError, setParseError] = useState<string | null>(null);

    const sampleJson = `[
  {
    "notificationId": "8D-10048412",
    "origin": "Q3 - Internal Defect",
    "symptomShortText": "Flange edge burr above limit",
    "materialId": "MAT-10247",
    "materialDesc": "Bracket Housing X240",
    "materialFamily": "CAST_BRACKET",
    "workCenterId": "WC-MILL-07",
    "workCenterDesc": "CNC Milling Line 7",
    "defectCode": "DEF-0489",
    "defectText": "Flange edge burr above limit",
    "rootCauseCategory": "Machine",
    "copqEur": 14200,
    "sapStatus": "Closed"
  }
]`;

    const handleLoadSample = () => {
        setJsonText(sampleJson);
        setParseError(null);
    };

    const handleImport = async () => {
        setParseError(null);
        if (!jsonText.trim()) {
            setParseError('Please enter JSON data.');
            return;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(jsonText.trim());
        } catch (e: any) {
            setParseError(`Invalid JSON syntax: ${e.message}`);
            return;
        }

        const items: Array<Partial<HistoricalCaseItem>> = Array.isArray(parsed) ? parsed : [parsed as Partial<HistoricalCaseItem>];

        if (items.length === 0) {
            setParseError('JSON array is empty.');
            return;
        }

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.notificationId || !item.materialId) {
                setParseError(`Item at index ${i} is missing required fields (notificationId, materialId).`);
                return;
            }
        }

        setImporting(true);
        let successCount = 0;
        let failCount = 0;
        const errors: string[] = [];

        for (const item of items) {
            try {
                await historicalCasesService.create({
                    notificationId: String(item.notificationId).trim(),
                    origin: item.origin || 'Q3 - Internal Defect',
                    symptomShortText: item.symptomShortText || null,
                    materialId: String(item.materialId).trim(),
                    materialDesc: item.materialDesc || null,
                    materialFamily: item.materialFamily || null,
                    workCenterId: item.workCenterId || null,
                    workCenterDesc: item.workCenterDesc || null,
                    defectCode: item.defectCode || null,
                    defectText: item.defectText || null,
                    rootCauseCategory: item.rootCauseCategory || null,
                    copqEur: item.copqEur != null ? Number(item.copqEur) : null,
                    sapStatus: item.sapStatus || 'Closed',
                });
                successCount++;
            } catch (err: any) {
                failCount++;
                errors.push(err?.response?.data?.error?.message ?? err?.message ?? 'Failed to save');
            }
        }

        setImporting(false);
        if (successCount > 0) {
            toast.success(`Imported ${successCount} historical defect case${successCount > 1 ? 's' : ''} successfully!`);
            onSuccess();
            onOpenChange(false);
            setJsonText('');
        }
        if (failCount > 0) {
            toast.error(`Failed to import ${failCount} record(s): ${errors[0] || ''}`);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] sm:max-w-3xl md:max-w-4xl !max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
                <DialogHeader>
                    <DialogTitle className="text-base font-bold flex items-center gap-2">
                        <FileCode className="w-5 h-5 text-primary" />
                        Import Historical Defect Cases from JSON
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                            Paste a single JSON object or an array of defect case objects:
                        </p>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleLoadSample}
                            className="h-7 text-xs text-primary hover:underline cursor-pointer"
                        >
                            Insert Sample Template
                        </Button>
                    </div>

                    <Textarea
                        value={jsonText}
                        onChange={(e) => { setJsonText(e.target.value); setParseError(null); }}
                        placeholder={sampleJson}
                        className="font-mono text-xs min-h-[220px] bg-background resize-y"
                    />

                    {parseError && (
                        <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 p-2.5 rounded-md">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{parseError}</span>
                        </div>
                    )}

                    <DialogFooter className="gap-2 pt-2 border-t">
                        <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={importing}>
                            Cancel
                        </Button>
                        <Button type="button" size="sm" onClick={handleImport} disabled={importing} className="bg-primary font-semibold">
                            {importing ? <Spinner className="w-4 h-4 mr-1.5" /> : null}
                            Import Cases
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}
