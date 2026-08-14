/**
 * Giá trị mặc định cho cấu hình truy hồi.
 *
 * ── Vì sao KHÔNG dùng CSV trong `db/data/` ──
 * CAP dịch CSV thành `.hdbtabledata` và HDI ghi đè toàn bộ bảng ở MỖI lần deploy.
 * Với dữ liệu tham chiếu bất biến thì hợp lý; với bảng admin chỉnh trên UI thì
 * đó là mất dữ liệu: chỉnh trọng số hôm nay, deploy ngày mai là về mặc định mà
 * không ai được báo.
 *
 * Nên seed bằng code lúc khởi động và CHỈ khi bảng rỗng. DB mới (kể cả HDI trên
 * CF) tự có mặc định; deploy lại giữ nguyên phần đã chỉnh.
 *
 * Trọng số dưới đây lấy nguyên văn từ `docs/AI Requirements - 8D Copilot POC.md`
 * mục 2. Sửa ở đây là sửa hành vi đã được acceptance criteria chốt.
 */

import type { Criterion } from './scoring';
import { DEFAULT_DISCIPLINE_GUIDE } from '../prompts';

export const DEFAULT_CRITERIA: readonly (Criterion & {
    description: string;
    sourceTable: string;
})[] = Object.freeze([
    Object.freeze({
        criterionKey: 'workCenter',
        label: 'Work center',
        description:
            'Same production line or machine group. The strongest single signal for D1: '
            + 'who has worked this equipment before is a question about identity, not about wording.',
        sourceTable: 'HistoricalCases · GD 4 WorkCenters',
        sourceField: 'workCenterId',
        matchType: 'exact',
        weight: 4,
        fallbackField: null,
        fallbackMatch: null,
        fallbackWeight: null,
        enabled: true,
        sortOrder: 10,
    }),
    Object.freeze({
        criterionKey: 'defectCode',
        label: 'Defect code',
        description:
            'Same catalogued defect. Falls back to shared keywords in the defect text when the '
            + 'codes differ — two plants often catalogue the same failure under different codes.',
        sourceTable: 'HistoricalCases · GD 3 Defects',
        sourceField: 'defectCode',
        matchType: 'exact',
        weight: 4,
        fallbackField: 'defectKeywords',
        fallbackMatch: 'keyword',
        fallbackWeight: 2,
        enabled: true,
        sortOrder: 20,
    }),
    Object.freeze({
        criterionKey: 'material',
        label: 'Material',
        description:
            'Same part number. Falls back to the same material group when the parts differ but '
            + 'belong to one family.',
        sourceTable: 'HistoricalCases · GD 1 Materials',
        sourceField: 'materialId',
        matchType: 'exact',
        weight: 3,
        fallbackField: 'materialFamily',
        fallbackMatch: 'family',
        fallbackWeight: 1,
        enabled: true,
        sortOrder: 30,
    }),
    Object.freeze({
        criterionKey: 'semantic',
        label: 'Similar description',
        description:
            'Semantic similarity between the two case narratives, from an embedding of the defect, '
            + 'the investigation findings and the causal chain. This is the only criterion that can '
            + 'connect two cases whose work centre, part and defect code all differ — the case where '
            + 'the same failure was written up in different words.',
        sourceTable: 'HistoricalCases.searchText (embedding)',
        sourceField: 'embedding',
        matchType: 'cosine',

        /**
         * Trọng số 5 — ngang một lần trùng work center (4).
         *
         * Với sàn 0.70, một case chỉ giống về ngữ nghĩa ăn 5 × 0.70 = 3.5 điểm,
         * vừa đủ vượt ngưỡng 3. Thấp hơn thì tiêu chí này không bao giờ tự đưa
         * nổi một case vào danh sách, tức là có cũng như không.
         */
        weight: 5,
        fallbackField: null,
        fallbackMatch: null,
        fallbackWeight: null,

        /**
         * Sàn 0.70, chọn theo SỐ ĐO chứ không theo cảm giác.
         *
         * `npx tsx scripts/measure-similarity.mjs` trên 78 cặp của kho hiện tại:
         *
         *     thấp nhất 0.543 · p25 0.608 · trung vị 0.636 · p75 0.687 · cao nhất 0.792
         *
         * Nền cao như vậy vì mọi case đều là văn bản lỗi sản xuất tiếng Anh cùng
         * khuôn — chúng giống nhau sẵn ~0.6 mà chẳng liên quan gì tới nhau. Sàn
         * 0.55 sẽ cho điểm 77/78 cặp và thứ hạng bị nhiễu nền chi phối.
         *
         * 0.70 nằm trên p75, giữ lại đúng nhóm đầu. Đổi công thức ghép
         * `searchText` hoặc đổi model nhúng ⇒ ĐO LẠI, vì phân bố sẽ khác.
         */
        minSimilarity: 0.70,
        enabled: true,
        sortOrder: 40,
    }),
]);

