/**
 * Xuất 8 prompt bước 8D ra Markdown để dán tay vào bảng `StepPrompts`.
 *
 * ── Vì sao sinh từ code chứ không chép tay ──
 * Prompt thật gửi cho model được ghép ở hai tầng (`DEFAULT_DISCIPLINE_GUIDE` +
 * phần FIELD MECHANICS của D1-D4). Chép tay sang một file .md là tạo ra bản thứ
 * ba, và bản đó lệch ngay lần đầu ai sửa code mà không có gì báo. File này đọc
 * thẳng `DEFAULT_STEP_PROMPTS`, nên nội dung xuất ra luôn đúng bằng thứ app gửi.
 *
 * ── Vì sao ghi rõ dán vào ô nào ──
 * Runtime đọc prompt bằng `combinedPrompt ?? systemPrompt` (xem
 * `getDisciplineGuide`). `combinedPrompt` CHE hoàn toàn `systemPrompt`. Dán vào
 * sai ô nghĩa là lưu thành công, hiện đúng trên UI, và không đổi gì hết.
 *
 * Chạy (cần loader tsx vì nguồn là TypeScript):
 *
 *     npm run export:prompts
 *
 * hoặc trực tiếp:
 *
 *     node --import ./node_modules/tsx/dist/loader.mjs scripts/export-step-prompts.mjs [đích]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { DEFAULT_STEP_PROMPTS } = await import('../srv/src/domain/eightd/precedent/defaults.ts');

const out = resolve(process.argv[2] ?? 'docs/8d-step-prompts.md');

const lines = [
    '# 8D Step Prompts',
    '',
    'Sinh tự động bằng `node scripts/export-step-prompts.mjs` — **đừng sửa file này**.',
    'Nguồn: `srv/src/domain/eightd/prompts.ts` (`DEFAULT_DISCIPLINE_GUIDE`) và',
    '`srv/src/domain/eightd/precedent/defaults.ts` (`STRUCTURED_CONFIG_OVERRIDES`).',
    '',
    '## Dán vào ô nào',
    '',
    'Runtime đọc prompt bằng `combinedPrompt ?? systemPrompt`, nên **`combinedPrompt`',
    'che hoàn toàn `systemPrompt`** chứ không bổ sung cho nó. Mỗi bước dưới đây ghi rõ',
    'ô đích. Dán nhầm ô thì lưu vẫn thành công, UI vẫn hiện, và prompt không đổi.',
    '',
    '| Bước | Ô cần dán | Số từ |',
    '|---|---|---|',
];

for (const step of DEFAULT_STEP_PROMPTS) {
    const field = step.combinedPrompt ? 'combinedPrompt' : 'systemPrompt';
    const text = (step.combinedPrompt ?? step.systemPrompt ?? '').trim();
    lines.push(`| ${step.stepCode} — ${step.label} | \`${field}\` | ${text.split(/\s+/).length} |`);
}
lines.push('');

for (const step of DEFAULT_STEP_PROMPTS) {
    const field = step.combinedPrompt ? 'combinedPrompt' : 'systemPrompt';
    const text = (step.combinedPrompt ?? step.systemPrompt ?? '').trim();
    lines.push(
        '---',
        '',
        `## ${step.stepCode} — ${step.label}`,
        '',
        `${step.description}`,
        '',
        `**Dán vào ô \`${field}\`** của dòng \`stepCode = '${step.stepCode}'\` trong bảng \`StepPrompts\`.`,
        '',
        '```text',
        text,
        '```',
        '',
    );
}

writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`OK: ${DEFAULT_STEP_PROMPTS.length} bước -> ${out}`);
