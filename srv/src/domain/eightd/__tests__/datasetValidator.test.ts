/**
 * Test validator sau khi đổi vai trò.
 *
 * Validator KHÔNG còn là cổng chặn. Nó chỉ từ chối khi payload không phải một
 * case; mọi thứ khác thành cảnh báo chất lượng, chảy vào `CaseContext.gaps` và
 * được gửi cho model làm ngữ cảnh.
 *
 * Lý do đổi nằm ở `mock-data/dirty/`: với luật cũ, cả 12 case mô phỏng dữ liệu
 * SAP thật đều bị chặn. Từ chối phân tích chúng là từ chối đúng những case cần
 * giúp nhất.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
    blockingIssues,
    isDeliberateNA,
    isRootCauseFlag,
    qualityIssues,
    validateDataset,
} from '../datasetValidator';

const MOCK_DIR = path.resolve(__dirname, '../../../../../mock-data/clean');

function load(name = 'case-8D-10048412.json') {
    return JSON.parse(fs.readFileSync(path.join(MOCK_DIR, name), 'utf-8'));
}

const ALL_CASES = fs.readdirSync(MOCK_DIR)
    .filter((f) => f.startsWith('case-') && f.endsWith('.json'))
    .sort();

const blockingIds = (raw: unknown) =>
    blockingIssues(validateDataset(raw)).map((i) => i.constraintId);
const qualityIds = (raw: unknown) =>
    qualityIssues(validateDataset(raw)).map((i) => i.constraintId);

// ─────────────────────────────────────────────────────────────────────────────

describe('bộ clean', () => {
    it.each(ALL_CASES)('%s không có vi phạm chặn', (file) => {
        expect(blockingIds(load(file))).toEqual([]);
    });

    it.each(ALL_CASES)('%s cũng không có cảnh báo chất lượng nào', (file) => {
        // Đây là điều phân biệt `clean/` với `dirty/`: bộ sạch phải sạch tuyệt
        // đối, nếu không thì không còn là mốc so sánh.
        expect(qualityIds(load(file))).toEqual([]);
    });

    it('phủ đủ 6 nhánh Ishikawa làm nguyên nhân gốc', () => {
        const roots = new Set(
            ALL_CASES.map((f) => {
                const rows = load(f).data.causes_ishikawa as Array<Record<string, string>>;
                return rows.find((r) => isRootCauseFlag(r.is_root_cause))?.category;
            }),
        );
        expect([...roots].sort()).toEqual(
            ['Environment', 'Machine', 'Man', 'Material', 'Measurement', 'Method'],
        );
    });

    it('phủ cả hai origin và cả ba trạng thái SAP', () => {
        const notes = ALL_CASES.map((f) => load(f).data.notifications[0]);
        expect(new Set(notes.map((n: any) => String(n.origin).slice(0, 2))))
            .toEqual(new Set(['Q1', 'Q3']));
        expect(new Set(notes.map((n: any) => n.status)))
            .toEqual(new Set(['In Process', 'Completed', 'Closed']));
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('CHẶN — payload không phải một case', () => {
    it('không phải object', () => {
        expect(blockingIds('nope')).toContain('SHAPE');
        expect(blockingIds(null)).toContain('SHAPE');
    });

    it("thiếu khối 'data'", () => {
        expect(blockingIds({ meta: {} })).toContain('SHAPE');
    });

    it('không có dòng notifications', () => {
        expect(blockingIds({ data: { notifications: [] } })).toContain('SHAPE');
    });

    it('nhiều hơn một case trong một file', () => {
        const raw = load();
        raw.data.notifications.push({ ...raw.data.notifications[0], notification_id: '8D-99999999' });
        expect(blockingIds(raw)).toContain('SHAPE');
    });

    it('thiếu notification_id — không có khoá để join', () => {
        expect(blockingIds({ data: { notifications: [{ origin: 'Q3 - Internal Defect' }] } }))
            .toContain('SHAPE');
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('KHÔNG chặn — chỉ là vấn đề chất lượng', () => {
    /** Mọi thứ ở đây từng chặn pipeline; giờ chỉ cảnh báo. */
    const cases: Array<[string, string, (raw: any) => void]> = [
        ['thiếu nhánh Ishikawa', 'ISHIKAWA-COVERAGE',
            (r) => { r.data.causes_ishikawa = r.data.causes_ishikawa.slice(0, 3); }],
        ['không nhánh nào được đánh dấu root cause', 'ROOT-CAUSE-FLAG',
            (r) => { for (const x of r.data.causes_ishikawa) x.is_root_cause = 'N'; }],
        ['hai nhánh cùng đánh dấu root cause', 'ROOT-CAUSE-FLAG',
            (r) => { r.data.causes_ishikawa[0].is_root_cause = 'Y'; }],
        ['5-Why rỗng', 'FIVE-WHY-DEPTH',
            (r) => { r.data.five_why_chain = []; }],
        ['5-Why chỉ một bước', 'FIVE-WHY-DEPTH',
            (r) => { r.data.five_why_chain = r.data.five_why_chain.slice(0, 1); }],
        ['team_size lệch số dòng', 'TEAM-SIZE-MATCH',
            (r) => { r.data.notifications[0].team_size = 99; }],
        ['không có trưởng nhóm', 'TEAM-ONE-LEADER',
            (r) => { for (const x of r.data.team_assignments) x.partner_role = '8D Team Member'; }],
        ['action trùng dòng', 'PK-UNIQUE',
            (r) => { r.data.actions.push({ ...r.data.actions[0] }); }],
        ['khoá ngoại trỏ vào nơi không tồn tại', 'FK-EXISTS',
            (r) => { r.data.notifications[0].material_id = 'MAT-KHONG-TON-TAI'; }],
        ['action không được phân loại', 'ACTION-TYPE-MISSING',
            (r) => { for (const a of r.data.actions) a.action_type = ''; }],
        ['case Q3 mang dữ liệu khách hàng', 'Q1-ONLY-CUSTOMER-FIELDS',
            (r) => { r.data.customer_reference[0].complaint_reference = 'CC-2026-9999'; }],
    ];

    it.each(cases)('%s → cảnh báo %s, không chặn', (_label, constraintId, mutate) => {
        const raw = load();
        mutate(raw);
        expect(qualityIds(raw)).toContain(constraintId);
        expect(blockingIds(raw)).toEqual([]);
    });

    it('case đã đóng mà thiếu loại action chỉ là cảnh báo', () => {
        const raw = load('case-8D-10048603.json'); // Closed
        raw.data.actions = raw.data.actions.filter((a: any) => a.action_type !== 'Preventive');
        expect(qualityIds(raw)).toContain('ACTION-TYPE-COVERAGE');
        expect(blockingIds(raw)).toEqual([]);
    });

    it('case đang mở mà thiếu preventive thì KHÔNG kêu gì cả — đúng luật', () => {
        expect(validateDataset(load('case-8D-10048651.json'))).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('dung sai với dữ liệu bẩn', () => {
    it('khoá ngoại có khoảng trắng thừa vẫn khớp', () => {
        const raw = load();
        raw.data.notifications[0].material_id = `  ${raw.data.materials[0].material_id} `;
        expect(qualityIds(raw)).not.toContain('FK-EXISTS');
    });

    it('khoá ngoại sai hoa thường vẫn khớp', () => {
        const raw = load();
        raw.data.notifications[0].work_center_id =
            String(raw.data.work_centers[0].work_center_id).toLowerCase();
        expect(qualityIds(raw)).not.toContain('FK-EXISTS');
    });

    it('ô trống dạng chuỗi ở trường khách hàng không bị coi là dữ liệu thật', () => {
        const raw = load(); // case Q3
        raw.data.customer_reference[0].customer_plant_contact = '   ';
        expect(qualityIds(raw)).not.toContain('Q1-ONLY-CUSTOMER-FIELDS');
    });
});

describe('isRootCauseFlag', () => {
    it.each([
        ['Y', true], ['y', true], ['x', true], ['X', true],
        ['ja', true], ['yes', true], ['✓', true],
        ['N', false], ['', false], ['-', false], ['nein', false],
    ])('%s → %s', (value, expected) => {
        expect(isRootCauseFlag(value)).toBe(expected);
    });

    it('null và undefined không phải cờ', () => {
        expect(isRootCauseFlag(null)).toBe(false);
        expect(isRootCauseFlag(undefined)).toBe(false);
    });
});

describe('isDeliberateNA', () => {
    it.each([
        ['N/A - internal defect, no customer reference', true],
        ['N/A', true],
        ['n/a - lowercase still counts', true],
        ['CC-2026-0442', false],
        ['', false],
    ])('%s → %s', (value, expected) => {
        expect(isDeliberateNA(value)).toBe(expected);
    });

    it('null không phải "N/A có chủ đích" — đó là thiếu dữ liệu thật', () => {
        expect(isDeliberateNA(null)).toBe(false);
        expect(isDeliberateNA(undefined)).toBe(false);
    });
});

describe('thông báo', () => {
    it('gắn kèm notification_id để biết case nào', () => {
        const raw = load();
        raw.data.notifications[0].team_size = 99;
        const issue = validateDataset(raw).find((i) => i.constraintId === 'TEAM-SIZE-MATCH');
        expect(issue?.message).toContain('8D-10048412');
    });

    it('cảnh báo nói rõ thiếu nhánh nào, không chỉ nói "sai"', () => {
        const raw = load();
        raw.data.causes_ishikawa = raw.data.causes_ishikawa.filter(
            (r: any) => !['Man', 'Environment'].includes(r.category),
        );
        const msg = validateDataset(raw).find((i) => i.constraintId === 'ISHIKAWA-COVERAGE')?.message;
        expect(msg).toContain('Man');
        expect(msg).toContain('Environment');
    });
});
