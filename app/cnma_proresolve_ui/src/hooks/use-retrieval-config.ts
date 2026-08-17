import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
    getCriteria, getLibraryCases, getSettings,
    type LibraryCase, type RetrievalSettings, type SimilarityCriterion,
} from '@/services/retrieval-service';

/**
 * Trạng thái cấu hình tìm tiền lệ, dùng chung cho AI Settings và trang Workflow.
 *
 * ── Vì sao gom vào một hook ──
 * Hai trang hiển thị CÙNG một cấu hình theo hai cách sắp xếp khác nhau: một bên
 * nhóm theo chủ đề, một bên đi theo thứ tự quy trình. Nếu mỗi trang tự quản lý
 * state thì sớm muộn chúng lệch nhau — sửa ở trang này, trang kia vẫn hiện số cũ.
 *
 * ── Vì sao mọi thao tác ghi đều nạp lại cả bộ ──
 * Trần điểm phụ thuộc MỌI tiêu chí đang bật, nên đổi một dòng là đổi con số của
 * cả bảng. Cập nhật cục bộ sẽ cho ra một trần sai mà nhìn không biết.
 */
export interface RetrievalConfigState {
    criteria: SimilarityCriterion[];
    settings: RetrievalSettings | null;
    cases: LibraryCase[];
    loading: boolean;
    /** Khoá đang được ghi, hoặc null. Dùng để vô hiệu hoá đúng chỗ đang bận. */
    busy: string | null;
    reload: () => Promise<void>;
    /** Chạy một thao tác ghi rồi nạp lại; lỗi thì báo và nạp lại để bỏ thay đổi hỏng. */
    run: (key: string, fn: () => Promise<unknown>) => Promise<void>;

    // ── Số liệu dẫn xuất, tính một chỗ để hai trang không lệch nhau ──
    maxScore: number;
    enabledCount: number;
    embeddedCount: number;
    notEmbedded: number;
    embeddingModel: string | null;
    hasVectorStep: boolean;
}

export function useRetrievalConfig(): RetrievalConfigState {
    const [criteria, setCriteria] = useState<SimilarityCriterion[]>([]);
    const [settings, setSettings] = useState<RetrievalSettings | null>(null);
    const [cases, setCases] = useState<LibraryCase[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);

    const reload = useCallback(async () => {
        const [c, s, l] = await Promise.all([getCriteria(), getSettings(), getLibraryCases()]);
        setCriteria(c);
        setSettings(s);
        setCases(l);
    }, []);

    useEffect(() => {
        reload()
            .catch((e: any) => toast.error(`Could not load retrieval configuration: ${e.message}`))
            .finally(() => setLoading(false));
    }, [reload]);

    const run = useCallback(async (key: string, fn: () => Promise<unknown>) => {
        setBusy(key);
        try {
            await fn();
            await reload();
        } catch (e: any) {
            toast.error(`Save failed: ${e?.response?.data?.error?.message ?? e.message}`);
            // Nạp lại kể cả khi lỗi: ô nhập đang giữ giá trị người dùng vừa gõ,
            // mà DB thì không nhận — để nguyên là hiện một trạng thái không có thật.
            await reload().catch(() => undefined);
        } finally {
            setBusy(null);
        }
    }, [reload]);

    const enabled = criteria.filter((c) => c.enabled);
    const embedded = cases.filter((c) => c.embeddingModel);

    return {
        criteria,
        settings,
        cases,
        loading,
        busy,
        reload,
        run,
        maxScore: enabled.reduce((s, c) => s + (c.weight ?? 0), 0),
        enabledCount: enabled.length,
        embeddedCount: embedded.length,
        notEmbedded: cases.length - embedded.length,
        embeddingModel: embedded[0]?.embeddingModel ?? null,
        hasVectorStep: enabled.some((c) => c.matchType === 'cosine'),
    };
}
