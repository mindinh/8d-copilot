/**
 * D6 — kiểm chứng hiệu quả, TÍNH THUẦN, không gọi model.
 *
 * ── Vì sao D6 không được phép đi qua LLM (R2.6.1) ──
 * Nội dung D6 đã nằm sẵn trong dữ liệu: danh sách action kèm status. Không có
 * gì để soạn thảo. Cho model viết lại danh sách đó không thêm được thông tin
 * nào, nhưng mở ra đúng một rủi ro: dataset KHÔNG chứa bằng chứng kiểm chứng
 * nào, nên bất kỳ câu nào nghe như "đã xác nhận có hiệu quả" đều là bịa — và
 * đó lại là câu tự nhiên nhất để viết khi nhìn một dòng status = 'Verified'.
 *
 * Một status trong SAP nói rằng ai đó đã bấm nút, không nói rằng lỗi đã hết.
 * Khoảng cách giữa hai điều đó chính là thứ D6 phải giữ cho rõ.
 *
 * Vì vậy: bước này không nằm trong hợp đồng field gửi cho model, và giá trị của
 * nó được dựng ở đây rồi ghi thẳng vào discipline.
 */

import type { ActionRow, CaseContext } from './types';

/** Nhãn 8D của từng loại action, để checklist đọc được mà không cần tra bảng. */
const STEP_OF_TYPE: Record<string, string> = {
    containment: 'D3 - Containment',
    corrective: 'D5 - Corrective',
    preventive: 'D7 - Preventive',
};

export interface D6Narrative {
    summary: string;
    content: string;
    actionItems: string[];
}

export interface D6Result {
    verification: {
        checklist: Array<{ action: string; actionType: string; status: string; sourcePath: string }>;
        /**
         * Chỉ có MỘT giá trị hợp lệ. Là enum một phần tử chứ không phải hằng số
         * trong code, để ràng buộc D6_NO_EFFECTIVENESS_CLAIM kiểm được nó như
         * mọi ràng buộc khác thay vì phải tin vào một dòng lệnh gán.
         */
        evidenceAvailable: 'None recorded';
        plan: string;
        gaps: string[];
    };
    sources: string[];
}

function rowsOf(context: CaseContext): Array<{ row: ActionRow; kind: keyof typeof STEP_OF_TYPE; index: number }> {
    return (['containment', 'corrective', 'preventive'] as const).flatMap((kind) =>
        (context.actions?.[kind] ?? []).map((row, index) => ({ row, kind, index })),
    );
}

/**
 * Dựng nội dung D6 từ CaseContext.
 *
 * Case không có action nào vẫn trả về kết quả hợp lệ — checklist rỗng cộng một
 * gap nói rõ là chưa có gì để kiểm chứng. Trả null ở đây sẽ khiến D6 rơi về
 * nhánh do model sinh, tức là đúng thứ ta vừa cấm.
 */
export function computeD6(context: CaseContext): D6Result {
    const entries = rowsOf(context);

    const checklist = entries.map(({ row, kind, index }) => ({
        action: row.actionText,
        actionType: STEP_OF_TYPE[kind],
        status: row.status || 'Not Started',
        sourcePath: `actions.${kind}#${index + 1}`,
    }));

    const open = checklist.filter((item) => !/^(complete|verified|done)$/i.test(item.status));

    const gaps: string[] = [];
    if (!checklist.length) {
        gaps.push('No actions are recorded on this case yet, so there is nothing to verify.');
    } else {
        // Nói rõ "chưa có bằng chứng" kể cả khi mọi dòng đã Verified — nhất là
        // khi mọi dòng đã Verified, vì đó là lúc người đọc dễ kết luận nhầm nhất.
        gaps.push(
            'No verification evidence is recorded in this dataset. Action status reflects who marked the work done, not measured proof that the defect stopped recurring.',
        );
        if (open.length) {
            gaps.push(`${open.length} of ${checklist.length} action(s) are not yet complete: ${open.map((item) => item.action).join('; ')}.`);
        }
    }

    const plan = checklist.length
        ? [
            'Effectiveness cannot be confirmed from the recorded data. To close D6 on evidence rather than status:',
            '- re-inspect the affected characteristic on production after the corrective action, and record the lot results;',
            '- compare the nonconforming rate before and after the change on the same work centre;',
            '- keep the case open until at least one post-change lot is measured.',
        ].join('\n')
        : 'Define containment, corrective, and preventive actions in D3, D5, and D7 before planning verification.';

    return {
        verification: { checklist, evidenceAvailable: 'None recorded', plan, gaps },
        sources: checklist.map((item) => item.sourcePath),
    };
}

