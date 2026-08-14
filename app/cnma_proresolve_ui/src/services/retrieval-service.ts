import axiosInstance from './core/axios-instance';

/**
 * Cấu hình tìm tiền lệ: tiêu chí chấm điểm, ngưỡng, và prompt từng bước D.
 *
 * Đi qua axios instance dùng chung để có CSRF token — sau approuter của BTP
 * (bật `csrfProtection`) thì mọi PATCH và POST không có token đều trả 403.
 */

const AI = '/api/cnma/AI_SRV';
const EIGHTD = '/api/cnma/EIGHTD_SRV';

/** CAP gói kết quả action trong `value` dưới dạng chuỗi JSON. */
function unwrapAction<T>(data: unknown): T {
    const raw = data && typeof data === 'object' && 'value' in (data as any)
        ? (data as any).value
        : data;
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as T;
}

/** Collection OData: `value` là MẢNG bản ghi, không phải chuỗi JSON. */
function unwrapList<T>(data: unknown): T[] {
    return ((data as any)?.value ?? []) as T[];
}

// ─────────────────────────────────────────────────────────────────────────────

export interface SimilarityCriterion {
    criterionKey: string;
    label: string;
    description: string | null;
    sourceTable: string | null;
    sourceField: string | null;
    matchType: string;
    weight: number;
    fallbackField: string | null;
    fallbackMatch: string | null;
    fallbackWeight: number | null;
    minSimilarity: number | null;
    enabled: boolean;
    sortOrder: number;
}

export interface RetrievalSettings {
    ID: string;
    minScore: number;
    topN: number;
    closedOnly: boolean;
}

export interface StepPrompt {
    stepCode: string;
    label: string;
    description: string | null;
    systemPrompt: string | null;
    userTemplate: string | null;
    enabled: boolean;
    version: number;
}

export interface ScoreBreakdown {
    criterionKey: string;
    label: string;
    level: 'exact' | 'fallback' | 'none';
    matchedOn: string | null;
    points: number;
    maxPoints: number;
}

export interface ScorePreview {
    caseA?: { notificationId: string; symptomShortText: string | null };
    caseB?: { notificationId: string; symptomShortText: string | null };
    score: number;
    maxScore: number;
    breakdown: ScoreBreakdown[];
    explanation: string;
    error?: string;
}

export interface EmbedReport {
    model: string;
    embedded: number;
    skipped: number;
    failed: number;
    total: number;
    error?: string;
}

