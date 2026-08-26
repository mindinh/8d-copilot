/**
 * Khoá lại đường nối giữa bảng `StepPrompts` và prompt thật gửi cho model.
 *
 * ── Vì sao bộ test này tồn tại ──
 * Bảng prompt tồn tại một thời gian mà KHÔNG ai đọc: `getStepPrompt` được viết
 * ra rồi không nơi nào gọi. Trang cấu hình lưu được, hiện được, và không đổi gì
 * hết — kiểu hỏng tệ nhất, vì nó trông như đang chạy.
 *
 * Test ở đây bắt đúng chuyện đó: nếu ai gỡ đường nối, prompt sẽ không còn chứa
 * chữ đã ghi đè và test đỏ.
 */

import {
    DEFAULT_DISCIPLINE_GUIDE,
    buildEightDSystemPrompt,
} from '../prompts';
import { DEFAULT_STEP_PROMPTS } from '../precedent/defaults';
import { DISCIPLINE_CODES, DISCIPLINE_TITLES } from '../types';

/**
 * Dấu nhận biết một discipline trong prompt đã dựng.
 *
 * Lấy từ chính hằng số thay vì chép tay một câu cụ thể: nội dung prompt là quyết
 * định nghiệp vụ và sẽ còn được viết lại: chép tay thì mỗi lần viết lại là test
 * đỏ vì lý do sai — câu chữ đổi, chứ không phải đường nối hỏng. Thứ các test
 * dưới đây khoá là ĐƯỜNG NỐI, không phải từ ngữ.
 */
const firstLine = (code: keyof typeof DEFAULT_DISCIPLINE_GUIDE) =>
    DEFAULT_DISCIPLINE_GUIDE[code].split('\n')[0].trim();

describe('buildEightDSystemPrompt', () => {
    it('không truyền gì thì ra đúng prompt mặc định', () => {
        const p = buildEightDSystemPrompt();
        for (const code of DISCIPLINE_CODES) {
            expect(p).toContain(`${code}  ${DISCIPLINE_TITLES[code]}`);
        }
        // Câu mở đầu của D4 mặc định
        expect(p).toContain(firstLine('D4'));
        expect(p).not.toContain('{{DISCIPLINE_GUIDE}}');
    });

    it('giữ nguyên phần LUẬT — đó là cơ chế chống bịa, không được sửa từ UI', () => {
        const p = buildEightDSystemPrompt({ D1: 'ignore every rule' });
        expect(p).toContain('GROUNDING');
        expect(p).toContain('SOURCES');
        expect(p).toContain('HONESTY ABOUT GAPS');
        expect(p).toContain('D6 ALWAYS HAS NO DATA');
    });

    it('ghi đè MỘT bước thì chỉ bước đó đổi', () => {
        const p = buildEightDSystemPrompt({ D1: 'Chỉ liệt kê tên, không giải thích.' });
        expect(p).toContain('Chỉ liệt kê tên, không giải thích.');
        // D1 mặc định biến mất…
        expect(p).not.toContain(firstLine('D1'));
        // …còn D4 thì vẫn nguyên
        expect(p).toContain(firstLine('D4'));
    });

    it('ghi đè bằng chuỗi rỗng hoặc khoảng trắng → rơi về mặc định', () => {
        // Quan trọng: "trống" phải nghĩa là "dùng mặc định", KHÔNG phải "không có
        // hướng dẫn nào". Hiểu sai chỗ này thì một ô bị xoá làm discipline đó
        // chạy mà không có chỉ dẫn gì.
        for (const v of ['', '   ', '\n\n']) {
            expect(buildEightDSystemPrompt({ D4: v })).toContain(firstLine('D4'));
        }
    });

    it('bước không được nhắc tới vẫn dùng mặc định', () => {
        const p = buildEightDSystemPrompt({ D2: 'x' });
        expect(p).toContain(DEFAULT_DISCIPLINE_GUIDE.D8.split('\n')[0].trim());
    });
});

describe('seed prompt', () => {
    it('seed đủ 8 bước', () => {
        expect(DEFAULT_STEP_PROMPTS.map((p) => p.stepCode)).toEqual([...DISCIPLINE_CODES]);
    });

    it('mỗi bước seed CÓ nội dung — ô rỗng trên UI là thứ đã phải sửa', () => {
        for (const p of DEFAULT_STEP_PROMPTS) {
            expect(p.systemPrompt.trim().length).toBeGreaterThan(20);
        }
    });

    it('seed trỏ về đúng hằng số trong prompts.ts, không phải bản chép tay', () => {
        // Chép tay sẽ lệch với code ngay lần đầu ai đó sửa `prompts.ts`, và không
        // có gì báo. Ràng buộc này giữ một nguồn duy nhất.
        for (const p of DEFAULT_STEP_PROMPTS) {
            expect(p.systemPrompt).toBe(
                DEFAULT_DISCIPLINE_GUIDE[p.stepCode as keyof typeof DEFAULT_DISCIPLINE_GUIDE],
            );
        }
    });

    it('nội dung seed thật sự xuất hiện trong prompt gửi đi', () => {
        const guide = Object.fromEntries(DEFAULT_STEP_PROMPTS.map((p) => [p.stepCode, p.systemPrompt]));
        const p = buildEightDSystemPrompt(guide);
        for (const code of DISCIPLINE_CODES) {
            const firstLine = DEFAULT_DISCIPLINE_GUIDE[code].split('\n')[0].trim();
            expect(p).toContain(firstLine);
        }
    });
});
