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
     * Chạy ĐỒNG BỘ — action chỉ trả về khi AI xong, khoảng 20-40 giây. Client
     * phải nới timeout tương ứng (axios mặc định 30s trong repo này là KHÔNG đủ).
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
     * Ghi lai nhom 8D ma nguoi dung da chot cho D1.
     *
     * -- Vi sao mot action HEP thay vi mo UPDATE tren Disciplines --
     * `Disciplines` van `@readonly` co chu dich: `resultJson` la ket luan cua AI,
     * mo ghi tu do len no nghia la bat ky ai cung sua duoc nguyen nhan goc, chuoi
     * 5-Why hay trich dan nguon ma khong de lai dau vet - dung thu ma ca pipeline
     * nay duoc dung len de chong.
     *
     * Action nay chi ghi DUNG mot khoa: `team.assignedRoster`. `team.roster` do AI
     * de xuat khong bi dung toi, nen luon doi chieu duoc "AI de xuat ai" voi
     * "nguoi dung chot ai" - va do la thu chung minh con nguoi van quyet, khong
     * phai may.
     *
     * @param disciplineID ID cua dong D1 trong `Disciplines`.
     * @param roster       Mang JSON: [{ partnerId, partnerName, functionTitle, partnerRole }]
     */
    action saveTeamRoster(disciplineID : String, roster : LargeString) returns String;

    /**
     * Ghi mot o do NGUOI DUNG nhap tren mot buoc D.
     *
     * -- Vi sao khong mo UPDATE tren Disciplines --
     * `resultJson` la ket luan cua AI. Mo ghi tu do len no nghia la bat ky ai
     * cung sua duoc nguyen nhan goc, chuoi 5-Why hay trich dan nguon ma khong
     * de lai dau vet - dung thu ca pipeline nay duoc dung len de chong.
     *
     * Action nay chi ghi duoc nhung khoa nam trong danh sach cho phep o server
     * (`HUMAN_WRITABLE_FIELDS`). Moi khoa deu la khoa RIENG cua nguoi dung, tach
     * khoi ban AI viet - vi du `problem.statementOverride` khong dung toi
     * `problem.statement`, nen luon doi chieu duoc may viet gi va nguoi sua gi.
     *
     * @param disciplineID ID dong trong `Disciplines`.
     * @param fieldKey     Khoa trong `resultJson`, phai nam trong danh sach cho phep.
     * @param valueJson    Gia tri, ma hoa JSON (chuoi, so, mang... deu duoc).
     */
    action saveDisciplineField(disciplineID : String, fieldKey : String, valueJson : LargeString) returns String;

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
