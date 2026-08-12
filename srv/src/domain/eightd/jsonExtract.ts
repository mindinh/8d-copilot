/**
 * Lớp phòng thủ khi bóc JSON từ output của model.
 *
 * Probe cho thấy `responseSchema` hoạt động, nên đây KHÔNG phải là parser chịu
 * lỗi hạng nặng — chỉ là lưới an toàn cho ba tình huống thật sự xảy ra:
 *
 *   1. Output bị cắt vì hết token (kiểu hỏng hay gặp nhất, xem `schemas.ts`)
 *   2. Model bọc JSON trong ```json fence dù đã yêu cầu JSON thuần
 *   3. Vài dòng lời dẫn trước hoặc sau khối JSON
 *
 * Chủ ý KHÔNG tự "sửa" JSON hỏng (đóng ngoặc thiếu, cắt phần tử dở dang). Một
 * bản ghi vá víu trông như thành công nhưng nội dung khuyết — tệ hơn nhiều so
 * với một lỗi rõ ràng, vì không ai biết mà kiểm lại.
 */

import { PipelineError } from './types';

/** Gỡ ```json fence và lời dẫn quanh khối JSON. */
export function stripFence(raw: string): string {
    let s = String(raw ?? '').trim();

    const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced) return fenced[1].trim();

    // Không có fence: cắt lấy đoạn từ dấu mở đầu tiên đến dấu đóng cuối cùng.
    const start = s.search(/[{[]/);
    if (start > 0) s = s.slice(start);

    const lastBrace = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (lastBrace >= 0 && lastBrace < s.length - 1) s = s.slice(0, lastBrace + 1);

    return s.trim();
}

/**
 * Chặn output cụt.
 *
 * `finishReason` là 'length' hoặc 'MAX_TOKENS' nghĩa là model bị cắt giữa chừng.
 * JSON có thể vẫn parse được nếu chỗ cắt rơi đúng ranh giới — nhưng nội dung
 * thì thiếu. Nên coi đây là lỗi bất kể parse có thành công hay không.
 */
export function assertNotTruncated(finishReason: string | undefined, step: string): void {
    const reason = String(finishReason ?? '').toLowerCase();
    if (reason === 'length' || reason === 'max_tokens') {
        throw new PipelineError(
            `Bước "${step}": model bị cắt vì hết token (finishReason=${finishReason}). ` +
            'Tăng max_tokens hoặc giảm thinkingBudget trong srv/src/domain/eightd/schemas.ts.',
            502,
        );
    }
}

/**
 * Bóc JSON từ output của model.
 *
 * @param raw   Nội dung model trả về
 * @param step  Tên bước, dùng cho thông báo lỗi
 */
export function extractJson<T>(raw: string, step: string): T {
    const cleaned = stripFence(raw);

    if (!cleaned) {
        throw new PipelineError(
            `Bước "${step}": model trả về chuỗi rỗng. Thường là do thinking ăn hết token budget.`,
            502,
        );
    }

    try {
        return JSON.parse(cleaned) as T;
    } catch (e: any) {
        const preview = cleaned.length > 300 ? `${cleaned.slice(0, 300)}…` : cleaned;
        throw new PipelineError(
            `Bước "${step}": output không phải JSON hợp lệ (${e.message}).`,
            502,
            { preview },
        );
    }
}

/**
 * Gọi model rồi bóc JSON, thử lại một lần khi hỏng.
 *
 * Chỉ thử lại ĐÚNG MỘT lần, và lần hai được gắn kèm thông báo lỗi của lần một
 * để model biết nó sai ở đâu. Thử lại nhiều hơn chỉ nhân đôi chi phí: nếu prompt
 * hoặc schema sai thì lần thứ ba cũng sai như lần thứ nhất.
 *
 * KHÔNG thử lại khi lỗi là truncation — lần sau cũng sẽ cụt y hệt, phải sửa
 * ngân sách token chứ không phải gọi lại.
 */
export async function callAndParse<T>(
    step: string,
    call: (repairHint?: string) => Promise<{ content: string; finishReason?: string }>,
): Promise<{ value: T; raw: string }> {
    const attempt = async (repairHint?: string) => {
        const res = await call(repairHint);
        assertNotTruncated(res.finishReason, step);
        return { value: extractJson<T>(res.content, step), raw: res.content };
    };

    try {
        return await attempt();
    } catch (e: any) {
        // Cụt token thì gọi lại vô ích — ném luôn.
        if (e instanceof PipelineError && e.code === 502 && /hết token/.test(e.message)) throw e;

        return attempt(
            'Your previous response could not be parsed as JSON. ' +
            `The error was: ${e.message}. ` +
            'Return ONLY valid JSON matching the schema, with no prose and no code fences.',
        );
    }
}
