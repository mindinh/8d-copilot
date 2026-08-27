/**
 * Is/Is-Not phải TÍNH ra được, không phải kể ra được.
 *
 * Bộ test này chính là lý do tồn tại của luật đó: mọi khẳng định dưới đây đếm
 * tay lại được từ dân số lô. Nếu có ngày việc chọn nhóm rơi vào tay model, không
 * khẳng định nào ở đây còn kiểm được nữa.
 */

import { computeIsIsNot, groupByEquipment, DEFAULT_MIN_CONTRAST } from '../isIsNot';
import type { InspectionLotRow } from '../types';

const MAT = 'MAT-10234';
const CHAR = 'Mounting-hole chamfer';

const lot = (
    lotId: string, equipment: string, conforming: boolean | null, characteristic = CHAR, materialId = MAT,
): InspectionLotRow => ({ lotId, materialId, characteristic, equipment, measuredValue: '0.20', conforming });

describe('nhóm theo thiết bị', () => {
    it('đếm đúng tổng và số không đạt, và giữ mã lô của từng nhóm', () => {
        const groups = groupByEquipment([
            lot('INS-1', 'EQ-A', false), lot('INS-2', 'EQ-A', true),
            lot('INS-3', 'EQ-B', true),
        ]);
        expect(groups).toEqual([
            { equipment: 'EQ-A', total: 2, nonconforming: 1, rate: 0.5, lotIds: ['INS-1', 'INS-2'] },
            { equipment: 'EQ-B', total: 1, nonconforming: 0, rate: 0, lotIds: ['INS-3'] },
        ]);
    });

    it('bỏ lô chưa kết luận thay vì tính là đạt', () => {
        // Đưa lô `null` vào mẫu số sẽ làm loãng tỉ lệ bằng một thứ ta không biết.
        const groups = groupByEquipment([lot('INS-1', 'EQ-A', false), lot('INS-2', 'EQ-A', null)]);
        expect(groups[0]).toMatchObject({ total: 1, nonconforming: 1, rate: 1 });
    });
});

describe('tiêu chí nghiệm thu 8 — 8D-10048291', () => {
    // GD 17: EQ-PRESS12-004 có 4 lô, 3 không đạt; EQ-PRESS12-009 có 3 lô, 0 không đạt.
    const lots = [
        lot('INS-90104', 'EQ-PRESS12-004', false), lot('INS-90105', 'EQ-PRESS12-004', true),
        lot('INS-90106', 'EQ-PRESS12-004', false), lot('INS-90107', 'EQ-PRESS12-004', false),
        lot('INS-90201', 'EQ-PRESS12-009', true), lot('INS-90202', 'EQ-PRESS12-009', true),
        lot('INS-90203', 'EQ-PRESS12-009', true),
    ];

    const result = computeIsIsNot(lots, MAT, CHAR);

    it('chọn EQ-PRESS12-004 là IS với 3/4 (75%)', () => {
        expect(result.applicable).toBe(true);
        expect(result.is).toBe(`EQ-PRESS12-004 — 3/4 lots nonconforming (75%) for ${CHAR}`);
    });

    it('chọn EQ-PRESS12-009 là IS NOT với 0/3 (0%)', () => {
        expect(result.isNot).toBe(`EQ-PRESS12-009 — 0/3 lots nonconforming (0%) for ${CHAR}`);
    });

    it('trích ĐỦ CẢ BẢY mã lô để người đọc đếm lại được', () => {
        expect(result.citedLotIds).toHaveLength(7);
        expect(result.citedLotIds).toEqual(expect.arrayContaining(lots.map((l) => l.lotId)));
    });

    it('nói rõ thiết bị là điểm khác nhau, vật liệu và đặc tính là điểm chung', () => {
        // Toàn bộ giá trị của kỹ thuật này nằm ở chỗ nêu được cái KHÁC.
        expect(result.notes).toContain(MAT);
        expect(result.notes).toContain('equipment is the difference');
    });
});