export const DEFAULT_RETRIEVAL_SETTINGS = Object.freeze({
    ID: 'GLOBAL',
    minScore: 3,
    topN: 3,
    closedOnly: true,
});

/**
 * Tám dòng hướng dẫn discipline, seed bằng CHÍNH nội dung đang chạy.
 *
 * ── Vì sao seed nội dung thật thay vì để trống ──
 * Bản đầu để trống, với lý do "trống = dùng hằng số trong code, tránh hai bản
 * sao lệch nhau". Đúng về mặt kỹ thuật nhưng vô dụng trên thực tế: người dùng
 * mở UI thấy tám ô rỗng, không biết prompt hiện tại viết gì, và muốn chỉnh một
 * câu thì phải đi lục `prompts.ts` rồi chép sang.
 *
 * Nỗi lo lệch bản vẫn còn thật, và được xử bằng nút "Reset all steps": nó xoá
 * dòng rồi seed lại từ `DEFAULT_DISCIPLINE_GUIDE`, tức là kéo bản trong DB về
 * đúng bản trong code bất cứ lúc nào.
 *
 * Nguồn duy nhất vẫn là `DEFAULT_DISCIPLINE_GUIDE` — ở đây chỉ tham chiếu tới
 * nó, không chép lại text.
 */
export const DEFAULT_STEP_PROMPTS: readonly {
    stepCode: string;
    label: string;
    description: string;
    systemPrompt: string;
}[] = Object.freeze([
    { stepCode: 'D1', label: 'Establish the Team', description: 'Suggest roles and people from the teams of matching precedent cases.' , systemPrompt: DEFAULT_DISCIPLINE_GUIDE.D1 },
    { stepCode: 'D2', label: 'Describe the Problem', description: 'Draft the problem paragraph and the 5W2H grid from verified case facts.' , systemPrompt: DEFAULT_DISCIPLINE_GUIDE.D2 },
    { stepCode: 'D3', label: 'Interim Containment Actions', description: 'Surface containment actions, or reuse the top precedent when none exist yet.' , systemPrompt: DEFAULT_DISCIPLINE_GUIDE.D3 },
    { stepCode: 'D4', label: 'Root Cause Analysis', description: 'Walk the 5-Why chain and weigh it against the independent diagnosis.' , systemPrompt: DEFAULT_DISCIPLINE_GUIDE.D4 },
    { stepCode: 'D5', label: 'Permanent Corrective Actions', description: 'Tie each corrective action to a step of the root cause chain.' , systemPrompt: DEFAULT_DISCIPLINE_GUIDE.D5 },
    { stepCode: 'D6', label: 'Verify Effectiveness', description: 'Write the verification plan; this dataset carries no verification evidence.' , systemPrompt: DEFAULT_DISCIPLINE_GUIDE.D6 },
    { stepCode: 'D7', label: 'Prevent Recurrence', description: 'Preventive actions and the FMEA entry to update.' , systemPrompt: DEFAULT_DISCIPLINE_GUIDE.D7 },
    { stepCode: 'D8', label: 'Closure and Recognition', description: 'Lessons learned and the completeness gate over D1–D7.' , systemPrompt: DEFAULT_DISCIPLINE_GUIDE.D8 },
].map((r) => Object.freeze(r)));
