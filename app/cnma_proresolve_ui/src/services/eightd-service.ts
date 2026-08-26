import { BaseODataService } from './core/base-service';
import { ODataQueryBuilder } from './core/odata-helper';
import axiosInstance from './core/axios-instance';

/**
 * Truy cập EightDService.
 *
 * ── Vòng đời một report ──
 * `analyzeFromJson` trả về NGAY với ID của một report ở trạng thái `Analyzing`;
 * pipeline AI chạy ở nền trên server và mất 60-90 giây. Client phải theo dõi
 * qua trường `status`, không có cách nào chờ đồng bộ.
 *
 * Sở dĩ vậy vì driver SQLite của CAP chỉ có một connection: bọc lời gọi AI
 * trong một transaction đang mở sẽ khoá toàn bộ DB suốt thời gian đó, kể cả
 * chính request đi hỏi tiến độ.
 */

export type ReportStatus = 'Draft' | 'Analyzing' | 'Analyzed' | 'Failed' | 'Closed';

export interface Discipline8D {
    ID: string;
    code: string;
    sequence: number;
    title: string;
    summary: string;
    content: string;
    /** Chuỗi JSON — dùng `parseList()` để đọc. */
    actionItems: string | null;
    /** Chuỗi JSON các đường dẫn về CaseContext. */
    sources: string | null;
    confidence: number;
    /** false = không có dữ liệu nguồn, AI suy luận ra. D6 luôn false. */
    dataBacked: boolean;
    resultJson: string | null;
    formSchemaJson: string | null;
    validationJson: string | null;
    configVersion: string | null;
    aiGenerated: boolean;

    /** 'Draft' | 'Approved' | 'ChangeRequested'. Null ở report phân tích trước khi có cột này. */
    reviewStatus: ReviewStatus | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
    /** Lý do trả lại. Chỉ có nghĩa khi reviewStatus = 'ChangeRequested'. */
    reviewNote: string | null;
}

export const REVIEW_STATUSES = ['Draft', 'Approved', 'ChangeRequested'] as const;
export type ReviewStatus = typeof REVIEW_STATUSES[number];

export type ReviewDecision = 'approve' | 'request-change' | 'reopen';

/** Cổng đóng case — server tính, client chỉ hiển thị. */
export interface ClosureGate {
    canClose: boolean;
    approved: number;
    required: number;
    blocking: string[];
    reason: string;
}

export interface ReviewEvent {
    ID: string;
    reportID: string;
    disciplineCode: string;
    fromStatus: string;
    toStatus: string;
    note: string | null;
    actor: string;
    at: string;
}

export interface ReviewResult {
    disciplineID: string;
    code: string;
    fromStatus: ReviewStatus;
    toStatus: ReviewStatus;
    reviewedBy: string;
    reviewedAt: string;
    gate: ClosureGate;
}

/**
 * Trạng thái duyệt đã chuẩn hoá.
 *
 * Report phân tích TRƯỚC khi có cột duyệt đọc lên là null. Mặc định sai chiều ở
 * đây sẽ hiện toàn bộ dữ liệu cũ là "đã duyệt" và mở cổng đóng case cho chúng.
 */
export function reviewStatusOf(discipline: Pick<Discipline8D, 'reviewStatus'>): ReviewStatus {
    const value = discipline.reviewStatus;
    return value && (REVIEW_STATUSES as readonly string[]).includes(value) ? value : 'Draft';
}

/** Một bước trong chuỗi 5-Why do AI tự dựng khi chưa thấy đáp án. */
export interface DerivedWhyStep {
    stepNo: number;
    question: string;
    answer: string;
    evidence: string;
}

export interface IndependentFinding {
    rootCauseCategory: string;
    rootCauseStatement: string;
    derivedFiveWhy: DerivedWhyStep[];
    ruledOut: Array<{ category: string; reason: string }>;
    runnerUpCategory: string | null;
    runnerUpReason: string | null;
    confidence: number;
    evidenceGaps: string[];
}

export interface IndependentAnalysis {
    finding: IndependentFinding;
    verdict: {
        recordedCategory: string | null;
        aiCategory: string;
        agrees: boolean;
        aiStepCount: number;
        recordedStepCount: number;
    };
    /** Chỗ rò đáp án phát hiện lúc kiểm tra. Rỗng là sạch. */
    leaks: string[];
}

/** Một tiêu chí đã chấm, kèm lý do ăn hay không ăn điểm. */
export interface PrecedentBreakdown {
    criterionKey: string;
    label: string;
    level: 'exact' | 'fallback' | 'none';
    matchedOn: string | null;
    points: number;
    maxPoints: number;
}

