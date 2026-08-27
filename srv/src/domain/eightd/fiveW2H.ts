/**
 * Lưới 5W2H của D2 — MỘT lần phân giải, hai cách hiển thị.
 *
 * ── Vì sao lưới không do model điền ──
 * Đoạn văn và lưới phải nói cùng một chuyện. Nếu cả hai đều do model sinh, thì
 * "cùng một chuyện" là một lời dặn trong prompt — và lời dặn thì có ngày bị phá:
 * đoạn văn nói 340 đơn vị, ô How Many nói 128, và không có gì báo động vì cả hai
 * đều nghe hợp lý.
 *
 * Nên sáu ô được phân giải ở đây, một lần, từ chính những trường mà đoạn văn
 * phải dựa vào. Model viết văn quanh chúng; lưới hiện thẳng chúng. Hai bên
 * không thể lệch, vì chỉ có một nguồn (R2.2.1).
 *
 * ── Ô không có nguồn thì nói thẳng là không có ──
 * `who` với case Q3 là khoảng trống thật: không có trường người báo lỗi. Điền
 * một cái tên nghe hợp lý vào đó là bịa; để trống thì người đọc tưởng chưa ai
 * nhập. Cả hai đều tệ hơn là viết ra đúng câu "chỗ này không được theo dõi"
 * (R2.2.2).
 */

import { ORIGIN_CUSTOMER, type CaseContext } from './types';

export interface FiveW2H {
    what: string;
    where: string;
    when: string;
    who: string;
    how: string;
    howMany: string;
}

/** Ô không phân giải được. Là hằng số để test bắt được, và để UI tô khác đi. */
export const NOT_TRACKED = {
    who: 'Not tracked — Q3 internal defects have no reporter field in this dataset.',
    when: 'Not recorded — no found date on the notification.',
    howMany: 'Not recorded — no quantity or extent on the notification.',
    where: 'Not recorded — no work centre on the notification.',
    how: 'Not recorded — the notification does not say how the defect was found.',
} as const;

function clean(value: unknown): string {
    const text = String(value ?? '').trim();
    return text && !/^n\/a\b/i.test(text) ? text : '';
}

/**
 * Phân giải sáu ô từ CaseContext. Thuần, không gọi model.
 *
 * Đây là hàm mà CẢ đoạn văn lẫn lưới phải dùng chung — xem ghi chú đầu file.
 */
export function resolveFiveW2H(context: CaseContext): FiveW2H {
    const product = context.product ?? ({} as CaseContext['product']);
    const header = context.header ?? ({} as CaseContext['header']);

    // WHAT — mã lỗi cộng số đo vượt dung sai, vì "cái gì sai" mà không kèm con
    // số thì không kiểm chứng được.
    const defect = [clean(product.defectText), clean(product.defectCode) && `(${clean(product.defectCode)})`]
        .filter(Boolean).join(' ');
    const outOfSpec = (context.inspections ?? []).find((row) => row.outOfSpec === true);
    const measurement = outOfSpec
        ? `${outOfSpec.characteristic}: measured ${outOfSpec.measuredValue} against specification ${outOfSpec.specValue}`
        : '';
    const what = [defect, measurement].filter(Boolean).join(' — ') || 'Not recorded — no defect code or text on the notification.';

    // WHERE
    const wcDesc = clean(product.workCenterDesc);
    const wcId = clean(product.workCenterId);
    const where = wcDesc || wcId
        ? [wcDesc, wcId && `(${wcId})`].filter(Boolean).join(' ')
        : NOT_TRACKED.where;

    // WHO — khoảng trống thật với Q3; case Q1 thì người liên hệ phía khách là
    // câu trả lời đúng, không phải một nhân sự nội bộ.
    const isCustomerCase = context.origin === ORIGIN_CUSTOMER || context.isCustomerFacing;
    const contact = clean(context.customer?.plantContact);
    const who = isCustomerCase && contact
        ? `${contact} (customer contact)`
        : NOT_TRACKED.who;

    // HOW — dataset không có trường "phát hiện bằng cách nào"; suy từ chỗ có
    // kết quả kiểm hay không là suy luận trung thực và nói rõ là suy luận.
    const how = (context.inspections ?? []).length
        ? 'Found during inspection — the case carries recorded inspection results.'
        : isCustomerCase
            ? 'Reported by the customer — this case originates from a customer complaint.'
            : NOT_TRACKED.how;

    return {
        what,
        where,
        when: clean(header.foundDate) || NOT_TRACKED.when,
        who,
        how,
        howMany: clean(header.quantityExtent) || NOT_TRACKED.howMany,
    };
}

/** `true` khi ô này là một khoảng trống đã thừa nhận, không phải nội dung thật. */
export function isGap(value: string): boolean {
    return Object.values(NOT_TRACKED).includes(value as typeof NOT_TRACKED[keyof typeof NOT_TRACKED]);
}

/**
 * Ghi lưới đã phân giải vào phần `data` của D2, và đồng bộ Is/Is-Not đã tính.
 *
 * Chỉ đụng sáu ô lưới cộng cặp Is/Is-Not; `problem.statement` và phần còn lại
 * vẫn của model. D2 khác D6 ở chỗ đó: D6 bỏ hẳn model, còn D2 vẫn cần model để
 * viết đoạn văn — chỉ những trường PHẢI khớp nhau mới bị chốt lại.
 */
export function applyResolvedProblemFields(
    result: { disciplines: Array<Record<string, any>> },
    context: CaseContext,
): void {
    const d2 = result.disciplines?.find((discipline) => discipline.code === 'D2');
    if (!d2) return;

    const grid = resolveFiveW2H(context);
    const data = (d2.data ??= {});
    const problem = (data.problem ??= {});

    problem.what = grid.what;
    problem.where = grid.where;
    problem.when = grid.when;
    problem.who = grid.who;
    problem.how = grid.how;
    problem.extent = grid.howMany;

    // Is/Is-Not: hiện bản đã tính, và khi không so được thì hiện LÝ DO chứ không
    // để hai ô trống — ô trống trông như chưa ai làm.
    const iin = context.isIsNot;
    if (iin) {
        problem.is = iin.applicable && iin.is ? [iin.is] : [];
        problem.isNot = iin.applicable && iin.isNot ? [iin.isNot] : [];
        if (!iin.applicable && iin.reason) {
            problem.isIsNotStatus = iin.reason;
        }
    }
}
