/**
 * Test lưới an toàn.
 *
 * Đây là chỗ chống bịa cuối cùng: model có thể trả về một discipline nghe rất
 * thuyết phục mà không có fact nào chống lưng. Các test dưới đây dựng đúng những
 * kiểu trả về sai đó rồi khẳng định `postProcess` bắt được và GHI LẠI.
 */

import fs from 'node:fs';
import path from 'node:path';
import { mapCase } from '../caseMapper';
import { postProcess } from '../postProcess';
import { DISCIPLINE_CODES, type DisciplineDraft, type EightDResult } from '../types';

const MOCK_DIR = path.resolve(__dirname, '../../../../../mock-data/clean');
const load = (n: string) => JSON.parse(fs.readFileSync(path.join(MOCK_DIR, n), 'utf-8'));

const ctxQ3 = mapCase(load('case-8D-10048412.json'));  // internal, đủ 3 loại action
const ctxQ1 = mapCase(load('case-8D-10048577.json'));  // customer complaint
const ctxGaps = mapCase(load('case-8D-10048651.json')); // thiếu preventive + fmea

function draft(code: string, over: Partial<DisciplineDraft> = {}): DisciplineDraft {
    return {
        code: code as DisciplineDraft['code'],
        sequence: 0,
        title: `Title ${code}`,
        summary: `Summary ${code}`,
        content: `Content ${code}`,
        actionItems: [],
        sources: ['header'],
        confidence: 0.9,
        dataBacked: true,
        ...over,
    };
}

function fullResult(over: Partial<EightDResult> = {}): EightDResult {
    return {
        internalSummary: 'Internal summary.',
        customerSummary: null,
        disciplines: DISCIPLINE_CODES.map((c) => draft(c, c === 'D6' ? { dataBacked: false } : {})),
        ...over,
    };
}

