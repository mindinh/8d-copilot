/**
 * Chấm điểm tương đồng giữa hai case — HÀM THUẦN, không chạm DB, không gọi AI.
 *
 * ── Vì sao tách hẳn ra một hàm thuần ──
 * Acceptance criteria của requirement đòi *"recompute the score by hand to
 * confirm the AI's number matches"*. Điều đó chỉ khả thi khi công thức nằm ở
 * đúng một chỗ, không phụ thuộc DB, không phụ thuộc model, và test được bằng hai
 * object thường. Nhúng công thức vào câu SQL là mất luôn khả năng đó.
 *
 * ── Công thức (do requirement định nghĩa, KHÔNG tự đổi) ──
 *     work center trùng                              +4
 *     defect code trùng   +4  · hoặc trùng từ khoá   +2
 *     material trùng      +3  · hoặc cùng họ vật tư  +1
 *     ────────────────────────────────────────────────
 *     tối đa                                          11 · ngưỡng 3
 *
 * Mức dự phòng CHỈ xét khi mức chính trượt. Cộng cả hai sẽ phá trần 11 và phá
 * luôn ví dụ 7/11 mà requirement dùng làm mốc đối chiếu.
 *
 * Trọng số đến từ bảng `SimilarityCriteria` chứ không hằng số hoá ở đây — admin
 * chỉnh trên UI phải có hiệu lực ngay.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Chuẩn hoá
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mã định danh về dạng so sánh được.
 *
 * Dữ liệu SAP đi qua Excel hay nhập tay thường dính khoảng trắng và lẫn hoa
 * thường: `' MAT-10247 '` và `'mat-10247'` là cùng một vật tư. So thô hai chuỗi
 * đó ra sai, và cái sai này im lặng — tiền lệ đúng biến mất mà không ai biết.
 */
export function normalizeId(value: unknown): string {
    return String(value ?? '').trim().toUpperCase();
}

/**
 * Từ bị loại khi tách từ khoá mô tả lỗi.
 *
 * Không có danh sách này thì "Hairline crack near mounting hole" và "Porosity
 * near sealing surface" trùng nhau ở chữ "near" và cùng ăn +2 — một điểm hoàn
 * toàn vô nghĩa. Chỉ liệt kê từ nối và từ đệm; KHÔNG loại từ kỹ thuật.
 */
const STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'into', 'onto', 'near', 'over', 'under',
    'after', 'before', 'during', 'above', 'below', 'between', 'against',
    'this', 'that', 'these', 'those', 'been', 'being', 'have', 'has', 'had',
    'was', 'were', 'are', 'not', 'per', 'due', 'out', 'off',
]);

/** Token ngắn hơn ngần này bị loại — 'in', 'at', 'mm' không phân biệt được gì. */
const MIN_TOKEN_LENGTH = 4;

/**
 * Tách mô tả lỗi thành tập từ khoá đã chuẩn hoá, trả về chuỗi ngăn bằng khoảng trắng.
 *
 * Dùng ở HAI nơi và phải là cùng một hàm:
 *   - lúc nạp kho, để điền `HistoricalCases.defectKeywords`
 *   - lúc chấm điểm, để tách mô tả của case đang mở
 * Hai cách tách khác nhau ở hai đầu là lỗi âm thầm kinh điển: không bao giờ khớp
 * mà cũng không bao giờ báo lỗi.
 *
 * Sắp xếp và khử trùng lặp để chuỗi kết quả tất định — cùng input luôn cùng output.
 */
export function tokenizeDefectText(text: unknown): string {
    const raw = String(text ?? '').toLowerCase();
    const tokens = raw
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(t));
    return [...new Set(tokens)].sort().join(' ');
}

/** Số từ khoá chung giữa hai chuỗi token. */
export function sharedKeywordCount(a: unknown, b: unknown): number {
    const left = new Set(String(a ?? '').split(' ').filter(Boolean));
    if (!left.size) return 0;
    let shared = 0;
    for (const token of String(b ?? '').split(' ')) {
        if (token && left.has(token)) shared++;
    }
    return shared;
}

/** Cần ít nhất ngần này từ khoá chung mới tính là "trùng mô tả". */
const MIN_SHARED_KEYWORDS = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Ngữ nghĩa
// ─────────────────────────────────────────────────────────────────────────────

/** Vector lưu dạng mảng JSON trong DB; ở test thì truyền thẳng mảng số. */
export function parseEmbedding(value: unknown): number[] | null {
    if (Array.isArray(value)) return value as number[];
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        const v = JSON.parse(value);
        return Array.isArray(v) && v.length ? (v as number[]) : null;
    } catch {
        return null;
    }
}

