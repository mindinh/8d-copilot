namespace cnma.proresolve;

using { cuid, managed } from '@sap/cds/common';

/**
 * Kho case 8D lịch sử — nguồn duy nhất để tìm tiền lệ.
 *
 * ── Vì sao tách khỏi `Reports` ──
 * `Reports` là MỘT DÒNG MỖI LẦN CHẠY phân tích: chạy lại cùng một case ba lần thì
 * có ba dòng. Kho tiền lệ cần đúng một dòng mỗi case, và phải sống độc lập với
 * việc ai đó có bấm phân tích hay không. Trộn hai thứ lại thì mỗi lần chạy thử
 * lại làm lệch phép đếm tần suất của D1.
 *
 * ── Vì sao phẳng, không join master data ──
 * Chấm điểm so ba khoá: work center, defect code, material. Cả ba phải nằm ngay
 * trên dòng để lọc bằng index. Dựng bảng Material/WorkCenter riêng chỉ để join
 * lại đúng một dòng là trả giá bằng mọi câu truy vấn mà không được gì.
 */
@assert.unique: { notification: [notificationId] }
entity HistoricalCases : cuid, managed {

    /** Khoá nghiệp vụ. Mọi trích dẫn tiền lệ đều dùng mã này. */
    notificationId    : String(30)  @mandatory;

    // ── Header ───────────────────────────────────────────────────────────────
    origin            : String(30);
    symptomShortText  : String(255);
    /** In Process | Completed | Closed. Chỉ case đã đóng mới được làm tiền lệ. */
    sapStatus         : String(30);
    foundDate         : Date;
    completionDate    : Date;
    quantityExtent    : String(60);

    // ── Ba khoá chấm điểm ────────────────────────────────────────────────────
    workCenterId      : String(30);
    workCenterDesc    : String(255);
    defectCode        : String(30);
    defectText        : String(255);
    materialId        : String(30);
    materialDesc      : String(255);

    /**
     * Nhóm vật tư (MATKL của SAP) — dùng cho tiêu chí "cùng họ vật tư: +1".
     *
     * Suy ra LÚC NẠP, không tính lại mỗi lần chấm: chấm điểm phải là phép so
     * sánh thuần. Null khi nguồn không khai nhóm — khi đó tiêu chí này không
     * bao giờ ăn điểm, thay vì đoán bừa một họ.
     */
    materialFamily    : String(30);

    /**
     * Token đã chuẩn hoá của `defectText`, phân tách bằng khoảng trắng.
     *
     * Cũng tính sẵn lúc nạp vì lý do trên. Tiêu chí "trùng từ khoá mô tả lỗi"
     * so hai chuỗi này chứ không so `defectText` thô — nếu không thì mỗi lần
     * chấm lại phải tách từ, bỏ dấu, hạ chữ hoa cho cả kho.
     */
    defectKeywords    : String(500);

    // ── Bối cảnh hiển thị trong panel tiền lệ ────────────────────────────────
    batchId           : String(30);
    rootCauseCategory : String(30);
    copqEur           : Decimal(15, 2);
    fmeaId            : String(30);

    /** JSON gốc của case, giữ nguyên vẹn — dựng lại chi tiết mà không cần bảng phụ. */
    sourcePayload     : LargeString;

    // ── Tìm theo ngữ nghĩa ───────────────────────────────────────────────────

    /**
     * Đoạn văn được đem đi nhúng. Ghép lúc nạp kho, xem `buildSearchText`.
     *
     * Lưu lại chứ không ghép lại mỗi lần vì hai lý do: nó là thứ giải thích được
     * *vì sao* hai case gần nhau, và khi đổi công thức ghép thì so hai cột này
     * biết ngay case nào cần nhúng lại.
     */
    searchText        : LargeString;

    /**
     * Vector 1536 chiều, lưu dạng mảng JSON.
     *
     * ── Vì sao JSON chứ không `cds.Vector` / REAL_VECTOR ──
     * REAL_VECTOR + COSINE_SIMILARITY chỉ có trên HANA. SQLite không có, nên
     * chọn nó là mất khả năng chạy và TEST toàn bộ phần tìm kiếm ở local — trong
     * khi kiến trúc ở đây vốn đã là "lọc bằng SQL rồi chấm trong TS", tức là
     * cosine chạy trên vài chục dòng chứ không phải cả kho.
     *
     * Khi nào đổi sang REAL_VECTOR: khi tập ứng viên sau lọc vượt vài nghìn dòng.
     * Lúc đó thêm cột vector song song và chuyển phép cosine xuống SQL; cột này
     * vẫn giữ để đối chiếu.
     */
    embedding         : LargeString;

    /**
     * Model đã sinh ra vector. BẮT BUỘC kiểm trước khi so.
     *
     * Vector của hai model khác nhau KHÔNG so sánh được — kết quả trông vẫn chạy
     * nhưng sai hoàn toàn. Đây là cái bẫy số ① trong `8d-vector-search-design.md`.
     */
    embeddingModel    : String(100);
    embeddedAt        : Timestamp;

    // `case` là từ khoá CDS nên association phải mang tên khác.
    team              : Composition of many HistoricalTeamMembers
                            on team.historicalCase = $self;
    actions           : Composition of many HistoricalActions
                            on actions.historicalCase = $self;
}

/**
 * Ai đã ở trong nhóm 8D của case nào — đây chính là thứ D1 đọc.
 *
 * D1 gom nhóm bảng này theo `functionTitle` để ra vai trò gợi ý, và theo
 * `partnerId` để ra danh sách người xếp theo số lần tham gia.
 */
entity HistoricalTeamMembers : cuid {
    historicalCase : Association to HistoricalCases;

    partnerId     : String(30)  @mandatory;
    partnerName   : String(100);
    /** Quality Engineer, Production Engineer, … — gom nhóm theo cột này ra "vai trò". */
    functionTitle : String(100);
    /** 8D Team Leader | 8D Team Member. */
    partnerRole   : String(50);

    /** Auto-fill khi người dùng chọn partner. Rule-based, không phải AI sinh. */
    email         : String(120);
    phone         : String(40);
}

/**
 * Hành động của case lịch sử.
 *
 * D1 chưa dùng. Nạp luôn vì D3/D5/D7 sẽ đọc chính bảng này ("hành động ngăn chặn
 * mà case tiền lệ điểm cao nhất đã làm") — nạp sau nghĩa là chạy lại cả job.
 */
entity HistoricalActions : cuid {
    historicalCase : Association to HistoricalCases;

    lineNo     : Integer;
    /** Containment | Corrective | Preventive — đã chuẩn hoá qua `classifyAction`. */
    actionType : String(30);
    actionText : String(1000);
    status     : String(30);
}
