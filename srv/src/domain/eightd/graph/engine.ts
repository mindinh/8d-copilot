/**
 * Engine truy hồi bằng graph — và cái công tắc chọn giữa nó với engine cũ.
 *
 * ── Vì sao công tắc là TOÀN CỤC, không phải mỗi bước một cờ ──
 * Cách hiển nhiên để giảm rủi ro là bật dần: cho D4 chạy graph, tám bước còn lại
 * giữ nguyên. Cách đó SAI, và sai một cách âm thầm.
 *
 * `mergeStepPrecedents` gộp kết quả của cả tám bước thành MỘT danh sách được đánh
 * số MỘT LẦN, giữ lại bản có điểm cao nhất:
 *
 *     if (!seen || p.score > seen.score) best.set(p.notificationId, p);
 *
 * Chạy lẫn lộn thì phép `>` đó đang so điểm graph (số bằng chứng có trọng số) với
 * điểm chấm cũ (thang 0–16). `precedents#1` thôi không còn là case mạnh nhất, và
 * KHÔNG lớp nào bắt được: `postProcess` chỉ kiểm trích dẫn khớp `^(team\.|precedents#)`,
 * mà một trích dẫn sai-nhưng-đúng-cú-pháp thì khớp. Đây đúng là thứ chú thích
 * trong `findPrecedents.ts` cảnh báo — *"một trích dẫn mơ hồ đi qua được mọi lớp
 * kiểm tra hiện có"*.
 *
 * Nên rủi ro được xử bằng `scripts/shadow-retrieval.mjs`: chạy CÙNG một case qua
 * CẢ HAI engine rồi so bảng. Cách đó cho bằng chứng tốt hơn hẳn, mà không bao giờ
 * ship ra một báo cáo lai.
 */

import cds from '@sap/cds';
import { buildAnchor, type GraphAnchor } from './anchor';
import { isGraphAvailable } from './graphClient';
import { hydratePrecedents } from './hydrate';
import {
    resolvedByActionType,
    sameDefectCode,
    sameMaterial,
    sameMaterialFamily,
    sameWorkCenter,
    sharedKeywords,
    type EvidenceHit,
} from './probes';
import {
    STEP_CODES,
    scoreEvidence,
    type GraphStepProfile,
    type StepCode,
} from './stepProfiles';
import { getGraphSettings, getStepProfiles } from './settings';
import {
    emptyPerStepPrecedents,
    findPrecedentsByStep as findPrecedentsByScoring,
    mergeStepPrecedents,
    type PerStepPrecedents,
    type PrecedentResult,
} from '../precedent/findPrecedents';
import type { CaseContext } from '../types';

const LOG = cds.log('graph');

/**
 * Gom TẤT CẢ bằng chứng một lần, dùng chung cho cả tám bước.
 *
 * Tám bước hỏi tám câu khác nhau, nhưng chúng rút từ cùng một tập đường đi. Chạy
 * lại các probe cho từng bước là tám lượt khứ hồi tới HANA cho cùng một câu trả
 * lời. Cái KHÔNG chia sẻ được là chấm điểm — đó chính là chỗ các bước khác nhau —
 * và chấm điểm là hàm thuần trên vài chục dòng, nên rẻ.
 */
async function collectEvidence(anchor: GraphAnchor): Promise<EvidenceHit[]> {
    // Tuần tự chứ không `Promise.all`, cùng lý do đã ghi trong `findPrecedentsByStep`:
    // pool của CAP mỗi tenant một connection, nên song song chỉ làm các câu xếp
    // hàng bên trong transaction của nhau.
    const value: EvidenceHit[] = [];
    for (const probe of [sameWorkCenter, sameMaterial, sameMaterialFamily, sameDefectCode, sharedKeywords]) {
        value.push(...await probe(anchor));
    }

    // Probe hành động chỉ chạy trên các case đã lọt lưới ở trên. Quét toàn kho
    // rồi mới giao nhau là đọc 78 dòng hành động để rồi bỏ gần hết.
    const candidates = [...new Set(value.map((h) => h.notificationId))];
    const action: EvidenceHit[] = [];
    for (const [type, kind] of [
        ['Containment', 'containment'],
        ['Corrective', 'corrective'],
        ['Preventive', 'preventive'],
    ] as const) {
        action.push(...await resolvedByActionType(anchor, type, kind, candidates));
    }

    return [...value, ...action];
}

function toResult(
    code: StepCode,
    profile: GraphStepProfile,
    precedents: Awaited<ReturnType<typeof hydratePrecedents>>,
    evidenceCount: number,
    libraryCount: number,
): PrecedentResult {
    return {
        precedents,
        reason: precedents.length ? null : reasonFor(code, profile, evidenceCount, libraryCount),
        // Bằng chứng graph không có trần cố định, nên `maxScore` báo điểm THỰC của
        // case mạnh nhất. Bịa ra một mẫu số cố định sẽ làm mọi tỉ lệ trên UI vô nghĩa.
        maxScore: precedents[0]?.score ?? 0,
        settings: { minScore: profile.minScore, topN: profile.topN, closedOnly: true },
        libraryCount,
        candidatesScored: evidenceCount,
        // Ngữ nghĩa bị hạ xuống booster và chưa tham gia vòng này — nói thật thay vì
        // báo `true` cho đẹp. Xem quyết định D-4 trong spec.
        semanticUsed: false,
        profileKey: `graph:${code}`,
        profileLabel: profile.label,
    };
}

