/**
 * Kiểm tra route html5 của approuter trỏ đúng tên app trong HTML5 repo.
 *
 * ── Vì sao cần ──
 * Approuter phục vụ UI qua `html5-apps-repo-rt`, và repo định danh app bằng
 * `sap.app.id` trong manifest ĐÃ BỎ DẤU CHẤM:
 *
 *     manifest sap.app.id : cnma.proresolve
 *     tên trong repo      : cnmaproresolve      ← phải nằm trong target của route
 *
 * Không khớp thì approuter lấy segment đầu của đường dẫn làm tên app, không tìm
 * ra, và trả 503 — nhưng CHỈ sau khi người dùng đăng nhập xong. Trước đó mọi thứ
 * trông vẫn bình thường: deploy xanh, app started, `/index.html` chưa đăng nhập
 * vẫn trả 200 vì đó là trang bootstrap. Cực khó lần ra nếu không biết trước.
 *
 * Log để nhận ra triệu chứng:  "Service Tag <segment> is unknown"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'app', 'cnma_proresolve_ui', 'public', 'manifest.json');
const XS_APP = path.join(ROOT, 'app', 'approuter', 'xs-app.json');

const fail = (msg) => { console.error(`[approuter-route] ${msg}`); process.exit(1); };

if (!fs.existsSync(MANIFEST)) fail(`Không thấy ${path.relative(ROOT, MANIFEST)}`);
if (!fs.existsSync(XS_APP)) fail(`Không thấy ${path.relative(ROOT, XS_APP)}`);

const appId = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))?.['sap.app']?.id;
if (!appId) fail('manifest.json thiếu sap.app.id');

const expected = appId.replace(/\./g, '');

const routes = JSON.parse(fs.readFileSync(XS_APP, 'utf8')).routes ?? [];
const html5 = routes.filter((r) => r.service === 'html5-apps-repo-rt');
if (!html5.length) fail('xs-app.json của approuter không có route html5-apps-repo-rt');

const ok = html5.some((r) => String(r.target ?? '').includes(`/${expected}/`));
if (!ok) {
    fail(
        `Route html5 không trỏ tới app "${expected}".\n`
        + `  sap.app.id      : ${appId}\n`
        + `  tên trong repo  : ${expected}\n`
        + `  target hiện tại : ${html5.map((r) => JSON.stringify(r.target)).join(', ')}\n`
        + `  cần dạng        : "/${expected}/$1"`,
    );
}

console.log(`[approuter-route] ${appId} → /${expected}/ — khớp.`);
