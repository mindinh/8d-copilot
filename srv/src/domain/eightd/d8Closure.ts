/**
 * D8 — phần TÌM KIẾM của bước đóng case.
 *
 * D8 không còn chỉ là một cái cổng. Nó đi tìm bài học của những case tương tự
 * đã đóng, và quét ngược xem sự vụ nào đang mở có thể dính cùng một lỗi.
 *
 * ── Ba câu trả lời, không phải hai ──
 * "Không có tiền lệ nào đủ điểm" và "có tiền lệ nhưng nó không ghi bài học nào"
 * là hai chuyện khác nhau, và cả hai đều khác "đây là bài học tìm được".
 * Một mảng rỗng gộp hai ca đầu làm một, nên trạng thái phải là trường riêng
 * (R2.8.7). Ca thứ hai còn nói lên điều đáng giá: quy trình ghi bài học đang bị
 * bỏ trống — thông tin đó mất hẳn nếu ta chỉ hiện "không tìm thấy gì".
 *
 * ── Quét tái diễn chỉ để BÁO ──
 * Không bao giờ ghi sang case khác (R2.8.9). Cờ này nói "chỗ kia có thể dính
 * cùng lỗi, người xem lại đi"; biến nó thành hành động tự động là để một case
 * đang đóng sửa đổi một case người khác đang làm dở.
 */

import cds from '@sap/cds';
import { findPrecedents } from './precedent/findPrecedents';
import { scoreCase, type ScorableCase } from './precedent/scoring';
import { getProfile } from './precedent/profileRepository';
import type { CaseContext } from './types';

const REPORTS = 'cnma.proresolve.Reports';
const HISTORICAL_CASES = 'cnma.proresolve.HistoricalCases';

export type PrecedentStatus =
    | 'Lessons found'
    | 'Precedent found, no lessons recorded'
    | 'No precedent lessons available';

export interface PrecedentLesson {
    caseId: string;
    /** `"7/11"` — hiện nguyên văn, để người đọc chấm tay lại được. */
    score: string;
    lesson: string;
}

export interface PrecedentLessonsResult {
    lessons: PrecedentLesson[];
    status: PrecedentStatus;
    /** Case đã đủ điểm, kể cả case không có bài học nào. */
    matchedCaseIds: string[];
}

export interface RecurrenceFlag {
    notificationId: string;
    score: string;
    symptomShortText: string | null;
    matchedOn: string;
}

export interface RecurrenceResult {
    flags: RecurrenceFlag[];
    /** Câu sẵn cho UI khi không có gì — tránh mỗi nơi tự chế một câu khác nhau. */
    message: string;
    scanned: number;
}

function toText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * Bóc bài học từ payload gốc của một case tiền lệ.
 *
 * Chấp nhận vài cách đặt tên vì payload đi qua nhiều đời export. Trả mảng rỗng
 * khi case không ghi gì — và mảng rỗng đó là một KẾT QUẢ có nghĩa, không phải
 * lỗi: nó chính là ca "precedent found, no lessons recorded".
 */
export function extractLessons(sourcePayload: string | null | undefined): string[] {
    if (!sourcePayload) return [];
    let parsed: any;
    try { parsed = JSON.parse(sourcePayload); } catch { return []; }

    const rows: any[] = [];
    const data = parsed?.data ?? parsed;
    const direct = data?.lessons_learned ?? data?.lessonsLearned;
    if (Array.isArray(direct)) rows.push(...direct);
    else if (direct && typeof direct === 'object') rows.push(direct);

    return rows.flatMap((row) => {
        const worked = toText(row.what_worked ?? row.whatWorked);
        const didnt = toText(row.what_didnt ?? row.whatDidnt);
        return [
            worked && `What worked: ${worked}`,
            didnt && `What did not work: ${didnt}`,
        ].filter(Boolean) as string[];
    });
}

/**
 * Bài học của những case tương tự đã đóng.
 *
 * Dùng lại `findPrecedents` chứ không tự chấm: cả hệ thống chỉ có MỘT engine
 * tương tự (R1.1), nên chỉnh trọng số ở AI Settings phải đổi kết quả của D8
 * đúng như nó đổi kết quả của D4.
 */
export async function findPrecedentLessons(
    context: CaseContext,
    opts: { raw?: unknown; profileKey?: string } = {},
): Promise<PrecedentLessonsResult> {
    const result = await findPrecedents(context, opts);
    if (!result.precedents.length) {
        return { lessons: [], status: 'No precedent lessons available', matchedCaseIds: [] };
    }

    const matchedCaseIds = result.precedents.map((precedent) => precedent.notificationId);
    const db = await cds.connect.to('db');
    const rows = await db.run(
        SELECT.from(HISTORICAL_CASES)
            .columns('notificationId', 'sourcePayload')
            .where({ notificationId: { in: matchedCaseIds } }),
    ) as Array<{ notificationId: string; sourcePayload: string | null }>;

    const payloadByCase = new Map(rows.map((row) => [row.notificationId, row.sourcePayload]));

    const lessons = result.precedents.flatMap((precedent) =>
        extractLessons(payloadByCase.get(precedent.notificationId)).map((lesson) => ({
            caseId: precedent.notificationId,
            score: `${precedent.score}/${precedent.maxScore}`,
            lesson,
        })),
    );

    return {
        lessons,
        // Có tiền lệ mà không có bài học là một phát hiện, không phải một khoảng
        // trống — nó nói rằng quy trình ghi bài học đang bị bỏ.
        status: lessons.length ? 'Lessons found' : 'Precedent found, no lessons recorded',
        matchedCaseIds,
    };
}

