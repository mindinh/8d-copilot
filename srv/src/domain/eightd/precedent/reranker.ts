/**
 * Tầng 2 của tìm tiền lệ: re-rank bằng model đọc CẢ HAI văn bản.
 *
 * ── Vì sao cần tầng này ──
 * Tầng 1 so query và ứng viên TÁCH RỜI: cosine giữa hai vector nhúng sẵn, khớp
 * mã exact/keyword. Câu hỏi của D4 — "cùng cơ chế hỏng vật lý?" — cần model đọc
 * đồng thời hai đoạn mô tả và phán, điều mà không phép so tách rời nào làm được.
 * D5 tương tự: "action của case kia có gỡ được nguyên nhân của case này không".
 *
 * ── Vì sao listwise, một lượt gọi ──
 * K ứng viên (≤20) đi chung MỘT prompt, model trả điểm cho từng cái. Một lượt
 * gọi mỗi profile mỗi lần chạy — rẻ hơn K lượt pairwise và đủ tốt: model nhìn
 * được cả danh sách nên tự hiệu chỉnh thang điểm giữa các ứng viên.
 *
 * ── Khế ước với phần còn lại của hệ thống ──
 * Kết quả re-rank là MỘT dòng breakdown như mọi tiêu chí khác: điểm = trọng số
 * × (score/100), có sàn, kèm lý do model đưa ra trong `matchedOn` — đọc được
 * trên UI, không hộp đen. Re-rank hỏng ⇒ giữ nguyên xếp hạng tầng 1, không bao
 * giờ làm hỏng lượt tìm (cùng triết lý với embedding hỏng ở `embedQuery`).
 *
 * Instruction lấy từ `description` của tiêu chí `rerank` trong profile — mỗi
 * bước D hỏi một câu khác nhau, và câu hỏi đó là cấu hình, không phải hằng số.
 */

import cds from '@sap/cds';
import { complete } from '../../../core/ai/llmClient';
import { callAndParse } from '../jsonExtract';
import { BUDGET } from '../schemas';
import { round1, type Criterion, type CriterionHit, type ScoreResult } from './scoring';

const LOG = cds.log('precedent-rerank');

/** Activity dùng chung với chẩn đoán mù: chấm theo tiêu chí cố định, temp 0. */
const ACTIVITY_RERANK = 'reviewQuality';

/** Quá số này thì lượt gọi bị coi là treo — giữ xếp hạng tầng 1 thay vì chờ. */
const RERANK_TIMEOUT_MS = 20_000;

/** Mỗi ứng viên chỉ đưa chừng này ký tự văn bản — đủ để phán, không phình prompt. */
const CANDIDATE_TEXT_CHARS = 700;
const QUERY_TEXT_CHARS = 1_400;

export interface RerankCandidate {
    notificationId: string;
    symptomShortText: string | null;
    searchText: string | null;
}

export interface RerankVerdict {
    /** 0-100, đã clamp. */
    score: number;
    /** Lý do một dòng của model — đi thẳng vào `breakdown.matchedOn`. */
    reason: string;
}

const RERANK_SCHEMA = {
    type: 'object',
    properties: {
        rankings: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    notificationId: { type: 'string' },
                    score: {
                        type: 'number',
                        description: 'Relevance 0-100 against the instruction. 0 = unrelated, 100 = textbook match.',
                    },
                    reason: {
                        type: 'string',
                        maxLength: 200,
                        description: 'One short sentence naming the evidence for the score.',
                    },
                },
                required: ['notificationId', 'score', 'reason'],
            },
        },
    },
    required: ['rankings'],
} as const;

const SYSTEM_PROMPT = `You are re-ranking historical quality-management (8D) cases against one open case.

Score every candidate from 0 to 100 for how relevant it is UNDER THE GIVEN INSTRUCTION —
not for generic similarity. Two cases can share a defect code and still score low, or share
nothing on paper and score high, when the instruction asks about the underlying mechanism.

Rules:
- Score every candidate exactly once, using its notificationId verbatim.
- Give one short factual reason per candidate, citing what in the texts drove the score.
- Return ONLY JSON matching the schema. No prose, no code fences.`;

