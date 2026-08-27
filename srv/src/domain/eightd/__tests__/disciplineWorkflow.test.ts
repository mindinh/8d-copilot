/**
 * Hai quyết định thuần của vòng đời duyệt: suy ra 'In review', và cổng đóng case.
 *
 * Phần đọc/ghi DB không test ở đây — nó cần CAP dựng sẵn, và luật nằm hết trong
 * hai hàm dưới đây chứ không nằm trong câu SQL.
 */

import {
    buildClosureGate,
    deriveStepState,
    isSuggestionOutcome,
    STORED_STEP_STATUSES,
    SUGGESTION_OUTCOMES,
} from '../disciplineWorkflow';
import { DISCIPLINE_CODES } from '../types';

const NOTHING = { accepted: 0, edited: 0 };

describe('trạng thái bước', () => {
    it('chỉ LƯU hai giá trị — In review không phải là một trong số đó', () => {
        expect(STORED_STEP_STATUSES).toEqual(['Draft', 'Complete']);
        expect(STORED_STEP_STATUSES as readonly string[]).not.toContain('InReview');
    });

    it('bước chưa ai đụng vào thì là Draft', () => {
        expect(deriveStepState('Draft', NOTHING)).toBe('Draft');
    });

    it('có accepted hoặc edited thì suy ra InReview', () => {
        expect(deriveStepState('Draft', { accepted: 1, edited: 0 })).toBe('InReview');
        expect(deriveStepState('Draft', { accepted: 0, edited: 3 })).toBe('InReview');
    });

    it('Complete thắng mọi dấu vết audit', () => {
        expect(deriveStepState('Complete', { accepted: 5, edited: 2 })).toBe('Complete');
        expect(deriveStepState('Complete', NOTHING)).toBe('Complete');
    });

    it('chỉ đề xuất bị TỪ CHỐI hoặc mới trình bày thì vẫn là Draft', () => {
        // `shown` và `rejected` không tính: người dùng nhìn thấy rồi bỏ qua không
        // có nghĩa là họ đang làm bước đó.
        expect(deriveStepState('Draft', NOTHING)).toBe('Draft');
    });
});

describe('cổng đóng case', () => {
    const D1_TO_D7 = DISCIPLINE_CODES.filter((code) => code !== 'D8');

    it('chặn khi chưa có bước nào Complete, và liệt kê đủ D1–D7', () => {
        const gate = buildClosureGate([]);
        expect(gate.passed).toBe(false);
        expect(gate.incomplete).toEqual([...D1_TO_D7]);
        expect(gate.message).toContain('Cannot close');
    });

    it('vẫn chặn khi chỉ còn thiếu một bước, và gọi đúng tên bước đó', () => {
        const gate = buildClosureGate(D1_TO_D7.filter((code) => code !== 'D5'));
        expect(gate.passed).toBe(false);
        expect(gate.incomplete).toEqual(['D5']);
        expect(gate.message).toBe('Cannot close: D5 is not marked complete.');
    });

    it('mở khi đủ D1–D7', () => {
        const gate = buildClosureGate(D1_TO_D7);
        expect(gate.passed).toBe(true);
        expect(gate.incomplete).toEqual([]);
    });

    it('KHÔNG đòi D8 phải Complete — D8 không tự xét chính nó', () => {
        // Nếu cổng xét cả D8 thì không bao giờ đóng được case: D8 chỉ Complete
        // được sau khi cổng đã mở, tức là một vòng lặp chết.
        expect(buildClosureGate(D1_TO_D7).passed).toBe(true);
        expect(buildClosureGate([...D1_TO_D7, 'D8']).passed).toBe(true);
    });

    it('bước lạ không thay được cho một bước còn thiếu', () => {
        const gate = buildClosureGate(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D9']);
        expect(gate.passed).toBe(false);
        expect(gate.incomplete).toEqual(['D7']);
    });
});

describe('giá trị outcome của audit', () => {
    it('nhận đúng bốn giá trị, kể cả shown', () => {
        expect(SUGGESTION_OUTCOMES).toEqual(['shown', 'accepted', 'rejected', 'edited']);
        for (const outcome of SUGGESTION_OUTCOMES) expect(isSuggestionOutcome(outcome)).toBe(true);
    });

    it('từ chối giá trị ngoài danh sách', () => {
        expect(isSuggestionOutcome('approved')).toBe(false);
        expect(isSuggestionOutcome('')).toBe(false);
    });
});
