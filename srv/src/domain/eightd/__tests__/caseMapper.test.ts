/**
 * Test cho mapper — chạy trên FILE JSON THẬT trong mock-data/, không phải
 * fixture tự chế.
 *
 * Lý do: mapper tồn tại để hiểu đúng định dạng của nhóm. Test bằng fixture tự
 * viết chỉ chứng minh mapper hiểu được thứ chính tôi vừa bịa ra — nó sẽ vẫn xanh
 * trong khi dataset thật đã đổi hình dạng.
 */

import fs from 'node:fs';
import path from 'node:path';
import { evaluateOutOfSpec, mapCase } from '../caseMapper';
import { PipelineError } from '../types';

const MOCK_DIR = path.resolve(__dirname, '../../../../../mock-data/clean');

/**
 * `beta/` là bộ Golden Dataset cũ, đóng băng có chủ đích. Đây là nơi duy nhất
 * còn khối `data` và `nested_case_view` — hai định dạng mapper vẫn phải đọc
 * được, nên phải có test chạy trên chúng.
 */
const LEGACY_DIR = path.resolve(__dirname, '../../../../../mock-data/beta');

function load(name: string) {
    return JSON.parse(fs.readFileSync(path.join(MOCK_DIR, name), 'utf-8'));
}

function loadLegacy(name: string) {
    return JSON.parse(fs.readFileSync(path.join(LEGACY_DIR, name), 'utf-8'));
}

const Q3_MACHINE = 'case-8D-10048412.json';   // gốc của nhóm
const Q1_MATERIAL = 'case-8D-10048577.json';
const Q3_METHOD = 'case-8D-10048603.json';
const Q1_MEASUREMENT = 'case-8D-10048651.json'; // thiếu preventive + fmea, cố ý

describe('evaluateOutOfSpec', () => {
    it.each([
        ['0.32mm', 'max 0.10mm', true],
        ['0.08mm', 'max 0.10mm', false],
        ['12 mbar*l/s', 'max 5 mbar*l/s', true],
        ['3.8%', 'max 1.0%', true],
        ['24.912mm', '24.950-25.000mm', true],
        ['24.980mm', '24.950-25.000mm', false],
        ['38um', '60-90um', true],
        ['75um', '60-90um', false],
        ['0.09mm', '0.05mm +/-0', true],
        ['Class 3', 'Class 0-1', true],
        ['Class 1', 'Class 0-1', false],
    ])('%s vs %s → outOfSpec=%s', (measured, spec, expected) => {
        expect(evaluateOutOfSpec(measured, spec)).toBe(expected);
    });

    it('trả null khi không parse được số đo', () => {
        expect(evaluateOutOfSpec('pass', 'max 0.10mm')).toBeNull();
    });

    it('trả null khi không hiểu định dạng spec — thà không biết còn hơn đoán sai', () => {
        expect(evaluateOutOfSpec('0.32mm', 'per drawing DOC-4610')).toBeNull();
    });
});

