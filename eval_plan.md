# Feature Plan: LLM-as-a-Judge — pipeline-wide evaluation for 8D reports

> **First deliverable**: save this document to `plans/llm-as-judge-evaluation-plan.md` in the repo
> (matching the existing `plans/flexible-configuration-full-flow-plan.md` naming convention), so the
> design is versioned alongside the code it describes. Everything below is the content of that file.

## Context

The system has **no report-grading logic at all today**. The closest thing is `scripts/run-analyze.ts:156-183` — a hard-coded binary checklist (all 8 disciplines present, D6 `dataBacked=false`, sources present when dataBacked, 5-Why depth ≥ 2…), run by hand, producing no score. The only stored correctness signal is `Reports.aiAgreesWithRecord` — binary, root-cause only.

Consequence: every time a prompt, a model, or a retrieval setting changes, **nobody can tell whether the pipeline got better or worse**. That is the gap this feature closes.

Decisions already made with the user:
1. The judge runs in **both modes**: batch (regression harness) + online (each finished report is graded).
2. Grade **the pipeline as a whole**, not three isolated steps (changed from the earlier "D2/D4/D5 only" idea — per-step scores never answer "is this report any good?").
3. Results are **persisted in the DB and surfaced in a new Training Center tab**.
4. After a run finishes, an **advisor proposes which configuration to change** to raise the score — measurement alone is a vanity metric if nobody can act on it.

The feature therefore delivers a closed loop: **measure → diagnose → suggest → apply → re-measure**.

## Business analysis — two different questions, never mixed

Evaluating this pipeline is really two independent questions, and conflating them is the classic failure mode:

| | Question | Ground truth? | Measured by |
|---|---|---|---|
| **Correctness** | Did the AI reach the RIGHT conclusion? | Yes — the dataset records the root cause | Code — `compareWithRecorded` already does it |
| **Quality** | Is the report WELL WRITTEN: grounded, coherent, usable? | No | The judge |

`aiAgreesWithRecord` already answers question 1 and **needs no judge**. The judge exists only for question 2. If the judge is shown the recorded answer while grading quality, it silently degrades into an answer-matcher — paying money to redo what code already does for free.

### Three signal layers — reported separately, never merged

**Layer 1 — Compliance (pure code, zero cost, hand-recomputable).** The data already exists in the DB; it only needs aggregating:
- `Disciplines.validationJson` = `{violations, inputDiagnostics, repairs}` (written at `eightDAnalyzer.ts:850`) → constraint violations + how many things `postProcess` had to repair
- All 8 disciplines present and in `sequence` order; D6 really has `dataBacked=false`; any `dataBacked=true` discipline still has `sources` after filtering
- 5-Why depth, Ishikawa branches carrying a verdict, `ruledOut` count — read from `resultJson`
- `customerSummary` matches `origin` (present for Q1, null for Q3)

This is the **backbone**: fully trustworthy because no model is involved. Most of the logic already exists in `scripts/run-analyze.ts:156-183` as pass/fail — this promotes it to a scored card.

**Layer 2 — Quality (the judge, 6 dimensions).** Grades only what code cannot see.

**Layer 3 — Correctness (code, only where ground truth exists).** `aiAgreesWithRecord`; for batch runs over clean/dirty pairs, whether the conclusion on the dirty variant still matches the clean one (`dirtyData.test.ts:113` already asserts this invariant).

> **Hard rule**: the three layers surface as three separate numbers. Blending a trustworthy deterministic score with an LLM's opinion into a single number destroys exactly the information that matters — and breaks the system's "recompute by hand" contract.

## Judge design

### The 6 quality dimensions (rubric)

Derived directly from `GUIDE_SOURCE` in `srv/src/domain/eightd/prompts.ts` — each step's guide **is** the specification of what "good" means:

| Dimension | Question | Weight | Anchored in |
|---|---|---|---|
| `grounding` | Does every claim trace to a real fact or a cited precedent? Any invented names, measurements, or actions? | 3 | The reason the whole architecture exists (CaseContext, sources, blind diagnosis) |
| `causal-coherence` | Does the chain symptom → cause → action → verification hold together **across steps**? | 3 | D5 "name the step of the D4 chain it removes"; D8 "check D1 through D7" |
| `gap-honesty` | Where data is missing, does it say "not recorded" instead of filling in something plausible? | 2 | D2 "a box with no source says so; it does not get a plausible value" |
| `specificity` | Measured vs specification values with units, named equipment/batch/IDs — or vague prose? | 2 | D2 "measured value against specification, with units"; D4 "a VERDICT, not an investigation plan" |
| `method-discipline` | Does each step do its own job: containment ≠ corrective ≠ preventive; D4 never self-confirms the root cause; D6 never claims proof | 2 | The explicit boundaries in the D3/D5/D7 guides; D4 "You never confirm a root cause" |
| `actionability` | Could a quality engineer act on this immediately (owner, acceptance threshold, scope) or would they have to ask? | 1 | D6 "'back within the 0.50mm tolerance on 30 consecutive parts' is a plan, 'monitor the process' is not" |

