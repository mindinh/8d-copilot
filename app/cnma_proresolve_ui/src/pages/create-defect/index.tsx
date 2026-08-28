import { useState, useMemo, useRef, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fillPlaceholderOnTab } from '@/hooks/use-placeholder-autofill';
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Spinner,
    Textarea,
} from '@cnma/react-ui';
import {
    AlertCircle,
    Box,
    Check,
    Code2,
    Copy,
    Factory,
    FileJson,
    FileText,
    FileUp,
    FolderOpen,
    Plus,
    RefreshCw,
    ShieldAlert,
    Sparkles,
    Trash2,
    Upload,
    UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { eightDService } from '@/services/eightd-service';

function generateRandomId(): string {
    const randomNum = Math.floor(10000000 + Math.random() * 90000000);
    return `8D-${randomNum}`;
}

export interface CreateDefectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated?: (reportID: string) => void;
}

export function CreateDefectDialog({ open, onOpenChange, onCreated }: CreateDefectDialogProps) {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showJsonPreview, setShowJsonPreview] = useState(false);
    const [showJsonImport, setShowJsonImport] = useState(false);
    const [importJsonText, setImportJsonText] = useState('');
    const [importError, setImportError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // Form state
    const [notificationId, setNotificationId] = useState(() => generateRandomId());
    const [origin, setOrigin] = useState('Q3 - Internal Defect');
    const [symptomShortText, setSymptomShortText] = useState('');
    const [status] = useState('In Process');
    const [foundDate, setFoundDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [quantityExtent, setQuantityExtent] = useState('');

    const [materialId, setMaterialId] = useState('');
    const [materialDesc, setMaterialDesc] = useState('');
    const [materialGroup, setMaterialGroup] = useState('');
    const [batchId, setBatchId] = useState('');

    const [workCenterId, setWorkCenterId] = useState('');
    const [workCenterDesc, setWorkCenterDesc] = useState('');

    const [defectCode, setDefectCode] = useState('');
    const [defectText, setDefectText] = useState('');

    const [inspections, setInspections] = useState([
        { characteristic: '', measuredValue: '', specValue: '' },
    ]);

    const [complaintReference, setComplaintReference] = useState('');
    const [customerPlantContact, setCustomerPlantContact] = useState('');
    const [slaResponseDue, setSlaResponseDue] = useState('');

    // Inspection row controls
    const addInspection = () => {
        setInspections([
            ...inspections,
            { characteristic: '', measuredValue: '', specValue: '' },
        ]);
    };

    const updateInspection = (
        index: number,
        field: 'characteristic' | 'measuredValue' | 'specValue',
        value: string,
    ) => {
        const updated = [...inspections];
        updated[index][field] = value;
        setInspections(updated);
    };

    const removeInspection = (index: number) => {
        if (inspections.length <= 1) return;
        setInspections(inspections.filter((_, i) => i !== index));
    };

    const applyJsonPayload = (rawJson: string, sourceName?: string) => {
        setImportError(null);
        if (!rawJson.trim()) {
            setImportError('Please provide a valid JSON payload.');
            return false;
        }

        try {
            const parsed = JSON.parse(rawJson);
            const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
            const note = Array.isArray(data.notifications) ? data.notifications[0] : (data.notification || data);
            const mat = Array.isArray(data.materials) ? data.materials[0] : (data.material || {});
            const batch = Array.isArray(data.batches) ? data.batches[0] : (data.batch || {});
            const defect = Array.isArray(data.defect_catalog) ? data.defect_catalog[0] : (data.defect || {});
            const workCenter = Array.isArray(data.work_centers) ? data.work_centers[0] : (data.workCenter || {});
            const custRef = Array.isArray(data.customer_reference) ? data.customer_reference[0] : (data.customerReference || data.customer || {});
            const rawInspections = Array.isArray(data.inspections) ? data.inspections : (Array.isArray(parsed.inspections) ? parsed.inspections : []);

            // Populate fields
            const nextNotifId = note.notification_id || note.notificationId || parsed.notificationId;
            if (nextNotifId) setNotificationId(String(nextNotifId).trim());

            const nextOrigin = note.origin || parsed.origin;
            if (nextOrigin) {
                const oStr = String(nextOrigin).trim();
                if (oStr.toLowerCase().includes('customer') || oStr.startsWith('Q1')) {
                    setOrigin('Q1 - Customer Complaint');
                } else if (oStr.toLowerCase().includes('supplier') || oStr.startsWith('Q2')) {
                    setOrigin('Q2 - Supplier Defect');
                } else {
                    setOrigin('Q3 - Internal Defect');
                }
            }

            const nextSymptom = note.symptom_short_text || note.symptomShortText || parsed.symptomShortText || defect.defect_text || defect.defectText;
            if (nextSymptom) setSymptomShortText(String(nextSymptom).trim());

            const nextFoundDate = note.found_date || note.foundDate || parsed.foundDate;
            if (nextFoundDate) {
                const d = String(nextFoundDate).trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(d)) setFoundDate(d);
            }

            const nextQuantity = note.quantity_extent || note.quantityExtent || parsed.quantityExtent;
            if (nextQuantity) setQuantityExtent(String(nextQuantity).trim());

            // Material
            const nextMatId = mat.material_id || mat.materialId || note.material_id || note.materialId || parsed.materialId;
            if (nextMatId) setMaterialId(String(nextMatId).trim());

            const nextMatDesc = mat.description || mat.materialDesc || parsed.materialDesc;
            if (nextMatDesc) setMaterialDesc(String(nextMatDesc).trim());

            const nextMatGroup = mat.material_group || mat.materialGroup || note.material_group || parsed.materialGroup;
            if (nextMatGroup) setMaterialGroup(String(nextMatGroup).trim());

            // Batch
            const nextBatchId = batch.batch_id || batch.batchId || note.batch_id || parsed.batchId;
            if (nextBatchId) setBatchId(String(nextBatchId).trim());

            // Work Center
            const nextWcId = workCenter.work_center_id || workCenter.workCenterId || note.work_center_id || parsed.workCenterId;
            if (nextWcId) setWorkCenterId(String(nextWcId).trim());

            const nextWcDesc = workCenter.description || workCenter.workCenterDesc || parsed.workCenterDesc;
            if (nextWcDesc) setWorkCenterDesc(String(nextWcDesc).trim());

            // Defect
            const nextDefectCode = defect.defect_code || defect.defectCode || note.defect_code || parsed.defectCode;
            if (nextDefectCode) setDefectCode(String(nextDefectCode).trim());

            const nextDefectText = defect.defect_text || defect.defectText || parsed.defectText;
            if (nextDefectText) setDefectText(String(nextDefectText).trim());

            // Inspections
            if (rawInspections.length > 0) {
                const mappedInspections = rawInspections.map((ins: any) => ({
                    characteristic: String(ins.characteristic ?? '').trim(),
                    measuredValue: String(ins.measured_value ?? ins.measuredValue ?? '').trim(),
                    specValue: String(ins.spec_value ?? ins.specValue ?? '').trim(),
                })).filter((i: any) => i.characteristic || i.measuredValue || i.specValue);

                if (mappedInspections.length > 0) {
                    setInspections(mappedInspections);
                }
            }

            // Customer Reference
            const nextCompRef = custRef.complaint_reference || custRef.complaintReference;
            if (nextCompRef && !String(nextCompRef).startsWith('N/A')) {
                setComplaintReference(String(nextCompRef).trim());
            }

            const nextContact = custRef.customer_plant_contact || custRef.customerPlantContact;
            if (nextContact && !String(nextContact).startsWith('N/A')) {
                setCustomerPlantContact(String(nextContact).trim());
            }

            const nextSla = custRef.sla_response_due || custRef.slaResponseDue;
            if (nextSla && !String(nextSla).startsWith('N/A')) {
                setSlaResponseDue(String(nextSla).trim());
            }

            setShowJsonImport(false);
            setImportJsonText('');
            toast.success(
                sourceName
                    ? `Loaded JSON file: ${sourceName}`
                    : 'JSON payload parsed & applied to form!',
                { description: 'All matching fields have been populated.' },
            );
            return true;
        } catch (err: any) {
            const errorMsg = `Invalid JSON syntax: ${err.message}`;
            setImportError(errorMsg);
            toast.error(errorMsg);
            return false;
        }
    };

    const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            applyJsonPayload(text, file.name);
        } catch (err: any) {
            toast.error(`Could not read file: ${err.message}`);
        } finally {
            // Reset input value so selecting the same file again triggers change
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    // Dynamic JSON payload construction
    const builtPayloadObject = useMemo(() => {
        const isQ1 = origin.startsWith('Q1');
        return {
            notificationId: notificationId.trim() || '8D-DEMO-001',
            origin,
            symptomShortText: symptomShortText.trim(),
            status,
            foundDate: foundDate || null,
            completionDate: null,
            quantityExtent: quantityExtent.trim() || null,
            teamSize: null,
            material: {
                materialId: materialId.trim() || null,
                description: materialDesc.trim() || null,
                materialGroup: materialGroup.trim() || null,
            },
            batch: {
                batchId: batchId.trim() || null,
                materialId: materialId.trim() || null,
            },
            defect: {
                defectCode: defectCode.trim() || null,
                defectText: defectText.trim() || null,
            },
            workCenter: {
                workCenterId: workCenterId.trim() || null,
                description: workCenterDesc.trim() || null,
            },
            inspections: inspections
                .filter((i) => i.characteristic.trim())
                .map((i) => ({
                    characteristic: i.characteristic.trim(),
                    measuredValue: i.measuredValue.trim(),
                    specValue: i.specValue.trim(),
                })),
            causesIshikawa: [],
            fiveWhyChain: [],
            actions: [],
            teamAssignments: [],
            isIsNot: null,
            fmeaLink: null,
            costCopq: null,
            lessonsLearned: null,
            customerReference: {
                complaintReference: isQ1
                    ? complaintReference.trim() || 'CC-2026-PENDING'
                    : 'N/A - internal defect, no customer reference',
                customerPlantContact: isQ1 ? customerPlantContact.trim() || 'Customer Quality' : 'N/A',
                slaResponseDue: isQ1 ? slaResponseDue.trim() || 'N/A' : 'N/A',
            },
        };
    }, [
        notificationId,
        origin,
        symptomShortText,
        status,
        foundDate,
        quantityExtent,
        materialId,
        materialDesc,
        materialGroup,
        batchId,
        workCenterId,
        workCenterDesc,
        defectCode,
        defectText,
        inspections,
        complaintReference,
        customerPlantContact,
        slaResponseDue,
    ]);

    const payloadJsonString = useMemo(
        () => JSON.stringify(builtPayloadObject, null, 2),
        [builtPayloadObject],
    );

    // Copy JSON to clipboard
    const copyJson = () => {
        navigator.clipboard.writeText(payloadJsonString);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success('JSON payload copied to clipboard');
    };

    // Form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!symptomShortText.trim()) {
            setError('Please enter a Symptom Description for the defect.');
            return;
        }

        setBusy(true);
        setError(null);

        try {
            const reportID = await eightDService.analyzeFromJson(
                payloadJsonString,
                `${notificationId} — ${symptomShortText.slice(0, 50)}`,
            );
            toast.success(`Defect record ${notificationId} created!`, {
                description: 'Starting AI 8D Copilot analysis workflow...',
            });
            onOpenChange(false);
            if (onCreated) {
                onCreated(reportID);
            } else {
                navigate(`/8d/${reportID}`);
            }
        } catch (err: any) {
            const msg =
                err?.response?.data?.error?.message ??
                err?.message ??
                'Failed to create defect and start analysis.';
            setError(msg);
            setBusy(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!busy) {
                    onOpenChange(v);
                }
            }}
        >
            <DialogContent className="w-[95vw] sm:max-w-5xl md:max-w-6xl lg:max-w-7xl max-h-[90vh] overflow-y-auto p-6">
                <DialogHeader className="pb-3 border-b border-border">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="bg-primary/10 text-primary text-xs font-mono px-2 py-0.5 rounded font-semibold border border-primary/20">
                                    SAP UI5 QM Simulation
                                </span>
                                <Badge variant="outline" className="text-xs">
                                    Fiori Record Defect
                                </Badge>
                            </div>
                            <DialogTitle className="text-lg font-bold text-foreground">
                                Record Quality Defect
                            </DialogTitle>
                            <DialogDescription className="text-xs text-muted-foreground">
                                Simulate creating a SAP QM Quality Notification, generating standard OData Deep Structure JSON, and initiating the AI 8D Copilot workflow.
                            </DialogDescription>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
                            <input
                                type="file"
                                ref={fileInputRef}
                                accept=".json,application/json"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => fileInputRef.current?.click()}
                                className="gap-1.5 text-xs bg-primary/10 hover:bg-primary/20 border-primary text-primary font-semibold shadow-2xs"
                            >
                                <Upload className="w-3.5 h-3.5 text-primary" />
                                Choose .JSON File
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setShowJsonImport(!showJsonImport);
                                    if (showJsonPreview) setShowJsonPreview(false);
                                }}
                                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                            >
                                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                                {showJsonImport ? 'Hide Paste Box' : 'Paste JSON'}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setShowJsonPreview(!showJsonPreview);
                                    if (showJsonImport) setShowJsonImport(false);
                                }}
                                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                            >
                                <Code2 className="w-3.5 h-3.5 text-muted-foreground" />
                                {showJsonPreview ? 'Hide Live Payload' : 'Inspect Payload'}
                            </Button>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-6 pt-2">
            {/* Collapsible JSON Import Card */}
            {showJsonImport && (
                <Card className="border-primary/40 bg-card shadow-md">
                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b border-border/60 bg-muted/30">
                        <div className="flex items-center gap-2">
                            <FileJson className="w-4 h-4 text-primary" />
                            <span className="text-xs font-semibold text-foreground">
                                Paste JSON Payload (SAP QM Deep Structure or OData Object)
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => fileInputRef.current?.click()}
                                className="h-7 text-xs gap-1 text-primary border-primary/30"
                            >
                                <Upload className="w-3 h-3" />
                                Browse File
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setImportJsonText('');
                                    setImportError(null);
                                }}
                                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                            >
                                Clear
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-3">
                        <Textarea
                            className="font-mono text-xs min-h-36 bg-background border-border/70 leading-relaxed"
                            placeholder='{\n  "notificationId": "8D-10049001",\n  "symptomShortText": "Operator stopped the line - rough edge felt on flange after milling",\n  "material": { "materialId": "MAT-10247", "description": "Bracket Housing X240" },\n  "workCenter": { "workCenterId": "WC-MILL-07", "description": "CNC Milling Line 7" },\n  "defect": { "defectCode": "DEF-0489", "defectText": "Flange edge burr above limit" },\n  "inspections": [{ "characteristic": "Burr height at flange edge", "measuredValue": "0.26mm", "specValue": "max 0.10mm" }]\n}'
                            value={importJsonText}
                            onChange={(e) => setImportJsonText(e.target.value)}
                        />
                        {importError && (
                            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-2">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>{importError}</span>
                            </div>
                        )}
                        <div className="flex items-center justify-end gap-2 pt-1">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setShowJsonImport(false);
                                    setImportError(null);
                                }}
                                className="h-7 text-xs"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => applyJsonPayload(importJsonText)}
                                className="h-7 text-xs font-semibold gap-1.5 px-3"
                                disabled={!importJsonText.trim()}
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                Apply to Form
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Collapsible Live JSON Payload Inspector */}
            {showJsonPreview && (
                <Card className="border-primary/30 bg-slate-950 text-slate-100 dark">
                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b border-slate-800">
                        <div className="flex items-center gap-2">
                            <Code2 className="w-4 h-4 text-cyan-400" />
                            <span className="text-xs font-mono font-semibold text-cyan-400">
                                Generated SAP QM OData Payload (JSON)
                            </span>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={copyJson}
                            className="h-7 text-xs text-slate-300 hover:text-white hover:bg-slate-800 gap-1"
                        >
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied ? 'Copied!' : 'Copy Payload'}
                        </Button>
                    </CardHeader>
                    <CardContent className="p-4">
                        <pre className="text-[11px] font-mono leading-relaxed overflow-x-auto text-cyan-200 max-h-72 p-2 rounded bg-slate-900 border border-slate-800">
                            {payloadJsonString}
                        </pre>
                    </CardContent>
                </Card>
            )}

            {/* Error Display Banner */}
            {error && (
                <div className="flex items-start gap-2.5 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1 font-medium">{error}</div>
                </div>
            )}

            {/* SAP QM Defect Form */}
            {/* onKeyDown gắn ở đây, không gắn lên từng ô: keydown nổi bọt lên nên
                một handler phủ hết mọi ô bên trong, thêm ô mới không phải nối dây lại. */}
            <form onSubmit={handleSubmit} onKeyDown={fillPlaceholderOnTab} className="space-y-6">
                {/* 1. Header Information */}
                <Card className="shadow-sm">
                    <CardHeader className="bg-muted/30 pb-3 border-b border-border/60">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ShieldAlert className="w-4 h-4 text-primary" />
                                <CardTitle className="text-sm font-bold">1. Notification Header</CardTitle>
                            </div>
                            <Badge variant="outline" className="font-mono text-[11px]">
                                SAP QM Notification
                            </Badge>
                        </div>
                        <CardDescription className="text-xs">
                            Basic SAP defect header parameters including notification ID, origin type, and symptom summary.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Notification ID */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-semibold">Notification ID</Label>
                                <button
                                    type="button"
                                    onClick={() => setNotificationId(generateRandomId())}
                                    className="text-[11px] text-primary hover:underline flex items-center gap-1"
                                >
                                    <RefreshCw className="w-3 h-3" /> New ID
                                </button>
                            </div>
                            <Input
                                value={notificationId}
                                onChange={(e) => setNotificationId(e.target.value)}
                                className="font-mono text-xs"
                                placeholder="8D-10049001"
                                required
                            />
                        </div>

                        {/* Defect Origin */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Defect Origin / Type</Label>
                            <Select value={origin} onValueChange={setOrigin}>
                                <SelectTrigger className="text-xs">
                                    <SelectValue placeholder="Select origin" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Q3 - Internal Defect">Q3 - Internal Defect (Shop Floor)</SelectItem>
                                    <SelectItem value="Q1 - Customer Complaint">Q1 - Customer Complaint (Field Return)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Found Date */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Found Date</Label>
                            <Input
                                type="date"
                                value={foundDate}
                                onChange={(e) => setFoundDate(e.target.value)}
                                className="text-xs"
                            />
                        </div>

                        {/* Symptom Short Text */}
                        <div className="md:col-span-2 space-y-1.5">
                            <Label className="text-xs font-semibold">
                                Symptom Short Text / Primary Description <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                value={symptomShortText}
                                onChange={(e) => setSymptomShortText(e.target.value)}
                                placeholder="Operator stopped the line - rough edge felt on flange after milling"
                                className="text-xs"
                                required
                            />
                        </div>

                        {/* Quantity Extent */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Quantity / Extent on Hold</Label>
                            <Input
                                value={quantityExtent}
                                onChange={(e) => setQuantityExtent(e.target.value)}
                                placeholder="e.g. 61 units on hold"
                                className="text-xs"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Material & Production Context */}
                <Card className="shadow-sm">
                    <CardHeader className="bg-muted/30 pb-3 border-b border-border/60">
                        <div className="flex items-center gap-2">
                            <Box className="w-4 h-4 text-primary" />
                            <CardTitle className="text-sm font-bold">2. Material & Production Context</CardTitle>
                        </div>
                        <CardDescription className="text-xs">
                            Master data links connecting the defect to Material Master, Batch Management, and Work Center.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
                        {/* Material ID */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Material ID</Label>
                            <Input
                                value={materialId}
                                onChange={(e) => setMaterialId(e.target.value)}
                                placeholder="MAT-10247"
                                className="font-mono text-xs"
                            />
                        </div>

                        {/* Material Description */}
                        <div className="md:col-span-2 space-y-1.5">
                            <Label className="text-xs font-semibold">Material Description</Label>
                            <Input
                                value={materialDesc}
                                onChange={(e) => setMaterialDesc(e.target.value)}
                                placeholder="Bracket Housing X240"
                                className="text-xs"
                            />
                        </div>

                        {/* Material Group */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Material Group</Label>
                            <Input
                                value={materialGroup}
                                onChange={(e) => setMaterialGroup(e.target.value)}
                                placeholder="MG-HOUSING"
                                className="font-mono text-xs"
                            />
                        </div>

                        {/* Batch ID */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Batch ID</Label>
                            <Input
                                value={batchId}
                                onChange={(e) => setBatchId(e.target.value)}
                                placeholder="B-55901"
                                className="font-mono text-xs"
                            />
                        </div>

                        {/* Work Center ID */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Work Center ID</Label>
                            <Input
                                value={workCenterId}
                                onChange={(e) => setWorkCenterId(e.target.value)}
                                placeholder="WC-MILL-07"
                                className="font-mono text-xs"
                            />
                        </div>

                        {/* Work Center Description */}
                        <div className="md:col-span-2 space-y-1.5">
                            <Label className="text-xs font-semibold">Work Center Description</Label>
                            <Input
                                value={workCenterDesc}
                                onChange={(e) => setWorkCenterDesc(e.target.value)}
                                placeholder="CNC Milling Line 7"
                                className="text-xs"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* 3. Defect Classification & Quality Inspection Results */}
                <Card className="shadow-sm">
                    <CardHeader className="bg-muted/30 pb-3 border-b border-border/60">
                        <div className="flex items-center gap-2">
                            <Factory className="w-4 h-4 text-primary" />
                            <CardTitle className="text-sm font-bold">3. Defect Classification & Measurements</CardTitle>
                        </div>
                        <CardDescription className="text-xs">
                            Defect catalog codes and quantitative measurement values against tolerance limits.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="p-5 space-y-4">
                        {/* Defect Code & Text */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-border/40">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Defect Code</Label>
                                <Input
                                    value={defectCode}
                                    onChange={(e) => setDefectCode(e.target.value)}
                                    placeholder="DEF-0489"
                                    className="font-mono text-xs"
                                />
                            </div>
                            <div className="md:col-span-2 space-y-1.5">
                                <Label className="text-xs font-semibold">Defect Catalog Description</Label>
                                <Input
                                    value={defectText}
                                    onChange={(e) => setDefectText(e.target.value)}
                                    placeholder="Flange edge burr above limit"
                                    className="text-xs"
                                />
                            </div>
                        </div>

                        {/* Inspection Measurements Table */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-semibold flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5 text-primary" />
                                    Inspection Characteristics & Measured Values (D2 Evidence)
                                </Label>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={addInspection}
                                    className="h-7 text-xs gap-1"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Add Characteristic
                                </Button>
                            </div>

                            <div className="space-y-2">
                                {inspections.map((insp, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <Input
                                            value={insp.characteristic}
                                            onChange={(e) => updateInspection(idx, 'characteristic', e.target.value)}
                                            placeholder="Characteristic (e.g. Burr height at flange edge)"
                                            className="flex-[2] text-xs"
                                        />
                                        <Input
                                            value={insp.measuredValue}
                                            onChange={(e) => updateInspection(idx, 'measuredValue', e.target.value)}
                                            placeholder="Measured (0.26mm)"
                                            className="flex-1 font-mono text-xs"
                                        />
                                        <Input
                                            value={insp.specValue}
                                            onChange={(e) => updateInspection(idx, 'specValue', e.target.value)}
                                            placeholder="Spec (max 0.10mm)"
                                            className="flex-1 font-mono text-xs"
                                        />
                                        {inspections.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removeInspection(idx)}
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* 4. Customer Reference (Q1 Complaint fields) */}
                {origin.startsWith('Q1') && (
                    <Card className="shadow-sm border-destructive/30 bg-destructive/5">
                        <CardHeader className="bg-destructive/10 pb-3 border-b border-destructive/20">
                            <div className="flex items-center gap-2">
                                <UserCheck className="w-4 h-4 text-destructive" />
                                <CardTitle className="text-sm font-bold text-destructive">
                                    4. Customer Complaint Reference (Q1 Fields)
                                </CardTitle>
                            </div>
                            <CardDescription className="text-xs text-destructive/80">
                                Additional customer-facing complaint metadata required for Q1 external defects.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Complaint Reference #</Label>
                                <Input
                                    value={complaintReference}
                                    onChange={(e) => setComplaintReference(e.target.value)}
                                    placeholder="CC-2026-1188"
                                    className="font-mono text-xs bg-card"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Customer Contact / Plant</Label>
                                <Input
                                    value={customerPlantContact}
                                    onChange={(e) => setCustomerPlantContact(e.target.value)}
                                    placeholder="Vestbeck Motors - Plant 2"
                                    className="text-xs bg-card"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">SLA Response Due Date</Label>
                                <Input
                                    type="date"
                                    value={slaResponseDue.match(/^\d{4}-\d{2}-\d{2}$/) ? slaResponseDue : ''}
                                    onChange={(e) => setSlaResponseDue(e.target.value)}
                                    className="text-xs bg-card"
                                />
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Form Action Controls */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={busy || !symptomShortText.trim()}
                        className="gap-2 px-6 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md"
                    >
                        {busy ? <Spinner className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                        {busy ? 'Creating Defect & Scheduling Analysis…' : 'Create Defect & Start 8D Process'}
                    </Button>
                </div>
            </form>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export const CreateDefectPage = CreateDefectDialog;
export default CreateDefectDialog;
