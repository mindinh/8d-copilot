/**
 * D6 phải tính ra được mà không cần model. Chính bộ test này là bằng chứng:
 * nếu có ngày D6 lại đi qua LLM, những khẳng định dưới đây không còn kiểm được.
 */

import { applyComputedD6, computeD6, renderD6Narrative } from '../d6Verification';
import type { ActionRow, CaseContext } from '../types';

const action = (actionText: string, status: string): ActionRow => ({
    lineNo: 1, actionType: 'x', actionText, status,
});

function contextWith(actions: Partial<CaseContext['actions']>): CaseContext {
    return {
        actions: { containment: [], corrective: [], preventive: [], ...actions },
    } as unknown as CaseContext;
}

describe('D6 tính thuần', () => {
    it('dựng checklist từ cả ba loại action, kèm đường dẫn nguồn truy được', () => {
        const result = computeD6(contextWith({
            containment: [action('Quarantine batch B-48213', 'Done')],
            corrective: [action('Replace worn forming die', 'Verified')],
            preventive: [action('Shorten inspection interval', 'In Process')],
        }));

        expect(result.verification.checklist).toEqual([
            { action: 'Quarantine batch B-48213', actionType: 'D3 - Containment', status: 'Done', sourcePath: 'actions.containment#1' },
            { action: 'Replace worn forming die', actionType: 'D5 - Corrective', status: 'Verified', sourcePath: 'actions.corrective#1' },
            { action: 'Shorten inspection interval', actionType: 'D7 - Preventive', status: 'In Process', sourcePath: 'actions.preventive#1' },
        ]);
        // Mọi dòng phải có nguồn — đây là điều kiện để ràng buộc D6_SOURCES đi qua.
        expect(result.sources).toEqual(['actions.containment#1', 'actions.corrective#1', 'actions.preventive#1']);
    });

    it('KHÔNG BAO GIỜ báo có bằng chứng kiểm chứng, kể cả khi mọi action đã Verified', () => {
        // Đây là trường hợp nguy hiểm nhất: nhìn ba dòng Verified thì câu tự
        // nhiên nhất để viết là "đã xác nhận hiệu quả" — và nó sẽ là bịa.
        const result = computeD6(contextWith({
            containment: [action('A', 'Verified')],
            corrective: [action('B', 'Verified')],
            preventive: [action('C', 'Verified')],
        }));

        expect(result.verification.evidenceAvailable).toBe('None recorded');
        expect(result.verification.gaps[0]).toMatch(/No verification evidence is recorded/);
        expect(result.verification.gaps.join(' ')).toMatch(/not measured proof|not measured|marked the work done/i);
    });

    it('nêu đích danh những action chưa xong', () => {
        const result = computeD6(contextWith({
            containment: [action('Done thing', 'Complete')],
            corrective: [action('Half-finished thing', 'In Process')],
        }));

        const gaps = result.verification.gaps.join(' ');
        expect(gaps).toMatch(/1 of 2 action\(s\) are not yet complete/);
        expect(gaps).toContain('Half-finished thing');
        expect(gaps).not.toContain('Done thing');
    });

    it('coi Complete / Verified / Done là đã xong, không phân biệt hoa thường', () => {
        const result = computeD6(contextWith({
            containment: [action('a', 'complete'), action('b', 'VERIFIED'), action('c', 'Done')],
        }));
        expect(result.verification.gaps.join(' ')).not.toMatch(/not yet complete/);
    });

    it('action thiếu status thì tính là Not Started, không phải là đã xong', () => {
        const result = computeD6(contextWith({ containment: [action('a', '')] }));
        expect(result.verification.checklist[0].status).toBe('Not Started');
        expect(result.verification.gaps.join(' ')).toMatch(/1 of 1 action/);
    });

    it('case chưa có action nào vẫn trả kết quả hợp lệ, không phải null', () => {
        // Trả null sẽ khiến D6 rơi về nhánh do model sinh — đúng thứ bước này cấm.
        const result = computeD6(contextWith({}));
        expect(result.verification.checklist).toEqual([]);
        expect(result.verification.evidenceAvailable).toBe('None recorded');
        expect(result.verification.gaps[0]).toMatch(/nothing to verify/);
        expect(result.verification.plan).toMatch(/D3, D5, and D7/);
    });

    it('cho cùng một đầu vào thì luôn ra cùng một kết quả', () => {
        const context = contextWith({ corrective: [action('Replace die', 'Verified')] });
        expect(computeD6(context)).toEqual(computeD6(context));
    });
});

describe('D6 phần tường thuật', () => {
    it('đếm đúng việc đã xong và còn mở, và không hứa hiệu quả', () => {
        const narrative = renderD6Narrative(computeD6(contextWith({
            containment: [action('A', 'Done')],
            corrective: [action('B', 'In Process')],
        })));

        expect(narrative.summary).toContain('2 recorded action(s)');
        expect(narrative.summary).toContain('1 marked done and 1 still open');
        expect(narrative.summary).toMatch(/effectiveness is not yet demonstrated/);
    });

    it('kể cả khi mọi việc đã Verified, văn xuôi vẫn không nói là đã hiệu quả', () => {
        const narrative = renderD6Narrative(computeD6(contextWith({
            corrective: [action('B', 'Verified')], preventive: [action('C', 'Verified')],
        })));
        expect(narrative.summary).toMatch(/not yet demonstrated/);
        expect(narrative.content).not.toMatch(/proven effective|confirmed effective|verified as effective/i);
    });

    it('bảng markdown trích đường dẫn nguồn cho từng dòng', () => {
        const narrative = renderD6Narrative(computeD6(contextWith({
            containment: [action('Quarantine', 'Done')],
        })));
        expect(narrative.content).toContain('`actions.containment#1`');
        expect(narrative.content).toMatch(/No part of it is AI-drafted/);
    });

    it('vẫn dựng D6 khi model quên trả bước này', () => {
        // Đây là ca đã bắt lỗi thật: model bỏ sót D6, postProcess bù vào một chỗ
        // trống "Not generated", và bản tính bị chính chỗ trống đó ghi đè.
        const result = { disciplines: [{ code: 'D5', sequence: 5 }] };
        applyComputedD6(result, contextWith({ corrective: [action('Replace die', 'Verified')] }));

        const d6 = result.disciplines.find((d: any) => d.code === 'D6') as any;
        expect(d6).toBeDefined();
        expect(d6.title).toBe('Verify Effectiveness');
        expect(d6.data.verification.checklist).toHaveLength(1);
        expect(d6.dataBacked).toBe(false);
        expect(result.disciplines.map((d: any) => d.code)).toEqual(['D5', 'D6']);
    });

    it('thay sạch chỗ trống mà model để lại, không trộn vào', () => {
        const result = {
            disciplines: [{ code: 'D6', sequence: 6, summary: 'Not generated. The model omitted this discipline.', data: {}, dataBacked: true }],
        };
        applyComputedD6(result, contextWith({ containment: [action('Quarantine', 'Done')] }));

        const d6 = result.disciplines[0] as any;
        expect(d6.summary).not.toMatch(/Not generated/);
        expect(d6.summary).toContain('1 recorded action(s)');
        // dataBacked phải bị kéo về false kể cả khi chỗ trống để true.
        expect(d6.dataBacked).toBe(false);
    });

    it('việc còn mở trở thành action item, việc đã xong thì không', () => {
        const narrative = renderD6Narrative(computeD6(contextWith({
            containment: [action('Done thing', 'Complete'), action('Open thing', 'Not Started')],
        })));
        expect(narrative.actionItems).toEqual(['Complete and verify: Open thing']);
    });
});
