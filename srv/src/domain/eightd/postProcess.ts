/**
 * Lưới an toàn cuối cùng, chạy sau khi model trả kết quả.
 *
 * Tách khỏi `eightDAnalyzer` có chủ đích: đây là logic thuần, không I/O, không
 * phụ thuộc `@sap/cds` hay CDK. Nhờ vậy test được trực tiếp mà không phải dựng
 * cả runtime CAP lên.
 *
 * ── Nguyên tắc ──
 * Sửa thì phải GHI LẠI. Mọi chỗ chữa đều vào mảng `repairs`. Im lặng sửa sẽ
 * giấu mất việc prompt đang có vấn đề: báo cáo trông vẫn đẹp trong khi model
 * ngày càng trả về thứ sai lệch.
 */

import {
    DISCIPLINE_CODES,
    DISCIPLINE_TITLES,
    type CaseContext,
    type DisciplineCode,
    type DisciplineDraft,
    type EightDResult,
} from './types';
import { buildSourceVocabulary, checkSources } from './sourceVocabulary';

function placeholder(code: DisciplineCode, index: number): DisciplineDraft {
    return {
        code,
        sequence: index + 1,
        title: DISCIPLINE_TITLES[code],
        summary: 'Not generated. The model omitted this discipline.',
        content:
            '_This discipline was missing from the model response and has been inserted as a ' +
            'placeholder. Re-run the analysis to populate it._',
        actionItems: [],
        sources: [],
        confidence: 0,
        dataBacked: false,
    };
}

export function postProcess(
    result: EightDResult,
    context: CaseContext,
    enrichment?: unknown,
    independent?: unknown,
): { result: EightDResult; repairs: string[] } {
    const repairs: string[] = [];
    const incoming = Array.isArray(result?.disciplines) ? result.disciplines : [];
    const vocab = buildSourceVocabulary(context, enrichment, independent);

    const byCode = new Map<string, DisciplineDraft>();
    for (const d of incoming) {
        if (!d || typeof d !== 'object') continue;
        if (byCode.has(d.code)) {
            repairs.push(`Model trả trùng ${d.code}; giữ bản đầu tiên.`);
            continue;
        }
        byCode.set(d.code, d);
    }

    const unknown = [...byCode.keys()].filter(
        (c) => !DISCIPLINE_CODES.includes(c as DisciplineCode),
    );
    if (unknown.length) repairs.push(`Model trả mã lạ, đã bỏ: ${unknown.join(', ')}.`);

    const disciplines = DISCIPLINE_CODES.map((code, i) => {
        const found = byCode.get(code);
        if (!found) {
            repairs.push(`Thiếu ${code}; chèn placeholder.`);
            return placeholder(code, i);
        }

        const d: DisciplineDraft = {
            ...found,
            code,
            sequence: i + 1,
            title: String(found.title ?? '').trim() || DISCIPLINE_TITLES[code],
            summary: String(found.summary ?? '').trim(),
            content: String(found.content ?? '').trim(),
            actionItems: Array.isArray(found.actionItems) ? found.actionItems : [],
            sources: Array.isArray(found.sources) ? found.sources : [],
            confidence: Number(found.confidence),
            dataBacked: Boolean(found.dataBacked),
        };

        if (d.summary.length > 500) {
            repairs.push(`${code}: summary dài ${d.summary.length} ký tự; cắt còn 500.`);
            d.summary = `${d.summary.slice(0, 497)}...`;
        }

        if (!Number.isFinite(d.confidence)) {
            repairs.push(`${code}: confidence không phải số; đặt 0.`);
            d.confidence = 0;
        } else if (d.confidence < 0 || d.confidence > 1) {
            repairs.push(`${code}: confidence ${d.confidence} ngoài khoảng 0..1; kẹp lại.`);
            d.confidence = Math.min(1, Math.max(0, d.confidence));
        }

        // D6 không bao giờ có dữ liệu verification trong dataset này. Model tự
        // tin ở đây nghĩa là nó đang bịa — hạ cờ và ghi nhận.
        if (code === 'D6' && d.dataBacked) {
            repairs.push(
                'D6 được đánh dataBacked=true nhưng dataset không có dữ liệu verification; hạ xuống false.',
            );
            d.dataBacked = false;
        }

        // ── Kiểm tra sources có trỏ vào thứ thật sự tồn tại không ──
        // Không kiểm thì `sources` chỉ là chuỗi tự do và lớp chống bịa thành
        // trang trí: model viết 'fiveWhy#7' trên case có 3 bước vẫn lọt.
        const { known, unknown } = checkSources(d.sources, vocab);
        if (unknown.length) {
            repairs.push(`${code}: sources không tồn tại trong CaseContext: ${unknown.join(', ')}.`);
            d.sources = known;
        }

        // Khẳng định có dữ liệu chống lưng mà không chỉ ra được nguồn nào thì
        // không phải khẳng định có dữ liệu chống lưng.
        if (d.dataBacked && d.sources.length === 0) {
            repairs.push(
                `${code}: dataBacked=true nhưng không còn source hợp lệ nào; hạ xuống false.`,
            );
            d.dataBacked = false;
        }

        return d;
    });

    // ── Discipline nào không có fact nào chống lưng thì không được tự tin ──
    // Ánh xạ từ mã discipline sang chỗ chứa fact tương ứng trong CaseContext.
    const unsupported: Partial<Record<DisciplineCode, boolean>> = {
        D3: context.actions.containment.length === 0,
        D5: context.actions.corrective.length === 0,
        D7: context.actions.preventive.length === 0 && !context.fmea,
        D8: !context.lessonsLearned,
    };
    for (const d of disciplines) {
        if (unsupported[d.code] && d.dataBacked) {
            repairs.push(
                `${d.code}: dataBacked=true nhưng CaseContext không có dữ liệu nguồn tương ứng; hạ xuống false.`,
            );
            d.dataBacked = false;
        }
    }

    // ── Ràng buộc Q1-ONLY-CUSTOMER-FIELDS, thực thi ở code ──
    // Không phó thác cho model: đây là luật của dataset, không phải lựa chọn văn phong.
    let customerSummary = result?.customerSummary ?? null;
    if (typeof customerSummary === 'string' && customerSummary.trim() === '') customerSummary = null;

    if (!context.isCustomerFacing && customerSummary) {
        repairs.push('Case Q3 nhưng model vẫn sinh customerSummary; bỏ đi.');
        customerSummary = null;
    }
    if (context.isCustomerFacing && !customerSummary) {
        repairs.push('Case Q1 nhưng model không sinh customerSummary.');
    }

    return {
        result: {
            internalSummary: String(result?.internalSummary ?? '').trim(),
            customerSummary,
            disciplines,
        },
        repairs,
    };
}
