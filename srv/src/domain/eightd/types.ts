/**
 * Hợp đồng dữ liệu của pipeline 8D.
 *
 *   raw JSON  →  CaseContext  →  EightDResult
 *
 * `CaseContext` là ranh giới quan trọng nhất trong toàn bộ tính năng: nó là tập
 * fact đã được xác minh. Mọi thứ sau nó chỉ được diễn đạt lại những fact này,
 * không được thêm fact mới. Model nào bịa ra một con số không có ở đây là sai,
 * và `sources` trên mỗi discipline tồn tại để bắt được điều đó.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Bước 1 — facts
// ─────────────────────────────────────────────────────────────────────────────

export const ORIGIN_INTERNAL = 'Q3 - Internal Defect';
export const ORIGIN_CUSTOMER = 'Q1 - Customer Complaint';

export type Origin = typeof ORIGIN_INTERNAL | typeof ORIGIN_CUSTOMER;

export const ISHIKAWA_CATEGORIES = [
    'Man', 'Machine', 'Method', 'Material', 'Measurement', 'Environment',
] as const;
export type IshikawaCategory = (typeof ISHIKAWA_CATEGORIES)[number];

/** Ánh xạ do chính dataset khai ở `schema.enumerations.action_type_to_8d_step`. */
export const ACTION_TYPE_TO_STEP = {
    Containment: 'D3',
    Corrective: 'D5',
    Preventive: 'D7',
} as const;

export interface ActionRow {
    lineNo: number;
    actionType: string;
    actionText: string;
    status: string;
}

export interface TeamRow {
    partnerId: string;
    partnerName: string;
    functionTitle: string;
    partnerRole: string;
}

export interface InspectionRow {
    characteristic: string;
    measuredValue: string;
    specValue: string;
    /**
     * Có vượt spec không, suy ra bằng code từ hai chuỗi trên.
     *
     * `null` khi KHÔNG parse được số (ví dụ 'Class 3' vs 'Class 0-1'). Để null
     * chứ không đoán — một phán quyết sai ở đây sẽ được model dùng làm bằng
     * chứng cho D2 và D4.
     */
    outOfSpec: boolean | null;
}

export interface IshikawaRow {
    category: string;
    description: string;
    metricValue: string | null;
    isRootCause: boolean;
    source: string;
}

export interface FiveWhyRow {
    stepNo: number;
    question: string;
    answer: string;
    evidenceCitation: string;
    /** Bước được đánh dấu '(root cause)' trong câu hỏi. */
    isRootCauseStep: boolean;
}

/**
 * Tập fact đã xác minh của một case. Đây là thứ duy nhất được gửi cho model ở
 * bước sinh 8D — dataset thô không bao giờ đi thẳng vào prompt.
 */
export interface CaseContext {
    notificationId: string;
    origin: Origin | string;
    /** true khi origin = Q1. Quyết định có sinh customerSummary hay không. */
    isCustomerFacing: boolean;

    header: {
        symptomShortText: string;
        status: string;
        foundDate: string | null;
        completionDate: string | null;
        quantityExtent: string;
        teamSize: number | null;
    };

    product: {
        materialId: string;
        materialDesc: string;
        /**
         * Nhóm vật tư (MATKL của SAP). Dùng cho tiêu chí "cùng họ vật tư: +1"
         * khi tìm tiền lệ.
         *
         * Chuỗi rỗng khi nguồn không khai nhóm — khi đó tiêu chí đó không bao
         * giờ ăn điểm. Cố ý không suy ra từ tiền tố mã vật tư: `MAT-10247` và
         * `MAT-10318` giống nhau bốn ký tự đầu mà chẳng liên quan gì nhau.
         */
        materialGroup: string;
        batchId: string;
        defectCode: string;
        defectText: string;
        workCenterId: string;
        workCenterDesc: string;
    };

    inspections: InspectionRow[];

    isIsNot: { is: string; isNot: string; notes: string | null } | null;

    /** Dòng Ishikawa có `is_root_cause = 'Y'`. Dataset đảm bảo đúng một dòng. */
    rootCause: {
        category: string;
        description: string;
        metricValue: string | null;
        source: string;
    } | null;

