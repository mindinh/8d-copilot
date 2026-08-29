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

    @readonly
    entity InspectionLots as projection on ns.InspectionLots;

    @readonly
    entity FmeaRegister as projection on ns.FmeaRegister;

    /**
     * Bằng chứng hoàn thành task (PDF evidence).
     *
     * Cho phép READ, CREATE, DELETE (KHÔNG cho UPDATE metadata trực tiếp: muốn
     * đổi file đã nộp thì xoá rồi nộp lại để vết rõ ràng).
     */
    @restrict: [
        { grant: ['READ'], to: ['admin', 'Admin', 'Auditor', 'User', 'authenticated-user'] },
        { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['admin', 'Admin', 'User'] }
    ]
    entity TaskEvidences as projection on ns.TaskEvidences;

    /**
     * Chạy pipeline: validate dataset → map facts → AI parseData → AI analyzeDefect
     * → lưu. Trả về ID của report vừa tạo.
     *
     * Chạy Ở NỀN qua `cds.spawn`: action trả về reportID NGAY, trạng thái bản ghi
     * đi Analyzing -> Analyzed/Failed. Client theo dõi bằng cách poll `status`,
     * không chờ response. Một lượt phân tích mất khoảng 3 phút — chờ đồng bộ thì
     * mọi timeout HTTP trên đường đi đều cắt trước khi AI xong.
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
     * Ghi quyet dinh duyet cua ky su chat luong cho MOT buoc D.
     *
     * -- Vi sao can action rieng --
     * AI chi soan nhap. Khong buoc nao duoc coi la chot cho toi khi mot con nguoi
     * bam duyet, va D8 chi mo cong dong case khi D1-D7 deu Approved. Khong co
     * duong ghi nay thi ca hai luat do khong ton tai trong du lieu.
     *
     * Moi lan bam ghi hai cho: trang thai hien tai tren `Disciplines`, va mot dong
     * KHONG XOA DUOC trong `ReviewEvents`. Danh tinh nguoi bam lay tu `req.user`,
     * KHONG nhan tu client - chu ky ma client tu khai duoc thi khong phai chu ky.
     *
     * @param disciplineID ID dong trong `Disciplines`.
     * @param decision     'approve' | 'request-change' | 'reopen'.
     * @param note         Bat buoc voi 'request-change'. Tra lai ma khong noi sua
     *                     gi thi nguoi nhan khong lam gi duoc.
     * @returns            JSON { code, fromStatus, toStatus, reviewedBy, reviewedAt, gate }
     */
    action reviewDiscipline(disciplineID : String, decision : String, note : String) returns String;

    /**
     * Xác nhận (Confirm) hoặc hủy xác nhận một ô thông tin do AI parse ra trên một bước D.
     *
     * @param disciplineID ID dòng trong `Disciplines`.
     * @param fieldKey     Tên trường thông tin (ví dụ: 'problem.what', 'team.roster'...).
     * @param confirmed    true = xác nhận; false = hủy xác nhận.
     * @returns            JSON { confirmedFields: string[] }
     */
    action confirmDisciplineField(disciplineID : String, fieldKey : String, confirmed : Boolean) returns String;

    /**
     * Cập nhật trạng thái xử lý (workState) của một bước D ('NotStarted' | 'InProgress').
     *
     * Giá trị 'Completed' bị từ chối với mã lỗi 400 vì 'Completed' là trạng thái
     * dẫn xuất khi bước đã được Approved qua cổng duyệt.
     *
     * @param disciplineID ID dòng trong `Disciplines`.
     * @param workState    'NotStarted' | 'InProgress'.
     * @returns            JSON { workState: string }
     */
    action setDisciplineWorkState(disciplineID : String, workState : String) returns String;

    /** Vet duyet cua mot report, moi nhat truoc. Nguon cho panel audit tren UI. */
    function getReviewTrail(reportID : String) returns String;

    /**
     * Danh sách toàn bộ bằng chứng hoàn thành của một report (không kèm content).
     * Phục vụ hiển thị trên tab Evidence của panel lưu trữ.
     */
    @(requires: ['admin', 'Admin', 'Auditor', 'User', 'authenticated-user'])
    function listTaskEvidence(reportID : String) returns String;

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
