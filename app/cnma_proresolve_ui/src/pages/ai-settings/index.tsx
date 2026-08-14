import { Tabs, TabsContent, TabsList, TabsTrigger } from '@cnma/react-ui';
import { AiModelManagementPage } from '@cnma/sap-aicore-integrate/react';
import { aiModelApi } from '@/services/ai-model-service';
import { GeneralSettingsTab } from './general-settings-tab';
import { SimilarityTab } from './similarity-tab';
import { StepPromptsTab } from './step-prompts-tab';

/**
 * Trang cấu hình AI.
 *
 *   General Settings — chọn model cho từng bước xử lý (tab mặc định)
 *   Similarity       — tiêu chí chấm điểm tiền lệ, ngưỡng, vector search
 *   Step Prompts     — prompt của từng bước D1–D8
 *   Model Registry   — đồng bộ từ AI Core, bật/tắt, giới hạn theo activity
 *
 * Model Registry do CDK cung cấp nguyên trang. Ba tab còn lại là của dự án, vì
 * việc lưu cấu hình ở đâu là chuyện của ứng dụng — CDK chỉ cho component, không
 * cho chỗ lưu.
 */
export function AiSettingsPage() {
    return (
        <div className="p-6 space-y-5">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">AI Settings</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Choose which model runs each processing step, and manage the model registry
                    synced from SAP AI Core.
                </p>
            </div>

            <Tabs defaultValue="general">
                <TabsList>
                    <TabsTrigger value="general">General Settings</TabsTrigger>
                    <TabsTrigger value="similarity">Similarity</TabsTrigger>
                    <TabsTrigger value="prompts">Step Prompts</TabsTrigger>
                    <TabsTrigger value="models">Model Registry</TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="mt-5">
                    <GeneralSettingsTab />
                </TabsContent>

                <TabsContent value="similarity" className="mt-5">
                    <SimilarityTab />
                </TabsContent>

                <TabsContent value="prompts" className="mt-5">
                    <StepPromptsTab />
                </TabsContent>

                {/*
                 * AiModelManagementPage của CDK không có khung hay padding ở tầng
                 * ngoài cùng — nó render thẳng bảng và empty state. Không bọc thì
                 * nội dung dính sát mép tab.
                 */}
                <TabsContent value="models" className="mt-5">
                    <div className="rounded-lg border bg-card p-6">
                        <AiModelManagementPage api={aiModelApi} />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}

export default AiSettingsPage;