describe('mapCase — case gốc của nhóm', () => {
    const ctx = mapCase(load(Q3_MACHINE));

    it('bóc đúng case header', () => {
        expect(ctx.notificationId).toBe('8D-10048412');
        expect(ctx.origin).toBe('Q3 - Internal Defect');
        expect(ctx.isCustomerFacing).toBe(false);
        expect(ctx.header.quantityExtent).toBe('128 units affected');
        expect(ctx.header.completionDate).toBeNull();
    });

    it('join master data qua khoá ngoại', () => {
        expect(ctx.product.materialId).toBe('MAT-10247');
        expect(ctx.product.materialDesc).toBe('Bracket Housing X240');
        expect(ctx.product.workCenterDesc).toBe('CNC Milling Line 7');
    });

    it('tách đúng dòng root cause trong 6 dòng Ishikawa', () => {
        expect(ctx.ishikawa).toHaveLength(6);
        expect(ctx.rootCause?.category).toBe('Machine');
        expect(ctx.rootCause?.metricValue).toBe('11,800 cycles');
        expect(ctx.ishikawa.filter((r) => r.isRootCause)).toHaveLength(1);
    });

    it('sắp 5-Why theo thứ tự và đánh dấu bước root cause', () => {
        expect(ctx.fiveWhy.map((r) => r.stepNo)).toEqual([1, 2, 3]);
        const rc = ctx.fiveWhy.filter((r) => r.isRootCauseStep);
        expect(rc).toHaveLength(1);
        expect(rc[0].stepNo).toBe(2);
        expect(rc[0].evidenceCitation).toContain('EQ-MILL07-002');
    });

    it('gom action theo ánh xạ action_type → bước 8D', () => {
        expect(ctx.actions.containment).toHaveLength(1);
        expect(ctx.actions.corrective).toHaveLength(1);
        expect(ctx.actions.preventive).toHaveLength(1);
        expect(ctx.actions.preventive[0].status).toBe('Planned');
    });

    it('tách leader khỏi members', () => {
        expect(ctx.team.leader?.partnerName).toBe('Heli Weber');
        expect(ctx.team.members).toHaveLength(3);
        expect(ctx.team.members.every((m) => m.partnerRole === '8D Team Member')).toBe(true);
    });

    it('so sánh số đo với dung sai', () => {
        const burr = ctx.inspections.find((i) => i.characteristic === 'Flange burr height');
        expect(burr?.outOfSpec).toBe(true);
    });

    it('coi chuỗi "N/A -" là không áp dụng, không phải thiếu dữ liệu', () => {
        expect(ctx.customer.applicable).toBe(false);
        expect(ctx.customer.complaintReference).toContain('N/A');
        // Không được báo gap: case nội bộ vốn dĩ không có khách hàng.
        expect(ctx.gaps.some((g) => /customer/i.test(g))).toBe(false);
    });
});

describe('mapCase — case Q1 khách hàng', () => {
    const ctx = mapCase(load(Q1_MATERIAL));

    it('bật cờ customer-facing và giữ dữ liệu khách hàng thật', () => {
        expect(ctx.isCustomerFacing).toBe(true);
        expect(ctx.customer.applicable).toBe(true);
        expect(ctx.customer.complaintReference).toBe('CC-2026-0442');
        expect(ctx.customer.slaResponseDue).toBe('2026-07-09');
    });

    it('nhận root cause Material', () => {
        expect(ctx.rootCause?.category).toBe('Material');
    });

    it('lấy được COPQ và FMEA', () => {
        expect(ctx.copqEur).toBe(28900);
        expect(ctx.fmea?.fmeaId).toBe('FMEA-CAST03-07');
    });

    it('gom nhiều action cùng loại', () => {
        expect(ctx.actions.containment).toHaveLength(2);
        expect(ctx.actions.containment.map((a) => a.lineNo)).toEqual([1, 2]);
    });
});

describe('mapCase — case cố ý thiếu dữ liệu', () => {
    const ctx = mapCase(load(Q1_MEASUREMENT));

    it('báo gap khi không có preventive action', () => {
        expect(ctx.actions.preventive).toHaveLength(0);
        expect(ctx.gaps.some((g) => /preventive/i.test(g))).toBe(true);
    });

    it('báo gap khi không có FMEA link', () => {
        expect(ctx.fmea).toBeNull();
        expect(ctx.gaps.some((g) => /FMEA/i.test(g))).toBe(true);
    });

    it('vẫn bóc được phần dữ liệu có', () => {
        expect(ctx.rootCause?.category).toBe('Measurement');
        expect(ctx.actions.containment).toHaveLength(2);
        expect(ctx.team.leader?.partnerName).toBe('Thien Tu');
    });
});