The rubric lives as a **code constant** in v1 (`srv/src/domain/eval/rubrics.ts`) — the same way `DEFAULT_CRITERIA` started. `breakdownJson` stores `dimensionId`, so moving the rubric to a config table later will not invalidate history.

### Three calls, grouped by PHASE (not eight calls, one per step)

```
Phase Frame  (D1+D2)  ─┐
Phase Cause  (D3+D4)  ─┼─ each call SEES THE WHOLE REPORT but GRADES ONLY its own phase
Phase Close  (D5..D8) ─┘   → the 6 dimensions, scoped to that phase
```

Why phases instead of steps: full 8-step coverage in **three calls** (same cost as the earlier D2/D4/D5 plan, twice the coverage), and `causal-coherence` — which can only be observed across steps — becomes genuinely measurable. Each call receives the entire report as context, so the Close phase can see D4's conclusion when judging whether D5 actually removes that cause.

### Scoring and the evidence contract

- Each dimension gets a verdict ∈ `pass` (1.0) / `partial` (0.5) / `fail` (0.0) / `n/a` (drops out of the ceiling — e.g. `actionability` in the Frame phase).
- Phase score = Σ(verdict × weight) / Σ(applicable weights). Dimension score aggregates across phases → a **6 × 3 matrix**, so a weak spot is visible at a glance ("grounding is fine, actionability is weak in Close").
- **Every verdict MUST carry `evidence`** — a verbatim quote from the report or a `sources` path. A verdict without evidence is treated as `abstain` and excluded from the ceiling. This is the anti-fabrication guard applied to the judge itself.
- The judge may `abstain` when the input is insufficient; a phase with too many abstentions is flagged rather than scored.

### Bias controls (what makes the score trustworthy)