export interface PrecedentTeamMember {
    partnerId: string;
    partnerName: string;
    functionTitle: string;
    partnerRole: string;
}

export interface PrecedentAction {
    lineNo: number;
    actionType: string;
    actionText: string;
    status: string;
}

export interface Precedent {
    notificationId: string;
    score: number;
    maxScore: number;
    breakdown: PrecedentBreakdown[];
    explanation: string;
    symptomShortText: string | null;
    sapStatus: string | null;
    completionDate: string | null;
    quantityExtent: string | null;
    workCenterId: string | null;
    workCenterDesc: string | null;
    defectCode: string | null;
    defectText: string | null;
    materialId: string | null;
    materialDesc: string | null;
    rootCauseCategory: string | null;
    copqEur: number | null;
    fmeaId: string | null;
    team: PrecedentTeamMember[];
    actions: PrecedentAction[];
}

export interface PrecedentResult {
    precedents: Precedent[];
    /** Vì sao rỗng. Null khi có tiền lệ. */
    reason: string | null;
    maxScore: number;
    settings: { minScore: number; topN: number; closedOnly: boolean };
    libraryCount: number;
    candidatesScored: number;
    semanticUsed: boolean;
}

export interface Report8D {
    ID: string;
    notificationId: string;
    origin: string;
    symptomShortText: string;
    sapStatus: string;
    foundDate: string | null;
    completionDate: string | null;
    quantityExtent: string;
    teamSize: number | null;

    materialId: string;
    materialDesc: string;
    batchId: string;
    defectCode: string;
    defectText: string;
    workCenterId: string;
    workCenterDesc: string;

    copqEur: number | null;
    rootCauseCategory: string | null;
    fmeaId: string | null;

    internalSummary: string | null;
    customerSummary: string | null;

    // ── Chẩn đoán độc lập ──
    /** JSON `IndependentAnalysis` — dùng `parseFinding()` để đọc. */
    aiFinding: string | null;
    aiRootCause: string | null;
    /** true = AI kết luận trùng kỹ sư mà không hề thấy đáp án. */
    aiAgreesWithRecord: boolean | null;
    aiConfidence: number | null;

    status: ReportStatus;
    sourcePayload?: string;
    caseContext?: string;
    aiModelParse: string | null;
    aiModelAnalyze: string | null;
    analyzedAt: string | null;
    tokensUsed: number | null;
    durationMs: number | null;
    errorMessage: string | null;

    createdAt?: string;
    disciplines?: Discipline8D[];
}

/** Cột đủ cho trang danh sách — đừng kéo về `sourcePayload` 50 KB mỗi dòng. */
const LIST_COLUMNS = [
    'ID', 'notificationId', 'origin', 'symptomShortText', 'materialId', 'materialDesc',
    'workCenterId', 'rootCauseCategory', 'copqEur', 'status', 'analyzedAt', 'createdAt',
    'tokensUsed', 'durationMs', 'errorMessage',
    'aiModelParse', 'aiModelAnalyze',
    // Cột chẩn đoán độc lập — nhẹ, và là thứ đáng nhìn nhất ở trang danh sách.
    'aiRootCause', 'aiAgreesWithRecord', 'aiConfidence',
];

class EightDService extends BaseODataService<Report8D> {
    constructor() {
        super('api/cnma/EIGHTD_SRV', 'Reports');
    }

    /**
     * Khoá là Edm.Guid, viết TRẦN chứ không bọc nháy.
     *
     * `formatKey` mặc định của lớp cha bọc chuỗi trong dấu nháy đơn — đúng với
     * khoá kiểu String, nhưng OData v4 quy định Guid literal không có nháy, nên
     * `Reports('3f2a…')` sẽ trả 400.
     */
    protected formatKey(id: string | number): string {
        return String(id);
    }

    /**
     * Danh sách, mới nhất trước.
     *
     * Kèm `code` + `reviewStatus` của tám discipline để bảng vẽ được cột tiến độ
     * "x/8 đã duyệt". Chỉ hai cột đó, KHÔNG kéo `content`/`resultJson` — chúng là
     * LargeString và sẽ biến một truy vấn danh sách thành vài megabyte.
     */
    async list() {
        return this.getList(
            new ODataQueryBuilder()
                .select(LIST_COLUMNS)
                .expand('disciplines($select=code,reviewStatus)')
                .orderBy('createdAt', 'desc')
                .count(),
        );
    }

    /**
     * Một report kèm đủ 8 discipline.
     *
     * `$orderby=sequence` là BẮT BUỘC — OData không đảm bảo thứ tự nếu không nói
     * rõ, và một báo cáo 8D hiện lộn xộn D5 trước D2 thì vô nghĩa.
     */
    async getWithDisciplines(id: string) {
        return this.getById(
            id,
            new ODataQueryBuilder().expand('disciplines($orderby=sequence)'),
        );
    }

