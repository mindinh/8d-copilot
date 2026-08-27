# AI Rules — 8D Steps (Normative, Final)

**Status:** Final for POC · **Supersedes:** the prose in `docs/AI Requirements - 8D Copilot POC.md` §2 where the two disagree
**Audience:** AI/backend engineers (implementation), BA/QA (acceptance)

The requirements doc says *what the AI should do*. This document says *what the code must enforce*, in a form that can be implemented literally and tested mechanically. Every rule has an ID. Every rule is either **HARD** (enforced in code, not configurable) or **TUNABLE** (lives in AI Settings, admin may change).

---

## R0 — Global invariants (HARD, apply to all eight steps)

| ID | Rule | Enforced where |
|---|---|---|
| **R0.1** | Every AI-asserted fact carries at least one entry in `sources[]`, and every entry resolves to a real path in `CaseContext` or `precedents#N.*`. Unresolvable path ⇒ the assertion is stripped in post-processing, not shown. | `postProcess.ts` |
| **R0.2** | The AI never writes a step status. `Complete` is only ever set by a human action. | Service layer; no AI-writable status field |
| **R0.3** | The AI never sets `isRootCause = Y` on any Ishikawa or 5-Why row. It may only *report* a row already tagged, or *propose* a candidate in a separate field that is not the confirmed value. | `postProcess.ts` |
| **R0.4** | The AI never transitions a report to `Closed`. | Service layer |
| **R0.5** | When a step has no qualifying data, the step must emit its declared **empty-state sentence** (see each step below) and set `dataBacked = false`. Producing plausible generic content instead is a defect, not a style choice. | `postProcess.ts` + per-step constraint rule |
| **R0.6** | `customerSummary` and every customer-facing field is produced **only** when `origin = 'Q1 - Customer Complaint'`. For Q3 it is `null`, never an empty string, never a placeholder. | `postProcess.ts` (Q1-ONLY-CUSTOMER-FIELDS) |
| **R0.7** | Every suggestion the AI *shows*, and every human *accept / reject / edit* on it, is written to `SuggestionAudit` with (who, what, when, stepCode, reportID, outcome). Showing is logged too — otherwise a rejected suggestion leaves no trace that it was ever offered. | Service layer |
| **R0.8** | Each generated discipline snapshots `resultJson`, `formSchemaJson`, `validationJson`, `configVersion`. Rendering a historical report never reads live configuration. | `eightDAnalyzer.ts` + `Disciplines` |
| **R0.9** | Configuration is a *fallback chain*, never a failure mode: step config disabled, blank, or invalid ⇒ fall back to the code default in `prompts.ts`. Analysis must always run. | `runtimeConfig.ts` |
| **R0.10** | R0.1–R0.8 are **not** reachable from AI Settings. A prompt or constraint edit may change tone, emphasis, ordering and field set; it may never remove a citation requirement, a human-in-the-loop gate, or the D8 gate. Post-processing re-checks them deterministically regardless of prompt text. | `postProcess.ts` |

---

## R1 — The similarity engine (one engine, reused by D1, D3, D4, D5, D8)

**R1.1 (HARD)** There is exactly one precedent-scoring function. D1's "which past cases are like this one" is the same question, computed the same way, as D4's and D8's. No step may define its own similarity metric.

**R1.2 (TUNABLE — AI Settings → Similarity)** Seeded defaults:

| Criterion | Weight | Condition |
|---|---|---|
| Work center match | **+4** | exact `workCenterId` |
| Defect code match | **+4** | exact `defectCode` |
| Defect-text keyword overlap | **+2** | only when defect code does **not** match — never both |
| Material match | **+3** | exact `materialId` |
| Same material family | **+1** | only when material does **not** match — `materialGroup` equality, never inferred from an ID prefix |
| Semantic (embedding) | **+3** | cosine ≥ **0.70**; **off by default** in the POC |

- Deterministic max = **11**; with semantic on = **14**.
- `minScore` = **3**, `topN` = **3**, `closedOnly` = **true**.

**R1.3 (HARD)** Below `minScore`, the step emits its empty-state sentence. It does not return the best-of-a-bad-lot.

**R1.4 (HARD)** Every surfaced precedent shows **case ID + score + what was done in that case**. A precedent without all three is not renderable.

**R1.5 (HARD)** Changing a weight in AI Settings changes the *next* retrieval for every consuming step at once. Steps do not cache scores across configuration versions.

