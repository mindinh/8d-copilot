import { Tabs, TabsContent, TabsList, TabsTrigger } from '@cnma/react-ui';
import { AiModelManagementPage } from '@cnma/sap-aicore-integrate/react';
import { SlidersHorizontal, GitCompare, MessageSquareCode, Cpu } from 'lucide-react';
import { aiModelApi } from '@/services/ai-model-service';
import { GeneralSettingsTab } from './general-settings-tab';
import { SimilarityTab } from './similarity-tab';
import { StepPromptsTab } from './step-prompts-landing';

/**
 * Trang cấu hình AI — gom theo CHỦ ĐỀ.
 *
 *   General Settings — chọn model cho từng bước xử lý
 *   Similarity       — tiêu chí chấm điểm tiền lệ, ngưỡng, vector search
 *   Step Prompts     — hướng dẫn cho từng discipline D1–D8
 *   Model Registry   — đồng bộ từ AI Core, bật/tắt, giới hạn theo activity
 *
 * Trang /workflow trình bày CÙNG những mảnh này nhưng theo thứ tự quy trình 8D,
 * kèm giải thích mỗi bước phục vụ gì. Hai trang dùng chung `useRetrievalConfig`
 * và chung các section trong `sections/`, nên không thể lệch nhau.
 *
 * Giữ cả hai có chủ đích: trang này để người đã quen tìm nhanh một ô cần sửa;
 * trang Workflow để người mới hiểu vì sao ô đó tồn tại.
 */
export function AiSettingsPage() {
    return (
        <div className="p-6 w-full min-w-0 space-y-5">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">AI Settings</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    How the 8D pipeline finds comparable cases and drafts the eight disciplines — and
                    which parts of it you can change.
                </p>
            </div>

            <Tabs defaultValue="general">
                <TabsList className="inline-flex h-auto items-center justify-start rounded-xl bg-muted dark:bg-muted/80 p-1.5 text-muted-foreground border-0 shadow-none gap-1">
                    <TabsTrigger
                        value="general"
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all border-0 border-b-0 -mb-0 text-muted-foreground hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:shadow-sm data-[state=active]:border-0 data-[state=active]:border-b-0"
                    >
                        <SlidersHorizontal className="h-4 w-4 mr-2 shrink-0 text-current" />
                        General Settings
                    </TabsTrigger>
                    <TabsTrigger
                        value="similarity"
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all border-0 border-b-0 -mb-0 text-muted-foreground hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:shadow-sm data-[state=active]:border-0 data-[state=active]:border-b-0"
                    >
                        <GitCompare className="h-4 w-4 mr-2 shrink-0 text-current" />
                        Similarity
                    </TabsTrigger>
                    <TabsTrigger
                        value="prompts"
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all border-0 border-b-0 -mb-0 text-muted-foreground hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:shadow-sm data-[state=active]:border-0 data-[state=active]:border-b-0"
                    >
                        <MessageSquareCode className="h-4 w-4 mr-2 shrink-0 text-current" />
                        Step Prompts
                    </TabsTrigger>
                    <TabsTrigger
                        value="models"
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all border-0 border-b-0 -mb-0 text-muted-foreground hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:shadow-sm data-[state=active]:border-0 data-[state=active]:border-b-0"
                    >
                        <Cpu className="h-4 w-4 mr-2 shrink-0 text-current" />
                        Model Registry
                    </TabsTrigger>
                </TabsList>

                {/*
                 * Keep every settings panel mounted. Model sync can take tens of seconds;
                 * unmounting sibling panels made them discard their loaded data and show a
                 * blocking loader again whenever the user changed tabs during the sync.
                 */}
                <TabsContent
                    value="general"
                    forceMount
                    className="mt-5 data-[state=inactive]:hidden"
                >
                    <GeneralSettingsTab />
                </TabsContent>

                <TabsContent
                    value="similarity"
                    forceMount
                    className="mt-5 data-[state=inactive]:hidden"
                >
                    <SimilarityTab />
                </TabsContent>

                <TabsContent
                    value="prompts"
                    forceMount
                    className="mt-5 data-[state=inactive]:hidden"
                >
                    <StepPromptsTab />
                </TabsContent>

                {/*
                 * AiModelManagementPage của CDK không có khung hay padding ở tầng
                 * ngoài cùng — nó render thẳng bảng và empty state. Không bọc thì
                 * nội dung dính sát mép tab.
                 */}
                <TabsContent
                    value="models"
                    forceMount
                    className="mt-5 data-[state=inactive]:hidden"
                >
                    <div className="rounded-lg border bg-card p-6">
                        <AiModelManagementPage api={aiModelApi} />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}

export default AiSettingsPage;