describe('mapCase — chuỗi 5-Why dài hơn', () => {
    it('giữ đủ 4 bước và đúng thứ tự', () => {
        const ctx = mapCase(load(Q3_METHOD));
        expect(ctx.fiveWhy).toHaveLength(4);
        expect(ctx.fiveWhy.map((r) => r.stepNo)).toEqual([1, 2, 3, 4]);
        expect(ctx.fiveWhy.filter((r) => r.isRootCauseStep)[0].stepNo).toBe(4);
    });
});

describe('mapCase — phương án dự phòng và lỗi', () => {
    it('map được từ nested_case_view khi không có khối data', () => {
        const raw = loadLegacy(Q3_MACHINE);
        const ctx = mapCase({ nested_case_view: raw.nested_case_view });

        expect(ctx.notificationId).toBe('8D-10048412');
        expect(ctx.rootCause?.category).toBe('Machine');
        expect(ctx.actions.containment).toHaveLength(1);
        expect(ctx.team.leader?.partnerName).toBe('Heli Weber');
        expect(ctx.product.materialDesc).toBe('Bracket Housing X240');
    });

    it('cho ra cùng root cause dù đọc data hay nested_case_view', () => {
        const raw = loadLegacy(Q1_MATERIAL);
        const fromData = mapCase(raw);
        const fromNested = mapCase({ nested_case_view: raw.nested_case_view });

        expect(fromNested.rootCause?.category).toBe(fromData.rootCause?.category);
        expect(fromNested.fiveWhy).toHaveLength(fromData.fiveWhy.length);
        expect(fromNested.actions.corrective).toHaveLength(fromData.actions.corrective.length);
    });

    it('map được dân số lô kiểm GD 17', () => {
        const ctx = mapCase(load(Q3_MACHINE));
        expect(ctx.historicalInspectionLots).toHaveLength(7);
        expect(ctx.historicalInspectionLots[0]).toMatchObject({
            lotId: 'INS-80411',
            equipment: 'EQ-MILL07-002',
            characteristic: 'Flange burr height',
            conforming: false,   // 'N' phải thành false, không phải truthy string
        });
        expect(ctx.historicalInspectionLots.filter((l) => l.conforming).length).toBe(4);
    });

    it('dòng is_is_not có sẵn trong dataset THẮNG giá trị tính', () => {
        // File này có sẵn isIsNot chép tay. Override phải thắng, và khi thắng thì
        // không có mã lô nào để trích — đó là lý do bản tính mới là mặc định.
        const ctx = mapCase(load(Q3_MACHINE));
        expect(ctx.isIsNot?.applicable).toBe(true);
        expect(ctx.isIsNot?.is).toContain('X240 flange edge');
        expect(ctx.isIsNot?.citedLotIds).toEqual([]);
    });

    it('không có dòng is_is_not thì TÍNH từ GD 17, kèm mã lô truy được', () => {
        const raw = load(Q3_MACHINE);
        delete (raw.data ?? raw).isIsNot;
        const ctx = mapCase(raw);

        expect(ctx.isIsNot?.applicable).toBe(true);
        // EQ-MILL07-002: 3/4 hỏng (75%). EQ-MILL07-005: 0/3 (0%).
        expect(ctx.isIsNot?.is).toContain('EQ-MILL07-002');
        expect(ctx.isIsNot?.is).toContain('3/4');
        expect(ctx.isIsNot?.isNot).toContain('EQ-MILL07-005');
        expect(ctx.isIsNot?.isNot).toContain('0/3');
        // Khác hẳn override: bản tính mang theo bằng chứng để đếm lại.
        expect(ctx.isIsNot?.citedLotIds).toHaveLength(7);
    });

    it('ném PipelineError 400 khi payload không phải Golden Dataset', () => {
        expect(() => mapCase({ hello: 'world' })).toThrow(PipelineError);
        try {
            mapCase({ hello: 'world' });
        } catch (e: any) {
            expect(e.code).toBe(400);
        }
    });
});
