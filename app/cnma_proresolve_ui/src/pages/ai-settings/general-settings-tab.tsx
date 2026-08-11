import { useEffect, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@cnma/react-ui';
import { AiModelSelection, AiAgentConfigJson } from '@cnma/sap-aicore-integrate/react';
import { aiModelApi, getGlobalAiConfig, updateGlobalAiConfig } from '@/services/ai-model-service';

/**
 * Tab "General Settings" — chọn model cho từng bước xử lý.
 *
 * Hai component của CDK bên dưới đều điều khiển bằng react-hook-form: chúng đọc
 * và ghi field `aiAgentConfig` qua `useFormContext`. Vì vậy trang phải bọc chúng
 * trong `FormProvider`, và tự lo việc nạp / lưu.
 *
 *   AiModelSelection  — mỗi activity đã đăng ký một dòng chọn model
 *   AiAgentConfigJson — chỉnh trực tiếp JSON, cho khoá mà form chưa có ô riêng
 *
 * Danh sách activity lấy từ registry của CDK, đăng ký ở src/config/ai-registry.ts.
 */

interface AiConfigForm {
    aiAgentConfig: string;
}

/** Cấu hình rỗng: chỉ đặt model mặc định, chưa ghi đè activity nào. */
const EMPTY_CONFIG = JSON.stringify({ model: 'gemini-2.5-pro' }, null, 2);

export function GeneralSettingsTab() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const form = useForm<AiConfigForm>({ defaultValues: { aiAgentConfig: EMPTY_CONFIG } });

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const raw = await getGlobalAiConfig();
                if (cancelled) return;
                // Server trả '{}' khi chưa có gì — hiện mặc định để admin thấy
                // model nào đang chạy, thay vì một object rỗng chẳng nói gì.
                const pretty =
                    raw && raw !== '{}' ? JSON.stringify(JSON.parse(raw), null, 2) : EMPTY_CONFIG;
                form.reset({ aiAgentConfig: pretty });
            } catch (e: any) {
                if (!cancelled) toast.error(`Could not load configuration: ${e.message}`);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // form.reset ổn định giữa các lần render — cố ý chỉ chạy một lần.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onSubmit = async (values: AiConfigForm) => {
        setSaving(true);
        try {
            const saved = await updateGlobalAiConfig(values.aiAgentConfig);
            form.reset({ aiAgentConfig: JSON.stringify(JSON.parse(saved), null, 2) });
            toast.success('AI configuration saved');
        } catch (e: any) {
            // Server từ chối JSON hỏng bằng 400 — hiện đúng thông báo của nó.
            const message = e?.response?.data?.error?.message ?? e.message;
            toast.error(`Save failed: ${message}`);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                Loading configuration…
            </div>
        );
    }

    return (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <Card>
                    <CardHeader>
                        <CardTitle>Model per processing step</CardTitle>
                        <CardDescription>
                            Each step can run on a different model. Leave a step empty to inherit
                            the default on the first row. With nothing configured, everything runs
                            on <span className="font-mono">gemini-2.5-pro</span>.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <AiModelSelection api={aiModelApi} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Raw configuration (JSON)</CardTitle>
                        <CardDescription>
                            For keys that have no dedicated field above — for example{' '}
                            <span className="font-mono">maxIterations</span> or{' '}
                            <span className="font-mono">&lt;activity&gt;ThinkingBudget</span>.
                            Editing here and editing above change the same data.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <AiAgentConfigJson rows={12} />
                    </CardContent>
                </Card>

                <div className="flex justify-end gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={saving}
                        onClick={() => form.reset()}
                    >
                        Discard
                    </Button>
                    <Button type="submit" disabled={saving}>
                        {saving ? 'Saving…' : 'Save configuration'}
                    </Button>
                </div>
            </form>
        </FormProvider>
    );
}
