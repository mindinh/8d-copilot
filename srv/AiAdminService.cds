using { cnma.aicore.integrate as aicore } from '@cnma/sap-aicore-integrate/db/schema';

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
}
