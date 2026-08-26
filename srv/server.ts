import express from 'express';
import cors from 'cors';
import cds from '@sap/cds';
import path from 'path';
import dotenv from 'dotenv';
import { ValueHelpHandler } from '@cnma/cap-valuehelp/srv';

import { registerAppActivities } from './src/core/ai/activities';
import { registerAppEmbeddingCorpora } from './src/core/ai/embeddingCorpora';
import { initEmbeddings } from './src/core/ai/llmClient';
import { runAiStartupProbes } from './src/core/ai/startupProbes';
import { registerAiAdminHandlers } from './src/services/aiAdminService';
import { registerIdentityHandlers } from './src/services/identityService';
import { registerEightDHandlers, sweepOnStartup } from './src/services/eightDService';
import { seedRetrievalConfig } from './src/domain/eightd/precedent/configRepository';
import { seedRetrievalProfiles } from './src/domain/eightd/precedent/profileRepository';
import {
    embedLibraryInBackground,
    seedLibraryFromBundle,
} from './src/domain/eightd/precedent/librarySeeder';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const logger = cds.log('Bootstrap');

/**
 * Custom CAP Bootstrap Server
 * Hooks into CDS bootstrap to add middleware, routes, and configuration.
 */
cds.on('bootstrap', (app: express.Application) => {
    // ===== SAP AI CORE =====
    // Registry activity và embedding corpus của CDK là theo từng bundle và khởi
    // đầu RỖNG. Đăng ký ở đây, trước khi bất kỳ handler nào có thể gọi model.
    registerAppActivities();
    registerAppEmbeddingCorpora();
    initEmbeddings();

    // ===== CORS =====
    app.use(cors({
        origin: (origin, callback) => callback(null, true),
        credentials: true,
    }));

    // ===== REQUEST LOGGING =====
    // Một dòng mỗi request, qua cds.log — KHÔNG console.log. Trước đây có thêm
    // một console.log('[HTTP INCOMING]') ngay đầu middleware: hai dòng mỗi
    // request, và trên Windows stdout của tiến trình con (chạy qua concurrently)
    // là pipe GHI ĐỒNG BỘ 64KB — console kẹt (QuickEdit, bôi đen…) là buffer
    // đầy và process.stdout.write chặn cứng CẢ EVENT LOOP: server còn listening
    // nhưng không trả lời bất kỳ request nào nữa.
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
        });
        next();
    });

    // ===== HEALTH CHECKS =====
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: process.env.SERVICE_NAME || 'cnma_proresolve-srv',
        });
    });

    app.get('/health/ready', async (req, res) => {
        try {
            await cds.connect.to('db');
            res.json({ status: 'ready', checks: { db: 'ok' } });
        } catch (error: any) {
            res.status(503).json({ status: 'not ready', error: error.message });
        }
    });

    logger.info('Custom bootstrap initialized');
});

/**
 * Service serving hook.
 * Registers event handlers during service initialization before route mounting.
 */
cds.on('serving', (srv) => {
    if (srv.name === 'IdentityService') {
        registerIdentityHandlers(srv as cds.ApplicationService);
    }
    if (srv.name === 'AiAdminService') {
        registerAiAdminHandlers(srv);
    }
    if (srv.name === 'EightDService') {
        registerEightDHandlers(srv);
    }
    if (srv.name === 'ValueHelpService') {
        new ValueHelpHandler({
            entityName: 'cnma.valuehelp.ValueHelpList',
            allowedReferenceTables: {
                ShadowUsers: 'cnma.identity.ShadowUsers',
                ShadowGroups: 'cnma.identity.ShadowGroups',
                SampleEntity: 'cnma.proresolve.SampleEntity',
            },
        });
    }
});

cds.on('served', () => {
    logger.info('All CDS services served successfully');

    // Báo AI Core có thông hay không ngay bây giờ, thay vì để vỡ ở lời gọi model
    // đầu tiên. Không chặn khởi động.
    runAiStartupProbes();
});