function clip(text: string | null | undefined, max: number): string {
    const t = String(text ?? '').replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function buildUserPrompt(
    instruction: string,
    queryText: string,
    candidates: readonly RerankCandidate[],
): string {
    const list = candidates
        .map((c, i) =>
            `${i + 1}. [${c.notificationId}] ${clip(c.symptomShortText, 160)}\n`
            + `   ${clip(c.searchText, CANDIDATE_TEXT_CHARS)}`)
        .join('\n');

    return `## INSTRUCTION
${instruction.trim()}

## OPEN CASE (the query)
${clip(queryText, QUERY_TEXT_CHARS)}

## CANDIDATES (${candidates.length})
${list}`;
}

/**
 * Chuẩn hoá output model thành map id → verdict — HÀM THUẦN, test không cần AI.
 *
 * Luật phòng thủ:
 *   - id lạ (không nằm trong danh sách gửi đi) bị BỎ — model không được thêm case
 *   - id thiếu thì vắng mặt trong map — dòng của nó ở lại mức 'none'
 *   - score ngoài [0,100] bị clamp; không phải số ⇒ bỏ dòng đó
 *   - trùng id: giữ lượt xuất hiện đầu tiên
 */
export function normalizeRerankOutput(
    value: unknown,
    sentIds: readonly string[],
): Map<string, RerankVerdict> {
    const allowed = new Set(sentIds);
    const out = new Map<string, RerankVerdict>();

    const rows = (value as { rankings?: unknown } | null)?.rankings;
    if (!Array.isArray(rows)) return out;

    for (const row of rows) {
        const id = String((row as any)?.notificationId ?? '').trim();
        if (!id || !allowed.has(id) || out.has(id)) continue;

        const rawScore = Number((row as any)?.score);
        if (!Number.isFinite(rawScore)) continue;
        const score = Math.min(100, Math.max(0, rawScore));

        const reason = String((row as any)?.reason ?? '').trim().slice(0, 200);
        out.set(id, { score, reason });
    }
    return out;
}

/**
 * Gọi model xếp hạng lại. Ném lỗi khi hỏng — NGƯỜI GỌI quyết định fallback,
 * vì chỉ người gọi biết xếp hạng tầng 1 đang có gì để giữ lại.
 */
export async function rerankCandidates(
    instruction: string,
    queryText: string,
    candidates: readonly RerankCandidate[],
): Promise<Map<string, RerankVerdict>> {
    if (!candidates.length) return new Map();

    const sentIds = candidates.map((c) => c.notificationId);

    const timeout = new Promise<never>((_, reject) => {
        const t = setTimeout(
            () => reject(new Error(`Re-rank quá ${RERANK_TIMEOUT_MS / 1000}s`)),
            RERANK_TIMEOUT_MS,
        );
        // Không giữ event loop sống chỉ vì cái đồng hồ này.
        (t as unknown as { unref?: () => void }).unref?.();
    });

    const call = callAndParse<{ rankings: unknown }>('rerank', async (repairHint) => {
        const res = await complete(
            [
                { role: 'system', content: SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: repairHint
                        ? `${buildUserPrompt(instruction, queryText, candidates)}\n\n## CORRECTION\n${repairHint}`
                        : buildUserPrompt(instruction, queryText, candidates),
                },
            ],
            {
                activity: ACTIVITY_RERANK,
                // temp 0 + budget dưới ngưỡng 1024: xếp hạng phải tất định hết
                // mức có thể — cùng lý do và cùng cơ chế với chẩn đoán mù.
                temperature: 0,
                max_tokens: BUDGET.rerank.maxTokens,
                thinkingBudget: BUDGET.rerank.thinkingBudget,
                responseMimeType: 'application/json',
                responseSchema: RERANK_SCHEMA as unknown as Record<string, unknown>,
            },
        );
        return { content: res.content, finishReason: res.finishReason };
    });

    const { value } = await Promise.race([call, timeout]);
    const verdicts = normalizeRerankOutput(value, sentIds);

    LOG.info(
        `Re-rank: ${verdicts.size}/${candidates.length} ứng viên được chấm`
        + (verdicts.size < candidates.length ? ' (phần thiếu giữ mức none)' : ''),
    );
    return verdicts;
}

/**
 * Gắn kết quả re-rank vào các bản chấm tầng 1 — HÀM THUẦN.
 *
 * Với mỗi ứng viên: tìm dòng breakdown của tiêu chí re-rank (tầng 1 đã đặt sẵn
 * mức 'none' giữ chỗ — xem `scoreCase`), rồi:
 *   - có verdict và đạt sàn  ⇒ điểm = weight × score/100, lý do vào `matchedOn`
 *   - có verdict, dưới sàn   ⇒ 0 điểm, `matchedOn` nói rõ dưới sàn bao nhiêu
 *   - không có verdict       ⇒ 0 điểm, `matchedOn` ghi chú vì sao (model bỏ sót
 *                              hoặc cả lượt re-rank hỏng)
 *
 * KHÔNG sort, KHÔNG cắt top-N ở đây — đó là việc của `scoreWithProfile`, nơi
 * biết ngưỡng và luật tie-break. Hàm này chỉ làm đúng một việc: cập nhật điểm.
 */
export function applyRerank(
    results: ReadonlyArray<{ notificationId: string; result: ScoreResult }>,
    criterion: Criterion,
    verdicts: ReadonlyMap<string, RerankVerdict> | null,
    unavailableNote = 'rerank unavailable',
): void {
    const weight = Number(criterion.weight) || 0;
    const floor = Number(criterion.minSimilarity ?? 0);

    for (const { notificationId, result } of results) {
        const row = result.breakdown.find(
            (b: CriterionHit) => b.criterionKey === criterion.criterionKey,
        );
        if (!row) continue;

        const verdict = verdicts?.get(notificationId);
        if (!verdict) {
            row.matchedOn = verdicts ? 'not scored by reranker' : unavailableNote;
            continue;
        }

        const normalized = verdict.score / 100;
        if (normalized >= floor) {
            const points = round1(weight * normalized);
            row.level = 'exact';
            row.points = points;
            row.matchedOn = `rerank ${verdict.score}/100 — ${verdict.reason}`;
            result.score = round1(result.score + points);
        } else {
            row.matchedOn = `rerank ${verdict.score}/100 < floor ${floor * 100}`;
        }
    }
}
