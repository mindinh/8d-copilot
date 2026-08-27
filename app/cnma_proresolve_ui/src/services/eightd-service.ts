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
    /** 'Draft' | 'Complete' — do người đặt. AI không bao giờ ghi cột này. */
    stepStatus: StoredStepStatus | null;
    approvedBy: string | null;
    approvedAt: string | null;
}

/** Hai giá trị được LƯU. 'InReview' không nằm ở đây — nó được suy ra. */
export type StoredStepStatus = 'Draft' | 'Complete';

/**
 * Trạng thái HIỆN cho người dùng — ba giá trị, trong khi chỉ hai được lưu.
 * 'InReview' do server suy ra từ vết audit accepted/edited khi bước còn Draft.
 */
export type DerivedStepState = 'Draft' | 'InReview' | 'Complete';

export type SuggestionOutcome = 'shown' | 'accepted' | 'rejected' | 'edited';

/**
 * Quyết định mới nhất trên một đề xuất.
 *
 * Đây là thứ dựng nên bảng "đã chốt": nhận một gợi ý CHÍNH LÀ hành động giao
 * việc, nên không có bảng roster/task riêng — bảng đó là các dòng `accepted`
 * đọc lại từ vết kiểm toán.
 */
export interface StepDecision {
    suggestionKey: string;
    outcome: Exclude<SuggestionOutcome, 'shown'>;
    payload: unknown;
    decidedBy: string | null;
    decidedAt: string | null;
}

export interface StepActivity {
    code: string;
    disciplineID: string;
    stepStatus: StoredStepStatus;
    state: DerivedStepState;
    approvedBy: string | null;
    approvedAt: string | null;
    counts: Record<SuggestionOutcome, number>;
    decisions: StepDecision[];
}

export interface ClosureGate {
    passed: boolean;
    /** Các bước còn thiếu, theo thứ tự D1→D7. Rỗng khi `passed`. */
    incomplete: string[];
    message: string;
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

    /** Danh sách, mới nhất trước. */
    async list() {
        return this.getList(
            new ODataQueryBuilder()
                .select(LIST_COLUMNS)
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

    // ── Duyệt từng bước & đóng case ──────────────────────────────────────────

    /**
     * Trạng thái + số liệu audit của cả 8 bước trong MỘT lời gọi.
     *
     * Là OData `function`, nên GET với tham số trong ngoặc — không phải POST như
     * mấy action bên trên. Gọi nhầm cách thì server trả 405.
     */
    async getDisciplineActivity(reportID: string): Promise<StepActivity[]> {
        const res = await axiosInstance.get<{ value: string }>(
            `${this.serviceName}/getDisciplineActivity(reportID='${reportID}')`,
        );
        return JSON.parse(res.data.value) as StepActivity[];
    }

    /** Đặt trạng thái duyệt của một bước. Trả về dòng activity đã cập nhật. */
    async setDisciplineStatus(
        disciplineID: string,
        status: StoredStepStatus,
    ): Promise<StepActivity> {
        const res = await axiosInstance.post<{ value: string }>(
            `${this.serviceName}/setDisciplineStatus`,
            { disciplineID, status },
        );
        return JSON.parse(res.data.value) as StepActivity;
    }

    /** Ghi vết một đề xuất. Trả về activity của cả report sau khi ghi. */
    async recordSuggestionOutcome(input: {
        reportID: string;
        stepCode: string;
        suggestionKey: string;
        outcome: Exclude<SuggestionOutcome, 'shown'>;
        payload?: unknown;
    }): Promise<StepActivity[]> {
        const res = await axiosInstance.post<{ value: string }>(
            `${this.serviceName}/recordSuggestionOutcome`,
            {
                ...input,
                payload: input.payload === undefined ? null : JSON.stringify(input.payload),
            },
        );
        return JSON.parse(res.data.value) as StepActivity[];
    }

    /** Đóng case. Server tính lại cổng D1–D7 tại thời điểm bấm; chưa đủ thì 409. */
    async closeReport(reportID: string): Promise<ClosureGate> {
        const res = await axiosInstance.post<{ value: string }>(
            `${this.serviceName}/closeReport`,
            { reportID },
        );
        return JSON.parse(res.data.value) as ClosureGate;
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
        const parsed = JSON.parse(res.data.value);

        // Dạng phẳng cũ — trả nguyên vẹn.
        if (Array.isArray(parsed?.precedents)) return parsed as PrecedentResult;

        // Dạng theo-từng-bước mới (`PerStepPrecedents`): `union` là danh sách hợp
        // nhất đánh số MỘT LẦN cho cả tám bước — đúng thứ panel cần hiển thị, và
        // đúng thứ trích dẫn `precedents#N` trong báo cáo trỏ tới. Metadata phần
        // đầu (ngưỡng, kho, số ứng viên) lấy từ bước D4 làm đại diện: D4 là bước
        // tra tiền lệ kinh điển và luôn có mặt trong `byStep`.
        const rep = parsed?.byStep?.D4
            ?? (Object.values(parsed?.byStep ?? {})[0] as PrecedentResult | undefined);
        return {
            precedents: parsed?.union ?? [],
            reason: rep?.reason ?? null,
            maxScore: rep?.maxScore ?? 0,
            settings: rep?.settings ?? { minScore: 0, topN: 0, closedOnly: true },
            libraryCount: rep?.libraryCount ?? 0,
            candidatesScored: rep?.candidatesScored ?? 0,
            semanticUsed: rep?.semanticUsed ?? false,
        };
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
