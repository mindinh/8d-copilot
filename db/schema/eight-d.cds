namespace cnma.proresolve;

using { cuid, managed } from '@sap/cds/common';

/**
 * Mô hình dữ liệu báo cáo 8D.
 *
 * Nguồn vào là "Golden Dataset" — một JSON mô tả trọn vẹn một case lỗi trong SAP
 * QM (16 entity, join theo `notification_id`). Xem `mock-data/README.md`.
 *
 * ── Vì sao phẳng hoá case header vào Reports ──
 * Dataset gốc có 16 entity, nhưng mỗi case chỉ có ĐÚNG MỘT dòng ở phần lớn
 * trong số đó (1 material, 1 batch, 1 defect code, 1 work center, 1 cost). Dựng
 * lại đủ 16 bảng ở đây chỉ để chứa một dòng mỗi bảng là công vô ích: mọi truy
 * vấn đều phải join 6 bảng để hiện một dòng danh sách.
 *
 * Nên: phẳng hoá phần 1:1 vào `Reports`, giữ JSON gốc nguyên vẹn ở
 * `sourcePayload` để không mất gì, và chỉ tách bảng riêng cho thứ thực sự
 * 1-nhiều mà UI cần lặp — tức là 8 discipline.
 */

type ReportStatus : String(20) enum {
    Draft;      // đã nhận payload, chưa chạy
    Analyzing;  // đang gọi AI Core
    Analyzed;   // có đủ D1-D8
    Failed;     // pipeline lỗi, xem errorMessage
    Closed;     // người dùng chốt
}

entity Reports : cuid, managed {

    // ── Case header (từ entity `notifications`) ──────────────────────────────
    /** Case key của dataset. Gần như mọi entity join ngược về đây. */
    notificationId    : String(30);
    /** 'Q3 - Internal Defect' | 'Q1 - Customer Complaint'. Quyết định có sinh customerSummary hay không. */
    origin            : String(30);
    symptomShortText  : String(255);
    /** Status phía SAP: In Process | Completed | Closed. Khác `status` bên dưới — đó là status của pipeline. */
    sapStatus         : String(30);
    foundDate         : Date;
    completionDate    : Date;
    /**
     * Giữ String chứ không Integer: workbook ghi dạng text ('128 units affected').
     * Ép sang số là tự nhận rủi ro parse sai để đổi lấy một trường mà UI chỉ hiển thị.
     */
    quantityExtent    : String(60);
    teamSize          : Integer;

    // ── Master data đã join sẵn ──────────────────────────────────────────────
    materialId        : String(30);
    materialDesc      : String(255);
    batchId           : String(30);
    defectCode        : String(30);
    defectText        : String(255);
    workCenterId      : String(30);
    workCenterDesc    : String(255);

    // ── Chỉ số ───────────────────────────────────────────────────────────────
    copqEur           : Decimal(15, 2);
    /** Category có is_root_cause = 'Y' trong causes_ishikawa. Một trong 6 giá trị Ishikawa. */
    rootCauseCategory : String(30);
    /** Null khi case chưa liên kết FMEA — cardinality gốc là 0..1. */
    fmeaId            : String(30);

    // ── AI sinh ──────────────────────────────────────────────────────────────
    /** Tóm tắt đối nội: được nêu tên thiết bị, lô, nhân sự. */
    internalSummary   : LargeString;
    /**
     * Tóm tắt đối ngoại. CHỈ sinh khi origin = 'Q1 - Customer Complaint'
     * (ràng buộc Q1-ONLY-CUSTOMER-FIELDS). Case Q3 luôn null.
     */
    customerSummary   : LargeString;

    // ── Chẩn đoán độc lập ────────────────────────────────────────────────────
    // Kết luận AI tự rút ra khi CHƯA thấy đáp án của kỹ sư. Xem
    // `srv/src/domain/eightd/blindEvidence.ts` để biết những gì bị cắt khỏi input.

    /** JSON `IndependentFinding` — chuỗi 5-Why AI tự dựng, nhánh bị loại, v.v. */
    aiFinding         : LargeString;
    /** Nhánh Ishikawa AI tự chọn. So với `rootCauseCategory` để biết trùng hay lệch. */
    aiRootCause       : String(30);
    /** true = AI kết luận trùng kỹ sư mà không hề thấy đáp án. */
    aiAgreesWithRecord: Boolean;
    aiConfidence      : Decimal(3, 2);

    // ── Vết chạy pipeline ────────────────────────────────────────────────────
    status            : ReportStatus default #Draft;
    /** JSON gốc, giữ nguyên vẹn — nguồn duy nhất để chạy lại (reanalyze). */
    sourcePayload     : LargeString;
    /** CaseContext sau caseMapper + bước AI parseData. Dùng để debug và truy vết. */
    caseContext       : LargeString;
    aiModelParse      : String(100);
    aiModelAnalyze    : String(100);
    analyzedAt        : DateTime;
    tokensUsed        : Integer;
    durationMs        : Integer;
    errorMessage      : String(1000);

    disciplines       : Composition of many Disciplines
                            on disciplines.report = $self;
}

/**
 * Một discipline trong báo cáo 8D. Đúng 8 dòng mỗi report, D1 đến D8.
 */
entity Disciplines : cuid, managed {
    report      : Association to Reports;

    /** 'D1' … 'D8'. */
    code        : String(4);
    /** 1..8 — sort theo cột này, đừng sort theo `code` dạng chuỗi. */
    sequence    : Integer;
    title       : String(120);

    /**
     * 1-2 câu, plain text. Tách khỏi `content` vì UI accordion cần dòng tóm tắt
     * lúc thu gọn; bắt model trả cả hai trong một lần rẻ hơn gọi lại để tóm tắt.
     */
    summary     : String(500);
    /** Markdown, hiện khi mở rộng. */
    content     : LargeString;

    /** Mảng JSON các string. */
    actionItems : LargeString;
    /**
     * Mảng JSON đường dẫn về CaseContext, ví dụ ['actions#1','causes_ishikawa.Machine'].
     * Đây là cơ chế chống bịa: mọi khẳng định phải truy được về một fact trong input.
     */
    sources     : LargeString;

    confidence  : Decimal(3, 2);

    /**
     * false = discipline này KHÔNG có dữ liệu nguồn, AI suy luận ra.
     *
     * Dataset không có dữ liệu verification nên D6 luôn false. Case thiếu action
     * Preventive thì D7 cũng false. UI bắt buộc phải đánh dấu rõ, không thì
     * người đọc tưởng đây là sự thật đã kiểm chứng.
     */
    dataBacked  : Boolean;
    aiGenerated : Boolean default true;
}