/**
 * Phần tường thuật của D6 — cũng dựng thuần, cùng lý do.
 *
 * ── Vì sao phải có hàm này, khi `computeD6` đã lo phần dữ liệu ──
 * Lượt sinh báo cáo chính vẫn trả về cả 8 discipline trong một lời gọi, nên
 * model VẪN viết `summary`/`content` cho D6. Nếu chỉ ghi đè phần `data` thì
 * đúng cái câu nguy hiểm nhất — "hành động đã được xác nhận có hiệu quả" — vẫn
 * lọt qua ở phần văn xuôi, nơi không có ràng buộc nào soi tới.
 *
 * Nên đầu ra D6 của model bị VỨT, không phải được tin. Rẻ hơn nhiều so với tách
 * D6 ra khỏi schema của lượt gọi chung, và cho cùng một bảo đảm: không một chữ
 * nào của D6 do model viết.
 */
/**
 * Thay nội dung D6 trong một `EightDResult` bằng bản tính thuần.
 *
 * TỰ TẠO discipline nếu nó vắng mặt: model quên trả D6 là chuyện có thật, và
 * khi đó bước này vẫn phải hiện ra đầy đủ — dữ liệu để dựng nó nằm hết trong
 * CaseContext, không phụ thuộc gì vào việc model có nhớ hay không.
 */
export function applyComputedD6(
    result: { disciplines: Array<Record<string, any>> },
    context: CaseContext,
): void {
    const computed = computeD6(context);
    const narrative = renderD6Narrative(computed);

    const patch = {
        code: 'D6',
        sequence: 6,
        title: 'Verify Effectiveness',
        summary: narrative.summary,
        content: narrative.content,
        actionItems: narrative.actionItems,
        sources: computed.sources,
        data: computed as unknown as Record<string, unknown>,
        // Luôn false: dataset không mang bằng chứng kiểm chứng nào.
        dataBacked: false,
        // Không phải do AI viết — và cột này là thứ UI dùng để nói với người đọc
        // điều đó, nên nó phải nói thật.
        confidence: 1,
    };

    const existing = result.disciplines?.find((discipline) => discipline.code === 'D6');
    if (existing) Object.assign(existing, patch);
    else (result.disciplines ??= []).push(patch);

    result.disciplines.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}

export function renderD6Narrative(result: D6Result): D6Narrative {
    const { checklist, gaps } = result.verification;
    const open = checklist.filter((item) => !/^(complete|verified|done)$/i.test(item.status));

    const summary = checklist.length
        ? `${checklist.length} recorded action(s), ${checklist.length - open.length} marked done and ${open.length} still open. No verification evidence is recorded, so effectiveness is not yet demonstrated.`
        : 'No actions are recorded on this case yet, so there is nothing to verify.';

    const content = [
        '### Action status',
        '',
        ...(checklist.length
            ? [
                '| Action | Step | Status | Source |',
                '| --- | --- | --- | --- |',
                ...checklist.map((item) => `| ${item.action} | ${item.actionType} | ${item.status} | \`${item.sourcePath}\` |`),
            ]
            : ['_No actions recorded._']),
        '',
        '### Why effectiveness is not confirmed',
        '',
        ...gaps.map((gap) => `- ${gap}`),
        '',
        '### Verification plan',
        '',
        result.verification.plan,
        '',
        '_This step is computed from recorded action status. No part of it is AI-drafted._',
    ].join('\n');

    return { summary, content, actionItems: open.map((item) => `Complete and verify: ${item.action}`) };
}