/**
 * Khởi tạo dữ liệu — chạy SAU khi cổng đã mở.
 *
 * ── Vì sao không đặt trong 'served' ──
 * CAP *chờ* handler 'served' bất đồng bộ chạy xong rồi mới gọi `listen()`. Để
 * chuỗi seed ở đó nghĩa là cổng chỉ mở khi seed xong. Đo trên hybrid/HANA Cloud:
 *
 *     sweepOnStartup         5.3s
 *     seedRetrievalConfig   20.0s
 *     seedRetrievalProfiles  1.4s
 *     seedLibraryFromBundle 17.5s
 *     ────────────────────────────
 *     tổng                  44.3s   ← cổng 4008 im lặng suốt quãng này
 *
 * Gần như toàn bộ quãng đó chỉ để XÁC NHẬN dữ liệu vốn đã có. Chi phí nằm ở
 * round-trip tới EU10 với pool `min: 0` — mỗi truy vấn đầu phải dựng lại một
 * connection TLS mới — chứ không phải khối lượng dữ liệu.
 *
 * Chuyển sang 'listening' thì server nhận request ngay từ ~10s, seed chạy nền
 * phía sau. An toàn vì mọi bước đều idempotent và chỉ bù phần còn thiếu.
 *
 * ── Vì sao local dev BỎ QUA seed ──
 * Local hybrid nối vào đúng cái HANA mà deploy đã seed rồi — 44s kia chỉ để xác
 * nhận lại điều đó qua round-trip EU10, ở MỌI lần boot, và `cds watch` thì boot
 * liên tục. Seed thuộc về vòng đời deploy, không thuộc vòng đời dev. Nhận diện
 * local qua profile `development` (`cds watch` luôn bật nó kèm theo; trên CF chỉ
 * có `production`). Cần ép chạy tại chỗ — DB mới tinh, hoặc test lại seeder —
 * thì đặt CNMA_STARTUP_SEED=1.
 */
cds.on('listening', () => {
    void startupTasks();
});

async function startupTasks(): Promise<void> {
    // Job phân tích 8D sống trong tiến trình này. Server chết giữa chừng thì bản
    // ghi kẹt ở 'Analyzing' và UI quay vòng mãi không dừng — dọn ngay lúc boot.
    // Bước này KHÔNG thuộc nhóm seed và chạy cả ở local: report kẹt sinh ra từ
    // chính tiến trình local chết giữa chừng, không phải từ deploy.
    try {
        await sweepOnStartup();
    } catch (e: any) {
        logger.error('Không dọn được report kẹt lúc boot:', e?.message ?? e);
    }

    const isLocalDev = cds.env.profiles?.includes('development');
    if (isLocalDev && process.env.CNMA_STARTUP_SEED !== '1') {
        logger.info('Local dev — bỏ qua seed khởi động (ép chạy: CNMA_STARTUP_SEED=1).');
        return;
    }

    // Cả chuỗi seed nằm chung một try: chạy trong `void startupTasks()`, nên một
    // promise vỡ ở đây là unhandled rejection và giết cả tiến trình. Gộp chung
    // cũng đúng về mặt phụ thuộc — hỏng `seedRetrievalConfig` thì bước profile
    // phía sau không còn cơ sở để chạy.
    try {
        // Trọng số chấm điểm và danh sách prompt bước D.
        //
        // Seed bằng code chứ không bằng CSV trong `db/data/`: HDI ghi đè CSV ở MỖI
        // lần deploy, nên trọng số admin chỉnh trên UI sẽ bị xoá mà không ai được
        // báo. Hàm này idempotent — chỉ ghi khi bảng còn rỗng.
        await seedRetrievalConfig();

        // Profile chấm điểm và ràng buộc bước D → profile.
        //
        // PHẢI chạy sau `seedRetrievalConfig()`: profile `default` được dựng từ bộ
        // trọng số toàn cục đang có trong DB, nên bảng đó phải tồn tại trước. Đảo thứ
        // tự thì trên một DB mới, profile mặc định sinh ra rỗng.
        await seedRetrievalProfiles();
    } catch (e: any) {
        logger.error('Khởi tạo dữ liệu lúc boot thất bại:', e?.message ?? e);
    }

    // Kho case tiền lệ. Chỉ BÙ case còn thiếu, không đụng case đã có — nên deploy
    // lại vừa mang được case mới lên, vừa giữ nguyên dữ liệu thật. Đây là đường
    // duy nhất để kho có dữ liệu trên CF mà không phải nới scope admin cho token
    // kỹ thuật của chính app.
    try {
        await seedLibraryFromBundle();
    } catch (e: any) {
        // Kho thiếu làm hỏng gợi ý tiền lệ, nhưng không được làm app chết:
        // `findPrecedents` đã báo rõ lý do thay vì đoán bừa.
        logger.error('Không bù được kho case từ dữ liệu đóng gói:', e?.message ?? e);
    }

    // Vector cho tiêu chí ngữ nghĩa. Chạy ngầm — cần AI Core sống và mất vài
    // giây, không đáng để chặn khởi động.
    embedLibraryInBackground();
}