    /** Chỉ trạng thái — dùng cho vòng poll, tránh kéo cả báo cáo về mỗi 3 giây. */
    async getStatus(id: string) {
        return this.getById(
            id,
            new ODataQueryBuilder().select(['ID', 'status', 'errorMessage']),
        ) as Promise<Pick<Report8D, 'ID' | 'status' | 'errorMessage'>>;
    }

    /**
     * Xếp lịch phân tích một Golden Dataset.
     * @returns ID của report vừa tạo, đang ở trạng thái `Analyzing`
     */
    async analyzeFromJson(payload: string, title = ''): Promise<string> {
        const res = await axiosInstance.post<{ value: string }>(
            `${this.serviceName}/analyzeFromJson`,
            { payload, title },
        );
        return res.data.value;
    }

    /** Chạy lại trên payload đã lưu. Ghi đè toàn bộ disciplines cũ. */
    async reanalyze(reportID: string): Promise<string> {
        const res = await axiosInstance.post<{ value: string }>(
            `${this.serviceName}/reanalyze`,
            { reportID },
        );
        return res.data.value;
    }

    /**
     * Case tiền lệ của một report, kèm điểm và diễn giải từng tiêu chí.
     *
     * Gọi được ngay khi report vừa tạo — nó chỉ cần `caseContext`, không chờ AI.
     * Nhờ vậy panel tiền lệ hiện trong khoảng 2 giây trong khi báo cáo còn đang
     * chạy 100 giây ở nền.
     */
    async findPrecedents(reportID: string): Promise<PrecedentResult> {
        const res = await axiosInstance.get<{ value: string }>(
            `${this.serviceName}/findPrecedents(reportID='${encodeURIComponent(reportID)}')`,
        );
        return JSON.parse(res.data.value) as PrecedentResult;
    }
}

export const eightDService = new EightDService();

// ─────────────────────────────────────────────────────────────────────────────
// Trợ giúp hiển thị
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Đọc cột chuỗi JSON thành mảng.
 *
 * `actionItems` và `sources` lưu dạng chuỗi JSON vì CDS không có kiểu mảng.
 * Bản ghi cũ hoặc hỏng thì trả mảng rỗng — một trang chi tiết trắng vì
 * `JSON.parse` ném lỗi thì tệ hơn nhiều so với việc thiếu vài dòng.
 */
export function parseList(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

/**
 * Đọc `aiFinding` thành object.
 *
 * Trả `null` khi chưa có hoặc hỏng — panel sẽ ẩn đi. Report chạy trước khi có
 * bước chẩn đoán mù sẽ rơi vào trường hợp này, và đó là hành vi đúng.
 */
export function parseFinding(raw: string | null | undefined): IndependentAnalysis | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed?.finding && parsed?.verdict ? (parsed as IndependentAnalysis) : null;
    } catch {
        return null;
    }
}

export function isCustomerComplaint(origin: string | null | undefined): boolean {
    return String(origin ?? '').startsWith('Q1');
}

/** 'Q1 - Customer Complaint' → 'Q1'. Cột danh sách hẹp, tên đầy đủ không vừa. */
export function originShort(origin: string | null | undefined): string {
    return String(origin ?? '').split(' ')[0] || '—';
}

/**
 * Mot Business Partner chon duoc cho nhom 8D.
 *
 * `email`/`phone` co trong schema (`HistoricalTeamMembers`) va co chu dich -
 * comment trong `case-library.cds` ghi ro "Auto-fill khi nguoi dung chon
 * partner. Rule-based, khong phai AI sinh". Nhung `librarySeeder` dang seed
 * `null` cho ca hai vi mock data khong he co chung, nen kieu du lieu phai cho
 * phep `null` thay vi hua mot thu chua ton tai.
 */
export interface PartnerDirectoryEntry {
    partnerId: string;
    partnerName: string;
    functionTitle: string;
    email: string | null;
    phone: string | null;
}

/**
 * Danh ba Business Partner, gom tu kho case lich su.
 *
 * -- Vi sao gom o client chu khong phai mot endpoint rieng --
 * `HistoricalTeamMembers` la mot dong MOI LAN mot nguoi tham gia MOT case, nen
 * mot nguoi lam 5 case se co 5 dong. Danh ba can moi nguoi mot dong. Gom o day
 * tranh phai them mot function moi vao `EightDService.cds` chi de lam mot phep
 * distinct - kho nay chi vai chuc dong, khong dang mot vong deploy.
 *
 * Giu lai ban ghi co `email`/`phone` khi trung `partnerId`: cac dong cua cung
 * mot nguoi khong nhat thiet day du nhu nhau.
 */