---

## R2 — Per-step rules

Notation per step: **In** = inputs · **Out** = required output fields · **Empty** = the exact empty-state behaviour · **HITL** = human gate.

### D1 — Team

- **In:** `header.teamSize`, `team.leader`, `team.members`, precedent rosters (`precedents#N.team`, GD 15), BP master.
- **Out (both, not either/or):**
  1. `suggestedRoles[]` — functions the qualifying precedents needed, each with `citedCases[]`.
  2. `suggestedPeople[]` — individuals, each with `name`, `function`, `servedOnCount`, `citedCases[]`, **ranked by `servedOnCount` desc**, tie-broken by case score desc.
- **R2.1.1 (HARD)** A suggested person must resolve to `team.leader`, `team.members#N`, or `precedents#N.team#M`. No invented names — including no plausible-sounding role placeholders dressed as people.
- **R2.1.2 (HARD)** `selectionMethod` ∈ { `Current case team`, `Precedent recommendation`, `Hybrid`, `Roles only - assignment required` } — exactly one.
- **R2.1.3 (HARD)** A required role with no grounded person is emitted as `name = "Unassigned"`, `sourceType = "unassigned"` — not omitted, and not filled with a guess.
- **Empty:** no precedent clears `minScore` ⇒ *"No team suggestion available; assign manually."* `dataBacked = false`.
- **HITL:** one **Accept all suggested** action (first accepted person → `8D Team Leader`, rest → `8D Team Member`) plus per-row remove. The AI never assigns. Accepting writes the roster; it does not mark D1 Complete.
- **Rule-based, not AI:** email/telephone auto-fill from the Partner record once a person is accepted.

### D2 — Problem description

Three renderings of **one** fact set — not three independently generated texts.

- **In:** `header` (incl. `foundDate`, `quantityExtent`), `product`, `inspections`, and **GD 17 historical inspection lots** for `materialId` + characteristic.
- **Out:**
  1. `statement` — the narrative paragraph.
  2. `fiveW2H` — `{ what, where, when, who, how, howMany }`, six discrete fields.
  3. `isIsNot` — `{ is, isNot, citedLotIds[], applicable }`.
- **R2.2.1 (HARD)** The 5W2H grid is **derived from the same resolved fields** as the paragraph. It is read-only in the UI and can never disagree with the paragraph. Implement as one field resolution, two renderings — not two generations.
- **R2.2.2 (HARD)** A 5W2H box with no source field shows the literal gap text (e.g. `Who` → *"Not tracked for Q3 cases"*). Never a plausible substitute.
- **R2.2.3 (HARD — Is/Is-Not is computed, not generated):** group the GD 17 lots for this Material + Characteristic by `equipment`, compute nonconforming rate per group, return the sharpest-contrast group as **IS** and the cleanest comparable group as **IS NOT**, citing **every** lot ID used on both sides. This is deterministic arithmetic. An LLM may only rephrase the sentence around numbers it did not choose.
- **R2.2.4 (HARD)** `applicable = false` and the pair is suppressed when: there is no measurable characteristic; fewer than 2 equipment groups; or the nonconforming-rate contrast between best and worst group is below the configured minimum. Output *"Not applicable — no measurable characteristic"* or *"No clear contrast in the available lots."*
- **Empty:** missing inspection data ⇒ the paragraph still renders from header/product facts, with gaps listed in `problem.gaps`.
- **HITL:** paragraph and Is/Is-Not are editable drafts; the grid is read-only. D2 cannot be marked Complete without an explicit approve.

### D3 — Interim containment

- **In:** `actions.containment` for this notification; precedent containment actions.
- **R2.3.1 (HARD — recorded first)** If a containment action already exists on this case, surface it as **recorded**. Only when none exists may a precedent action be offered, and it must be labelled **proposal**, with `precedents#N` cited.
- **R2.3.2 (HARD)** `recorded` vs `proposal` is a structural field, not a wording difference. The UI must be able to style them differently without parsing text.
- **Out:** 1–2 actions, each `{ action, owner, status, protection, origin: recorded|proposal, sources[] }`.
- **Empty:** no recorded action and no precedent ≥ `minScore` ⇒ *"No containment action recorded and no precedent available — define one manually."*
- **HITL:** select / edit / write own.

### D4 — Root cause