function reasonFor(
    code: StepCode,
    profile: GraphStepProfile,
    evidenceCount: number,
    libraryCount: number,
): string {
    if (libraryCount === 0) {
        return 'The case library is empty — no historical cases have been loaded yet. '
            + 'Run the library seed before expecting precedent-based suggestions.';
    }
    if (evidenceCount === 0) {
        return `No closed case shares a work centre, material, defect code or defect keyword with this one `
            + `(${libraryCount} cases in the library). Nothing is shown rather than a weak guess.`;
    }
    return `No past case reaches ${profile.minScore} points of graph evidence for ${code} `
        + `(${profile.label}: ${profile.question}). Evidence was found but none of it was strong enough; `
        + 'no precedent will be shown rather than a weak guess.';
}

/**
 * Tiền lệ cho cả tám bước, tìm bằng graph.
 *
 * Cùng chữ ký và cùng kiểu trả về với `findPrecedentsByStep` của engine cũ — đó là
 * điều kiện để đổi engine chỉ là đổi một cờ.
 */
export async function findPrecedentsByStepGraph(
    context: CaseContext,
): Promise<PerStepPrecedents> {
    const anchor = buildAnchor(context);
    const db = await cds.connect.to('db');

    const [{ N: libraryCount }] = (await db.run(
        'SELECT COUNT(*) AS N FROM "CNMA_PRORESOLVE_HISTORICALCASES"',
    )) as Array<{ N: number }>;

    const evidence = await collectEvidence(anchor);
    // Trọng số đọc từ `GraphStepParams`; thiếu dòng thì rơi về hằng số trong code.
    const profiles = await getStepProfiles();

    const byStep = {} as Record<StepCode, PrecedentResult>;
    for (const code of STEP_CODES) {
        const profile = profiles[code];
        // Bước có khai `actionType` chỉ nhận bằng chứng hành động của ĐÚNG loại đó.
        // Không lọc thì D3 (chặn tạm) ăn điểm từ hành động phòng ngừa của case khác —
        // một câu trả lời trông hợp lý cho một câu hỏi không ai đặt ra.
        const relevant = evidence.filter((hit) => {
            if (hit.kind === 'containment') return profile.actionType === 'Containment';
            if (hit.kind === 'corrective') return profile.actionType === 'Corrective';
            if (hit.kind === 'preventive') return profile.actionType === 'Preventive';
            return true;
        });
        const scored = scoreEvidence(relevant, profile);
        byStep[code] = toResult(code, profile, await hydratePrecedents(scored), relevant.length, Number(libraryCount));
    }

    const union = mergeStepPrecedents(byStep);
    const profileByStep = Object.fromEntries(
        STEP_CODES.map((code) => [code, `graph:${code}`]),
    ) as Record<StepCode, string>;

    LOG.info(
        `Case ${context.notificationId} · graph: ${union.length} tiền lệ hợp nhất từ `
        + `${evidence.length} chặng bằng chứng — `
        + STEP_CODES.map((code) => `${code}:${byStep[code].precedents.length}`).join(' '),
    );

    return { union, byStep, profileByStep };
}

/**
 * Điểm vào duy nhất: chọn engine, và luôn trả về một kết quả dùng được.
 *
 * Ba điều kiện phải cùng đúng thì graph mới chạy — cấu hình bật, database là
 * HANA, workspace đã deploy và hợp lệ. Thiếu bất cứ điều nào là rơi về engine cũ,
 * kèm một dòng log nói rõ điều nào thiếu: "không có tiền lệ" và "engine không
 * chạy" nhìn ngoài giống hệt nhau, và phân biệt được hai thứ đó là việc của log.
 *
 * Graph hỏng giữa chừng cũng rơi về chứ không ném — mất một cách tìm tiền lệ vẫn
 * còn cách kia, còn đổi cả lượt phân tích lấy một sự cố của DB thì không đáng.
 */
export async function findPrecedents(context: CaseContext, raw?: unknown): Promise<PerStepPrecedents> {
    const settings = await getGraphSettings();

    if (settings.engine !== 'graph') return findPrecedentsByScoring(context, raw);
    if (!(await isGraphAvailable())) return findPrecedentsByScoring(context, raw);

    try {
        return await findPrecedentsByStepGraph(context);
    } catch (e: any) {
        if (!settings.fallbackEnabled) {
            LOG.error(`Truy hồi bằng graph hỏng và fallback đang TẮT: ${e.message}`);
            throw e;
        }
        LOG.warn(`Truy hồi bằng graph hỏng (${e.message}) — rơi về engine chấm điểm.`);
        try {
            return await findPrecedentsByScoring(context, raw);
        } catch (fallbackError: any) {
            LOG.error(`Cả hai engine đều hỏng: ${fallbackError.message}`);
            return emptyPerStepPrecedents(`Precedent search failed: ${fallbackError.message}`);
        }
    }
}
