/**
 * Tìm case tiền lệ cho một case đang mở — 100% code, KHÔNG gọi AI.
 *
 *   cấu hình  →  lọc SQL  →  chấm điểm (hàm thuần)  →  cắt ngưỡng  →  top-N
 *
 * Đây là "một máy tương đồng dùng chung" mà requirement nói tới: D1 hỏi *"case
 * nào giống case này"* và D4 cũng hỏi đúng câu đó. Hai định nghĩa tương đồng
 * khác nhau cho cùng một hồ sơ là cách chắc chắn nhất để hai bước mâu thuẫn nhau.
 */

import cds from '@sap/cds';
import { getRetrievalConfig } from './configRepository';
import {
    explainScore,
    scoreCase,
    tokenizeDefectText,
    type CriterionHit,
    type ScorableCase,
} from './scoring';
import {
    countLibrary,
    fetchActions,
    fetchCandidates,
    fetchTeamMembers,
    type ActionRow,
    type TeamMemberRow,
} from './precedentRepository';
import { buildQueryText } from './searchText';
import { embed, currentEmbeddingModel } from '../../../core/ai/llmClient';
import type { CaseContext } from '../types';

const LOG = cds.log('precedent');

export interface Precedent {
    notificationId: string;
    score: number;
    maxScore: number;
    breakdown: CriterionHit[];
    /** Một dòng người đọc hiểu: `"7/11 — Work center WC-MILL-07, Material MAT-10247"`. */
    explanation: string;

    symptomShortText: string | null;
    sapStatus: string | null;
    completionDate: string | null;
    quantityExtent: string | null;
    workCenterId: string | null;
    workCenterDesc: string | null;
    defectCode: string | null;
    defectText: string | null;
    materialId: string | null;
    materialDesc: string | null;
    rootCauseCategory: string | null;
    copqEur: number | null;
    fmeaId: string | null;

    team: Array<Omit<TeamMemberRow, 'caseId' | 'notificationId'>>;
    actions: Array<Omit<ActionRow, 'caseId' | 'notificationId'>>;
}

export interface PrecedentResult {
    precedents: Precedent[];
    /**
     * Vì sao không có tiền lệ. Null khi có.
     *
     * Bắt buộc phải phân biệt được "kho chưa nạp" với "đã tìm nhưng không đủ
     * điểm" — nhìn ngoài UI hai thứ giống hệt nhau, mà cách xử lý hoàn toàn khác.
     */
    reason: string | null;
    maxScore: number;
    settings: { minScore: number; topN: number; closedOnly: boolean };
    libraryCount: number;
    candidatesScored: number;
    /**
     * Tiêu chí ngữ nghĩa có thực sự tham gia lần chấm này không.
     *
     * `false` khi nó bị tắt, hoặc khi nhúng case đang mở thất bại. Phân biệt hai
     * chuyện đó với "đã so nhưng không đủ gần" là cần thiết: nhìn kết quả thì
     * giống nhau, mà nguyên nhân hoàn toàn khác.
     */
    semanticUsed: boolean;
}

/** `CaseContext` → dạng chấm điểm được. Từ khoá tách ngay tại đây. */
export function toScorable(context: CaseContext): ScorableCase {
    return {
        notificationId: context.notificationId,
        workCenterId: context.product.workCenterId || null,
        defectCode: context.product.defectCode || null,
        defectText: context.product.defectText || null,
        // Tách bằng CHÍNH hàm đã dùng lúc nạp kho — hai cách tách khác nhau ở hai
        // đầu là lỗi âm thầm: không bao giờ khớp mà cũng không bao giờ báo lỗi.
        defectKeywords: tokenizeDefectText(context.product.defectText),
        materialId: context.product.materialId || null,
        materialFamily: context.product.materialGroup || null,
    };
}

/**
 * Nhúng case đang mở để có vector đem đi so.
 *
 * Ghép đoạn văn bằng CÙNG hàm đã dùng lúc nạp kho — khác công thức ở hai đầu thì
 * hai vector nằm ở hai phân bố khác nhau và cosine mất ý nghĩa.
 *
 * Hỏng thì trả `null` chứ không ném: mất tiêu chí ngữ nghĩa vẫn còn ba tiêu chí
 * theo luật. Đổi cả tính năng tìm tiền lệ lấy một sự cố tạm thời của AI Core là
 * cái giá quá đắt.
 */
async function embedQuery(
    context: CaseContext,
): Promise<{ embedding: number[]; embeddingModel: string } | null> {
    try {
        const embedding = await embed(buildQueryText(context));
        if (!Array.isArray(embedding) || !embedding.length) return null;
        return { embedding, embeddingModel: currentEmbeddingModel() };
    } catch (e: any) {
        LOG.warn(
            `Không nhúng được case ${context.notificationId} (${e.message}) — `
            + 'bỏ tiêu chí ngữ nghĩa, vẫn chấm theo ba tiêu chí còn lại.',
        );
        return null;
    }
}