- **In:** this case's `fiveWhy`, `ishikawa`; precedent causes; optionally GD 16 SPC as supporting evidence (**not** in the score).
- **R2.4.1 (HARD — two-part, in order):**
  1. **Primary:** the 5-Why step tagged `(root cause)`. If untagged, the Ishikawa row with `Is Root Cause? = Y`.
  2. **Supporting:** top precedent from R1, shown in a separate *similar cases* panel.
- **R2.4.2 (HARD)** Precedent root causes are rendered as **hypotheses**, never as this case's root cause. They may not populate `rootCause.conclusion`.
- **R2.4.3 (HARD)** `independentVerification` must state one of: agrees / disagrees / insufficient evidence — with a rationale. The blind diagnosis is computed before the recorded answer is visible to the model (`blindEvidence.ts`); that ordering is not configurable.
- **Out:** `conclusion`, `fiveWhyTable[]`, `contributingFactors[]`, `independentVerification{}`, `evidenceGaps[]`, `precedentMatch { caseId, score, whatWasDone }`.
- **Empty:** no tagged root cause and no precedent ≥ `minScore` ⇒ *"No strong precedent; root cause not established from available evidence."*
- **HITL:** engineer confirms. R0.3 applies — the AI never sets the confirmed flag.

### D5 — Permanent corrective action

- **In:** `actions.corrective`; the confirmed D4 root cause; precedent corrective actions.
- **R2.5.1 (HARD)** Same recorded-first / proposal-second rule as D3 (R2.3.1, R2.3.2).
- **R2.5.2 (HARD)** Every corrective action links to a specific step of the causal chain (`fiveWhy#N` or `rootCause`). An action that addresses nothing traceable is flagged, not silently accepted.
- **Empty:** *"No corrective action recorded and no precedent available."*
- **HITL:** suggestion only.

### D6 — Implement & verify

- **R2.6.1 (HARD — no drafting)** D6 performs **no generation**. It is a deterministic read of all `actions.*` rows with their status. If a model is invoked for D6, that is a bug.
- **Out:** checklist rows `{ actionText, actionType, status, sourcePath }`.
- **R2.6.2 (HARD)** The dataset carries no verification evidence, so no action may be described as *proven effective*. `dataBacked = false` for D6 always.
- **HITL:** status is set manually (`Not Started` / `In Process` / `Complete`).

### D7 — Preventive action

- **In:** `actions.preventive`; `fmea` (GD 9) by notification ID.
- **R2.7.1 (HARD)** Same recorded-first / proposal-second rule as D3/D5.
- **R2.7.2 (HARD)** FMEA is a **cross-reference flag**, not a claim: emit `{ fmeaId, description, status: 'link-found' | 'no-link' }`. The AI never asserts an FMEA was updated.
- **Empty:** *"No preventive action recorded and no precedent available."* / *"No FMEA entry linked to this notification."*

### D8 — Closure (three parts — gate, draft, search)

**Part (a) — completeness gate (HARD, computed, never AI-asserted)**

- **R2.8.1** Closure is blocked unless **D1–D7 each carry a human-set status of `Complete`**. This requires a real per-discipline status field; a gate over AI output alone is not a gate.
- **R2.8.2** The gate result is computed by the service and written into the result. If the model emits a gate verdict, post-processing overwrites it.
- **R2.8.3** Even with the gate passed, the case closes only on an explicit human close action (R0.4).

**Part (b) — Lessons Learned draft**

- **R2.8.4** Draft from this case's own GD 11 (`lessonsLearned.whatWorked` / `whatDidnt`) when present.
- **R2.8.5** When GD 11 is empty, synthesise from confirmed D4 root cause + D3/D5/D7 actions + D6 statuses — **every sentence still traceable to a source field**. The engineer never faces a blank box, and never faces an invented one.
- **Out:** `summary` with `whatWorked` / `whatDidnt`, editable, with `sources[]`.

**Part (c) — searched suggestions**

- **R2.8.6** Run R1 over closed cases; for each ≥ `minScore`, surface its GD 11 rows with case ID + score.
- **R2.8.7** Precedent clears the threshold but has **no** GD 11 rows ⇒ *"Precedent found, no lessons recorded."* Nothing clears ⇒ *"No precedent lessons available."* These are two different messages and must not be collapsed into one.
- **R2.8.8 — recurrence scan:** run R1 **in reverse** against *open* GD 5 notifications; flag matches ≥ `minScore`.
- **R2.8.9 (HARD)** The recurrence flag is **informational only**. The AI never writes into another case. Out of scope for the POC, and out of scope for configuration.
- **R2.8.10** Also flag the GD 9 FMEA entry that should be confirmed as updated per D7.
- **HITL:** accept / edit / reject per suggested lesson, plus **Accept all suggested** (same pattern as D1).

