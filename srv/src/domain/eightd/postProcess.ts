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
        data: {},
    };
}

export function postProcess(
    result: EightDResult,
    context: CaseContext,
    enrichment?: unknown,
    independent?: unknown,
    /** Tiền lệ đã tìm được — để `precedents#N` trong `sources` giải được. */
    precedents?: unknown,
    constraintsJson?: string | Partial<Record<DisciplineCode, string>>,
    /**
     * Chỉ dựng lại đúng những bước này. Bỏ trống = cả tám, tức hành vi cũ.
     *
     * Cần cho chế độ sinh từng bước: gọi hàm này với đúng một discipline mà
     * không giới hạn phạm vi thì bảy bước còn lại bị coi là "model bỏ sót" và
     * được thay bằng placeholder — kết quả trả về là mảng D1..D8 đầy đủ, nên
     * bên gọi lấy `disciplines[0]` sẽ luôn nhận ô D1 thay vì bước vừa sinh.
     */
    only?: readonly DisciplineCode[],
): { result: EightDResult; repairs: string[] } {
    const repairs: string[] = [];
    const incoming = Array.isArray(result?.disciplines) ? result.disciplines : [];
    const vocab = buildSourceVocabulary(context, enrichment, independent, precedents);

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

    // Lọc từ `DISCIPLINE_CODES` chứ không dùng thẳng `only`: thứ tự và `sequence`
    // phải là thứ tự chuẩn D1..D8, không phải thứ tự bên gọi truyền vào.
    const targetCodes = only?.length
        ? DISCIPLINE_CODES.filter((code) => only.includes(code))
        : DISCIPLINE_CODES;

    const disciplines = targetCodes.map((code) => {
        const i = DISCIPLINE_CODES.indexOf(code);
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
            data: found.data && typeof found.data === 'object' && !Array.isArray(found.data) ? found.data : {},
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
        // Cùng bộ lọc cho data.sources — đây là mảng hiển thị ở UI (Source records).
        // Không lọc thì `d.sources` (cột cũ) sạch nhưng `data.sources` (cấu trúc mới)
        // vẫn còn path bịa, và người đọc thấy "[object Object]" thay vì cảnh báo.
        if (d.data && Array.isArray(d.data.sources)) {
            const dataSources = (d.data.sources as unknown[]).filter((s): s is string => typeof s === 'string');
            const { known: dataKnown, unknown: dataUnknown } = checkSources(dataSources, vocab);
            if (dataUnknown.length) {
                repairs.push(`${code}: data.sources không tồn tại trong CaseContext: ${dataUnknown.join(', ')}.`);
                d.data.sources = dataKnown;
            }
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

    const configuredConstraints: Partial<Record<DisciplineCode, string>> = typeof constraintsJson === 'string' ? { D1: constraintsJson } : (constraintsJson ?? {});
    const d1 = disciplines.find((discipline) => discipline.code === 'D1');
    if (d1 && configuredConstraints.D1) {
        const hasCurrentTeam = Boolean(context.team.leader) || context.team.members.length > 0;
        const hasPrecedentTeam = Array.isArray(precedents)
            && precedents.some((item: any) => Array.isArray(item?.team) && item.team.length > 0);
        if (!hasCurrentTeam && !hasPrecedentTeam && d1.dataBacked) {
            repairs.push('D1: dataBacked=true but neither current nor precedent team data exists; set to false.');
            d1.dataBacked = false;
        }
        const groundedSources = d1.sources.filter((source) => /^(team\.|precedents#)/.test(source));
        if (groundedSources.length !== d1.sources.length) {
            repairs.push('D1: removed team sources that were not grounded in team.* or precedents#N.');
            d1.sources = groundedSources;
            if (d1.sources.length === 0) d1.dataBacked = false;
        }
    }

    for (const discipline of disciplines) {
        const json = configuredConstraints[discipline.code];
        if (!json) continue;
        try {
            const config = JSON.parse(json) as { rules?: Array<{ type?: string; enabled?: boolean; pattern?: string; message?: string }> };
            for (const rule of config.rules ?? []) {
                if (rule.enabled === false) continue;
                if (rule.type === 'sourcePattern' && rule.pattern) {
                    const pattern = new RegExp(rule.pattern);
                    const grounded = discipline.sources.filter((source) => pattern.test(source));
                    if (grounded.length !== discipline.sources.length) {
                        repairs.push(`${discipline.code}: removed sources outside configured pattern ${rule.pattern}.`);
                        discipline.sources = grounded;
                        if (!grounded.length) discipline.dataBacked = false;
                    }
                    // Cùng pattern cho data.sources — UI render mảng này trong Source records.
                    if (discipline.data && Array.isArray(discipline.data.sources)) {
                        const dataSources = discipline.data.sources as unknown[];
                        const groundedData = dataSources.filter((item): item is string => typeof item === 'string' && pattern.test(item));
                        if (groundedData.length !== dataSources.length) {
                            repairs.push(`${discipline.code}: filtered data.sources against pattern ${rule.pattern}.`);
                            discipline.data.sources = groundedData;
                        }
                    }
                }
                if (rule.type === 'requiredDisclosure' && rule.pattern && !new RegExp(rule.pattern, 'i').test(discipline.content)) {
                    repairs.push(`${discipline.code}: required disclosure is missing (${rule.message ?? rule.pattern}).`);
                }
            }
        } catch {
            repairs.push(`${discipline.code}: configured constraints could not be evaluated.`);
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
