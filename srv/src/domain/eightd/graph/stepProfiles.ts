/**
 * Mỗi bước D cân bằng chứng theo cách của riêng nó — và chấm điểm là HÀM THUẦN.
 *
 * ── Vì sao tám bộ trọng số, không phải một ──
 * Đây là lý do tồn tại của cả đợt này. Tám bước hỏi tám câu khác nhau, nên "case
 * nào đáng đọc" có tám nghĩa khác nhau:
 *
 *     D1 cần NGƯỜI đã làm loại việc này  ⇒ work center và họ vật tư nặng ký
 *     D4 cần CÙNG CƠ CHẾ HỎNG            ⇒ từ khoá nặng ký, work center gần như vô nghĩa
 *     D7 cần CHỖ KHÁC CÙNG RỦI RO        ⇒ họ vật tư nặng nhất, work center không tính
 *
 * Bản cũ dùng một phép đo cho cả tám và chỉ đổi trọng số, nên chỉnh cho D4 tốt lên
 * là làm D1 xấu đi. Ở đây mỗi bước còn chọn được cả LOẠI bằng chứng nó muốn.
 *
 * ── Vì sao chấm điểm tách hẳn khỏi truy vấn ──
 * Cùng lý do file `precedent/scoring.ts` đưa ra và lý do đó vẫn đúng: đây là chỗ
 * dễ sai nhất, và cái sai khó thấy nhất — một tiền lệ yếu lọt lưới trông y hệt
 * một tiền lệ mạnh. Hàm thuần thì test được bằng mấy object thường, không cần DB,
 * không cần graph.
 */

import type { EvidenceHit, EvidenceKind } from './probes';

export const STEP_CODES = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'] as const;
export type StepCode = (typeof STEP_CODES)[number];

export interface GraphStepProfile {
    label: string;
    /** Bước này hỏi gì. Đi thẳng vào log và vào phần nguồn hiện trên UI. */
    question: string;
    weights: Partial<Record<EvidenceKind, number>>;
    /**
     * Trần số từ khoá được tính điểm.
     *
     * Không có trần thì một case dài dòng trùng tám chữ vặt sẽ vượt mọi tín hiệu
     * khác chỉ nhờ độ dài. Có trần thì "trùng nhiều" vẫn thắng "trùng một" — đúng
     * thứ R3 đòi — mà không biến độ dài mô tả thành thước đo.
     */
    keywordCap: number;
    /**
     * Dưới ngưỡng ⇒ KHÔNG có tiền lệ, và nói thẳng ra như vậy.
     *
     * Ngưỡng phải đặt sao cho MỘT từ khoá chung không bao giờ tự nó đủ điểm. Đó
     * chính là dương tính giả `flange` trong `PRECEDENT-RETRIEVAL-REVIEW.md`.
     */
    minScore: number;
    topN: number;
    /** Loại hành động bước này quan tâm. Bỏ trống ⇒ không dò hành động. */
    actionType?: 'Containment' | 'Corrective' | 'Preventive';
}

/**
 * Trọng số mặc định. Admin đè được qua bảng `GraphStepParams` mà không cần deploy.
 *
 * Con số chọn theo một luật đơn giản để còn giải thích được: một tín hiệu ĐỊNH
 * DANH (đúng work center, đúng vật tư) đáng 2–4; từ khoá đáng 2 MỖI TỪ tới trần.
 * Nên ở D4, hai từ chung (4) ngang một lần trùng vật tư, còn một từ chung (2)
 * không bao giờ tự nó qua ngưỡng.
 */