---

## R3 — AI Settings configuration contract

**R3.1 (HARD)** All eight steps expose the same four editors: **Data Schema**, **Prompt Guide** (≤ 80 lines), **Form Mapping**, **Constraints** — plus the shared **Similarity** tab. There is no tier of "enriched" and "basic" steps. D5–D8 are configured exactly like D1–D4.

**R3.2 — validation on save (HARD).** Reject at save time, identically in the browser and in the CAP service:
- duplicate output paths in Form Mapping;
- Form Mapping fields absent from Data Schema, or vice versa;
- unknown group ids, unsupported field types, unsupported constraint rule types;
- a constraint rule that attempts to disable an R0 invariant.

Blank JSON is **unconfigured**, not invalid (R0.9).

**R3.3 — D8 minimum surface.** Data Schema toggles for: own GD 11 · confirmed D4 root cause · D3/D5/D7 actions · D6 statuses · precedent GD 11 rows · GD 9 FMEA link · open-case recurrence scan. Form Mapping paths for: gate result · draft summary · precedent-lessons list · recurrence flags. Constraints: the R2.8.7 empty-state strings and the R2.8.2 computed-gate rule.

**R3.4 — auditability.** Configuration changes log (who, what, when) to the same trail as R0.7. `previewStepConfiguration(stepCode, payload)` must accept **D1–D8**, and must never surface AI credentials.

---

## R4 — Acceptance matrix

| # | Rule(s) | Test |
|---|---|---|
| 1 | R2.2.1 | 8D-10048291 → D2 paragraph, every fact traceable to its row |
| 2 | R1.2 | 8D-10048291 vs 8D-10047950 = **7/11** (WC +4, MAT +3, defect +0); recompute by hand |
| 3 | R1.3, R2.4 empty | 8D-10048150 → "no strong precedent", no fabricated root cause |
| 4 | R0.6 | 8D-2612 (Q1) runs D2/D4 with GD 14 present, Q3 flow unaffected |
| 5 | R2.8.1 | Closure blocked with any of D1–D7 not Complete; allowed once all seven are |
| 6 | R2.1 | 8D-10048291 → roles Production/Quality Engineer, Warehouse Clerk, Production Worker + 4 people, cited to 8D-10047950 (7/11) |
| 7 | R2.1 empty | 8D-10048150 → "No team suggestion available" |
| 8 | R2.2.3 | 8D-10048291 → IS `EQ-PRESS12-004` (3/4, 75%), IS NOT `EQ-PRESS12-009` (0/3, 0%), all 7 lot IDs cited |
| 9 | R2.2.3 | 8D-2612 → Fixture #2/LH vs Fixture #1/RH, computed independently |
| 10 | R2.2.4 | 8D-10048150 → "not applicable", no fabricated comparison |
| 11 | R2.8.4, R2.8.6 | 8D-10048291 → own-GD-11 summary + precedent panel citing 8D-10047950 (7/11) |
| 12 | R2.8.7 | 8D-10048150 → summary drafted, panel shows "no precedent lessons available" |
| 13 | R3.1, R0.9 | Adding *"Always check equipment calibration date."* to D4 changes the next output; disabling falls back to default. **Repeat for D5, D6, D7, D8.** |
| 14 | R1.5 | Work-center weight 4 → 5 changes scores next retrieval; restoring returns tests 2 and 6 |
| 15 | R0.8 | After a Form Mapping change, an old report renders with its saved layout; the next uses the new one |
| 16 | R0.10 | No prompt/constraint edit lets the AI mark Complete, set `isRootCause = Y`, or close a case |
| 17 | R0.7 | Every shown/accepted/rejected suggestion appears in `SuggestionAudit` and is visible in the UI |
| 18 | R2.6.1 | D6 produces its checklist with **zero** model calls |

---

## R5 — Explicitly out of scope

Live SAP OData/RFC · authentication and RBAC (incl. on AI Settings) · multi-language · production observability · writing into other cases from the D8 recurrence scan.
