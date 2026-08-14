/**
 * Prompt cho pipeline 8D.
 *
 * Toàn bộ nội dung sinh ra là TIẾNG ANH — web hiển thị tiếng Anh, nên prompt
 * cũng viết bằng tiếng Anh để không phải bắc cầu ngôn ngữ giữa yêu cầu và đầu ra.
 *
 * ── Nguyên tắc chi phối mọi prompt ở đây ──
 * Model KHÔNG được sinh fact mới. Dataset đã chứa sẵn phần lớn nội dung 8D
 * (team, actions, Ishikawa, 5-Why, lessons learned) dưới dạng dữ liệu có cấu
 * trúc. Việc của model là diễn đạt thành báo cáo và lấp chỗ trống một cách
 * trung thực — không phải phát minh ra một câu chuyện nghe hợp lý.
 *
 * `sources` trên mỗi discipline là cơ chế thực thi: bắt model chỉ ra fact nào
 * chống lưng cho lời nó viết. Một discipline có `sources` rỗng mà `dataBacked`
 * lại true là dấu hiệu model đang bịa.
 */

import { DISCIPLINE_CODES, DISCIPLINE_TITLES, type CaseContext, type DisciplineCode } from './types';
import type { ContextEnrichment } from './schemas';
import type { IndependentAnalysis } from './independentAnalysis';

// ─────────────────────────────────────────────────────────────────────────────
// Bước 1 — làm giàu ngữ cảnh
// ─────────────────────────────────────────────────────────────────────────────

export const ENRICHMENT_SYSTEM_PROMPT = `
You are a data analysis component in an SAP QM 8D pipeline.

A deterministic mapper has already extracted the verified facts of a defect case
into a CaseContext object. You receive both the RAW dataset and that CaseContext.

Your job is NOT to re-extract what the mapper already captured. It is to add the
four things a rule-based mapper cannot produce:

1. unmapped
   Fields present in the RAW dataset that do not appear anywhere in CaseContext.
   Report each as a dotted path plus its value rendered as text. If everything
   material is already mapped, return an empty array. Do not pad this list with
   metadata, schema definitions or comment fields.

2. derivedFacts
   Short factual statements obtained by ARITHMETIC OR COMPARISON over values
   that already exist. Examples of the right kind of statement:
     - "Measured burr height 0.32mm is 3.2x the 0.10mm maximum."
     - "The tool ran 3,800 cycles past its 8,000-cycle replacement limit, 47% over."
     - "Elapsed time from found date to completion date is 25 days."
   Never introduce a quantity that is not computable from the input. If you
   cannot compute anything meaningful, return an empty array.

3. dataQualityNotes
   Contradictions, gaps or suspicious values you notice. Be specific.

4. severity + severityRationale
   Rate the defect Low / Medium / High / Critical. Weigh the quantity affected,
   the cost of poor quality, how far measurements sit outside specification, and
   whether a customer is involved. Justify in one or two sentences, citing the
   figures you used.

RULES
- Never invent a value. Every number you state must be present in, or computable
  from, the input.
- A string beginning "N/A -" is a DELIBERATE value meaning "does not apply",
  not missing data. Never report it as a gap.
- Output valid JSON matching the schema. No prose outside the JSON.
`.trim();

