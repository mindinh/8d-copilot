import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
    getProfileCriteria, getProfiles, getSourceFieldCatalog, getStepBindings,
    saveRetrievalProfile, STEP_CODES,
    type ProfileCriterion, type RetrievalProfile, type SourceFieldInfo, type StepBinding,
} from '@/services/retrieval-service';

/**
 * Trạng thái của trang Object Schema.
 *
 * ── Ranh giới với tab Similarity của từng bước D ──
 * Trang này định nghĩa profile so NHỮNG FIELD NÀO. Tab Similarity của từng bước
 * chỉnh trọng số, cách so, sàn cosine và ngưỡng — tức là những field đó nặng nhẹ
 * ra sao với riêng bước đó.
 *
 * Ranh giới này không phải sở thích trình bày. Cùng một profile phục vụ nhiều
 * bước, và trọng số là thứ khác nhau giữa các bước; còn bộ field thì không. Trộn
 * hai thứ vào một màn hình nghĩa là mỗi lần kéo thêm một field ở đây sẽ ghi đè
 * trọng số mà ai đó vừa chỉnh ở tab kia — âm thầm. Xem `criteriaFields` trong
 * `profileRepository.saveProfile`.
 *
 * ── Vì sao có bản nháp thay vì ghi thẳng ──
 * Kéo field và gán bước D chỉ có nghĩa CÙNG NHAU: gán một bước cho profile chưa
 * có field nào là để bước đó không tìm ra tiền lệ nào. Sửa trên bản nháp rồi gửi
 * trạng thái mong muốn trong MỘT lượt thì không có khoảnh khắc nửa vời nào.
 */

/** Bản nháp của một profile — đúng những gì Save sẽ gửi đi. */
export interface ProfileDraft {
    label: string;
    description: string;
    /**
     * Field của profile. Giữ nguyên `ProfileCriterion` để hiện được tham số chấm
     * điểm ở dạng CHỈ ĐỌC — người dùng cần thấy field này đang nặng bao nhiêu để
     * biết bỏ nó ra thì mất gì. Save chỉ gửi phần định danh.
     */
    fields: ProfileCriterion[];
    /** Bước D trỏ vào profile này. Một bước chỉ nằm trong đúng một profile. */
    steps: string[];
}

export interface ObjectSchemaState {
    catalog: SourceFieldInfo[];
    catalogCaseCount: number;
    profiles: RetrievalProfile[];
    loading: boolean;
    saving: boolean;

    activeProfileKey: string;
    selectProfile: (key: string) => void;
    activeProfile: RetrievalProfile | null;

    draft: ProfileDraft | null;
    setDraft: (patch: Partial<ProfileDraft>) => void;
    dirty: boolean;
    /** Lý do chưa lưu được, hoặc null khi hợp lệ. */
    blockingError: string | null;

    /** Field trong danh mục chưa được bản nháp dùng — nguồn của panel trái. */
    availableFields: SourceFieldInfo[];
    fieldByPath: Map<string, SourceFieldInfo>;
    /** Bước D → profile đang giữ nó trên SERVER. Để cảnh báo khi cướp bước. */
    ownerByStep: Record<string, string>;
    /** Số field của từng profile — panel danh sách cần, và nó là số của trang này. */
    fieldCountByProfile: Record<string, number>;

    save: () => Promise<void>;
    discard: () => void;
    /** Nạp lại từ server; truyền khoá để mở luôn profile vừa tạo. */
    reload: (selectKey?: string) => Promise<void>;
}

function toDraft(
    profile: RetrievalProfile,
    criteria: ProfileCriterion[],
    bindings: StepBinding[],
): ProfileDraft {
    return {
        label: profile.label ?? profile.profileKey,
        description: profile.description ?? '',
        fields: criteria
            .filter((c) => c.profile_profileKey === profile.profileKey)
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
        steps: STEP_CODES.filter((code) =>
            bindings.find((b) => b.stepCode === code)?.profile_profileKey === profile.profileKey),
    };
}