    ishikawa: IshikawaRow[];
    fiveWhy: FiveWhyRow[];

    /** Đã gom sẵn theo `ACTION_TYPE_TO_STEP`. Mảng rỗng = case chưa có loại đó. */
    actions: {
        containment: ActionRow[];  // → D3
        corrective: ActionRow[];   // → D5
        preventive: ActionRow[];   // → D7
    };

    team: {
        leader: TeamRow | null;
        members: TeamRow[];
    };

    fmea: { fmeaId: string; description: string } | null;
    copqEur: number | null;
    lessonsLearned: { whatWorked: string; whatDidnt: string } | null;

    customer: {
        complaintReference: string | null;
        plantContact: string | null;
        slaResponseDue: string | null;
        /**
         * false với case Q3 — khi đó ba trường trên là chuỗi 'N/A - ...' CÓ CHỦ
         * ĐÍCH, không phải thiếu dữ liệu. Phân biệt hai thứ này để model không
         * báo "thiếu thông tin khách hàng" cho một lỗi nội bộ vốn không có khách.
         */
        applicable: boolean;
    };

    /**
     * Những gì mapper không nhận ra. Bước AI parseData đọc phần này để bắt các
     * trường mà export SAP thật có nhưng Golden Dataset chưa có.
     */
    unmapped: Record<string, unknown>;

    /** Cảnh báo từ mapper: dữ liệu thiếu hoặc bất thường, không đủ để chặn. */
    gaps: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Bước 2 — báo cáo
// ─────────────────────────────────────────────────────────────────────────────

export const DISCIPLINE_CODES = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'] as const;
export type DisciplineCode = (typeof DISCIPLINE_CODES)[number];

export const DISCIPLINE_TITLES: Record<DisciplineCode, string> = {
    D1: 'Establish the Team',
    D2: 'Describe the Problem',
    D3: 'Interim Containment Actions',
    D4: 'Root Cause Analysis',
    D5: 'Permanent Corrective Actions',
    D6: 'Verify Effectiveness',
    D7: 'Prevent Recurrence',
    D8: 'Closure and Recognition',
};

export interface DisciplineDraft {
    code: DisciplineCode;
    sequence: number;
    title: string;
    /** 1-2 câu, plain text, ≤500 ký tự. */
    summary: string;
    /** Markdown. */
    content: string;
    actionItems: string[];
    /**
     * Đường dẫn về CaseContext, ví dụ 'actions.containment#1',
     * 'ishikawa.Machine', 'fiveWhy#2'. Rỗng nghĩa là discipline này không dựa
     * trên fact nào — chỉ chấp nhận được khi `dataBacked` là false.
     */
    sources: string[];
    confidence: number;
    /** false = không có dữ liệu nguồn, model suy luận. D6 luôn false. */
    dataBacked: boolean;
}

export interface EightDResult {
    internalSummary: string;
    /** null khi origin = Q3 — ràng buộc Q1-ONLY-CUSTOMER-FIELDS. */
    customerSummary: string | null;
    /** Đúng 8 phần tử, sắp theo `sequence`. */
    disciplines: DisciplineDraft[];
}

export interface AnalyzeOutcome {
    context: CaseContext;
    result: EightDResult;
    /**
     * Kết luận model tự rút ra khi CHƯA thấy đáp án, kèm kết quả đối chiếu.
     * Kiểu để lỏng ở đây nhằm tránh vòng import với `independentAnalysis.ts`.
     */
    independent: unknown;
    models: { parse: string; analyze: string };
    tokensUsed: number;
    durationMs: number;
    /** Ghi chú của postProcess: chỗ nào phải chữa sau khi model trả về. */
    repairs: string[];
}

/** Lỗi có mã HTTP, để tầng service ánh xạ thẳng sang `req.error`. */
export class PipelineError extends Error {
    constructor(
        message: string,
        readonly code: number = 500,
        readonly details?: unknown,
    ) {
        super(message);
        this.name = 'PipelineError';
    }
}
