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

/**
 * Một lô kiểm (GD 17 — QALS/QAMR). Khác `InspectionRow` ở chỗ đây là DÂN SỐ:
 * nhiều lô cho cùng một Material + Characteristic, tách theo thiết bị.
 *
 * ── Vì sao cần bản ghi từng lô, không dùng bản tổng hợp GD 16 ──
 * GD 16 cho biết LUẬT (target, spec, action/warning limit). Nó không cho biết
 * đồ gá nào đang hỏng. Câu hỏi của Is/Is-Not là "khác nhau ở đâu", và câu đó chỉ
 * trả lời được khi có nhiều nhóm để so — tức là cần từng bản ghi.
 */
export interface InspectionLotRow {
    lotId: string;
    materialId: string;
    characteristic: string;
    /** Đồ gá / thiết bị (trường Equipment của QALS). Chiều để tách nhóm. */
    equipment: string;
    measuredValue: string;
    /** `null` khi dataset không kết luận — không tự đoán, xem InspectionRow. */
    conforming: boolean | null;
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

    /**
     * Dân số lô kiểm lịch sử (GD 17) cho Is/Is-Not của D2. Rỗng khi dataset
     * không có — khi đó `isIsNot.applicable` phải là false, không phải là một
     * so sánh bịa.
     */
    historicalInspectionLots: InspectionLotRow[];

    /**
     * So sánh Is / Is-Not của D2.
     *
     * `applicable = false` nghĩa là KHÔNG so được (không có đặc tính đo được,
     * dưới hai nhóm thiết bị, hoặc độ chênh quá thấp) — khác hẳn với "chưa ai
     * ghi". Giá trị được TÍNH ở `isIsNot.ts`; dòng có sẵn trong dataset chỉ là
     * override.
     */
    isIsNot: {
        /**
         * `null` khi không so được — KHÔNG dùng chuỗi rỗng.
         *
         * Một ô trống sẽ được renderer in ra như một vế Is thật sự nhưng rỗng
         * nghĩa, và `dirtyData.test.ts` bắt đúng lỗi đó: mọi trường văn bản
         * trong CaseContext phải là null hoặc có nội dung, không có ở giữa.
         */
        is: string | null;
        isNot: string | null;
        notes: string | null;
        applicable: boolean;
        /** Mã lô đã dùng cho cả hai vế — bằng chứng để người đọc tự kiểm lại. */
        citedLotIds: string[];
        /** Vì sao không so được. Chỉ có giá trị khi `applicable = false`. */
        reason: string | null;
    } | null;

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

/**
 * Các bước có editor cấu hình (Data Schema / Prompt Guide / Form Mapping /
 * Constraints).
 *
 * ── Vì sao là một hằng số riêng, không dùng thẳng DISCIPLINE_CODES ──
 * Trước đây danh sách này bị viết cứng thành `['D1','D2','D3','D4']` ở SÁU chỗ
 * (hai regex `/^D[1-4]$/` trong aiAdminService, hai mảng trong eightDAnalyzer,
 * một bộ lọc khi seed, và hai bản sao ENRICHED_STEPS bên UI). Sáu nơi cùng khai
 * một sự thật là sáu cơ hội để chúng lệch nhau — và chúng đã lệch: service từ
 * chối `previewStepConfiguration` cho D5–D8 trong khi UI vẫn cho vào tab
 * Similarity của đúng những bước đó.
 *
 * Giữ tên riêng thay vì thay thẳng bằng DISCIPLINE_CODES để chỗ nào hỏi "bước
 * này cấu hình được không" vẫn đọc ra đúng câu hỏi đó, kể cả khi mai này có
 * bước bị rút khỏi diện cấu hình.
 */
export const CONFIGURABLE_STEP_CODES = DISCIPLINE_CODES;
export type ConfigurableStepCode = (typeof CONFIGURABLE_STEP_CODES)[number];

/** `true` khi `code` là một bước có editor cấu hình. Dùng thay cho /^D[1-4]$/. */
export function isConfigurableStepCode(code: string): code is ConfigurableStepCode {
    return (CONFIGURABLE_STEP_CODES as readonly string[]).includes(code);
}

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
    /** Flexible D1-D4 output. Form Editor field keys are paths inside this object. */
    data?: Record<string, unknown>;
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
    runtime?: Partial<Record<DisciplineCode, {
        formSchemaJson: string;
        validationJson: string;
        configVersion: string;
        resultJson: string;
    }>>;
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
