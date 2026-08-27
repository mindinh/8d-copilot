import { Button, cn } from '@cnma/react-ui';

export type StepEditorTab = 'data' | 'prompt' | 'form' | 'constraints' | 'similarity';

const TABS: Array<{ id: StepEditorTab; label: string }> = [
    { id: 'data', label: 'Data schema' },
    { id: 'prompt', label: 'Prompt guide' },
    { id: 'form', label: 'Form editor' },
    { id: 'constraints', label: 'Constraints' },
    // Tìm tiền lệ đứng TRƯỚC bốn tab kia về mặt thời gian — nó quyết định bước
    // này nhìn thấy case nào. Đặt cuối vì bốn tab kia mới là thứ được sửa hằng
    // ngày; tab này sửa một lần rồi để yên.
    { id: 'similarity', label: 'Similarity search' },
];

interface StepEditorTabNavigationProps {
    activeTab: StepEditorTab;
    onTabChange: (tab: StepEditorTab) => void;
    /**
     * Tab được phép hiện. Bỏ trống ⇒ tất cả.
     *
     * Bước chưa có cấu hình cấu trúc VẪN tìm tiền lệ — nên nó mở đúng tab
     * Similarity thay vì bị chặn khỏi cả trang.
     */
    availableTabs?: readonly StepEditorTab[];
    /**
     * Tab bị khoá kèm LÝ DO, ví dụ D6 không có Prompt guide vì bước đó không gọi
     * model. Khoá kèm lý do chứ không ẩn đi: một tab biến mất trông như lỗi hoặc
     * như tính năng chưa làm, và người dùng sẽ đi tìm nó. Một tab xám có
     * tooltip thì trả lời luôn câu hỏi tại sao.
     */
    disabledTabs?: Partial<Record<StepEditorTab, string>>;
}

export function StepEditorTabNavigation({
    activeTab, onTabChange, availableTabs, disabledTabs,
}: StepEditorTabNavigationProps) {
    const visible = availableTabs ? TABS.filter((tab) => availableTabs.includes(tab.id)) : TABS;

    return <div className="shrink-0 border-b bg-primary-foreground px-2 py-1.5">
        <div className="flex items-center gap-0 overflow-x-auto">
            {visible.map((tab) => {
                const disabledReason = disabledTabs?.[tab.id];
                return <Button
                    key={tab.id}
                    type="button"
                    variant="ghost"
                    disabled={Boolean(disabledReason)}
                    title={disabledReason}
                    onClick={() => onTabChange(tab.id)}
                    className={cn(
                        'relative whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/60',
                        activeTab === tab.id && 'text-primary',
                        disabledReason && 'opacity-40 hover:bg-transparent',
                    )}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                >
                    {tab.label}
                    {activeTab === tab.id && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />}
                </Button>;
            })}
        </div>
    </div>;
}
