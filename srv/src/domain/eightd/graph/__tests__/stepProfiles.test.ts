import {
    DEFAULT_STEP_PROFILES,
    STEP_CODES,
    explainEvidence,
    scoreEvidence,
    type GraphStepProfile,
} from '../stepProfiles';
import type { EvidenceHit } from '../probes';

const hit = (
    notificationId: string,
    kind: EvidenceHit['kind'],
    detail: string,
    count = 1,
): EvidenceHit => ({ notificationId, kind, detail, count });

describe('scoreEvidence', () => {
    const profile: GraphStepProfile = {
        label: 'test', question: 'test',
        weights: { keywords: 2, materialFamily: 2, workCenter: 1 },
        keywordCap: 4, minScore: 4, topN: 3,
    };

    it('cộng điểm theo trọng số của từng loại bằng chứng', () => {
        const [result] = scoreEvidence(
            [hit('A', 'materialFamily', 'MG-HOUSING'), hit('A', 'workCenter', 'WC-MILL-07')],
            { ...profile, minScore: 0 },
        );
        expect(result.score).toBe(3);
    });

    it('nhân điểm từ khoá theo SỐ từ chung, tới trần', () => {
        const three = scoreEvidence([hit('A', 'keywords', 'burr, edge, limit', 3)], { ...profile, minScore: 0 });
        const one = scoreEvidence([hit('B', 'keywords', 'flange', 1)], { ...profile, minScore: 0 });
        expect(three[0].score).toBe(6);
        expect(one[0].score).toBe(2);
    });

    it('chặn ở trần để mô tả dài không tự nó thắng', () => {
        const [result] = scoreEvidence([hit('A', 'keywords', 'a, b, c, d, e, f', 6)], { ...profile, minScore: 0 });
        expect(result.score).toBe(8); // 2 × min(6, cap 4)
    });

    /**
     * Chính là dương tính giả trong PRECEDENT-RETRIEVAL-REVIEW.md: hai case chỉ
     * chung chữ `flange` từng ăn +2 y hệt một case khớp thật. Ở đây một từ chung
     * không bao giờ tự nó qua ngưỡng.
     */
    it('một từ khoá chung KHÔNG bao giờ tự nó đủ điểm làm tiền lệ', () => {
        expect(scoreEvidence([hit('B', 'keywords', 'flange', 1)], profile)).toEqual([]);
    });

    it('xếp case khớp nhiều từ trên case khớp một từ', () => {
        const result = scoreEvidence([
            hit('8D-10049010', 'keywords', 'flange', 1),
            hit('8D-10049010', 'workCenter', 'WC-MILL-07'),
            hit('8D-10049030', 'keywords', 'burr, edge, limit', 3),
        ], profile);
        expect(result.map((r) => r.notificationId)).toEqual(['8D-10049030']);
    });

    it('bỏ qua loại bằng chứng mà bước này không cân', () => {
        const [result] = scoreEvidence([
            hit('A', 'materialFamily', 'MG-HOUSING'),
            hit('A', 'defectCode', 'DEF-0489'),
            hit('A', 'workCenter', 'WC-MILL-07'),
        ], { ...profile, minScore: 0 });
        expect(result.score).toBe(3);
        expect(result.evidence.map((e) => e.kind)).not.toContain('defectCode');
    });

    it('đặt bằng chứng nặng nhất lên đầu', () => {
        const [result] = scoreEvidence([
            hit('A', 'workCenter', 'WC-MILL-07'),
            hit('A', 'keywords', 'burr, edge', 2),
        ], profile);
        expect(result.evidence[0].kind).toBe('keywords');
    });

    it('tất định khi điểm bằng nhau — sắp theo mã case', () => {
        const hits = [hit('8D-2', 'materialFamily', 'F', 1), hit('8D-1', 'materialFamily', 'F', 1)];
        const forward = scoreEvidence(hits, { ...profile, minScore: 0 });
        const reversed = scoreEvidence([...hits].reverse(), { ...profile, minScore: 0 });
        expect(forward.map((r) => r.notificationId)).toEqual(['8D-1', '8D-2']);
        expect(reversed.map((r) => r.notificationId)).toEqual(forward.map((r) => r.notificationId));
    });

    it('cắt đúng topN', () => {
        const hits = ['A', 'B', 'C', 'D'].map((id) => hit(id, 'keywords', 'x, y', 2));
        expect(scoreEvidence(hits, { ...profile, topN: 2 })).toHaveLength(2);
    });
});

describe('DEFAULT_STEP_PROFILES', () => {
    it('khai đủ tám bước', () => {
        expect(Object.keys(DEFAULT_STEP_PROFILES).sort()).toEqual([...STEP_CODES].sort());
    });

    /**
     * Luật bất biến của cả đợt này. Nếu một bước nào đó đặt trọng số từ khoá đủ
     * cao để một từ chung qua ngưỡng, R3 quay lại — âm thầm, ở đúng một bước.
     */
    it('không bước nào để MỘT từ khoá chung tự nó qua ngưỡng', () => {
        for (const [code, profile] of Object.entries(DEFAULT_STEP_PROFILES)) {
            const single = scoreEvidence([hit('X', 'keywords', 'flange', 1)], profile);
            expect(`${code}:${single.length}`).toBe(`${code}:0`);
        }
    });

    it('D4 cân từ khoá nặng hơn work center — đó là câu hỏi của nó', () => {
        const d4 = DEFAULT_STEP_PROFILES.D4;
        expect((d4.weights.keywords ?? 0) * d4.keywordCap).toBeGreaterThan(d4.weights.workCenter ?? 0);
    });

    it('D7 không thưởng điểm cho cùng work center — phòng ngừa là mở rộng ra ngoài trạm đó', () => {
        expect(DEFAULT_STEP_PROFILES.D7.weights.workCenter).toBeUndefined();
    });
});

describe('explainEvidence', () => {
    it('viết một dòng người đọc hiểu, dẫn được về đúng bằng chứng', () => {
        const [scored] = scoreEvidence([
            hit('A', 'keywords', 'burr, edge, limit', 3),
            hit('A', 'materialFamily', 'MG-HOUSING'),
        ], DEFAULT_STEP_PROFILES.D4);
        // 3 từ × trọng số 3 = 9, cộng 1 cho cùng họ vật tư.
        expect(explainEvidence(scored)).toBe(
            '10 điểm — 3 từ khoá chung (burr, edge, limit), cùng họ vật tư MG-HOUSING',
        );
    });
});
