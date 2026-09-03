import { DEFAULT_SETTINGS, normalizeSettings } from '../settings';

describe('normalizeSettings', () => {
    it('mặc định là engine chấm điểm khi không có dòng cấu hình', () => {
        expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
        expect(DEFAULT_SETTINGS.engine).toBe('scoring');
    });

    it('nhận đúng hai giá trị engine, không phân biệt hoa thường', () => {
        expect(normalizeSettings({ engine: 'graph' }).engine).toBe('graph');
        expect(normalizeSettings({ engine: 'GRAPH' }).engine).toBe('graph');
        expect(normalizeSettings({ engine: 'scoring' }).engine).toBe('scoring');
    });

    /**
     * Một chuỗi gõ sai trong bảng cấu hình không được phép bật engine mới. Sai
     * theo hướng an toàn ở đây có nghĩa cụ thể: giữ nguyên hành vi đang chạy tốt.
     */
    it('giá trị lạ rơi về scoring chứ không ném và cũng không bật graph', () => {
        for (const engine of ['grap', 'Graph engine', '', null, 42, {}]) {
            expect(normalizeSettings({ engine }).engine).toBe('scoring');
        }
    });

    it('từ chối maxKeywords không dùng được, giữ mặc định', () => {
        for (const maxKeywords of [0, -5, NaN, 'nhiều', null, undefined]) {
            expect(normalizeSettings({ maxKeywords }).maxKeywords).toBe(DEFAULT_SETTINGS.maxKeywords);
        }
        expect(normalizeSettings({ maxKeywords: 12 }).maxKeywords).toBe(12);
        expect(normalizeSettings({ maxKeywords: 12.9 }).maxKeywords).toBe(12);
    });

    it('fallback chỉ tắt khi khai đúng false', () => {
        expect(normalizeSettings({}).fallbackEnabled).toBe(true);
        expect(normalizeSettings({ fallbackEnabled: null }).fallbackEnabled).toBe(true);
        expect(normalizeSettings({ fallbackEnabled: false }).fallbackEnabled).toBe(false);
    });
});