describe('postProcess — đường thẳng', () => {
    it('giữ nguyên kết quả hợp lệ và không báo chữa gì', () => {
        const { result, repairs } = postProcess(fullResult(), ctxQ3);
        expect(result.disciplines).toHaveLength(8);
        expect(result.disciplines.map((d) => d.code)).toEqual([...DISCIPLINE_CODES]);
        expect(repairs).toEqual([]);
    });

    it('đánh số sequence lại theo thứ tự chuẩn, bỏ qua số model tự gán', () => {
        const r = fullResult();
        r.disciplines = r.disciplines.map((d) => ({ ...d, sequence: 99 }));
        const { result } = postProcess(r, ctxQ3);
        expect(result.disciplines.map((d) => d.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('sắp lại đúng thứ tự khi model trả lộn xộn', () => {
        const r = fullResult();
        r.disciplines = [...r.disciplines].reverse();
        const { result } = postProcess(r, ctxQ3);
        expect(result.disciplines.map((d) => d.code)).toEqual([...DISCIPLINE_CODES]);
    });
});

describe('postProcess — discipline thiếu hoặc thừa', () => {
    it('chèn placeholder cho discipline bị bỏ sót', () => {
        const r = fullResult();
        r.disciplines = r.disciplines.filter((d) => d.code !== 'D5');
        const { result, repairs } = postProcess(r, ctxQ3);

        expect(result.disciplines).toHaveLength(8);
        const d5 = result.disciplines.find((d) => d.code === 'D5')!;
        expect(d5.dataBacked).toBe(false);
        expect(d5.confidence).toBe(0);
        expect(repairs).toContain('Thiếu D5; chèn placeholder.');
    });

    it('bỏ discipline trùng, giữ bản đầu', () => {
        const r = fullResult();
        r.disciplines.push(draft('D2', { summary: 'Bản thứ hai' }));
        const { result, repairs } = postProcess(r, ctxQ3);

        expect(result.disciplines).toHaveLength(8);
        expect(result.disciplines.find((d) => d.code === 'D2')!.summary).toBe('Summary D2');
        expect(repairs.some((x) => /trùng D2/.test(x))).toBe(true);
    });

    it('bỏ mã lạ ngoài D1..D8', () => {
        const r = fullResult();
        r.disciplines.push(draft('D9'));
        const { result, repairs } = postProcess(r, ctxQ3);

        expect(result.disciplines).toHaveLength(8);
        expect(repairs.some((x) => /mã lạ/.test(x))).toBe(true);
    });

    it('trả đủ 8 placeholder khi model trả mảng rỗng', () => {
        const { result, repairs } = postProcess(fullResult({ disciplines: [] }), ctxQ3);
        expect(result.disciplines).toHaveLength(8);
        expect(repairs).toHaveLength(8);
    });
});

describe('postProcess — chống bịa', () => {
    it('luôn hạ dataBacked của D6 xuống false', () => {
        const r = fullResult();
        r.disciplines = r.disciplines.map((d) =>
            d.code === 'D6' ? { ...d, dataBacked: true, confidence: 0.95 } : d,
        );
        const { result, repairs } = postProcess(r, ctxQ3);

        expect(result.disciplines.find((d) => d.code === 'D6')!.dataBacked).toBe(false);
        expect(repairs.some((x) => /^D6 được đánh dataBacked=true/.test(x))).toBe(true);
    });

    it('hạ dataBacked khi khẳng định có dữ liệu mà sources rỗng', () => {
        const r = fullResult();
        r.disciplines = r.disciplines.map((d) =>
            d.code === 'D4' ? { ...d, sources: [] } : d,
        );
        const { result, repairs } = postProcess(r, ctxQ3);

        expect(result.disciplines.find((d) => d.code === 'D4')!.dataBacked).toBe(false);
        expect(repairs.some((x) => /D4: dataBacked=true nhưng không còn source/.test(x))).toBe(true);
    });

    it('hạ D7 khi CaseContext không có preventive action lẫn FMEA', () => {
        // Đây là phép thử quan trọng nhất: case-8D-10048651 cố ý thiếu cả hai.
        expect(ctxGaps.actions.preventive).toHaveLength(0);
        expect(ctxGaps.fmea).toBeNull();

        const { result, repairs } = postProcess(fullResult(), ctxGaps);

        expect(result.disciplines.find((d) => d.code === 'D7')!.dataBacked).toBe(false);
        expect(repairs.some((x) => /^D7: dataBacked=true nhưng CaseContext không có/.test(x))).toBe(true);
    });

    it('KHÔNG hạ D7 khi case có preventive action thật', () => {
        const { result } = postProcess(fullResult(), ctxQ3);
        expect(result.disciplines.find((d) => d.code === 'D7')!.dataBacked).toBe(true);
    });
});

describe('postProcess — làm sạch giá trị', () => {
    it('cắt summary quá dài', () => {
        const r = fullResult();
        r.disciplines = r.disciplines.map((d) =>
            d.code === 'D1' ? { ...d, summary: 'x'.repeat(700) } : d,
        );
        const { result, repairs } = postProcess(r, ctxQ3);

        expect(result.disciplines.find((d) => d.code === 'D1')!.summary).toHaveLength(500);
        expect(repairs.some((x) => /summary dài 700/.test(x))).toBe(true);
    });

    it.each([
        [1.4, 1],
        [-0.2, 0],
    ])('kẹp confidence %s về %s', (given, expected) => {
        const r = fullResult();
        r.disciplines = r.disciplines.map((d) =>
            d.code === 'D3' ? { ...d, confidence: given } : d,
        );
        const { result } = postProcess(r, ctxQ3);
        expect(result.disciplines.find((d) => d.code === 'D3')!.confidence).toBe(expected);
    });

    it('đặt confidence = 0 khi model trả về thứ không phải số', () => {
        const r = fullResult();
        r.disciplines = r.disciplines.map((d) =>
            d.code === 'D3' ? { ...d, confidence: 'high' as any } : d,
        );
        const { result, repairs } = postProcess(r, ctxQ3);

        expect(result.disciplines.find((d) => d.code === 'D3')!.confidence).toBe(0);
        expect(repairs.some((x) => /không phải số/.test(x))).toBe(true);
    });

    it('điền title mặc định khi model để trống', () => {
        const r = fullResult();
        r.disciplines = r.disciplines.map((d) => (d.code === 'D4' ? { ...d, title: '  ' } : d));
        const { result } = postProcess(r, ctxQ3);
        expect(result.disciplines.find((d) => d.code === 'D4')!.title).toBe('Root Cause Analysis');
    });
});

describe('postProcess — structured data.sources phải cùng bộ lọc với discipline.sources', () => {
    const d1GroundOnly = JSON.stringify({
        enabled: true,
        rules: [
            {
                id: 'D1_GROUNDING',
                type: 'sourcePattern',
                severity: 'error',
                enabled: true,
                pattern: '^(team\\.|precedents#)',
                message: 'Team identities must come from the current team or a cited precedent.',
            },
        ],
    });

    it('loại bỏ path không khớp pattern khỏi data.sources (D1)', () => {
        const r = fullResult();
        r.disciplines = r.disciplines.map((d) =>
            d.code === 'D1'
                ? {
                    ...d,
                    // sources cũ thì đúng pattern, sources mới (UI hiển thị) thì không
                    sources: ['team.leader'],
                    data: { sources: ['team', 'report[]', 'team.leader'] },
                }
                : d,
        );
        const { result, repairs } = postProcess(
            r,
            ctxQ3,
            undefined,
            undefined,
            undefined,
            { D1: d1GroundOnly },
        );
        const d1 = result.disciplines.find((d) => d.code === 'D1')!;
        expect(d1.data?.sources).toEqual(['team.leader']);
        expect(repairs.some((x) => /D1: filtered data\.sources against pattern/.test(x))).toBe(true);
    });

    it('KHÔNG đụng data.sources khi các path đều hợp lệ', () => {
        const r = fullResult();
        r.disciplines = r.disciplines.map((d) =>
            d.code === 'D1'
                ? {
                    ...d,
                    sources: ['team.leader', 'team.members#1'],
                    data: { sources: ['team.leader', 'team.members#1'] },
                }
                : d,
        );
        const { result, repairs } = postProcess(
            r,
            ctxQ3,
            undefined,
            undefined,
            [{ notificationId: 'X', team: [{ partnerName: 'A' }] }],
            { D1: d1GroundOnly },
        );
        const d1 = result.disciplines.find((d) => d.code === 'D1')!;
        expect(d1.data?.sources).toEqual(['team.leader', 'team.members#1']);
        expect(repairs.some((x) => /data\.sources/.test(x))).toBe(false);
    });

    it('áp dụng cùng bộ lọc khi path match pattern nhưng không giải được trên CaseContext', () => {
        // `precedents#999` khớp pattern nhưng vượt quá số tiền lệ — vocab check loại.
        const r = fullResult();
        r.disciplines = r.disciplines.map((d) =>
            d.code === 'D1'
                ? {
                    ...d,
                    sources: ['team.leader'],
                    data: { sources: ['team.leader', 'precedents#999'] },
                }
                : d,
        );
        const { result, repairs } = postProcess(
            r,
            ctxQ3,
            undefined,
            undefined,
            [{ notificationId: 'X', team: [] }],
            { D1: d1GroundOnly },
        );
        const d1 = result.disciplines.find((d) => d.code === 'D1')!;
        expect(d1.data?.sources).toEqual(['team.leader']);
        expect(repairs.some((x) => /D1: data\.sources không tồn tại trong CaseContext/.test(x))).toBe(true);
    });
});

describe('postProcess — ràng buộc Q1-ONLY-CUSTOMER-FIELDS', () => {
    it('bỏ customerSummary khi case là Q3 nội bộ', () => {
        const { result, repairs } = postProcess(
            fullResult({ customerSummary: 'Dear customer…' }),
            ctxQ3,
        );
        expect(result.customerSummary).toBeNull();
        expect(repairs.some((x) => /Case Q3 nhưng model vẫn sinh/.test(x))).toBe(true);
    });

    it('giữ customerSummary khi case là Q1 khách hàng', () => {
        const { result, repairs } = postProcess(
            fullResult({ customerSummary: 'Dear customer…' }),
            ctxQ1,
        );
        expect(result.customerSummary).toBe('Dear customer…');
        expect(repairs).toEqual([]);
    });

    it('báo chữa khi case Q1 mà model không sinh customerSummary', () => {
        const { repairs } = postProcess(fullResult({ customerSummary: null }), ctxQ1);
        expect(repairs.some((x) => /Case Q1 nhưng model không sinh/.test(x))).toBe(true);
    });

    it('coi chuỗi rỗng như null', () => {
        const { result } = postProcess(fullResult({ customerSummary: '   ' }), ctxQ1);
        expect(result.customerSummary).toBeNull();
    });
});

/**
 * Chế độ sinh từng bước gọi `postProcess` với ĐÚNG MỘT discipline.
 *
 * Không giới hạn phạm vi thì bảy bước kia bị coi là model bỏ sót và bị thay
 * bằng placeholder, nên kết quả vẫn là mảng D1..D8 — bên gọi lấy `[0]` sẽ nhận
 * ô D1 thay vì bước vừa sinh. Hệ quả thật đã xảy ra: mọi bước D2..D8 ghi đè lên
 * hàng D1 và báo cáo cuối cùng chỉ còn một dòng, không kèm lỗi nào.
 */
describe('postProcess — phạm vi từng bước', () => {
    it('trả về đúng bước được yêu cầu, không phải ô D1', () => {
        const { result } = postProcess(
            { internalSummary: '', customerSummary: null, disciplines: [draft('D4')] },
            ctxQ3, undefined, undefined, undefined, undefined, ['D4'],
        );

        expect(result.disciplines).toHaveLength(1);
        expect(result.disciplines[0].code).toBe('D4');
        expect(result.disciplines[0].summary).toBe('Summary D4');
    });

    it('giữ nguyên sequence chuẩn của bước, không phải vị trí trong tập con', () => {
        const { result } = postProcess(
            { internalSummary: '', customerSummary: null, disciplines: [draft('D7')] },
            ctxQ3, undefined, undefined, undefined, undefined, ['D7'],
        );
        expect(result.disciplines[0].sequence).toBe(7);
    });

    it('không báo "thiếu" cho những bước nằm ngoài phạm vi', () => {
        const { repairs } = postProcess(
            { internalSummary: '', customerSummary: null, disciplines: [draft('D2')] },
            ctxQ3, undefined, undefined, undefined, undefined, ['D2'],
        );
        expect(repairs.filter((r) => r.includes('Thiếu'))).toEqual([]);
    });

    it('vẫn chèn placeholder khi chính bước trong phạm vi bị thiếu', () => {
        const { result, repairs } = postProcess(
            { internalSummary: '', customerSummary: null, disciplines: [] },
            ctxQ3, undefined, undefined, undefined, undefined, ['D5'],
        );
        expect(result.disciplines).toHaveLength(1);
        expect(result.disciplines[0].code).toBe('D5');
        expect(repairs.some((r) => r.includes('Thiếu D5'))).toBe(true);
    });

    it('vẫn áp luật riêng của bước trong phạm vi — D6 không bao giờ dataBacked', () => {
        const { result } = postProcess(
            { internalSummary: '', customerSummary: null, disciplines: [draft('D6', { dataBacked: true })] },
            ctxQ3, undefined, undefined, undefined, undefined, ['D6'],
        );
        expect(result.disciplines[0].dataBacked).toBe(false);
    });

    it('bỏ trống phạm vi thì giữ nguyên hành vi cũ: đủ tám bước', () => {
        const { result } = postProcess(fullResult(), ctxQ3);
        expect(result.disciplines.map((d) => d.code)).toEqual([...DISCIPLINE_CODES]);
    });

    it('phạm vi rỗng cũng là hành vi cũ, không phải kết quả rỗng', () => {
        const { result } = postProcess(fullResult(), ctxQ3, undefined, undefined, undefined, undefined, []);
        expect(result.disciplines).toHaveLength(DISCIPLINE_CODES.length);
    });
});