/**
 * Cosine giữa hai vector. `null` khi KHÔNG được phép so.
 *
 * Ba trường hợp trả null, và cả ba đều phải im lặng bỏ qua chứ không được đoán:
 *   - một bên chưa có vector (chưa nhúng)
 *   - hai bên khác số chiều
 *   - hai bên nhúng bằng MODEL KHÁC NHAU — vector của hai model không nằm chung
 *     một không gian; so chúng cho ra con số trông hợp lý nhưng vô nghĩa. Đây là
 *     bẫy số ① trong `docs/8d-vector-search-design.md`.
 */
export function cosineSimilarity(
    a: unknown,
    b: unknown,
    modelA?: string | null,
    modelB?: string | null,
): number | null {
    if (modelA && modelB && modelA !== modelB) return null;

    const va = parseEmbedding(a);
    const vb = parseEmbedding(b);
    if (!va || !vb || va.length !== vb.length) return null;

    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < va.length; i++) {
        dot += va[i] * vb[i];
        na += va[i] * va[i];
        nb += vb[i] * vb[i];
    }
    if (na === 0 || nb === 0) return null;

    // Tự chuẩn hoá thay vì tin là API đã chuẩn hoá sẵn — bẫy số ② trong cùng tài liệu.
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Điểm ngữ nghĩa làm tròn 1 chữ số — đủ để đối chiếu tay, đủ để xếp hạng. */
function round1(n: number): number {
    return Math.round(n * 10) / 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// Kiểu dữ liệu
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Phần tối thiểu của một case cần để chấm điểm.
 *
 * Cố ý KHÔNG dùng `CaseContext` hay entity DB: hàm phải chấm được giữa một case
 * đang mở (từ `CaseContext`) và một case trong kho (từ DB) mà không cần biết
 * bên nào là bên nào.
 */
export interface ScorableCase {
    notificationId: string;
    workCenterId?: string | null;
    defectCode?: string | null;
    /** Chỉ cần khi `defectKeywords` chưa có — hàm sẽ tự tách. */
    defectText?: string | null;
    /** Đã tách sẵn. Kho lịch sử luôn có; case đang mở thì tách lúc gọi. */
    defectKeywords?: string | null;
    materialId?: string | null;
    materialFamily?: string | null;

    /** Vector 1536 chiều — chuỗi JSON từ DB, hoặc mảng số trong test. */
    embedding?: string | number[] | null;
    /** Model đã sinh vector. Khác nhau ⇒ không so, xem `cosineSimilarity`. */
    embeddingModel?: string | null;
}

/** Một tiêu chí, đúng hình dạng của entity `SimilarityCriteria`. */
export interface Criterion {
    criterionKey: string;
    label: string;
    sourceField: string;
    matchType: string;
    weight: number;
    fallbackField?: string | null;
    fallbackMatch?: string | null;
    fallbackWeight?: number | null;
    /** Sàn cosine cho tiêu chí ngữ nghĩa. Dưới sàn ⇒ 0 điểm. */
    minSimilarity?: number | null;
    enabled: boolean;
    sortOrder?: number;
}

export interface CriterionHit {
    criterionKey: string;
    label: string;
    /** exact = mức chính · fallback = mức dự phòng · none = trượt cả hai. */
    level: 'exact' | 'fallback' | 'none';
    /** Giá trị đã khớp, để UI giải thích được vì sao ăn điểm. Null khi trượt. */
    matchedOn: string | null;
    points: number;
    /** Điểm tối đa tiêu chí này có thể cho — dùng để hiện 4/4, 2/4… */
    maxPoints: number;
}

export interface ScoreResult {
    score: number;
    /** Tổng trọng số của các tiêu chí ĐANG BẬT. Tắt bớt tiêu chí thì trần hạ theo. */
    maxScore: number;
    breakdown: CriterionHit[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Chấm điểm
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Đọc một cột theo tên lấy từ cấu hình.
 *
 * `sourceField` là dữ liệu do admin cấu hình, không phải hằng số trong code, nên
 * không có cách nào để TypeScript kiểm nó lúc biên dịch. Gom việc ép kiểu vào
 * đúng một chỗ có tên rõ ràng, thay vì rải cast khắp nơi.
 */
function fieldOf(c: ScorableCase, field: string): unknown {
    return (c as unknown as Record<string, unknown>)[field];
}

/** Lấy từ khoá đã tách; tự tách từ `defectText` nếu chưa có. */
function keywordsOf(c: ScorableCase): string {
    if (c.defectKeywords != null && c.defectKeywords !== '') return c.defectKeywords;
    return tokenizeDefectText(c.defectText);
}

/**
 * So hai giá trị theo một kiểu khớp.
 * Trả về giá trị đã khớp (để hiển thị), hoặc null khi trượt.
 *
 * Rỗng KHÔNG BAO GIỜ khớp rỗng: hai case cùng thiếu work center không phải là
 * hai case cùng work center. Bỏ luật này thì dữ liệu khuyết tự cộng điểm cho nhau.
 */
function matchValue(
    matchType: string,
    current: ScorableCase,
    candidate: ScorableCase,
    field: string,
): string | null {
    if (matchType === 'keyword') {
        const shared = sharedKeywordCount(keywordsOf(current), keywordsOf(candidate));
        if (shared < MIN_SHARED_KEYWORDS) return null;
        const left = new Set(keywordsOf(current).split(' ').filter(Boolean));
        const common = keywordsOf(candidate).split(' ').filter((t) => t && left.has(t));
        return common.join(', ');
    }

    // exact và family cùng là so bằng; khác nhau ở chỗ so cột nào.
    const a = normalizeId(fieldOf(current, field));
    const b = normalizeId(fieldOf(candidate, field));
    if (!a || !b || a !== b) return null;
    return String(fieldOf(candidate, field) ?? '').trim();
}

/**
 * Điểm tương đồng giữa case đang mở và một case trong kho.
 *
 * @param current   case đang xử lý
 * @param candidate case lịch sử đem ra so
 * @param criteria  cấu hình lấy từ `SimilarityCriteria`; tiêu chí tắt bị bỏ qua
 */
export function scoreCase(
    current: ScorableCase,
    candidate: ScorableCase,
    criteria: readonly Criterion[],
): ScoreResult {
    const breakdown: CriterionHit[] = [];
    let score = 0;
    let maxScore = 0;

    const active = criteria
        .filter((c) => c.enabled)
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    for (const c of active) {
        const weight = Number(c.weight) || 0;
        maxScore += weight;

        // ── Tiêu chí ngữ nghĩa ───────────────────────────────────────────────
        // Khác mọi tiêu chí còn lại ở chỗ nó cho điểm LIÊN TỤC chứ không đúng/sai:
        // điểm = trọng số × cosine. `matchedOn` hiện luôn con số cosine để vẫn
        // đối chiếu tay được, và để người đọc biết "gần" là gần tới mức nào.
        if ((c.matchType || 'exact') === 'cosine') {
            const sim = cosineSimilarity(
                current.embedding, candidate.embedding,
                current.embeddingModel, candidate.embeddingModel,
            );
            const floor = Number(c.minSimilarity ?? 0);

            if (sim !== null && sim >= floor) {
                const points = round1(weight * sim);
                score += points;
                breakdown.push({
                    criterionKey: c.criterionKey,
                    label: c.label,
                    level: 'exact',
                    matchedOn: `cosine ${sim.toFixed(3)}`,
                    points,
                    maxPoints: weight,
                });
            } else {
                breakdown.push({
                    criterionKey: c.criterionKey,
                    label: c.label,
                    level: 'none',
                    // Phân biệt "chưa nhúng" với "đã nhúng nhưng không đủ gần" —
                    // nhìn ngoài giống nhau, mà cách xử lý hoàn toàn khác.
                    matchedOn: sim === null ? null : `cosine ${sim.toFixed(3)} < ${floor}`,
                    points: 0,
                    maxPoints: weight,
                });
            }
            continue;
        }

        const exact = matchValue(c.matchType || 'exact', current, candidate, c.sourceField);
        if (exact !== null) {
            score += weight;
            breakdown.push({
                criterionKey: c.criterionKey,
                label: c.label,
                level: 'exact',
                matchedOn: exact,
                points: weight,
                maxPoints: weight,
            });
            continue;
        }

        // Mức dự phòng — CHỈ tới đây khi mức chính đã trượt.
        const fbWeight = Number(c.fallbackWeight) || 0;
        if (c.fallbackMatch && c.fallbackField && fbWeight > 0) {
            const fb = matchValue(c.fallbackMatch, current, candidate, c.fallbackField);
            if (fb !== null) {
                score += fbWeight;
                breakdown.push({
                    criterionKey: c.criterionKey,
                    label: c.label,
                    level: 'fallback',
                    matchedOn: fb,
                    points: fbWeight,
                    maxPoints: weight,
                });
                continue;
            }
        }

        breakdown.push({
            criterionKey: c.criterionKey,
            label: c.label,
            level: 'none',
            matchedOn: null,
            points: 0,
            maxPoints: weight,
        });
    }

    return { score, maxScore, breakdown };
}

/** Bỏ phần thập phân thừa: `7` chứ không `7.0`, nhưng giữ `3.8`. */
function fmt(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Câu giải thích ngắn cho UI và cho prompt: `"7/11 — Work center WC-MILL-07, Material MAT-10247"`. */
export function explainScore(result: ScoreResult): string {
    const total = `${fmt(result.score)}/${fmt(result.maxScore)}`;
    const hits = result.breakdown
        .filter((b) => b.points > 0)
        .map((b) => `${b.label} ${b.matchedOn}`);
    if (!hits.length) return `${total} — no matching criteria`;
    return `${total} — ${hits.join(', ')}`;
}