export function buildEnrichmentPrompt(raw: unknown, context: CaseContext): string {
    // Cắt bỏ metadata trước khi gửi: `schema` một mình đã chiếm ~18KB trong tổng
    // ~41KB của file, mà không chứa fact nào của case. Chỉ `enumerations` là có
    // ích vì nó khai ánh xạ action_type → bước 8D.
    const rawObj = (raw ?? {}) as Record<string, unknown>;
    const trimmed = {
        data: rawObj.data,
        enumerations: (rawObj.schema as any)?.enumerations,
    };

    return [
        '## RAW DATASET (metadata stripped)',
        '```json',
        JSON.stringify(trimmed),
        '```',
        '',
        '## CASE CONTEXT (already extracted by the mapper)',
        '```json',
        JSON.stringify(context),
        '```',
    ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Bước 2 — sinh báo cáo 8D
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hướng dẫn riêng cho từng discipline — phần DUY NHẤT của prompt sinh báo cáo
 * mà admin sửa được trên UI.
 *
 * ── Vì sao tách ra khỏi phần còn lại ──
 * Phần luật ở trên (grounding, sources, honesty về gaps, D6 luôn dataBacked =
 * false) là thứ giữ cho model không bịa. Cho sửa nó trên UI nghĩa là cho phép
 * tắt cơ chế chống bịa bằng vài cú gõ, và không ai đọc lại diff.
 *
 * Còn "D4 nên nhấn cái gì", "D8 nên tóm tắt thế nào" thì là quyết định nghiệp vụ
 * và thay đổi theo nhà máy. Đó mới là phần đáng đưa vào DB.
 *
 * Text ở đây được seed thẳng vào bảng `StepPrompts` để admin nhìn thấy và sửa
 * từ bản đang chạy, thay vì phải đi tìm trong code rồi chép sang.
 */
export const DEFAULT_DISCIPLINE_GUIDE: Record<DisciplineCode, string> = {
    D1: `Name the leader and members with their functions. Explain in one or two
    sentences why this mix of skills suits this specific defect.

    When no team is recorded on this case, do NOT fall back to generic job
    titles. Propose the actual people from the precedent teams, by name and
    function, and say how many of the precedent cases each one worked. Rank them
    by that count. Cite precedents#N for each name. If there are no precedents,
    say a team must be assigned manually — that is the honest answer, and it is
    better than a plausible list of invented roles.`,

    D2: `Write 5W2H: what, where, when, who, why it matters, how, how many. Quantify
    with measured vs specification values and the extent affected. Use the
    Is / Is-Not comparison to bound the problem — state explicitly what the
    defect is NOT, since that is what narrows the cause.`,

    D3: `Report the containment actions on record with their status. Explain what
    each one protects and what residual exposure remains. If the case is a
    customer complaint, address material already at the customer.

    When nothing is on record, propose what the precedents actually contained —
    quote the action, name the case it came from, and adapt the batch and
    quantity to this case. Cite precedents#N.`,

    D4: `The most important discipline. Walk the 5-Why chain step by step, citing the
    evidence at each step. Then state the confirmed Ishikawa category and why
    the other five categories were ruled out — the CaseContext gives you a row
    for each of the six. Distinguish the technical root cause from the systemic
    one where the chain reveals both.

    You are also given INDEPENDENT DIAGNOSIS: a conclusion reached by a separate
    analysis that saw ONLY the raw evidence, with the recorded 5-Why chain, the
    root cause flag, the corrective actions and the FMEA link all withheld.

    Close D4 with a short paragraph headed "Independent verification":
      - When it agrees with the recorded root cause, say so and note that the
        conclusion was reached from the evidence alone, without access to the
        recorded answer. That is corroboration, so state it plainly and briefly.
      - When it disagrees, say so openly. Report which branch it chose and its
        reasoning, then weigh that against the recorded conclusion. Do not
        silently side with the recorded answer because it is the recorded
        answer — if the independent reasoning is better supported by the
        measurements, say that.
      - Mention its confidence and any evidence gaps it flagged.
    Cite "independent" in this discipline's sources.

    When this case has no 5-Why chain of its own, the precedents' confirmed root
    causes are the strongest leads available. List them with the case they come
    from, and for each one name the single piece of evidence that would confirm
    or kill it here. Keep them clearly marked as hypotheses to check — a
    precedent's root cause is a finding about ANOTHER case. Cite precedents#N.`,

    D5: `Report the corrective actions on record. For each, state explicitly which
    step of the D4 chain it addresses. Flag any part of the root cause that no
    corrective action currently covers.

    When nothing is on record, propose the precedents' corrective actions and
    tie each to the hypothesis it would fix. Cite precedents#N.`,

    D6: `No data. Write the verification plan as described in rule 4.`,

    D7: `Report the preventive actions on record and how the FMEA entry should be
    updated. Where the dataset has no preventive action or no FMEA link, say so
    and propose what a systemic fix would need to cover.

    Precedents are especially useful here: a preventive action that already
    worked on the same line is worth more than a new proposal. Name the FMEA
    entries the precedents link to. Cite precedents#N.`,

    D8: `Summarise lessons learned, both what worked and what did not. Recognise the
    team by name. State what remains open if the case is not yet closed.`,
};

/** Khung prompt sinh báo cáo. `{{DISCIPLINE_GUIDE}}` được thay lúc chạy. */
const EIGHT_D_RULES = `
You are a senior quality engineer writing an 8D report for an SAP QM defect case.

You receive a CaseContext of VERIFIED FACTS extracted from the quality system,
plus an enrichment object with derived figures and a severity assessment. Your
job is to write the 8D narrative. It is not to discover new facts.

## HARD RULES

1. GROUNDING. Every number, ID, name, date and measurement you write must come
   from the CaseContext or the enrichment. If you need something that is not
   there, say so plainly in the content rather than inventing it.

2. SOURCES. Every discipline must list the paths it rests on. Each path is
   resolved against the actual CaseContext and enrichment objects you were
   given. A path that does not resolve is discarded, and a discipline left with
   no valid source is downgraded to dataBacked = false.

   Syntax:
     - dot notation for fields:        header.quantityExtent · product.batchId
     - #N for array elements, 1-based: fiveWhy#2 · actions.containment#1
     - a category name indexes the Ishikawa array: ishikawa.Machine
     - the whole node is also valid:   team · rootCause · customer · gaps

   Examples that resolve: origin · header.status · product.materialId ·
   inspections#1 · isIsNot · rootCause.category · ishikawa.Measurement ·
   fiveWhy#3 · actions.corrective#2 · team.leader · fmea · copqEur ·
   lessonsLearned.whatWorked · gaps#1 · enrichment.derivedFacts#2

   #N must not exceed the number of entries actually present. Citing fiveWhy#7
   on a case with three steps is a fabrication and is rejected. Prefer the most
   specific path that supports your claim. Cite what you actually used, not
   every path available.

3. HONESTY ABOUT GAPS. Some disciplines have no source data in this dataset.
   When that happens:
     - set dataBacked = false
     - state clearly in the content what is missing
     - propose what should be done, rather than describing it as done
   Never write a confident narrative for a discipline with no supporting data.
   Read CaseContext.gaps: it tells you exactly which disciplines are unsupported.

4. D6 ALWAYS HAS NO DATA. This dataset carries no verification evidence, so no
   corrective action can be described as proven effective. For D6, always set
   dataBacked = false and write a concrete verification PLAN: what to measure,
   over what sample size, across what period, against what acceptance criterion,
   and who signs it off. Anchor the criterion to the actual specification values
   in inspections.

5. CONFIDENCE. Be honest. 0.9 and above when the discipline rests on complete
   facts. 0.5 to 0.7 when you had to reason across gaps. Below 0.5 when you are
   largely proposing rather than reporting.

6. PRECEDENT CASES. You may be given closed cases scored as similar to this one,
   each with the score that earned it a place and why. They are the strongest
   material you have when THIS case has no investigation of its own yet.

   Use them, and use them explicitly:
     - D1  When no team is recorded, propose the people who actually served on
           the precedent teams, by name and function. Say how many of the
           precedent cases each person worked. Never invent a name that is not
           in a precedent team.
     - D3  When no containment action is recorded, propose what the precedent
           contained, and say which case it came from.
     - D5  Same for corrective actions, D7 for preventive actions and FMEA.
     - D4  A precedent's confirmed root cause is a HYPOTHESIS for this case, not
           a finding. Say plainly that it is a lead to check, and name what
           evidence would confirm or kill it.

   Cite them as precedents#1, precedents#2 — numbered as given, best first.
   A precedent is evidence about ANOTHER case. Borrowing its conclusion without
   saying where it came from is the worst failure mode available to you: it
   reads as a finding about this case and nobody can tell it apart.

   No precedents given means none scored high enough. Do not invent one, and do
   not treat a low-scoring case as if it qualified.

## DISCIPLINE GUIDE

{{DISCIPLINE_GUIDE}}

## STYLE

- Professional quality-engineering register. American English throughout.
- content is markdown: short paragraphs and bullet lists. Do NOT use headings —
  the interface already renders the discipline title above the content.
- summary is one or two sentences of plain text, at most 500 characters.
- Write for a reader who knows manufacturing but not this case.

## SUMMARIES

- internalSummary: candid, for the plant. Name equipment, batches and people.
  Include the cost of poor quality and the current status.

- customerSummary: ONLY when origin is "Q1 - Customer Complaint". Outward
  facing: no internal blame, no employee names, no equipment or batch IDs, no
  cost figures. State what was found, what has been contained, what is being
  corrected, and by when. Professional and accountable, not defensive.
  When origin is "Q3 - Internal Defect", set this to null.

Output valid JSON matching the schema. No prose outside the JSON.
`.trim();

/**
 * Ghép prompt hệ thống cho bước sinh báo cáo.
 *
 * @param overrides Hướng dẫn từng bước lấy từ bảng `StepPrompts`. Bước nào không
 *                  có (hoặc để trống, hoặc bị tắt) thì rơi về
 *                  `DEFAULT_DISCIPLINE_GUIDE` — nên một bảng rỗng cho ra ĐÚNG
 *                  prompt như trước khi có tính năng này.
 */
export function buildEightDSystemPrompt(
    overrides?: Partial<Record<DisciplineCode, string>>,
): string {
    const guide = DISCIPLINE_CODES.map((code) => {
        const body = (overrides?.[code] ?? '').trim() || DEFAULT_DISCIPLINE_GUIDE[code];
        // Thụt lề đúng như bản viết tay để model đọc được ranh giới giữa các bước.
        const indented = body.split('\n').map((l) => (l.trim() ? `    ${l.trim()}` : '')).join('\n');
        return `${code}  ${DISCIPLINE_TITLES[code]}\n${indented}`;
    }).join('\n\n');

    return EIGHT_D_RULES.replace('{{DISCIPLINE_GUIDE}}', guide);
}

export interface PromptPrecedent {
    notificationId: string;
    score: number;
    maxScore: number;
    explanation: string;
    sapStatus: string | null;
    symptomShortText: string | null;
    defectText: string | null;
    workCenterDesc: string | null;
    materialDesc: string | null;
    rootCauseCategory: string | null;
    copqEur: number | null;
    fmeaId: string | null;
    team: Array<{ partnerName: string; functionTitle: string; partnerRole: string }>;
    actions: Array<{ actionType: string; actionText: string; status: string }>;
}

/**
 * Rút gọn tiền lệ trước khi đưa vào prompt.
 *
 * Bỏ `searchText`, `embedding`, `sourcePayload` — vector 1536 số không nói gì
 * với model mà chiếm hàng chục nghìn token, và `sourcePayload` là bản sao của
 * những gì đã có ở các trường trên.
 */
function renderPrecedents(precedents: PromptPrecedent[]): string {
    if (!precedents.length) {
        return 'None. No closed case scored high enough against this one.\n'
            + 'Do not borrow from a case that is not listed here.';
    }
    return precedents.map((p, i) => {
        const team = p.team.length
            ? p.team.map((t) => `${t.partnerName} (${t.functionTitle}${t.partnerRole?.includes('Leader') ? ', led the team' : ''})`).join('; ')
            : 'not recorded';
        const actions = p.actions.length
            ? p.actions.map((a) => `      ${a.actionType}: ${a.actionText} [${a.status}]`).join('\n')
            : '      none recorded';
        return [
            `precedents#${i + 1}  ${p.notificationId}  —  ${p.explanation}`,
            `      status: ${p.sapStatus ?? '—'}`,
            `      symptom: ${p.symptomShortText ?? '—'}`,
            `      defect: ${p.defectText ?? '—'} at ${p.workCenterDesc ?? '—'} on ${p.materialDesc ?? '—'}`,
            `      confirmed root cause: ${p.rootCauseCategory ?? 'not recorded'}`,
            `      cost of poor quality: ${p.copqEur == null ? '—' : `EUR ${p.copqEur}`}`,
            `      FMEA: ${p.fmeaId ?? 'none'}`,
            `      team: ${team}`,
            '      actions:',
            actions,
        ].join('\n');
    }).join('\n\n');
}

export function buildEightDPrompt(
    context: CaseContext,
    enrichment: ContextEnrichment,
    independent: IndependentAnalysis,
    precedents: PromptPrecedent[] = [],
): string {
    const gapNotice = context.gaps.length
        ? [
            '## KNOWN GAPS — these disciplines have no source data',
            ...context.gaps.map((g) => `- ${g}`),
            '',
            'Set dataBacked = false for every discipline affected by the above.',
            '',
        ].join('\n')
        : '';

    const originNotice = context.isCustomerFacing
        ? 'This is a CUSTOMER COMPLAINT (Q1). Produce customerSummary.'
        : 'This is an INTERNAL DEFECT (Q3). Set customerSummary to null.';

    return [
        `## ORIGIN\n${originNotice}`,
        '',
        gapNotice,
        '## CASE CONTEXT',
        '```json',
        JSON.stringify(context),
        '```',
        '',
        '## ENRICHMENT',
        '```json',
        JSON.stringify(enrichment),
        '```',
        '',
        '## INDEPENDENT DIAGNOSIS',
        'Reached from raw evidence only. The recorded 5-Why chain, root cause flag,',
        'corrective actions and FMEA link were withheld from this analysis.',
        independent.verdict.agrees
            ? `It AGREES with the recorded root cause (${independent.verdict.recordedCategory}).`
            : `It DISAGREES: it chose ${independent.verdict.aiCategory}, the record says ` +
              `${independent.verdict.recordedCategory}.`,
        '```json',
        JSON.stringify(independent.finding),
        '```',
        '',
        '## PRECEDENT CASES',
        'Closed cases scored as similar to this one, best match first. See rule 6.',
        '',
        renderPrecedents(precedents),
    ].join('\n');
}
