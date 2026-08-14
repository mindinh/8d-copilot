namespace cnma.proresolve;

using { cuid, managed } from '@sap/cds/common';
using { cnma.proresolve.Reports } from './eight-d';

/**
 * Tiêu chí chấm điểm tương đồng — sửa trên UI, không phải sửa code.
 *
 * ── Vì sao mỗi tiêu chí có một mức dự phòng ──
 * Requirement định nghĩa ba tiêu chí, trong đó hai cái có mức thấp hơn khi không
 * khớp chính xác:
 *
 *     work center trùng                          +4
 *     defect code trùng  +4  · hoặc trùng từ khoá mô tả  +2
 *     material trùng     +3  · hoặc cùng họ vật tư       +1
 *     ─────────────────────────────────────────────────────
 *     tối đa                                             11
 *
 * Mô hình hoá thành năm dòng độc lập sẽ sai: một case trùng cả defect code lẫn
 * từ khoá sẽ ăn 4+2 = 6, phá trần 11 và phá luôn ví dụ 7/11 trong requirement.
 * Nên mỗi tiêu chí là MỘT dòng có hai mức, và mức dự phòng chỉ được xét khi mức
 * chính trượt.
 *
 * ── Vì sao là bảng chứ không phải hằng số ──
 * Trọng số là dữ liệu. Chỉnh trên UI phải có hiệu lực ngay, không cần deploy lại.
 * Danh sách dạng bảng cũng là chỗ chừa cho vector sau này: thêm một dòng
 * `semantic` với `matchType = 'cosine'` là xong, không phải thiết kế lại.
 */
entity SimilarityCriteria : managed {

    /** workCenter | defectCode | material — mã ổn định, code tra theo cột này. */
    key criterionKey   : String(40);

        label          : String(100);
        description    : String(500);

        /**
         * Bảng/nguồn dữ liệu tiêu chí này đọc. Hiện trên UI để admin biết tắt
         * một tiêu chí thì mất đi nguồn nào.
         */
        sourceTable    : String(60);
        /** Cột trên HistoricalCases dùng để so ở mức chính. */
        sourceField    : String(60);
        /** exact | keyword | family — hiện tại chỉ dùng exact ở mức chính. */
        matchType      : String(20)  default 'exact';
        weight         : Integer;

        // ── Mức dự phòng, chỉ xét khi mức chính trượt ────────────────────────
        /** Null = tiêu chí này không có mức dự phòng. */
        fallbackField  : String(60);
        /** keyword = trùng từ khoá · family = cùng nhóm vật tư. */
        fallbackMatch  : String(20);
        fallbackWeight : Integer;

        /**
         * Ngưỡng riêng cho tiêu chí ngữ nghĩa (`matchType = 'cosine'`).
         *
         * Cosine giữa hai case bất kỳ hiếm khi bằng 0 — hai đoạn văn kỹ thuật
         * tiếng Anh luôn giống nhau ở mức nền. Đo thực tế trên bộ dữ liệu này:
         * cùng chủ đề ≈ 0.72, khác hẳn chủ đề ≈ 0.29. Không đặt sàn thì mọi case
         * đều được cộng một ít điểm và thứ hạng bị nhiễu nền chi phối.
         *
         * Dưới sàn ⇒ 0 điểm. Null với các tiêu chí không phải cosine.
         */
        minSimilarity  : Decimal(3, 2);

        /** Tắt ⇒ tiêu chí không tính điểm VÀ không tính vào điểm tối đa. */
        enabled        : Boolean     default true;
        sortOrder      : Integer;
}

/**
 * Ngưỡng và số lượng tiền lệ. Đúng một dòng, khoá cố định 'GLOBAL'.
 *
 * Không có cột "loại chính case đang xử lý": đó là luật đúng/sai chứ không phải
 * sở thích. Case hiện tại luôn tự khớp 11/11 và luôn phải bị loại — để admin tắt
 * được chỉ tạo ra một cách tự bắn vào chân.
 */
entity RetrievalSettings : managed {
    key ID         : String(10)  default 'GLOBAL';

        /** Dưới ngưỡng ⇒ báo "không có tiền lệ", KHÔNG trả đại kết quả top đầu. */
        minScore   : Integer     default 3;
        /** N tiền lệ lấy ra. */
        topN       : Integer     default 3;
        /** Chỉ case Completed/Closed mới được làm tiền lệ. */
        closedOnly : Boolean     default true;
}

/**
 * Prompt cho từng bước D — sửa trên UI.
 *
 * Trống hoặc tắt ⇒ code rơi về hằng số trong `srv/src/domain/eightd/prompts.ts`.
 * Nhờ vậy cài đặt bảng này KHÔNG đổi hành vi cho tới khi có người thật sự sửa
 * prompt, và luôn có đường quay về bản chạy được.
 */
entity StepPrompts : managed {
    /** D1 … D8. */
    key stepCode     : String(4);

        label        : String(100);
        description  : String(500);

        /** Vai trò và luật. Trống ⇒ dùng hằng số trong code. */
        systemPrompt : LargeString;
        /**
         * Khung nội dung gửi kèm. Placeholder `{{caseContext}}`, `{{precedents}}`,
         * `{{candidates}}` được thay lúc chạy. Trống ⇒ dùng khung mặc định.
         */
        userTemplate : LargeString;

        enabled      : Boolean   default true;
        /** Tăng mỗi lần lưu — để biết prompt nào đã sinh ra kết quả nào. */
        version      : Integer   default 1;
}

/**
 * Vết mỗi lần AI đề xuất và người dùng xử lý đề xuất đó.
 *
 * Requirement mục 3 bắt buộc có: *"Every AI action (draft shown, suggestion
 * accepted/rejected) is logged"*. Ghi cả `shown` chứ không chỉ `accepted` —
 * tỉ lệ bị từ chối mới là con số nói lên chất lượng gợi ý.
 */
entity SuggestionAudit : cuid, managed {
    report   : Association to Reports;
    /** D1 … D8. */
    stepCode : String(4);
    /** shown | accepted | rejected | edited */
    action   : String(20);
    /** JSON của đề xuất tại thời điểm đó. */
    payload  : LargeString;
    /** Người thao tác. `createdBy` của `managed` giữ user kỹ thuật. */
    actor    : String(120);
}