export const DEFAULT_STEP_PROFILES: Record<StepCode, GraphStepProfile> = {
    D1: {
        label: 'Establish the Team',
        question: 'Ai đã xử lý loại lỗi này, ở trạm này, trên họ vật tư này?',
        weights: { workCenter: 4, materialFamily: 3, material: 2, keywords: 1 },
        keywordCap: 3, minScore: 3, topN: 5,
    },
    D2: {
        label: 'Describe the Problem',
        question: 'Lỗi này đã xuất hiện ở đâu, trên vật tư nào, với mã lỗi nào?',
        weights: { defectCode: 4, material: 3, workCenter: 2, keywords: 2 },
        keywordCap: 3, minScore: 4, topN: 3,
    },
    D3: {
        label: 'Interim Containment Actions',
        question: 'Lần trước chặn tạm loại lỗi này bằng cách nào?',
        weights: { keywords: 2, materialFamily: 2, workCenter: 2, containment: 2 },
        keywordCap: 3, minScore: 4, topN: 3, actionType: 'Containment',
    },
    D4: {
        label: 'Root Cause Analysis',
        question: 'Chi tiết này hỏng theo cơ chế nào?',
        // Từ khoá PHẢI áp đảo ở đây, và con số này đến từ một lần chạy shadow
        // thật chứ không phải từ trực giác. Với bộ 2/2/1/1 ban đầu, case
        // `8D-10049030` (chung 3 từ: burr, edge, limit) hoà 6-6 với `8D-10049010`
        // (chung đúng 1 từ `flange`, nhưng cùng trạm và cùng vật tư) — tức là R3
        // quay lại qua cửa sau, ở đúng bước quan tâm tới cơ chế hỏng nhất.
        //
        // Cùng trạm và cùng vật tư vẫn được tính, nhưng chỉ đủ để phá thế hoà chứ
        // không đủ để lật thứ hạng: giờ 3 từ chung được 9, còn 1 từ + trạm + họ
        // vật tư được 5. Cả hai vẫn hiện ra, nhưng đúng thứ tự.
        weights: { keywords: 3, materialFamily: 1, workCenter: 1 },
        // Ngưỡng 5 vì trọng số từ khoá là 3: một từ chung (3) không thể tự nó qua,
        // hai từ chung (6) thì qua. Đổi trọng số mà quên đổi ngưỡng là mở lại R3.
        keywordCap: 4, minScore: 5, topN: 3,
    },
    D5: {
        label: 'Permanent Corrective Actions',
        question: 'Cách sửa nào đã thật sự đóng được nguyên nhân này?',
        weights: { keywords: 2, materialFamily: 2, corrective: 3 },
        keywordCap: 3, minScore: 4, topN: 3, actionType: 'Corrective',
    },
    D6: {
        label: 'Verify Effectiveness',
        question: 'Bằng chứng nào cho thấy bản sửa đã có tác dụng?',
        weights: { keywords: 2, materialFamily: 1, corrective: 3 },
        keywordCap: 2, minScore: 4, topN: 3, actionType: 'Corrective',
    },
    D7: {
        label: 'Prevent Recurrence',
        question: 'Chỗ nào khác cũng mang rủi ro này?',
        // Work center KHÔNG có trọng số: phòng ngừa là mở rộng ra ngoài trạm đã
        // hỏng, nên thưởng điểm cho việc cùng trạm là đi ngược mục đích của bước.
        weights: { materialFamily: 4, material: 2, preventive: 3, keywords: 1 },
        keywordCap: 2, minScore: 4, topN: 3, actionType: 'Preventive',
    },
    D8: {
        label: 'Closure and Recognition',
        question: 'Case tương đương nào đã đóng trọn vẹn?',
        weights: { workCenter: 2, materialFamily: 2, keywords: 1 },
        keywordCap: 2, minScore: 3, topN: 3,
    },
};

export interface ScoredCase {
    notificationId: string;
    score: number;
    /** Chỉ những bằng chứng THẬT SỰ ăn điểm ở bước này. */
    evidence: Array<{ kind: EvidenceKind; detail: string; count: number; points: number }>;
}

/**
 * Bằng chứng thô + trọng số của bước → danh sách case đã chấm, sắp giảm dần.
 *
 * Hàm thuần. Không DB, không graph, không AI.
 *
 * Bằng chứng có `kind` mà bước này không cân thì bị BỎ QUA, không phải tính 0 —
 * khác biệt lộ ra ở đường bằng chứng: D7 không được phép in ra "cùng work center"
 * như một lý do, vì với D7 đó không phải lý do.
 */
export function scoreEvidence(
    hits: readonly EvidenceHit[],
    profile: GraphStepProfile,
): ScoredCase[] {
    const byCase = new Map<string, ScoredCase>();

    for (const hit of hits) {
        const weight = profile.weights[hit.kind];
        if (!weight) continue;

        const multiplier = hit.kind === 'keywords'
            ? Math.min(hit.count, profile.keywordCap)
            : 1;
        const points = weight * multiplier;
        if (points <= 0) continue;

        const entry = byCase.get(hit.notificationId)
            ?? { notificationId: hit.notificationId, score: 0, evidence: [] };
        entry.score += points;
        entry.evidence.push({ kind: hit.kind, detail: hit.detail, count: hit.count, points });
        byCase.set(hit.notificationId, entry);
    }

    return [...byCase.values()]
        .filter((c) => c.score >= profile.minScore)
        .map((c) => ({
            ...c,
            // Bằng chứng nặng nhất đứng trước: dòng đầu tiên của đường bằng chứng
            // phải là lý do CHÍNH, không phải lý do tình cờ được dò trước.
            evidence: [...c.evidence].sort((a, b) => b.points - a.points || a.kind.localeCompare(b.kind)),
        }))
        // Chốt bằng mã case để kết quả tất định khi điểm bằng nhau — cùng input
        // phải cho cùng thứ tự, nếu không thì `precedents#1` đổi giữa hai lần chạy
        // trên cùng một dữ liệu.
        .sort((a, b) => b.score - a.score || a.notificationId.localeCompare(b.notificationId))
        .slice(0, profile.topN);
}

/** Một dòng người đọc hiểu: `"6 điểm — 3 từ khoá chung (burr, edge, limit), cùng họ vật tư MG-HOUSING"`. */
export function explainEvidence(scored: ScoredCase): string {
    const parts = scored.evidence.map((e) => {
        switch (e.kind) {
            case 'keywords': return `${e.count} từ khoá chung (${e.detail})`;
            case 'workCenter': return `cùng work center ${e.detail}`;
            case 'material': return `cùng vật tư ${e.detail}`;
            case 'materialFamily': return `cùng họ vật tư ${e.detail}`;
            case 'defectCode': return `cùng mã lỗi ${e.detail}`;
            case 'containment': return `đã chặn tạm bằng ${e.detail}`;
            case 'corrective': return `đã khắc phục bằng ${e.detail}`;
            case 'preventive': return `đã phòng ngừa bằng ${e.detail}`;
            default: return e.detail;
        }
    });
    return `${scored.score} điểm — ${parts.join(', ')}`;
}
