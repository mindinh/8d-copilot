/**
 * Worklist sự vụ mới đến — đồng bộ (mô phỏng) từ SAP Record Defects (Q3) và
 * Create Quality Notification (Q1).
 *
 * ── Vì sao đọc từ `mock-data/incoming/` ──
 * POC chưa có OData/RFC sang SAP thật (xem "Out of Scope" trong AI Requirements).
 * Thư mục `incoming/` chứa đúng thứ một lần pull từ Record Defects sẽ trả về:
 * sự vụ CHỈ có triệu chứng và bối cảnh, chưa có root cause / 5-Why / action.
 * Khi có kết nối thật, chỉ cần thay `readIncomingDir()` bằng lời gọi OData —
 * phần upsert và phần Create 8D không đổi.
 *
 * ── Vì sao idempotent theo `notificationId` ──
 * Nút Sync sẽ bị bấm nhiều lần. Nạp trùng một notification thành hai dòng
 * worklist nghĩa là có thể mở hai case 8D cho cùng một sự vụ — đúng cái nhầm
 * lẫn mà worklist sinh ra để tránh.
 */

import cds from '@sap/cds';
import fs from 'fs';
import path from 'path';
import { mapCase } from './caseMapper';
import type { CaseContext } from './types';

const LOG = cds.log('eightd-worklist');

const WORKLIST = 'cnma.proresolve.WorklistItems';

/**
 * Thư mục sự vụ mới trong repo. KHÔNG được deploy lên Cloud Foundry — trên CF,
 * đường duy nhất là đẩy payload thẳng vào action `syncWorklist`.
 */
const INCOMING_DIR = path.resolve(__dirname, '../../../../mock-data/incoming');

export interface SyncReport {
    synced: number;
    skipped: number;
    failed: number;
    /** Thông điệp người đọc hiểu được — hiện thẳng ở toast phía UI. */
    messages: string[];
}

/** Q1 đến từ Create Quality Notification, mọi thứ còn lại từ Record Defects. */
function sourceSystemOf(origin: string): string {
    return String(origin ?? '').startsWith('Q1') ? 'Create Quality Notification' : 'Record Defects';
}

function readIncomingDir(): unknown[] {
    if (!fs.existsSync(INCOMING_DIR)) {
        LOG.info('Không có thư mục mock-data/incoming — sync chỉ nhận payload đẩy vào.');
        return [];
    }
    return fs.readdirSync(INCOMING_DIR)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => JSON.parse(fs.readFileSync(path.join(INCOMING_DIR, f), 'utf8')));
}

/**
 * Nạp sự vụ vào worklist. `rawCases` rỗng ⇒ đọc từ thư mục incoming.
 *
 * Case không map được KHÔNG làm hỏng cả mẻ: sự vụ hỏng bị bỏ qua kèm thông điệp,
 * các sự vụ còn lại vẫn vào worklist — một file rác trong thư mục không được
 * phép chặn toàn bộ luồng nghiệp vụ.
 */
export async function syncWorklist(rawCases?: unknown[]): Promise<SyncReport> {
    const db = await cds.connect.to('db');
    const cases = rawCases?.length ? rawCases : readIncomingDir();

    const report: SyncReport = { synced: 0, skipped: 0, failed: 0, messages: [] };
    if (!cases.length) {
        report.messages.push('Không có sự vụ nào để đồng bộ.');
        return report;
    }

    const existing = new Set<string>(
        (await db.run(SELECT.from(WORKLIST).columns('notificationId')))
            .map((r: any) => String(r.notificationId)),
    );

    for (const raw of cases) {
        let context: CaseContext;
        try {
            context = mapCase(raw);
        } catch (e: any) {
            report.failed += 1;
            report.messages.push(`Bỏ qua một sự vụ không đọc được: ${e?.message ?? e}`);
            continue;
        }

        if (existing.has(context.notificationId)) {
            report.skipped += 1;
            continue;
        }

        await INSERT.into(WORKLIST).entries({
            ID: cds.utils.uuid(),
            notificationId: context.notificationId,
            origin: context.origin,
            symptomShortText: context.header.symptomShortText,
            sapStatus: context.header.status,
            foundDate: context.header.foundDate,
            quantityExtent: context.header.quantityExtent,

            materialId: context.product.materialId,
            materialDesc: context.product.materialDesc,
            batchId: context.product.batchId,
            defectCode: context.product.defectCode,
            defectText: context.product.defectText,
            workCenterId: context.product.workCenterId,
            workCenterDesc: context.product.workCenterDesc,

            sourceSystem: sourceSystemOf(String(context.origin)),
            status: 'New',
            syncedAt: new Date().toISOString(),
            sourcePayload: JSON.stringify(raw),
        });

        existing.add(context.notificationId);
        report.synced += 1;
    }

    report.messages.unshift(
        `Đồng bộ xong: ${report.synced} sự vụ mới, ${report.skipped} đã có sẵn` +
        (report.failed ? `, ${report.failed} lỗi` : '') + '.',
    );
    return report;
}

export interface WorklistRow {
    ID: string;
    notificationId: string;
    status: string;
    sourcePayload: string | null;
    report_ID: string | null;
}

export async function getWorklistItem(itemID: string): Promise<WorklistRow | null> {
    const db = await cds.connect.to('db');
    const row = await db.run(
        SELECT.one.from(WORKLIST)
            .columns('ID', 'notificationId', 'status', 'sourcePayload', 'report_ID')
            .where({ ID: itemID }),
    );
    return (row as WorklistRow) ?? null;
}

/** Gắn report vừa mở vào dòng worklist và chốt trạng thái. */
export async function markEightDCreated(itemID: string, reportID: string): Promise<void> {
    await UPDATE(WORKLIST)
        .set({ status: 'EightDCreated', report_ID: reportID })
        .where({ ID: itemID });
}