/**
 * Ghi phần TÌM KIẾM của D8 vào discipline.
 *
 * Chỉ đụng `precedentLessons`, `precedentStatus` và `recurrence.*` — phần tóm
 * tắt bài học (`summary.*`) vẫn của model, vì đó là việc soạn thảo thật sự.
 * Ba trường này thì không: chúng là kết quả tìm kiếm, và một kết quả tìm kiếm do
 * model tự kể ra là một kết quả không ai kiểm được.
 *
 * `gate.*` KHÔNG đụng ở đây: cổng phụ thuộc `stepStatus` do người đặt, tức là nó
 * đổi sau khi báo cáo đã sinh xong. Nó được tính lúc đọc, không lúc ghi.
 */
export async function applyD8Search(
    result: { disciplines: Array<Record<string, any>> },
    context: CaseContext,
    opts: { raw?: unknown } = {},
): Promise<void> {
    const d8 = result.disciplines?.find((discipline) => discipline.code === 'D8');
    if (!d8) return;

    // Tìm kiếm hỏng thì bỏ phần tìm kiếm, KHÔNG làm hỏng cả báo cáo: phần tóm
    // tắt bài học vẫn có giá trị khi không có tiền lệ nào.
    const [lessons, recurrence] = await Promise.all([
        findPrecedentLessons(context, opts).catch(() => null),
        scanRecurrence(context).catch(() => null),
    ]);

    const data = (d8.data ??= {});
    if (lessons) {
        data.precedentLessons = lessons.lessons;
        data.precedentStatus = lessons.status;
    }
    if (recurrence) {
        const rec = (data.recurrence ??= {});
        rec.openCaseMatches = recurrence.flags.map(
            (flag) => `${flag.notificationId} (${flag.score}) — ${flag.symptomShortText ?? 'no symptom recorded'}; matched on ${flag.matchedOn}`,
        );
        if (!recurrence.flags.length) rec.openCaseMatches = [];
    }

    // FMEA để xác nhận: một tham chiếu chéo, không phải một khẳng định đã cập
    // nhật (cùng luật với D7 — R2.7.2).
    if (context.fmea?.fmeaId) {
        const rec = (data.recurrence ??= {});
        rec.fmeaToConfirm = `${context.fmea.fmeaId}${context.fmea.description ? ` (${context.fmea.description})` : ''} — confirm it was updated per D7.`;
    }
}

/**
 * Quét NGƯỢC: sự vụ nào đang MỞ có thể dính cùng lỗi này.
 *
 * Cùng công thức chấm, chỉ đổi tập ứng viên — tiền lệ nhìn về quá khứ đã đóng,
 * còn quét này nhìn sang hiện tại chưa đóng.
 */
export async function scanRecurrence(
    context: CaseContext,
    opts: { profileKey?: string } = {},
): Promise<RecurrenceResult> {
    const profile = await getProfile(opts.profileKey);
    const db = await cds.connect.to('db');

    // Tính hệt như `findPrecedents`: tổng trọng số của các tiêu chí đang bật.
    // Quét tái diễn phải dùng cùng thang điểm với panel tiền lệ, nếu không thì
    // "7/11" ở hai chỗ trên cùng một trang lại có nghĩa khác nhau.
    const maxScore = profile.criteria
        .filter((criterion) => criterion.enabled)
        .reduce((sum, criterion) => sum + (Number(criterion.weight) || 0), 0);

    const openReports = await db.run(
        SELECT.from(REPORTS)
            .columns('notificationId', 'symptomShortText', 'workCenterId', 'defectCode', 'defectText', 'materialId')
            .where({ status: { '!=': 'Closed' } }),
    ) as Array<Record<string, any>>;

    // Loại chính nó: một case luôn khớp hoàn hảo với chính mình, và báo điều đó
    // là tiếng ồn thuần tuý.
    const candidates = openReports.filter((row) => row.notificationId !== context.notificationId);

    const flags: RecurrenceFlag[] = [];
    for (const row of candidates) {
        const scored = scoreCase(
            context,
            {
                notificationId: row.notificationId,
                workCenterId: row.workCenterId,
                defectCode: row.defectCode,
                defectText: row.defectText,
                materialId: row.materialId,
            } as unknown as ScorableCase,
            profile.criteria,
        );
        if (scored.score < profile.minScore) continue;
        flags.push({
            notificationId: row.notificationId,
            score: `${scored.score}/${maxScore}`,
            symptomShortText: row.symptomShortText ?? null,
            matchedOn: scored.breakdown
                .filter((hit) => hit.level !== 'none')
                .map((hit) => hit.label)
                .join(', ') || 'threshold reached',
        });
    }

    flags.sort((a, b) => Number.parseInt(b.score, 10) - Number.parseInt(a.score, 10));

    return {
        flags,
        message: flags.length
            ? `${flags.length} open case(s) share enough context that this fix may apply. Informational only — review them manually.`
            : 'No other open case scores above the threshold against this one.',
        scanned: candidates.length,
    };
}
