using { cnma.proresolve as ns } from '../db/schema/schema';

/**
 * Service báo cáo 8D — backend cho trang 8D Reports.
 *
 * Hai entity để đọc, hai action để chạy pipeline AI. Không mở CREATE/UPDATE
 * trực tiếp trên Reports: một report chỉ được sinh ra qua `analyzeFromJson`,
 * cho phép ghi tay sẽ tạo ra bản ghi không có `sourcePayload` và không
 * reanalyze được.
 */
@path: '/api/cnma/EIGHTD_SRV'
@(requires: 'authenticated-user')
service EightDService {

    /**
     * Báo cáo 8D. Đọc kèm disciplines bằng `?$expand=disciplines`.
     *
     * Không mở CREATE/UPDATE có chủ đích: report chỉ được sinh qua
     * `analyzeFromJson`, và tầng repository ghi thẳng xuống db chứ không qua
     * service này. Mở ghi ở đây chỉ tạo đường tắt để lọt vào bản ghi thiếu
     * `sourcePayload`, tức là không bao giờ chạy lại được.
     *
     * DELETE thì mở cho admin: mỗi lần phân tích tạo một bản ghi mới, nên chạy
     * thử nhiều lần sẽ tích rác. Không có đường xoá thì cách duy nhất để dọn là
     * xoá luôn file sqlite. Composition sẽ xoá disciplines theo.
     */
    @restrict: [
        { grant: 'READ',   to: 'authenticated-user' },
        { grant: 'DELETE', to: ['admin', 'Admin'] }
    ]
    entity Reports as projection on ns.Reports;

    @readonly
    entity Disciplines as projection on ns.Disciplines;

    /**
     * Chạy pipeline: validate dataset → map facts → AI parseData → AI analyzeDefect
     * → lưu. Trả về ID của report vừa tạo.
     *
     * Chạy BẤT ĐỒNG BỘ: action trả `ID` ngay khi bản ghi được tạo ở trạng thái
     * `Analyzing`, còn pipeline chạy nền qua `cds.spawn` (xem `runInBackground`
     * trong `srv/src/services/eightDService.ts`). Client KHÔNG cần nới timeout —
     * nó theo dõi bằng cách poll trường `status`.
     *
     * Lỗi ở giữa chừng vẫn để lại một bản ghi Reports với status = Failed và
     * `errorMessage`, chứ không nuốt lỗi — có bản ghi thì còn debug được.
     *
     * @param payload  JSON Golden Dataset, nguyên văn
     * @param title    Nhãn tuỳ chọn cho lần chạy; bỏ trống thì lấy symptom_short_text
     */
    action analyzeFromJson(payload : LargeString, title : String) returns String;

    /**
     * Chạy lại trên `sourcePayload` đã lưu. Xoá toàn bộ disciplines cũ rồi ghi
     * bộ mới — không merge, vì trộn hai lần chạy khác model sẽ cho ra một báo
     * cáo không nhất quán mà chẳng ai truy được phần nào từ đâu.
     */
    action reanalyze(reportID : String) returns String;

    // ── Duyệt từng bước & đóng case ──────────────────────────────────────────

    /**
     * Đặt trạng thái duyệt của một bước: 'Draft' hoặc 'Complete'.
     *
     * Đường DUY NHẤT ghi vào `Disciplines.stepStatus`. AI không bao giờ gọi
     * action này — đó là toàn bộ cơ chế thực thi "mô hình soạn, người chốt".
     *
     * Trạng thái thứ ba mà UI hiện, 'In review', KHÔNG lưu ở đâu cả: nó được
     * suy ra khi đọc, từ dấu vết accepted/edited trong SuggestionAudit.
     *
     * Đặt D8 = 'Complete' khi D1–D7 chưa xong thì trả 409 kèm danh sách bước
     * còn thiếu — chặn ngay tại đây chứ không đợi đến lúc bấm đóng case.
     */
    action setDisciplineStatus(disciplineID : String, status : String) returns String;

    /**
     * Ghi vết một đề xuất: 'shown' | 'accepted' | 'rejected' | 'edited'.
     *
     * `shown` do pipeline tự ghi sau mỗi lần phân tích; ba giá trị còn lại do
     * người dùng thao tác. Ghi cả `shown` vì tỉ lệ bị từ chối mới nói lên chất
     * lượng gợi ý, và một đề xuất bị lờ đi thì không có thao tác nào để ghi.
     *
     * `actor` lấy từ phiên đăng nhập, không nhận từ payload.
     */
    action recordSuggestionOutcome(
        reportID      : String,
        stepCode      : String,
        suggestionKey : String,
        outcome       : String,
        payload       : LargeString
    ) returns String;

    /**
     * Trạng thái + số liệu audit của cả 8 bước trong một lời gọi. Trang chi tiết
     * cần đủ 8 dòng cùng lúc, nên hỏi lẻ từng bước là 8 round-trip vô ích.
     */
    function getDisciplineActivity(reportID : String) returns String;

    /**
     * Đóng case. Cổng D1–D7 được TÍNH LẠI ở server tại thời điểm bấm, không tin
     * vào trạng thái UI đang hiện — giữa lúc vẽ trang và lúc bấm, một bước có
     * thể đã bị mở lại ở tab khác.
     *
     * Chưa đủ điều kiện thì trả 409 kèm danh sách bước còn thiếu.
     */
    action closeReport(reportID : String) returns String;

    // ── Worklist sự vụ mới đến ───────────────────────────────────────────────

    /**
     * Sự vụ đã đồng bộ từ Record Defects / Create Quality Notification, chờ mở 8D.
     *
     * Không mở CREATE/UPDATE trực tiếp: dòng worklist chỉ sinh ra qua
     * `syncWorklist` và chỉ đổi trạng thái qua `createEightDFromWorklist` — ghi
     * tay sẽ tạo dòng không có `sourcePayload`, tức là không bao giờ mở 8D được.
     */
    @restrict: [
        { grant: 'READ',   to: 'authenticated-user' },
        { grant: 'DELETE', to: ['admin', 'Admin'] }
    ]
    entity Worklist as projection on ns.WorklistItems;

    /**
     * Đồng bộ sự vụ mới từ SAP (mô phỏng). Hai chế độ:
     *  - `payload` rỗng  → đọc `mock-data/incoming/*.json` như một lần pull.
     *  - `payload` có giá trị → nhận một case hoặc mảng case đẩy thẳng vào
     *    (mô phỏng webhook; cũng là đường duy nhất trên Cloud Foundry, nơi
     *    thư mục mock-data không được deploy).
     *
     * Idempotent theo `notificationId`: sự vụ đã có trong worklist thì bỏ qua,
     * sync lại bao nhiêu lần cũng không nạp trùng.
     */
    action syncWorklist(payload : LargeString) returns String;

    /**
     * Mở 8D từ một dòng worklist: chạy đúng pipeline của `analyzeFromJson` trên
     * `sourcePayload` đã lưu, rồi gắn report vào dòng và chuyển status sang
     * 'EightDCreated'. Trả về ID report — client điều hướng sang trang chi tiết.
     *
     * Dòng đã mở 8D rồi thì trả 409 kèm ID report cũ, không mở bản thứ hai:
     * hai report cùng một notification chỉ gây nhầm lẫn về bản nào là thật.
     */
    action createEightDFromWorklist(itemID : String) returns String;

    // ── Kho case lịch sử ─────────────────────────────────────────────────────

    /**
     * Kho tiền lệ, chỉ đọc. Xem nhóm 8D kèm theo bằng `?$expand=team`.
     *
     * Ghi chỉ qua `seedCaseLibrary`: một dòng ghi tay sẽ không có `defectKeywords`
     * và `materialFamily` tính sẵn, nên nó lặng lẽ không bao giờ ăn điểm.
     */
    @readonly
    entity HistoricalCases as projection on ns.HistoricalCases;

    @readonly
    entity HistoricalTeamMembers as projection on ns.HistoricalTeamMembers;

    /**
     * Case tiền lệ của một report, kèm điểm và diễn giải từng tiêu chí.
     *
     * Trả JSON `PrecedentResult`. Không có tiền lệ ⇒ `precedents` rỗng và
     * `reason` nói rõ vì sao — phân biệt được "kho chưa nạp" với "đã tìm nhưng
     * không đủ điểm", hai thứ nhìn ngoài UI giống hệt nhau.
     */
    function findPrecedents(reportID : String) returns String;

    /**
     * Nạp case vào kho tiền lệ.
     *
     * Có mặt vì trên Cloud Foundry không chạy được script cục bộ đối với HDI
     * container. Thay thế theo `notificationId`, nên nạp lại cùng bộ dữ liệu là
     * an toàn.
     *
     * @param payload Mảng JSON các case, hoặc một case đơn lẻ.
     */
    @(requires: ['admin', 'Admin'])
    action seedCaseLibrary(payload : LargeString) returns String;

    /** Xoá sạch kho. Dùng khi muốn nạp lại từ đầu. */
    @(requires: ['admin', 'Admin'])
    action clearCaseLibrary() returns String;

    /**
     * Sinh vector cho các case trong kho — bước bắt buộc để tiêu chí ngữ nghĩa
     * hoạt động.
     *
     * Tách khỏi `seedCaseLibrary` vì nạp kho là thao tác DB thuần luôn chạy được,
     * còn nhúng thì phụ thuộc AI Core. Gộp chung thì một sự cố bên AI khiến kho
     * không nạp được, trong khi chấm điểm theo luật vốn không cần vector.
     *
     * @param force true = nhúng lại tất cả. Dùng khi đổi công thức ghép searchText
     *              hoặc đổi model nhúng — vector cũ khi đó không còn so được.
     */
    @(requires: ['admin', 'Admin'])
    action embedCaseLibrary(force : Boolean) returns String;
}