1. **Deterministic first, judge second**: the judge *receives* Layer 1 findings as context but never re-grades them. Its score covers only what code cannot check.
2. **The judge never sees the recorded answer** (the dataset's `rootCauseCategory`) while grading quality — otherwise it collapses into `aiAgreesWithRecord`.
3. **The judge never sees** the model's self-reported `confidence`, nor which model produced the text — removes anchoring.
4. **`temperature: 0`** + structured output + `callAndParse` retry — the same shape already proven by the blind diagnosis.
5. **Calibrate the judge against real human verdicts**: `ReviewEvents` + `reviewStatus`/`reviewNote` are engineers' actual judgments. Add a calibration report comparing judge verdicts against human ones (`Approved` ↔ high score, `ChangeRequested` ↔ low score). Low agreement means **the judge is not trustworthy yet, and the UI must say so**.
6. **Online mode ships disabled by default** until calibration numbers exist — showing an uncalibrated score to engineers invites misplaced trust.

## Architecture — one judge core, two callers

```
judgeReport(report, disciplines, caseContext, complianceFindings)
  → 3 calls (Frame / Cause / Close), activity `evaluateQuality`, temperature 0
  → { byPhase, byDimension, qualityScore, maxScore, abstainCount }
```

**Caller A — Online** (`eightDService.ts`, inside `runInBackground` after `saveResult`):
- Runs as a **separate, non-blocking phase**: if the judge fails, the report is still `Analyzed`. Grading must never be able to fail an analysis.
- Behind an `EVAL_ONLINE_ENABLED` flag in the global AI config, default OFF.
- Writes `EvalScores` with `run = null` and `report` set to the finished report.

**Caller B — Batch** (`runEvaluation` action on `AiAdminService`):
- Two modes:
  - `analyze` — **true regression**: read `Reports.sourcePayload` for the selected cases → call `analyze()` **in-process without persisting a new report** (exactly what `run-analyze.ts` already does) → grade → store only `EvalScores`. No extra `Reports` rows, no filesystem dependency, so it runs identically on CF/HANA.
  - `grade-only` — re-grade reports already in the DB (cheap; the way to build calibration data).
- Uses `cds.spawn` with a short transaction per case — the established pattern from `runInBackground` (`eightDService.ts:110-173`) — plus a sweep for runs stuck in `Running`.
- Case selection by `notificationId` prefix (`8D-1…` = clean, `8D-9…` = dirty) plus a `limit` parameter.

**New activity `evaluateQuality`** added to `shared/ai-activities/index.ts` (the registry shared by backend and frontend): `reviewQuality` currently carries three unrelated jobs (blind diagnosis, reranker, and now the judge). Splitting it out lets an admin route the judge's model and thinking budget independently.

## Config advisor — closing the loop from *measure* to *act*

An eval score that nobody can act on is a vanity metric. After a run completes, the advisor answers the next question: **which configuration knob should change, and to what value?**

This is an AI proposing changes to the AI's own configuration, so it needs the same discipline as the judge — and one extra guard, because a bad suggestion here degrades the pipeline permanently rather than just misreporting it.

### What is actually configurable (the lever inventory)

| Surface | Table / field | Typical failure it fixes |
|---|---|---|
| Step guide | `StepPrompts.combinedPrompt` | `gap-honesty`, `specificity`, `method-discipline` |
| Output contract | `StepPrompts.formSchemaJson` (constraints: `minLength`, `enum`, `minItems`) | `specificity`, structurally thin output |
| Guardrails | `StepPrompts.constraintsJson` (`sourcePattern`, `citationRequired`, `requiredDisclosure`, `dataBackedWhenInputPresent`) | `grounding`, missing disclosures |
| Retrieval reach | `RetrievalProfiles.minScore` / `topN` / `closedOnly` | `grounding` failing because no precedent cleared the threshold |
| Scoring weights | `ProfileCriteria.weight` / `matchType` / `minSimilarity` / `enabled` (incl. the new `rerank` criterion) | Wrong precedents retrieved → weak D3/D5/D7 proposals |
| Step→profile binding | `StepRetrievalBindings` | A step asking the wrong similarity question |
| Model routing | Global AI config: model + thinking budget per activity | High `repairCount`, incoherent reasoning |

### Two stages again — deterministic correlation first, LLM second

**Stage 1 — Correlation (pure code, zero cost).** Most eval symptoms map to a lever mechanically, and that mapping must not be guessed by a model:

- Which constraint rule IDs fired most across the run (already in `validationJson.violations`) → names the exact `constraintsJson` rule
- Whether `grounding` failures coincide with empty precedent results (`PrecedentResult.reason` says the threshold was not cleared) → points at `minScore` / criteria weights, not at the prompt
- Which steps drove `repairCount` (postProcess had to rebuild D4) → correlates with the model routed to `analyzeDefect`
- High `abstainCount` → the report was too thin to grade; an upstream problem, **not** a config problem — the advisor must say so rather than invent a knob

Output: ranked *candidate levers*, each already carrying its evidence. Fully explainable, no model involved.

**Stage 2 — Advisor (LLM, activity `evaluateQuality`, temperature 0).** Given the failing dimensions, the candidate levers, and the **current values** of those levers (actual prompt text, actual rule set, actual weights), propose concrete diffs — one call per targeted area, not one giant call.

### Suggestion shape — mechanical, not advisory prose

```ts
{
  targetType: 'stepPrompt' | 'constraint' | 'profileCriterion' | 'retrievalSetting' | 'modelRouting',
  targetKey,        // "D5" | "diagnosis/rerank" | "activity:analyzeDefect"
  field,            // "combinedPrompt" | "weight" | "minScore"
  currentValue,     // snapshot at suggestion time
  proposedValue,    // concrete and applicable — never "improve the wording"
  rationale,
  evidence,         // the eval scores / cases that justify it
  expectedEffect,   // which dimension should move, in which direction
  risk,             // what could get WORSE — mandatory, see below
  confidence
}
```

`proposedValue` must be directly usable. "Make D5 more specific" is rejected at parse time; "append this sentence to D5's `combinedPrompt`" or "`minScore`: 3 → 2.5" is accepted.

### Guards (this is where the loop can go wrong)

1. **`risk` is mandatory.** Every config change is a trade: loosening `minScore` surfaces more precedents *and* weaker ones. A suggestion without a stated downside is rejected as incomplete.
2. **Never suggest touching the hard rules.** `EIGHT_D_RULES` in `prompts.ts` (grounding, `sources`, "D6 always has no data", Q1-only customer fields) is deliberately not UI-configurable — it is the anti-fabrication core. The advisor is told these are off-limits and must not propose weakening them.
3. **"Rule too strict" vs "model failing the rule" must be distinguished explicitly.** A constraint firing often is usually evidence the model is misbehaving, *not* evidence the rule is wrong. The advisor must state which reading it believes and why — the default answer for a frequently-firing rule is to strengthen the prompt, not to relax the guardrail.
4. **Never auto-apply.** Suggestions are records with status `open | applied | dismissed`. v1 surfaces them as cards with the concrete value and a deep link into the existing editor (`discipline-section.tsx` for prompts, `ProfileConfigPanel.tsx` for criteria); one-click apply is a later step, not v1.
5. **Every suggestion is falsifiable.** It carries `basedOnRun`; after applying, the operator re-runs the eval and the UI shows the before/after per dimension. `EvalRuns.configSnapshot` exists precisely to make that comparison honest — two runs are only comparable when their snapshots differ in the intended way.

## Data model (`db/schema/eval.cds` — NEW)

```cds
entity EvalRuns : cuid, managed {
    label          : String(120);      // "Before the D4 prompt change"
    mode           : String(20);       // analyze | grade-only | online
    datasetFilter  : String(60);       // notificationId prefix; null = all
    status         : String(20);       // Running | Completed | Failed
    caseCount      : Integer;
    processedCount : Integer;          // drives the progress display
    /** Snapshot of what was graded, so comparing two runs compares like with like. */
    configSnapshot : LargeString;      // JSON {stepCode: configVersion} + judgeModel
    complianceScore: Decimal(5,2);     // layer 1
    qualityScore   : Decimal(5,2);     // layer 2
    agreementRate  : Decimal(5,2);     // layer 3
    tokensUsed     : Integer;
    durationMs     : Integer;
    errorMessage   : String(1000);
}

entity EvalScores : cuid, managed {
    run            : Association to EvalRuns;   // null for online grading
    report         : Association to Reports;    // null for batch-analyze (no report persisted)
    notificationId : String(30);
    phase          : String(10);       // frame | cause | close
    qualityScore   : Decimal(5,2);
    maxScore       : Decimal(5,2);
    /** [{dimensionId, verdict, points, maxPoints, evidence}] */
    breakdownJson  : LargeString;
    /** Layer 1 for this phase's scope — deliberately kept apart from the judge score. */
    violationCount : Integer;
    repairCount    : Integer;
    abstainCount   : Integer;
    judgeError     : String(500);
}

entity EvalSuggestions : cuid, managed {
    basedOnRun     : Association to EvalRuns;
    targetType     : String(30);       // stepPrompt | constraint | profileCriterion | retrievalSetting | modelRouting
    targetKey      : String(80);       // "D5" | "diagnosis/rerank" | "activity:analyzeDefect"
    field          : String(60);
    currentValue   : LargeString;      // snapshot at suggestion time — proves what it was reacting to
    proposedValue  : LargeString;
    rationale      : String(1000);
    evidenceJson   : LargeString;      // eval scores / cases behind it
    expectedEffect : String(200);      // which dimension should move, which way
    risk           : String(500);      // mandatory — what could get worse
    confidence     : Decimal(3,2);
    status         : String(20);       // open | applied | dismissed
    decidedBy      : String(120);
    decidedAt      : DateTime;
}
```

Exposed read-only on `AiAdminService` (except `EvalSuggestions.status`, which the UI updates when an operator applies or dismisses), following the `SuggestionAudit` projection shape — noting that `SuggestionAudit` itself is **declared but unused**, so it is a shape reference only, not a data source.

## Files to change

| File | Kind |
|---|---|
| `db/schema/eval.cds` | NEW — EvalRuns, EvalScores, EvalSuggestions |
| `srv/src/domain/eval/rubrics.ts` | NEW — 6 dimensions × 3 phases, weights, guide anchors |
| `srv/src/domain/eval/compliance.ts` | NEW — layer 1, **pure function** (promotes the `run-analyze.ts:156-183` checklist to a scorecard) |
| `srv/src/domain/eval/judge.ts` | NEW — build the 3 phase prompts, call the model, defensively normalize output |
| `srv/src/domain/eval/evalScoring.ts` | NEW — **pure**: verdict → points, dimension × phase rollup, abstain/`n-a` handling |
| `srv/src/domain/eval/leverCorrelation.ts` | NEW — advisor stage 1, **pure**: eval symptoms → ranked candidate levers with evidence |
| `srv/src/domain/eval/advisor.ts` | NEW — advisor stage 2: build prompt from levers + current config values, call model, validate suggestions (reject vague `proposedValue`, missing `risk`, or any attempt at the hard rules) |
| `srv/src/domain/eval/evalRepository.ts` | NEW — persist runs, scores and suggestions |
| `srv/src/domain/eval/runEvaluation.ts` | NEW — batch orchestration (`cds.spawn`, per-case transaction, sweep), advisor as the final phase |
| `srv/AiAdminService.cds` + `srv/src/services/aiAdminService.ts` | EvalRuns/EvalScores/EvalSuggestions projections + `runEvaluation` action + `decideSuggestion(id, status)` |
| `srv/src/services/eightDService.ts` | Online hook after `saveResult`, behind the flag, non-blocking |
| `shared/ai-activities/index.ts` | New `evaluateQuality` activity |
| `srv/src/domain/eightd/schemas.ts` | `BUDGET.judge` |
| `app/.../pages/evaluation/*` | NEW — run list, run detail (6×3 matrix), two-run comparison, suggestion cards (current → proposed, rationale, risk, deep link to the right editor, apply/dismiss) |
| `app/.../pages/workflow/index.tsx` | Fourth tab, "Evaluation" |
| `app/.../services/eval-service.ts` | NEW |
| `app/.../pages/eight-d/detail.tsx` (or a small panel) | Online score badge next to `release-check-panel` (only when online grading is on) |

## Implementation order

1. **Layer 1 first** (`compliance.ts` + tests) — pure, no AI, immediately useful, and it is the judge's context input.
2. `rubrics.ts` + `evalScoring.ts` + tests (points math, abstain, `n/a`, ceiling).
3. `judge.ts` + output-normalization tests (unknown dimension, missing evidence, invalid verdict).
4. Schema + repository + batch action — `grade-only` first (cheap, no pipeline run).
5. Batch `analyze` mode (run `analyze()` in-process from `sourcePayload`).
6. **Advisor stage 1** (`leverCorrelation.ts` + tests) — pure, no AI; already useful on its own ("these three constraint rules account for 80% of violations").
7. **Advisor stage 2** (`advisor.ts`) + suggestion validation and persistence.
8. Evaluation UI tab (run list → matrix → comparison → suggestion cards).
9. Online hook + flag (default OFF) + report-detail badge.
10. Calibration report: judge vs `ReviewEvents` — only enable online by default once those numbers exist.

## Verification

1. **Unit (jest, following `srv/src/domain/eightd/__tests__/` conventions)**: `compliance.ts` over the 12 clean/dirty pairs (the dirty variant must score lower — a relative invariant in the style of `dirtyData.test.ts:71-77`); points math (`partial` = half, `n/a` leaves the ceiling, abstain adds nothing); judge output normalization (unknown dimensions dropped, missing evidence ⇒ abstain).
2. **`grade-only` batch on real HANA**: grade the 25 seeded reports → `EvalRuns` shows three distinct numbers, `processedCount` advances, a stuck run is swept.
3. **`analyze` batch**: run with `limit: 3` on prefix `8D-1` → confirm **no new `Reports` rows are created**, only `EvalScores`.
4. **Bias guard test**: assert the judge prompt contains neither the dataset's recorded `rootCauseCategory` nor the model's self-reported `confidence` (a string assertion on the built prompt, in the spirit of `auditBlindEvidence`).
5. **Advisor tests**: `leverCorrelation` on a synthetic run where all violations come from one rule ID (must rank that rule first) and where `grounding` fails with empty precedents (must point at `minScore`, not at the prompt); suggestion validation rejects a vague `proposedValue`, a missing `risk`, and any suggestion targeting `EIGHT_D_RULES`.
6. **Loop test, end to end**: run eval → apply one suggestion through the normal editor → re-run eval → confirm the two `EvalRuns.configSnapshot` values differ only in the intended field and the comparison view shows the dimension moving.
7. **Calibration**: run `grade-only` over disciplines whose `reviewStatus` ≠ `Draft`, and surface the judge-vs-human agreement table in the Evaluation tab.
8. `npm run typecheck` + `npm test` clean; `cds deploy` succeeds with the new schema.

## Out of scope for this feature

Rubric editing in the UI (v1 keeps it as a code constant); grading a single D-step on demand; one-click apply that writes config directly (v1 deep-links into the existing editors instead); any auto-gate — a judge score must **never** block the human review workflow, and the advisor must **never** apply a change on its own.
