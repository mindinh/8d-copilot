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

    /** Vết đề xuất AI đã hiện / được nhận / bị từ chối. Chỉ đọc. */
    @readonly
    entity SuggestionAudit as projection on ns.SuggestionAudit;

    /**
     * Chấm thử hai case với cấu hình HIỆN TẠI, không chạy pipeline.
     *
     * Có mặt để admin chỉnh trọng số rồi thấy ngay hệ quả. Không có nó thì cách
     * duy nhất để biết một thay đổi làm gì là chạy cả lượt phân tích AI.
     *
     * Trả JSON `ScoreResult` kèm `breakdown` từng tiêu chí.
     */
    @requires: ['admin', 'Admin']
    function previewScore(caseA : String, caseB : String) returns String;

    /**
     * Ghi lại mặc định cho cấu hình tìm tiền lệ.
     *
     * @param scope 'criteria' | 'settings' | 'prompts' | 'all'
     */
    @requires: ['admin', 'Admin']
    action resetRetrievalConfig(scope : String) returns String;
}
