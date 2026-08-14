/**
 * Chặn deploy khi `cf` đang trỏ vào org/space khác.
 *
 * ── Vì sao cần ──
 * `cf` chỉ giữ MỘT target, và nó đổi lặng lẽ: login vào subaccount khác để xem
 * một app khác là target của repo này đã đi mất. `cf deploy` sau đó không hỏi
 * gì — nó tạo service và đẩy app vào đúng nơi đang được trỏ tới.
 *
 * Chuyện này đã suýt xảy ra một lần trong dự án: target tự chuyển từ
 * proconarum-sandbox-system/Training sang proconarum-development-system/DEV
 * giữa hai lần chạy.
 *
 * Đặt ORG / SPACE khác bằng biến môi trường khi cần:
 *     CF_ORG=proconarum-quality-system CF_SPACE=QAS npm run deploy
 * Bỏ qua hẳn (tự chịu trách nhiệm):
 *     SKIP_CF_TARGET_CHECK=1 npm run deploy
 */
import { execFileSync } from 'node:child_process';

const WANT_ORG = process.env.CF_ORG || 'proconarum-sandbox-system';
const WANT_SPACE = process.env.CF_SPACE || 'Training';

if (process.env.SKIP_CF_TARGET_CHECK) {
    console.log('[cf-target] Bỏ qua kiểm tra target theo yêu cầu.');
    process.exit(0);
}

let out;
try {
    out = execFileSync('cf', ['target'], { encoding: 'utf8' });
} catch {
    console.error('[cf-target] Chưa đăng nhập CF. Chạy `npm run cf:cpea` rồi `npm run cf:sandbox`.');
    process.exit(1);
}

const field = (label) => (out.match(new RegExp(`^${label}:\\s*(.+)$`, 'im')) || [])[1]?.trim() ?? '';
const org = field('org');
const space = field('space');
const api = field('API endpoint');
const user = field('user');

if (org !== WANT_ORG || space !== WANT_SPACE) {
    console.error(
        `\n[cf-target] DỪNG — target không khớp.\n\n`
        + `  đang trỏ tới : ${org || '(chưa có)'} / ${space || '(chưa có)'}   (${api})\n`
        + `  cần          : ${WANT_ORG} / ${WANT_SPACE}\n\n`
        + `  npm run cf:cpea      # login landscape eu10-004\n`
        + `  npm run cf:sandbox   # target đúng org/space\n`,
    );
    process.exit(1);
}

console.log(`[cf-target] ${org} / ${space} — ${user}`);
