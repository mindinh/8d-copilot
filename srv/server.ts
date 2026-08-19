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
    app.use((req, res, next) => {
        console.log(`[HTTP INCOMING] ${req.method} ${req.url}`);
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

cds.on('served', async () => {
    logger.info('All CDS services served successfully');

    // Báo AI Core có thông hay không ngay bây giờ, thay vì để vỡ ở lời gọi model
    // đầu tiên. Không chặn khởi động.
    runAiStartupProbes();

    // Job phân tích 8D sống trong tiến trình này. Server chết giữa chừng thì bản
    // ghi kẹt ở 'Analyzing' và UI quay vòng mãi không dừng — dọn ngay lúc boot.
    await sweepOnStartup();

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
});