describe('tiêu chí nghiệm thu 10 — không áp dụng thay vì bịa', () => {
    it('lỗi ngoại quan (không có đặc tính đo được) ⇒ not applicable', () => {
        const result = computeIsIsNot([lot('INS-1', 'EQ-A', false)], MAT, '');
        expect(result.applicable).toBe(false);
        expect(result.reason).toMatch(/no measurable characteristic/);
        // null, không phải chuỗi rỗng — ô trống sẽ bị renderer in ra như một vế thật.
        expect(result.is).toBeNull();
        expect(result.isNot).toBeNull();
    });

    it('chỉ một nhóm thiết bị ⇒ không có gì để so', () => {
        const result = computeIsIsNot(
            [lot('INS-1', 'EQ-A', false), lot('INS-2', 'EQ-A', false)], MAT, CHAR,
        );
        expect(result.applicable).toBe(false);
        expect(result.reason).toMatch(/nothing to compare against/);
    });

    it('hai nhóm nhưng chênh lệch quá thấp ⇒ no clear contrast, không chọn bừa', () => {
        // 50% vs 40%: có nhóm cao hơn, nhưng gọi nó là "nơi vấn đề xảy ra" là
        // đọc tín hiệu ra từ nhiễu.
        const result = computeIsIsNot([
            lot('A1', 'EQ-A', false), lot('A2', 'EQ-A', true),
            lot('B1', 'EQ-B', false), lot('B2', 'EQ-B', true), lot('B3', 'EQ-B', true),
            lot('B4', 'EQ-B', false), lot('B5', 'EQ-B', true),
        ], MAT, CHAR);
        expect(result.applicable).toBe(false);
        expect(result.reason).toMatch(/No clear contrast/);
        expect(result.citedLotIds).toEqual([]);
    });

    it('không có lô nào cho đặc tính đó ⇒ not applicable', () => {
        const result = computeIsIsNot([lot('INS-1', 'EQ-A', false, 'Other characteristic')], MAT, CHAR);
        expect(result.applicable).toBe(false);
        expect(result.reason).toMatch(/no historical inspection lots/);
    });

    it('chỉ xét lô CÙNG vật liệu — lô của vật liệu khác không được trộn vào', () => {
        const result = computeIsIsNot([
            lot('A1', 'EQ-A', false), lot('A2', 'EQ-A', false),
            lot('X1', 'EQ-B', true, CHAR, 'MAT-OTHER'), lot('X2', 'EQ-B', true, CHAR, 'MAT-OTHER'),
        ], MAT, CHAR);
        // Chỉ còn EQ-A ⇒ một nhóm ⇒ không so được. Nếu lọc sai, ta sẽ có một cặp
        // Is/Is-Not "đẹp" dựng trên hai vật liệu khác nhau — vô nghĩa.
        expect(result.applicable).toBe(false);
    });
});

describe('ngưỡng tương phản', () => {
    const lots = [
        lot('A1', 'EQ-A', false), lot('A2', 'EQ-A', true),
        lot('B1', 'EQ-B', true), lot('B2', 'EQ-B', true),
    ];

    it('mặc định là 0.25', () => {
        expect(DEFAULT_MIN_CONTRAST).toBe(0.25);
    });

    it('50% vs 0% qua được ngưỡng mặc định', () => {
        expect(computeIsIsNot(lots, MAT, CHAR).applicable).toBe(true);
    });

    it('nâng ngưỡng lên 0.6 thì chính bộ dữ liệu đó bị loại', () => {
        // Chỉnh được ngưỡng là yêu cầu R2.2.4; đây là chỗ chứng minh nó có tác dụng.
        expect(computeIsIsNot(lots, MAT, CHAR, { minContrast: 0.6 }).applicable).toBe(false);
    });

    it('nhóm nhỏ hơn minGroupSize không được coi là so sánh được', () => {
        const result = computeIsIsNot(
            [lot('A1', 'EQ-A', false), lot('A2', 'EQ-A', false), lot('B1', 'EQ-B', true)],
            MAT, CHAR, { minGroupSize: 2 },
        );
        expect(result.applicable).toBe(false);
    });
});

describe('tính tái lập', () => {
    it('cùng đầu vào cho cùng đầu ra, không phụ thuộc thứ tự lô', () => {
        const lots = [
            lot('A1', 'EQ-A', false), lot('A2', 'EQ-A', false),
            lot('B1', 'EQ-B', true), lot('B2', 'EQ-B', true),
        ];
        const forward = computeIsIsNot(lots, MAT, CHAR);
        const reversed = computeIsIsNot([...lots].reverse(), MAT, CHAR);
        expect(forward.is).toBe(reversed.is);
        expect(forward.isNot).toBe(reversed.isNot);
    });
});
