import { BaseODataService } from './core/base-service';
import { ODataQueryBuilder } from './core/odata-helper';
import axiosInstance from './core/axios-instance';

/**
 * Truy cập worklist sự vụ mới đến trên EightDService.
 *
 * ── Nghiệp vụ ──
 * Kỹ sư ghi nhận defect bên SAP (Record Defects cho Q3, Create Quality
 * Notification cho Q1) → `syncWorklist` kéo sự vụ về worklist → từ một dòng
 * worklist, `createEightD` mở case 8D và chạy pipeline AI ở nền.
 *
 * POC chưa nối SAP thật: sync đọc từ `mock-data/incoming/` phía server.
 */

export type WorklistStatus = 'New' | 'EightDCreated';

export interface WorklistItem {
    ID: string;
    notificationId: string;
    origin: string;
    symptomShortText: string;
    sapStatus: string | null;
    foundDate: string | null;
    quantityExtent: string | null;

    materialId: string | null;
    materialDesc: string | null;
    batchId: string | null;
    defectCode: string | null;
    defectText: string | null;
    workCenterId: string | null;
    workCenterDesc: string | null;

    /** 'Record Defects' (Q3) | 'Create Quality Notification' (Q1). */
    sourceSystem: string | null;
    status: WorklistStatus;
    syncedAt: string | null;
    /** ID report 8D đã mở từ dòng này. Null khi status = 'New'. */
    report_ID: string | null;

    createdAt?: string;
}

export interface WorklistSyncReport {
    synced: number;
    skipped: number;
    failed: number;
    messages: string[];
}

/** Cột đủ cho trang danh sách — đừng kéo `sourcePayload` về theo từng dòng. */
const LIST_COLUMNS = [
    'ID', 'notificationId', 'origin', 'symptomShortText', 'sapStatus', 'foundDate',
    'quantityExtent', 'materialId', 'materialDesc', 'defectCode', 'defectText',
    'workCenterId', 'workCenterDesc', 'sourceSystem', 'status', 'syncedAt', 'report_ID',
];

class WorklistService extends BaseODataService<WorklistItem> {
    constructor() {
        super('api/cnma/EIGHTD_SRV', 'Worklist');
    }

    /** Khoá là Edm.Guid — viết trần, không bọc nháy (xem eightd-service). */
    protected formatKey(id: string | number): string {
        return String(id);
    }

    /** Danh sách, sự vụ mới đồng bộ trước. */
    async list() {
        return this.getList(
            new ODataQueryBuilder()
                .select(LIST_COLUMNS)
                .orderBy('syncedAt', 'desc')
                .count(),
        );
    }

    /**
     * Đồng bộ sự vụ mới từ SAP (mô phỏng). Idempotent — bấm lại không nạp trùng.
     */
    async sync(): Promise<WorklistSyncReport> {
        const res = await axiosInstance.post<{ value: string }>(
            `${this.serviceName}/syncWorklist`,
            { payload: '' },
        );
        return JSON.parse(res.data.value) as WorklistSyncReport;
    }

    /**
     * Mở 8D từ một dòng worklist.
     * @returns ID report vừa tạo, đang ở trạng thái `Analyzing`
     */
    async createEightD(itemID: string): Promise<string> {
        const res = await axiosInstance.post<{ value: string }>(
            `${this.serviceName}/createEightDFromWorklist`,
            { itemID },
        );
        return res.data.value;
    }
}

export const worklistService = new WorklistService();
