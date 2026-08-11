import express from 'express';
import cors from 'cors';
import cds from '@sap/cds';
import path from 'path';
import dotenv from 'dotenv';
import { IdentityServiceHandler } from '@cnma/cap-identity/srv';
import { ValueHelpHandler } from '@cnma/cap-valuehelp/srv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const logger = cds.log('Bootstrap');

/**
 * Custom CAP Bootstrap Server
 * Hooks into CDS bootstrap to add middleware, routes, and configuration.
 */
cds.on('bootstrap', (app: express.Application) => {
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
        const handler = new IdentityServiceHandler(srv as cds.ApplicationService);
        handler.register();
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
});
