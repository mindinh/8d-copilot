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
}