/**
 * Top-N case tiền lệ, sắp theo điểm giảm dần.
 *
 * Dưới ngưỡng ⇒ trả mảng rỗng kèm `reason`, KHÔNG bao giờ trả đại mấy case điểm
 * cao nhất. Requirement nói thẳng: *"Below a score of 3, do not surface a
 * precedent — say so explicitly instead of guessing."*
 */
export async function findPrecedents(context: CaseContext): Promise<PrecedentResult> {
    const { criteria, settings } = await getRetrievalConfig();
    const current = toScorable(context);

    // Chỉ gọi embedding khi thật sự có tiêu chí ngữ nghĩa đang bật — tắt nó đi
    // thì không tốn một lời gọi AI nào.
    const semanticOn = criteria.some((c) => c.enabled && (c.matchType || 'exact') === 'cosine');
    let semanticAvailable = false;
    if (semanticOn) {
        const q = await embedQuery(context);
        if (q) {
            current.embedding = q.embedding;
            current.embeddingModel = q.embeddingModel;
            semanticAvailable = true;
        }
    }

    const maxScore = criteria
        .filter((c) => c.enabled)
        .reduce((sum, c) => sum + (Number(c.weight) || 0), 0);

    const base: Omit<PrecedentResult, 'precedents' | 'reason' | 'candidatesScored'> = {
        maxScore,
        settings,
        libraryCount: 0,
        semanticUsed: semanticAvailable,
    };

    const libraryCount = await countLibrary();
    base.libraryCount = libraryCount;

    if (libraryCount === 0) {
        return {
            ...base,
            precedents: [],
            candidatesScored: 0,
            reason:
                'The case library is empty — no historical cases have been loaded yet. '
                + 'Run the library seed before expecting precedent-based suggestions.',
        };
    }

    const candidates = await fetchCandidates(current, criteria, {
        closedOnly: settings.closedOnly,
        minScore: settings.minScore,
    });

    const scored = candidates
        .map((row) => ({ row, result: scoreCase(current, row, criteria) }))
        .filter((x) => x.result.score >= settings.minScore)
        .sort((a, b) =>
            b.result.score - a.result.score
            // Điểm bằng nhau thì lấy case đóng gần đây nhất: bài học mới phản ánh
            // đúng dây chuyền hiện tại hơn. Chốt bằng mã case để kết quả tất định.
            || String(b.row.completionDate ?? '').localeCompare(String(a.row.completionDate ?? ''))
            || a.row.notificationId.localeCompare(b.row.notificationId),
        )
        .slice(0, settings.topN);

    if (!scored.length) {
        LOG.info(
            `Case ${context.notificationId}: ${candidates.length} ứng viên, không cái nào đạt `
            + `ngưỡng ${settings.minScore}/${maxScore}`,
        );
        return {
            ...base,
            precedents: [],
            candidatesScored: candidates.length,
            reason:
                `No past case scores at least ${settings.minScore} of ${maxScore} against this one `
                + `(${candidates.length} candidate${candidates.length === 1 ? '' : 's'} examined). `
                + 'No precedent will be shown rather than a weak guess.',
        };
    }

    const caseIds = scored.map((x) => x.row.ID);
    const [team, actions] = await Promise.all([fetchTeamMembers(caseIds), fetchActions(caseIds)]);

    const teamByCase = new Map<string, TeamMemberRow[]>();
    for (const m of team) {
        const list = teamByCase.get(m.caseId) ?? [];
        list.push(m);
        teamByCase.set(m.caseId, list);
    }
    const actionsByCase = new Map<string, ActionRow[]>();
    for (const a of actions) {
        const list = actionsByCase.get(a.caseId) ?? [];
        list.push(a);
        actionsByCase.set(a.caseId, list);
    }

    const precedents: Precedent[] = scored.map(({ row, result }) => ({
        notificationId: row.notificationId,
        score: result.score,
        maxScore: result.maxScore,
        breakdown: result.breakdown,
        explanation: explainScore(result),

        symptomShortText: row.symptomShortText,
        sapStatus: row.sapStatus,
        completionDate: row.completionDate,
        quantityExtent: row.quantityExtent,
        workCenterId: row.workCenterId ?? null,
        workCenterDesc: row.workCenterDesc,
        defectCode: row.defectCode ?? null,
        defectText: row.defectText ?? null,
        materialId: row.materialId ?? null,
        materialDesc: row.materialDesc,
        rootCauseCategory: row.rootCauseCategory,
        copqEur: row.copqEur,
        fmeaId: row.fmeaId,

        team: (teamByCase.get(row.ID) ?? []).map(({ caseId, notificationId, ...rest }) => rest),
        actions: (actionsByCase.get(row.ID) ?? []).map(({ caseId, notificationId, ...rest }) => rest),
    }));

    LOG.info(
        `Case ${context.notificationId}: ${precedents.length} tiền lệ — `
        + precedents.map((p) => `${p.notificationId} ${p.score}/${p.maxScore}`).join(', '),
    );

    return { ...base, precedents, candidatesScored: candidates.length, reason: null };
}