export async function getPartnerDirectory(): Promise<PartnerDirectoryEntry[]> {
    const response = await axiosInstance.get(
        'api/cnma/EIGHTD_SRV/HistoricalTeamMembers'
        + '?$select=partnerId,partnerName,functionTitle,email,phone&$top=5000',
    );
    const rows = (response.data?.value ?? response.data ?? []) as Array<Record<string, unknown>>;
    const merged = new Map<string, PartnerDirectoryEntry>();
    for (const row of Array.isArray(rows) ? rows : []) {
        const partnerId = String(row.partnerId ?? '').trim();
        if (!partnerId) continue;
        const entry: PartnerDirectoryEntry = {
            partnerId,
            partnerName: String(row.partnerName ?? '').trim() || partnerId,
            functionTitle: String(row.functionTitle ?? '').trim(),
            email: (row.email as string | null) || null,
            phone: (row.phone as string | null) || null,
        };
        const existing = merged.get(partnerId);
        merged.set(partnerId, existing
            ? {
                ...existing,
                functionTitle: existing.functionTitle || entry.functionTitle,
                email: existing.email ?? entry.email,
                phone: existing.phone ?? entry.phone,
            }
            : entry);
    }
    return [...merged.values()].sort((a, b) => a.partnerName.localeCompare(b.partnerName));
}

/** Mot dong nhom 8D nguoi dung da chot cho D1. */
export interface AssignedTeamRow {
    partnerId: string;
    partnerName: string;
    functionTitle: string;
    partnerRole: string;
}

/**
 * Luu nhom 8D da chot cua D1 xuong DB.
 *
 * Chi ghi khoa `team.assignedRoster` trong `resultJson` cua discipline - phan
 * `team.roster` do AI de xuat khong bi dung toi, nen van doi chieu duoc "AI de
 * xuat ai" voi "nguoi dung chot ai". Server validate lai toan bo (vai tro hop le,
 * khong trung partner, toi da mot truong nhom), nen loi tra ve tu day la loi that
 * chu khong phai canh bao co the bo qua.
 */
export async function saveTeamRoster(
    disciplineID: string,
    roster: AssignedTeamRow[],
): Promise<number> {
    const response = await axiosInstance.post('api/cnma/EIGHTD_SRV/saveTeamRoster', {
        disciplineID,
        roster: JSON.stringify(roster),
    });
    const raw = response.data?.value ?? response.data;
    try {
        return (typeof raw === 'string' ? JSON.parse(raw) : raw)?.saved ?? roster.length;
    } catch {
        return roster.length;
    }
}

/**
 * Ghi mot o do nguoi dung nhap tren mot buoc D.
 *
 * Server chi chap nhan nhung khoa nam trong danh sach cho phep cua buoc do, va
 * moi khoa deu tach khoi ban AI viet - nen mot lan luu khong the lam mat ket
 * luan cua may. Loi tra ve tu day la loi that, khong phai canh bao bo qua duoc.
 *
 * Gui `null` de XOA phan sua va quay ve ban AI.
 */
export async function saveDisciplineField(
    disciplineID: string,
    fieldKey: string,
    value: unknown,
): Promise<void> {
    await axiosInstance.post('api/cnma/EIGHTD_SRV/saveDisciplineField', {
        disciplineID,
        fieldKey,
        valueJson: JSON.stringify(value ?? null),
    });
}

/**
 * Ghi quyet dinh duyet cua ky su cho MOT buoc D.
 *
 * Server la noi quyet dinh: no lay danh tinh nguoi bam tu ngu canh xac thuc chu
 * khong tu payload, bat buoc phai co `note` khi tra lai, va tra ve luon trang
 * thai cong dong case sau thao tac - nen client khong phai tu tinh lai.
 */
export async function reviewDiscipline(
    disciplineID: string,
    decision: ReviewDecision,
    note?: string | null,
): Promise<ReviewResult> {
    const response = await axiosInstance.post('api/cnma/EIGHTD_SRV/reviewDiscipline', {
        disciplineID,
        decision,
        note: note ?? '',
    });
    const raw = response.data?.value ?? response.data;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/** Vet duyet + cong dong case cua mot report. Moi nhat truoc. */
export async function getReviewTrail(
    reportID: string,
): Promise<{ gate: ClosureGate; trail: ReviewEvent[] }> {
    const response = await axiosInstance.get(
        `api/cnma/EIGHTD_SRV/getReviewTrail(reportID='${encodeURIComponent(reportID)}')`,
    );
    const raw = response.data?.value ?? response.data;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
}
