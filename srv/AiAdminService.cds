using { cnma.aicore.integrate as aicore } from '@cnma/sap-aicore-integrate/db/schema';
using { cnma.proresolve as ns } from '../db/schema/schema';

/**
 * Service quản trị AI — backend cho trang cấu hình model của CDK.
 *
 * Ba endpoint dưới đây là đúng những gì `createAiModelApi()` phía React gọi:
 *   GET    AIModels                    → getAIModels()
 *   PATCH  AIModels(<id>)              → updateAIModel()
 *   POST   syncModels()                → syncModels()
 *   GET    getAvailableModels(activity)→ getAvailableModels()
 *
 * Registry model là **toàn subaccount**, không phân vùng theo tenant — nó phản
 * ánh những model có thật trong instance AI Core đang bound.
 */
@path: '/api/cnma/AI_SRV'
@(requires: 'authenticated-user')
service AiAdminService {

    /**
     * Danh mục model nền, đồng bộ từ AI Core bằng action syncModels.
     *
     * Admin chỉnh được `active` và `suitableActivities`; các cột còn lại do
     * discovery ghi đè mỗi lần sync nên sửa tay sẽ mất.
     */
    @restrict: [
        { grant: 'READ',   to: ['admin', 'Admin'] },
        { grant: 'UPDATE', to: ['admin', 'Admin'] }
    ]
    entity AIModels as projection on aicore.AIModels;

    /**
     * Nạp lại danh mục từ AI Core, giữ nguyên phần admin đã chỉnh.
     * Trả JSON `SyncModelsResult`. Không ném lỗi — hỏng thì báo qua trường `error`
     * để UI hiện được mà không phải nuốt stack trace.
     */
    @requires: ['admin', 'Admin']
    action syncModels() returns String;

    /**
     * Các model đang bật mà một activity được phép dùng, đã sắp xếp cho ô chọn.
     * Bỏ trống `activity` thì tắt bộ lọc theo activity.
     * Trả JSON `AvailableModel[]`.
     */
    @requires: ['admin', 'Admin']
    function getAvailableModels(activity: String) returns String;

    // ── Cấu hình chung: model nào chạy cho activity nào ─────────────────────
    // Lưu dưới dạng chuỗi JSON `aiAgentConfig` — đúng định dạng mà component
    // AiModelSelection và AiAgentConfigJson của CDK đọc/ghi.

    /** Trả cấu hình đang lưu, hoặc `{}` khi chưa có gì. */
    @requires: ['admin', 'Admin']
    function getGlobalAiConfig() returns String;

    /**
     * Ghi cấu hình chung và xoá cache của bộ chọn model, để thay đổi có hiệu lực
     * ở lời gọi kế tiếp thay vì phải chờ hết TTL.
     * Ném 400 nếu payload không phải object JSON — một cấu hình hỏng sẽ làm gãy
     * việc chọn model của toàn hệ thống.
     */
    @requires: ['admin', 'Admin']
    action updateGlobalAiConfig(aiAgentConfig: LargeString) returns String;

    // ── Cấu hình tìm tiền lệ ────────────────────────────────────────────────
    // Ba bảng này là những gì admin chỉnh trên trang AI Settings: trọng số chấm
    // điểm, ngưỡng + số tiền lệ, và prompt của từng bước D.

    /**
     * Tiêu chí chấm điểm tương đồng — một "pipeline" các bước so khớp.
     *
     * Mở đủ CREATE/UPDATE/DELETE: `scoring.ts` không hard-code danh sách tiêu
     * chí, nó chạy theo `matchType` + `sourceField` đọc từ đây. Nên một bước mới
     * do admin thêm — ví dụ so `batchId` bằng `exact` — chạy được ngay mà không
     * cần đụng code.
     *
     * Giới hạn thật nằm ở `matchType`: chỉ `exact`, `keyword` và `cosine` có
     * nhánh xử lý. Giá trị khác sẽ không bao giờ ăn điểm — UI chỉ cho chọn trong
     * ba giá trị đó.
     */
    @restrict: [
        { grant: 'READ',   to: ['admin', 'Admin'] },
        { grant: 'CREATE', to: ['admin', 'Admin'] },
        { grant: 'UPDATE', to: ['admin', 'Admin'] },
        { grant: 'DELETE', to: ['admin', 'Admin'] }
    ]
    entity SimilarityCriteria as projection on ns.SimilarityCriteria;

    /** Ngưỡng điểm và số tiền lệ lấy ra. Đúng một dòng, khoá 'GLOBAL'. */
    @restrict: [
        { grant: 'READ',   to: ['admin', 'Admin'] },
        { grant: 'UPDATE', to: ['admin', 'Admin'] }
    ]
    entity RetrievalSettings as projection on ns.RetrievalSettings;

    /**
     * Prompt của từng bước D. Để trống `systemPrompt`/`userTemplate` nghĩa là
     * dùng hằng số trong `srv/src/domain/eightd/prompts.ts`.
     */
    @restrict: [
        { grant: 'READ',   to: ['admin', 'Admin'] },
        { grant: 'UPDATE', to: ['admin', 'Admin'] }
    ]
    entity StepPrompts as projection on ns.StepPrompts;

    // ── Object Schema: profile chấm điểm theo từng bước D ───────────────────
    // Ba entity dưới đây là backend của trang Object Schema. Xem
    // `db/schema/retrieval-config.cds` để biết vì sao mỗi bước cần một bộ trọng
    // số riêng, và `srv/src/domain/eightd/precedent/profileRepository.ts` để biết
    // ràng buộc mồ côi được chữa ở đâu.

    /**
     * Bộ trọng số có tên. Xoá được trừ profile hệ thống — luật đó nằm ở
     * `deleteRetrievalProfile`, không phải ở đây, vì nó cần kéo ràng buộc về
     * mặc định trong cùng một lượt.
     */
    @restrict: [
        { grant: 'READ',   to: ['admin', 'Admin'] },
        { grant: 'UPDATE', to: ['admin', 'Admin'] }
    ]
    entity RetrievalProfiles as projection on ns.RetrievalProfiles;

    /**
     * Tiêu chí bên trong một profile — đây là thứ panel giữa của Object Schema
     * ghi vào. Mở đủ CREATE/UPDATE/DELETE vì kéo một field từ panel trái sang là
     * tạo một dòng, và kéo ra là xoá.
     */
    @restrict: [
        { grant: 'READ',   to: ['admin', 'Admin'] },
        { grant: 'CREATE', to: ['admin', 'Admin'] },
        { grant: 'UPDATE', to: ['admin', 'Admin'] },
        { grant: 'DELETE', to: ['admin', 'Admin'] }
    ]
    entity ProfileCriteria as projection on ns.ProfileCriteria;

    /** Bước D nào chạy profile nào. Đúng tám dòng; chỉ đổi được profile. */
    @restrict: [
        { grant: 'READ',   to: ['admin', 'Admin'] },
        { grant: 'UPDATE', to: ['admin', 'Admin'] }
    ]
    entity StepRetrievalBindings as projection on ns.StepRetrievalBindings;

    /**
     * Mọi field SAP gửi lên, quét từ payload thật trong kho — nguồn của panel
     * trái trên trang Object Schema.
     *
     * Là function chứ không entity: đây là kết quả suy ra từ dữ liệu, không phải
     * bảng. Dựng thành entity nghĩa là phải đồng bộ nó mỗi lần kho đổi, và bản
     * đồng bộ đó sẽ lệch.
     *
     * Trả JSON `SourceFieldInfo[]`.
     */
    @requires: ['admin', 'Admin']
    function getSourceFieldCatalog() returns String;

    /**
     * Tạo profile mới bằng cách nhân bản một profile đang có.
     *
     * Nhân bản chứ không tạo rỗng: profile không tiêu chí nào không chấm nổi
     * điểm nào, nên "tạo mới" theo nghĩa rỗng luôn cho ra một profile hỏng.
     */
    @requires: ['admin', 'Admin']
    action cloneRetrievalProfile(
        sourceKey   : String,
        profileKey  : String,
        label       : String,
        description : String
    ) returns String;

    /** Xoá profile; bước nào đang trỏ vào thì kéo về `default` trong cùng lượt. */
    @requires: ['admin', 'Admin']
    action deleteRetrievalProfile(profileKey : String) returns String;

    /**
     * Ghi cả profile trong MỘT lượt: cấu hình, bộ tiêu chí, và bước D trỏ vào nó.
     *
     * Màn hình Object Schema sửa ba thứ cùng lúc rồi bấm Save một lần. Gửi từng
     * thay đổi thành một request nghĩa là một lần Save có thể thành công một nửa
     * — tiêu chí đã đổi mà ràng buộc bước thì chưa, và không có đường lùi.
     *
     * `payload` là JSON `{ label, description, minScore, topN, closedOnly,
     * criteria[], steps[] }`. Trường vắng mặt ⇒ giữ nguyên; `criteria` và `steps`
     * có mặt ⇒ THAY THẾ toàn bộ tập cũ.
     */
    @requires: ['admin', 'Admin']
    action saveRetrievalProfile(profileKey : String, payload : LargeString) returns String;

    /** Vết đề xuất AI đã hiện / được nhận / bị từ chối. Chỉ đọc. */
    @readonly
    entity SuggestionAudit as projection on ns.SuggestionAudit;

    /**
     * Chấm thử hai case bằng MỘT profile, không chạy pipeline.
     *
     * Có mặt để admin chỉnh trọng số rồi thấy ngay hệ quả. Không có nó thì cách
     * duy nhất để biết một thay đổi làm gì là chạy cả lượt phân tích AI.
     *
     * `profileKey` trống ⇒ profile mặc định. Bỏ tham số này đi thì ô chấm thử
     * luôn nói về một profile, trong khi tám bước đang chạy nhiều profile — và
     * con số hiện ra sẽ mâu thuẫn với kết quả thật mà không rõ vì sao.
     *
     * Trả JSON `ScoreResult` kèm `breakdown` từng tiêu chí.
     */
    @requires: ['admin', 'Admin']
    function previewScore(caseA : String, caseB : String, profileKey : String) returns String;

    /** Resolve one step's configuration against a sample case without exposing credentials. */
    @requires: ['admin', 'Admin']
    action previewStepConfiguration(stepCode : String, payload : LargeString) returns String;

    /**
     * Kiểm tra một BẢN NHÁP cấu hình bước mà không lưu. Trả
     * `{ valid, error }` — `error` là đúng câu mà lúc Save sẽ báo.
     *
     * ── Vì sao là một lời gọi server, không phải hàm kiểm tra bên trình duyệt ──
     * Yêu cầu R3.2 nói trình duyệt và service phải từ chối GIỐNG HỆT nhau. Viết
     * lại bộ luật đó bằng TypeScript phía UI là tạo ra bản sao thứ hai của cùng
     * một quy tắc, và bản sao thì trôi: sửa một chỗ, quên chỗ kia, rồi UI cho
     * Save đúng thứ service chặn — đúng cái nghịch lý mà yêu cầu muốn diệt.
     *
     * Ở đây gọi thẳng `normalizeStepConfig`, tức là CHÍNH đoạn code chạy lúc
     * Save. Giống nhau do cấu tạo, không do kỷ luật con người. Đổi lấy một
     * round-trip có debounce trên một màn hình admin — rẻ.
     *
     * Khác `previewStepConfiguration`: hàm kia cần một case mẫu để dựng input
     * thật; hàm này chỉ xét bản thân cấu hình, nên gõ tới đâu kiểm tới đó được.
     */
    @requires: ['admin', 'Admin']
    action validateStepConfiguration(
        stepCode        : String,
        inputSchemaJson : LargeString,
        formSchemaJson  : LargeString,
        constraintsJson : LargeString
    ) returns String;

    /**
     * Ghi lại mặc định cho cấu hình tìm tiền lệ.
     *
     * @param scope 'criteria' | 'settings' | 'prompts' | 'all'
     */
    @requires: ['admin', 'Admin']
    action resetRetrievalConfig(scope : String) returns String;
}
