/**
 * Lưới 5W2H phải phân giải được, không phải kể được.
 *
 * Điểm cốt lõi mà bộ test này giữ: một ô không có nguồn phải NÓI RA rằng nó
 * không có nguồn. Điền một giá trị nghe hợp lý vào đó là bịa; để trống thì người
 * đọc tưởng chưa ai nhập. Cả hai đều tệ hơn sự thật.
 */

import { applyResolvedProblemFields, isGap, NOT_TRACKED, resolveFiveW2H } from '../fiveW2H';
import { ORIGIN_CUSTOMER, type CaseContext } from '../types';

function ctx(overrides: Record<string, any> = {}): CaseContext {
    return {
        notificationId: '8D-1',
        origin: 'Q3 - Internal Defect',
        isCustomerFacing: false,
        header: { foundDate: '2026-08-05', quantityExtent: '340 units affected' },
        product: {
            materialId: 'MAT-10234', defectCode: 'DEF-0451',
            defectText: 'Hairline crack near mounting hole',
            workCenterId: 'WC-PRESS-12', workCenterDesc: 'Forming Press Line 2',
        },
        inspections: [{
            characteristic: 'Mounting-hole chamfer', measuredValue: '0.20mm',
            specValue: '0.50mm +/-0', outOfSpec: true,
        }],
        customer: {},
        ...overrides,
    } as unknown as CaseContext;
}

describe('phân giải sáu ô', () => {
    const grid = resolveFiveW2H(ctx());

    it('WHAT gồm cả mã lỗi lẫn số đo vượt dung sai', () => {
        // "Cái gì sai" mà không kèm con số thì không kiểm chứng được.
        expect(grid.what).toContain('Hairline crack near mounting hole');
        expect(grid.what).toContain('DEF-0451');
        expect(grid.what).toContain('measured 0.20mm');
        expect(grid.what).toContain('0.50mm +/-0');
    });

    it('WHERE ghép mô tả và mã work centre', () => {
        expect(grid.where).toBe('Forming Press Line 2 (WC-PRESS-12)');
    });

    it('WHEN và HOW MANY lấy thẳng từ notification', () => {
        expect(grid.when).toBe('2026-08-05');
        expect(grid.howMany).toBe('340 units affected');
    });

    it('WHO của case Q3 nói thẳng là không được theo dõi', () => {
        // Đây là khoảng trống THẬT — dataset không có trường người báo lỗi.
        expect(grid.who).toBe(NOT_TRACKED.who);
        expect(isGap(grid.who)).toBe(true);
    });
});

describe('case Q1 khách hàng', () => {
    it('WHO là người liên hệ phía khách, không phải nhân sự nội bộ', () => {
        const grid = resolveFiveW2H(ctx({
            origin: ORIGIN_CUSTOMER, isCustomerFacing: true,
            customer: { plantContact: 'Anna Weber' },
        }));
        expect(grid.who).toBe('Anna Weber (customer contact)');
        expect(isGap(grid.who)).toBe(false);
    });

    it('Q1 mà không có người liên hệ thì vẫn nói là không theo dõi, không bịa tên', () => {
        const grid = resolveFiveW2H(ctx({ origin: ORIGIN_CUSTOMER, isCustomerFacing: true, customer: {} }));
        expect(grid.who).toBe(NOT_TRACKED.who);
    });

    it("chuỗi 'N/A - ...' không được coi là tên người", () => {
        const grid = resolveFiveW2H(ctx({
            origin: ORIGIN_CUSTOMER, isCustomerFacing: true,
            customer: { plantContact: 'N/A - internal defect' },
        }));
        expect(grid.who).toBe(NOT_TRACKED.who);
    });
});

describe('ô thiếu nguồn', () => {
    it('thiếu found date ⇒ nói rõ chưa ghi, không để trống', () => {
        const grid = resolveFiveW2H(ctx({ header: { foundDate: null, quantityExtent: null } }));
        expect(grid.when).toBe(NOT_TRACKED.when);
        expect(grid.howMany).toBe(NOT_TRACKED.howMany);
        // Không ô nào được là chuỗi rỗng — ô trống trông như chưa ai nhập.
        expect(Object.values(grid).every((value) => value.length > 0)).toBe(true);
    });

    it('thiếu work centre ⇒ nói rõ chưa ghi', () => {
        expect(resolveFiveW2H(ctx({ product: {} })).where).toBe(NOT_TRACKED.where);
    });

    it('không có số đo vượt spec thì WHAT vẫn nêu được mã lỗi', () => {
        const grid = resolveFiveW2H(ctx({ inspections: [] }));
        expect(grid.what).toContain('Hairline crack');
        expect(grid.what).not.toContain('measured');
    });
});

describe('ghi vào D2', () => {
    it('thay sáu ô lưới nhưng KHÔNG đụng đoạn văn của model', () => {
        const result = {
            disciplines: [{
                code: 'D2',
                data: { problem: { statement: 'Model-written paragraph.', what: 'model guess', gaps: ['x'] } },
            }],
        };
        applyResolvedProblemFields(result, ctx());

        const problem = (result.disciplines[0] as any).data.problem;
        expect(problem.statement).toBe('Model-written paragraph.');   // giữ nguyên
        expect(problem.gaps).toEqual(['x']);                          // giữ nguyên
        expect(problem.what).not.toBe('model guess');                 // bị chốt lại
        expect(problem.who).toBe(NOT_TRACKED.who);
        expect(problem.extent).toBe('340 units affected');
    });

    it('Is/Is-Not so được ⇒ hiện cặp; không so được ⇒ hiện LÝ DO, không để hai ô trống', () => {
        const applicable = { disciplines: [{ code: 'D2', data: {} }] };
        applyResolvedProblemFields(applicable, ctx({
            isIsNot: { is: 'EQ-A — 3/4', isNot: 'EQ-B — 0/3', notes: null, applicable: true, citedLotIds: ['L1'], reason: null },
        }));
        expect((applicable.disciplines[0] as any).data.problem.is).toEqual(['EQ-A — 3/4']);

        const notApplicable = { disciplines: [{ code: 'D2', data: {} }] };
        applyResolvedProblemFields(notApplicable, ctx({
            isIsNot: { is: null, isNot: null, notes: null, applicable: false, citedLotIds: [], reason: 'Not applicable — no measurable characteristic.' },
        }));
        const problem = (notApplicable.disciplines[0] as any).data.problem;
        expect(problem.is).toEqual([]);
        expect(problem.isIsNotStatus).toMatch(/no measurable characteristic/);
    });

    it('không có D2 thì không nổ', () => {
        expect(() => applyResolvedProblemFields({ disciplines: [{ code: 'D1' }] }, ctx())).not.toThrow();
    });
});