export function useObjectSchema(): ObjectSchemaState {
    const [catalog, setCatalog] = useState<SourceFieldInfo[]>([]);
    const [catalogCaseCount, setCatalogCaseCount] = useState(0);
    const [profiles, setProfiles] = useState<RetrievalProfile[]>([]);
    const [criteria, setCriteria] = useState<ProfileCriterion[]>([]);
    const [bindings, setBindings] = useState<StepBinding[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeProfileKey, setActiveProfileKey] = useState('default');
    const [draft, setDraftState] = useState<ProfileDraft | null>(null);

    const reload = useCallback(async (selectKey?: string) => {
        const [cat, p, c, b] = await Promise.all([
            getSourceFieldCatalog(), getProfiles(), getProfileCriteria(), getStepBindings(),
        ]);
        setCatalog(cat.fields ?? []);
        setCatalogCaseCount(cat.caseCount ?? 0);
        setProfiles(p);
        setCriteria(c);
        setBindings(b);

        // Profile đang mở vừa bị xoá ⇒ về bộ đầu tiên. Không làm thì panel giữa
        // trống trơn và không có gì nói vì sao.
        const wanted = selectKey ?? activeProfileKey;
        const target = p.find((row) => row.profileKey === wanted) ?? p[0] ?? null;
        if (target) {
            setActiveProfileKey(target.profileKey);
            setDraftState(toDraft(target, c, b));
        } else {
            setDraftState(null);
        }
    }, [activeProfileKey]);

    useEffect(() => {
        reload()
            .catch((e: any) => toast.error(`Could not load object schema: ${e.message}`))
            .finally(() => setLoading(false));
        // Chạy đúng một lần lúc mở trang. `reload` phụ thuộc `activeProfileKey`,
        // đưa nó vào deps sẽ nạp lại mỗi lần đổi profile và xoá mất bản nháp.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const serverDraft = useMemo(() => {
        const profile = profiles.find((p) => p.profileKey === activeProfileKey);
        return profile ? toDraft(profile, criteria, bindings) : null;
    }, [profiles, criteria, bindings, activeProfileKey]);

    /**
     * So phần Save THẬT SỰ gửi đi, không so cả bản nháp.
     *
     * `fields` mang theo trọng số chỉ để hiển thị; đưa chúng vào phép so sẽ báo
     * "chưa lưu" mỗi khi tab Similarity đổi một con số, và nút Save sẽ mời người
     * dùng ghi đè đúng thứ vừa đổi.
     */
    const saveShape = useCallback((d: ProfileDraft) => JSON.stringify({
        label: d.label,
        description: d.description,
        fields: d.fields.map((f) => f.criterionKey),
        steps: d.steps,
    }), []);

    const dirty = useMemo(
        () => Boolean(draft && serverDraft && saveShape(draft) !== saveShape(serverDraft)),
        [draft, serverDraft, saveShape],
    );

    const setDraft = useCallback((patch: Partial<ProfileDraft>) => {
        setDraftState((current) => (current ? { ...current, ...patch } : current));
    }, []);

    const selectProfile = useCallback((key: string) => {
        if (key === activeProfileKey) return;
        if (dirty && !window.confirm('Discard unsaved changes to current profile?')) return;
        const profile = profiles.find((p) => p.profileKey === key);
        if (!profile) return;
        setActiveProfileKey(key);
        setDraftState(toDraft(profile, criteria, bindings));
    }, [activeProfileKey, dirty, profiles, criteria, bindings]);

    const discard = useCallback(() => {
        if (serverDraft) setDraftState(serverDraft);
    }, [serverDraft]);

    /**
     * Prevent invalid states from saving.
     */
    const blockingError = useMemo(() => {
        if (!draft) return null;
        if (!draft.label.trim()) return 'Profile must have a label.';
        if (draft.steps.length && !draft.fields.length) {
            return `Profile is assigned to ${draft.steps.join(', ')} but contains no fields — these steps will never match any precedent.`;
        }
        return null;
    }, [draft]);

    const save = useCallback(async () => {
        if (!draft || blockingError) return;
        setSaving(true);
        try {
            await saveRetrievalProfile(activeProfileKey, {
                label: draft.label,
                description: draft.description,
                criteriaFields: draft.fields.map((f) => ({
                    criterionKey: f.criterionKey,
                    label: f.label,
                    description: f.description,
                    sourceTable: f.sourceTable,
                    sourceField: f.sourceField,
                    matchType: f.matchType,
                })),
                steps: draft.steps,
            });
            await reload(activeProfileKey);
            toast.success(`Saved profile "${draft.label}".`);
        } catch (e: any) {
            toast.error(`Save failed: ${e?.response?.data?.error?.message ?? e.message}`);
        } finally {
            setSaving(false);
        }
    }, [draft, blockingError, activeProfileKey, reload]);

    const fieldByPath = useMemo(() => new Map(catalog.map((f) => [f.path, f])), [catalog]);

    const availableFields = useMemo(() => {
        // So theo `sourceField`, không theo `criterionKey`: hai tiêu chí khác tên
        // vẫn có thể trỏ vào cùng một field, và lúc đó field đó ĐÃ được dùng.
        const used = new Set((draft?.fields ?? []).map((c) => c.sourceField ?? ''));
        return catalog.filter((f) => !used.has(f.path));
    }, [catalog, draft]);

    const fieldCountByProfile = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const c of criteria) {
            counts[c.profile_profileKey] = (counts[c.profile_profileKey] ?? 0) + 1;
        }
        // Profile đang mở đếm theo BẢN NHÁP: kéo một field ra rồi vẫn thấy con số
        // cũ ở panel bên cạnh là hai chỗ nói hai chuyện về cùng một profile.
        if (draft) counts[activeProfileKey] = draft.fields.length;
        return counts;
    }, [criteria, draft, activeProfileKey]);

    const ownerByStep = useMemo(
        () => Object.fromEntries(
            STEP_CODES.map((code) => [
                code,
                bindings.find((b) => b.stepCode === code)?.profile_profileKey ?? 'default',
            ]),
        ),
        [bindings],
    );

    return {
        catalog,
        catalogCaseCount,
        profiles,
        loading,
        saving,
        activeProfileKey,
        selectProfile,
        activeProfile: profiles.find((p) => p.profileKey === activeProfileKey) ?? null,
        draft,
        setDraft,
        dirty,
        blockingError,
        availableFields,
        fieldByPath,
        ownerByStep,
        fieldCountByProfile,
        save,
        discard,
        reload,
    };
}
