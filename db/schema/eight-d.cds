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
    /**
     * Tiền lệ đã chấm điểm lúc phân tích — JSON `{ union, byStep, profileByStep }`.
     *
     * ── Vì sao phải lưu thay vì tính lại khi mở màn hình ──
     * Pipeline đã chấm toàn kho để dựng báo cáo (đo được 17-21 giây). Vứt kết quả
     * đó đi rồi cho UI gọi `findPrecedents` chấm lại là làm hai lần cùng một việc.
     *
     * Nhưng lý do chính không phải tốc độ mà là TÍNH NHẤT QUÁN: trọng số chấm điểm
     * sửa được trên trang cấu hình. Chấm lại lúc xem nghĩa là panel có thể hiện một
     * bộ tiền lệ khác hẳn bộ mà báo cáo đã trích dẫn — hai con số cùng nằm trên một
     * màn hình mà không khớp nhau, và không ai biết cái nào đúng.
     *
     * Bản chụp này bất biến như `resultJson`: nó ghi lại điều AI ĐÃ THẤY lúc kết luận.
     */
    precedentsJson    : LargeString;
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
    /** Flexible AI data and immutable runtime snapshots for schema-driven rendering. */
    resultJson     : LargeString;
    formSchemaJson : LargeString;
    validationJson : LargeString;
    configVersion  : String(64);
    aiGenerated : Boolean default true;

    // ── Người duyệt ──────────────────────────────────────────────────────────
    // AI chỉ soạn nháp; không bước nào được coi là chốt cho tới khi một kỹ sư
    // chất lượng bấm duyệt. Không có mấy cột này thì không thể trả lời câu hỏi
    // đầu tiên của mọi cuộc audit — "ai duyệt, lúc nào" — và cổng đóng case ở D8
    // cũng không có gì để kiểm.

    /** 'Draft' | 'Approved' | 'ChangeRequested'. Xem ReviewDecision ở service. */
    reviewStatus : String(16) default 'Draft';
    /** Ai bấm. Lấy từ req.user, không cho client tự khai. */
    reviewedBy   : String(120);
    reviewedAt   : DateTime;
    /** Bắt buộc khi ChangeRequested — "cần sửa" mà không nói sửa gì thì vô dụng. */
    reviewNote   : String(500);

    /** JSON mảng string chứa các fieldKey của AI đã được người dùng bấm Confirm. */
    confirmedFieldsJson : LargeString;
    /** 'NotStarted' | 'InProgress' | 'Completed'. Trạng thái xử lý của bước D. */
    workState           : String(16) default 'NotStarted';
}

/**
 * Vết duyệt — CHỈ THÊM, không sửa không xoá.
 *
 * `Disciplines.reviewStatus` chỉ giữ trạng thái HIỆN TẠI. Một case bị trả lại
 * rồi duyệt lại hai vòng trông y hệt một case duyệt thẳng, mà đó lại đúng là thứ
 * người audit muốn thấy. Bảng này giữ trọn chuỗi quyết định.
 *
 * Không có association ngược về Disciplines: hàng ở đây phải sống sót kể cả khi
 * report bị chạy lại (reanalyze) và discipline cũ bị thay. Khoá là cặp
 * (reportID, disciplineCode) dạng giá trị, không phải con trỏ.
 */
entity ReviewEvents : cuid {
    reportID       : String(36);
    /** 'D1' … 'D8'. */
    disciplineCode : String(4);
    fromStatus     : String(16);
    toStatus       : String(16);
    note           : String(500);
    /** Danh tính lấy từ req.user lúc ghi. */
    actor          : String(120);
    at             : DateTime;
}

/**
 * Bằng chứng hoàn thành hành động (PDF completion evidence cho từng Action Task).
 *
 * Không dùng Association ngược về Disciplines: hàng ở đây phải sống sót kể cả khi
 * report bị chạy lại (reanalyze) và discipline cũ bị thay. Khoá liên kết là bộ ba
 * (reportID, disciplineCode, taskId) dạng giá trị độc lập.
 */
entity TaskEvidences : cuid {
    reportID       : String(36);
    /** 'D3' | 'D5' | 'D7'... */
    disciplineCode : String(4);
    taskId         : String(64);
    fileName       : String(255);
    fileSize       : Integer;
    @Core.MediaType  : mediaType
    content        : LargeBinary;
    @Core.IsMediaType: true
    mediaType      : String(100);
    uploadedBy     : String(120);
    uploadedAt     : DateTime;
}

