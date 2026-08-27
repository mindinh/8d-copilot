/**
 * D8 phải phân biệt được BA câu trả lời, không phải hai.
 *
 * Phần bóc bài học là thuần nên test được ở đây; hai hàm còn lại đọc DB và được
 * kiểm ở tầng tích hợp.
 */

import { extractLessons } from '../d8Closure';

const payload = (lessons: unknown) => JSON.stringify({ data: { lessons_learned: lessons } });

describe('bóc bài học từ payload tiền lệ', () => {
    it('đọc được cả what_worked và what_didnt, gắn nhãn rõ từng vế', () => {
        const lessons = extractLessons(payload([{
            what_worked: 'Precedent case reuse shortened the PM interval.',
            what_didnt: 'Relying on inspection alone without a die-wear trigger.',
        }]));
        expect(lessons).toEqual([
            'What worked: Precedent case reuse shortened the PM interval.',
            'What did not work: Relying on inspection alone without a die-wear trigger.',
        ]);
    });

    it('chấp nhận cả object đơn lẻ lẫn mảng', () => {
        const asObject = extractLessons(payload({ what_worked: 'A' }));
        const asArray = extractLessons(payload([{ what_worked: 'A' }]));
        expect(asObject).toEqual(asArray);
        expect(asObject).toEqual(['What worked: A']);
    });

    it('chấp nhận camelCase — payload đi qua nhiều đời export', () => {
        expect(extractLessons(payload([{ whatWorked: 'A', whatDidnt: 'B' }])))
            .toEqual(['What worked: A', 'What did not work: B']);
    });

    it('chỉ có một vế thì chỉ trả một dòng, không độn vế trống', () => {
        expect(extractLessons(payload([{ what_worked: 'A', what_didnt: '   ' }])))
            .toEqual(['What worked: A']);
    });

    it('case KHÔNG ghi bài học ⇒ mảng rỗng, không phải lỗi', () => {
        // Mảng rỗng ở đây chính là ca "precedent found, no lessons recorded".
        expect(extractLessons(payload([]))).toEqual([]);
        expect(extractLessons(JSON.stringify({ data: {} }))).toEqual([]);
    });

    it('payload hỏng hoặc rỗng không làm sập bước đóng case', () => {
        expect(extractLessons('{ not json')).toEqual([]);
        expect(extractLessons(null)).toEqual([]);
        expect(extractLessons('')).toEqual([]);
    });

    it('đọc được cả payload phẳng, không bọc trong `data`', () => {
        expect(extractLessons(JSON.stringify({ lessons_learned: [{ what_worked: 'A' }] })))
            .toEqual(['What worked: A']);
    });
});