export interface LibraryCase {
    notificationId: string;
    symptomShortText: string | null;
    sapStatus: string | null;
    embeddingModel: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function getCriteria(): Promise<SimilarityCriterion[]> {
    const res = await axiosInstance.get(`${AI}/SimilarityCriteria?$orderby=sortOrder`);
    return unwrapList<SimilarityCriterion>(res.data);
}

export async function updateCriterion(
    key: string,
    patch: Partial<SimilarityCriterion>,
): Promise<void> {
    await axiosInstance.patch(`${AI}/SimilarityCriteria(criterionKey='${key}')`, patch);
}

export async function createCriterion(row: Partial<SimilarityCriterion>): Promise<void> {
    await axiosInstance.post(`${AI}/SimilarityCriteria`, row);
}

export async function deleteCriterion(key: string): Promise<void> {
    await axiosInstance.delete(`${AI}/SimilarityCriteria(criterionKey='${key}')`);
}

/**
 * Đổi chỗ hai bước.
 *
 * Ghi tuần tự chứ không song song: cả hai lệnh PATCH đi vào cùng một bảng, và
 * driver SQLite của CAP chỉ có một connection — bắn song song thì lệnh thứ hai
 * xếp hàng sau lệnh thứ nhất mà vẫn nằm trong transaction của nó.
 */
export async function swapCriterionOrder(
    a: SimilarityCriterion,
    b: SimilarityCriterion,
): Promise<void> {
    await updateCriterion(a.criterionKey, { sortOrder: b.sortOrder });
    await updateCriterion(b.criterionKey, { sortOrder: a.sortOrder });
}

/**
 * Cột trên `HistoricalCases` đem ra so được.
 *
 * Danh sách cứng có chủ đích: người dùng gõ tự do một tên cột không tồn tại thì
 * tiêu chí lặng lẽ không bao giờ ăn điểm — không lỗi, không cảnh báo, chỉ là
 * mãi 0 điểm.
 */
export const COMPARABLE_FIELDS = [
    { field: 'workCenterId', label: 'Work centre', note: 'Nơi sản xuất' },
    { field: 'defectCode', label: 'Defect code', note: 'Mã lỗi trong danh mục' },
    { field: 'defectKeywords', label: 'Defect keywords', note: 'Từ khoá đã tách từ mô tả lỗi' },
    { field: 'materialId', label: 'Material', note: 'Mã vật tư' },
    { field: 'materialFamily', label: 'Material group', note: 'Nhóm vật tư (MATKL)' },
    { field: 'batchId', label: 'Batch', note: 'Số lô' },
    { field: 'rootCauseCategory', label: 'Root cause category', note: 'Nhánh Ishikawa' },
    { field: 'origin', label: 'Origin', note: 'Q1 khiếu nại / Q3 nội bộ' },
    { field: 'fmeaId', label: 'FMEA', note: 'Liên kết FMEA' },
    { field: 'embedding', label: 'Case narrative (vector)', note: 'Chỉ dùng với phương pháp cosine' },
] as const;

/** Phương pháp so khớp CÓ nhánh xử lý trong `scoring.ts`. */
export const MATCH_METHODS = [
    {
        value: 'exact',
        label: 'Exact',
        hint: 'So bằng, đã cắt khoảng trắng và bỏ qua hoa thường. Rỗng không khớp rỗng.',
    },
    {
        value: 'keyword',
        label: 'Keyword',
        hint: 'Trùng ít nhất một từ khoá sau khi bỏ từ nối và từ ngắn.',
    },
    {
        value: 'cosine',
        label: 'Vector',
        hint: 'Độ gần ngữ nghĩa giữa hai đoạn mô tả. Điểm = trọng số × cosine.',
    },
] as const;

export async function getSettings(): Promise<RetrievalSettings | null> {
    const res = await axiosInstance.get(`${AI}/RetrievalSettings`);
    return unwrapList<RetrievalSettings>(res.data)[0] ?? null;
}

export async function updateSettings(patch: Partial<RetrievalSettings>): Promise<void> {
    await axiosInstance.patch(`${AI}/RetrievalSettings(ID='GLOBAL')`, patch);
}

export async function previewScore(caseA: string, caseB: string): Promise<ScorePreview> {
    const a = encodeURIComponent(caseA);
    const b = encodeURIComponent(caseB);
    const res = await axiosInstance.get(`${AI}/previewScore(caseA='${a}',caseB='${b}')`);
    return unwrapAction<ScorePreview>(res.data);
}

export async function resetRetrievalConfig(scope: 'criteria' | 'settings' | 'prompts' | 'all') {
    const res = await axiosInstance.post(`${AI}/resetRetrievalConfig`, { scope });
    return unwrapAction<unknown>(res.data);
}

// ── Prompt từng bước D ───────────────────────────────────────────────────────

export async function getStepPrompts(): Promise<StepPrompt[]> {
    const res = await axiosInstance.get(`${AI}/StepPrompts?$orderby=stepCode`);
    return unwrapList<StepPrompt>(res.data);
}

export async function updateStepPrompt(
    stepCode: string,
    patch: Partial<StepPrompt>,
): Promise<void> {
    await axiosInstance.patch(`${AI}/StepPrompts(stepCode='${stepCode}')`, patch);
}

// ── Kho case ─────────────────────────────────────────────────────────────────

export async function getLibraryCases(): Promise<LibraryCase[]> {
    // `$select` bỏ hẳn cột `embedding` — mỗi vector ~30 KB, kéo cả kho về chỉ để
    // đổ vào một ô chọn là tự làm chậm trang mà không được gì.
    const select = encodeURIComponent('notificationId,symptomShortText,sapStatus,embeddingModel');
    const orderby = encodeURIComponent('notificationId');
    const res = await axiosInstance.get(
        `${EIGHTD}/HistoricalCases?$select=${select}&$orderby=${orderby}`,
    );
    return unwrapList<LibraryCase>(res.data);
}

export async function embedLibrary(force = false): Promise<EmbedReport> {
    const res = await axiosInstance.post(`${EIGHTD}/embedCaseLibrary`, { force });
    return unwrapAction<EmbedReport>(res.data);
}
