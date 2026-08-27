# 8D Copilot — Refactor & Implementation Plan

**Baseline:** `main` @ `c83f3bd` plus the uncommitted worklist work
**Measured against:** [`docs/AI-RULES-8D-STEPS.md`](AI-RULES-8D-STEPS.md)

---

## 0. Executive summary

The pipeline, the similarity engine, the schema-driven discipline renderer and the per-step configuration editors are real and working. What is missing is not AI capability — it is **the human half of the loop** and **four of the eight steps**.

Three structural gaps outrank everything else:

| # | Gap | Consequence |
|---|---|---|
| **G1** | `Disciplines` has **no status field**, and there is no approve/accept action anywhere | The D8 completeness gate (R2.8.1) is *unimplementable as specified*. "Every suggestion is a draft, not a decision" is currently enforced only by the AI not having a button — not by design. Acceptance test 5 cannot pass. |
| **G2** | `D1–D4` is hard-coded in **six places** as the set of configurable steps | Half the requirement's configurability surface does not exist. Acceptance test 13 fails for D5–D8. |
| **G3** | `SuggestionAudit` exists in the schema and is **never written and never read** | The audit-trail requirement (R0.7) is declared, not delivered. |

Everything else — worklist columns, detail-page layout, Is/Is-Not computation, D8's three parts — is downstream of these.

---

## 1. Gap analysis

### 1.1 Configurability is gated to D1–D4 (G2)

Six hard-codings, all of which must move to one shared constant:

| File | Line | Code |
|---|---|---|
| [aiAdminService.ts](../srv/src/services/aiAdminService.ts:372) | 372 | `if (!/^D[1-4]$/.test(stepCode)) return req.reject(400, …)` — blocks `previewStepConfiguration` |
| [aiAdminService.ts](../srv/src/services/aiAdminService.ts:400) | 400 | `if (/^D[1-4]$/.test(stepCode))` — save-time validation silently skipped for D5–D8 |
| [eightDAnalyzer.ts](../srv/src/domain/eightd/eightDAnalyzer.ts:216) | 216 | `const configurableCodes = ['D1','D2','D3','D4']` |
| [eightDAnalyzer.ts](../srv/src/domain/eightd/eightDAnalyzer.ts:475) | 475 | the same four codes again, for the constraint recheck |
| [configRepository.ts](../srv/src/domain/eightd/precedent/configRepository.ts:203) | 203 | seeding filtered to the same four |
| [step-prompts-tab.tsx](../app/cnma_proresolve_ui/src/pages/ai-settings/step-prompts-tab.tsx:20) + [step-prompts-landing.tsx](../app/cnma_proresolve_ui/src/pages/ai-settings/step-prompts-landing.tsx:23) | — | `ENRICHED_STEPS = ['D1','D2','D3','D4']` duplicated in two components |

And the root cause of all six: [`defaults.ts:310–313`](../srv/src/domain/eightd/precedent/defaults.ts:310) — D5–D8 carry only a `systemPrompt`, with no `inputSchemaJson` / `formSchemaJson` / `constraintsJson`, so `STRUCTURED_CONFIG_OVERRIDES` has nothing for them.

> Note the honest comment already in `step-prompts-landing.tsx`: D5–D8 still *consume* precedents, so blocking the whole page would leave the thing that decides what they see unconfigurable. That instinct was right — the fix is to give them the other four tabs, not to keep the workaround.

### 1.2 No step status, no accept/reject (G1)

- [`db/schema/eight-d.cds`](../db/schema/eight-d.cds) `Disciplines` has `dataBacked`, `confidence`, `aiGenerated` — but no `status`, no `approvedBy`, no `approvedAt`.
- `grep` for `markComplete|approve|accepted` across `srv/src/domain`, `srv/src/services`, `db/schema` returns **only a comment**.
- Consequence: D8's gate can only check that AI output exists — which is not what R2.8.1 asks for.
- The D1 "Accept all suggested" button and the D8 per-lesson accept/reject have no backend to call.

### 1.3 Is/Is-Not is read, not computed

[`types.ts:118`](../srv/src/domain/eightd/types.ts:118) declares `isIsNot: { is, isNot, notes } | null`, and [`caseMapper.ts:370`](../srv/src/domain/eightd/caseMapper.ts:370) reads it straight out of the dataset. The requirement (R2.2.3) is that the AI **computes** it by grouping GD 17 lots by equipment and comparing nonconforming rates. There is no `historicalInspectionLots` anywhere in `CaseContext`, so acceptance tests 8–10 cannot run.

### 1.4 D8 is a summary step, not a search step

No open-case recurrence scan exists. No precedent-GD-11 retrieval exists. `findPrecedents` returns precedents but D8 does not consume their lessons. D8's `combinedPrompt` is a one-line guide.

### 1.5 Stale contract documentation

[`srv/EightDService.cds`](../srv/EightDService.cds) documents `analyzeFromJson` as *"Chạy ĐỒNG BỘ — action chỉ trả về khi AI xong, khoảng 20-40 giây. Client phải nới timeout"*. It does not: [`eightDService.ts:75`](../srv/src/services/eightDService.ts:75) runs it through `cds.spawn` and returns immediately, which is why the detail page polls. Anyone sizing a client timeout from that comment will size it wrong.

### 1.6 Worklist page

| Issue | Detail |
|---|---|
| `sapStatus` is fetched, never rendered | in `LIST_COLUMNS`, no `<TableCell>` for it |
| `batchId` is in the `WorklistItem` type but **not** in `LIST_COLUMNS` | dead field on the type |
| **Source (SAP)** column is redundant | `sourceSystem` is derivable 1:1 from `origin` — the Q1/Q3 badge two columns left already says it. It costs `w-44` of a table that scrolls horizontally |
| No **Age** column | the one number a worklist exists to show — "how long has this been sitting" — is absent. `foundDate` and `syncedAt` are both there; neither answers it |
| No **Status** column | `New` vs `EightDCreated` is only inferrable from which button rendered |
| No search / filter / sort | a POC with 3 rows survives this; a demo with 15 does not |
| Only one entry path | **Sync from SAP** exists; there is no way to raise a defect by hand. The paste-JSON `analyze-dialog` lives on the *8D Reports* page instead, which is the wrong surface — it creates a report with no worklist row, so the two lists disagree |

### 1.7 Detail page

- Ordering fights itself: `PrecedentPanel` → `ReasoningPanel` → case facts → summaries → the eight disciplines. The comments argue for it ("precedent arrives in 2s, report takes a minute") — but the result is that the **8D report itself is the fourth thing on the page**, below two AI-explanation panels.
- No per-step status, approve, or accept/reject controls (G1).
- No D8 gate UI — nothing shows *why* a case cannot close.
- 5W2H grid and Is/Is-Not have no dedicated rendering; they land in whatever the D2 form schema happens to declare.
- No print/export of the 8D report. An 8D is a document that leaves the building; there is no way to get it out.
- `Source JSON` is a top-level primary-row button — a debug affordance in the position of a business action.
- `Re-analyze` has no confirmation and silently discards the previous disciplines.

---

## 2. Decisions taken

| # | Question | Decision |
|---|---|---|
| 1 | HITL foundation first, or D5–D8 configurability first? | **Both, merged** — per-step vertical slices, each delivering status + approve + the four config editors for one step |
| 2 | Step status model | **2 stored states** (`Draft`, `Complete`) + **"In review" derived** from `SuggestionAudit` |
| 3 | Worklist columns | **Triage table, 10 columns** — drop standalone *Source (SAP)*, add **Age** and **Status**, keep Work center |
| 4 | Manual defect creation | **`createWorklistItem(fields)`** — server-side payload builder, shared ingestion path |
| 5 | Paste-JSON path | **Moves onto the worklist** as an *Advanced* tab of the New defect dialog |
| 6 | Is/Is-Not | **Deterministic pick, LLM phrasing only** — numbers verified unchanged in post-processing |
| 7 | Detail page layout | **Report-first**, AI panels in a collapsible sidebar beside the disciplines |

---

## 3. Plan

Six workstreams. **A** is a prelude everything else needs; **B** is the repeated per-step slice; **C**, **D** are independent of both and of each other.

### A — Plumbing prelude (once) — ✅ **DONE**

Verified end-to-end against case 8D-10048577 on 2026-08-26. Backend typecheck clean, frontend typecheck clean, 495 tests passing (12 new). One pre-existing unrelated test failure (`sourceFields.test.ts:157`, a Vietnamese assertion stale since `ee3d182`) is tracked separately.

Two behaviours settled during implementation and documented in code rather than left implicit:
- **Re-analysis clears approvals.** `saveResult` deletes and re-inserts disciplines, so `stepStatus` resets to `Draft`. Deliberate: an approval signs the specific content the person read, and carrying it onto a freshly rewritten draft attributes an endorsement they never gave. `SuggestionAudit` history survives.
- **Reopening clears `approvedBy` / `approvedAt`**, for the same reason.

Two places where a capability check beat a code list (both self-adjust as B slices land, so nobody has to remember to update a list): `configRepository` now asks *"does this default carry a form schema?"*, and the UI asks `hasStructuredConfig(prompt)`.

A.5 turned out to be mostly already-built: `normalizeStepConfig` already implements every R3.2 check (duplicate paths `:159`, schema/form mismatch `:183`, type mismatch `:187`, unknown group fields `:194`, unsupported rules `:205`). Lifting the D1–D4 gate was the whole server-side fix. The real gap was the browser letting you save what the server would reject — closed with a new `validateStepConfiguration` action that runs *the same* `normalizeStepConfig`, called debounced from the editor. Parity by construction, not by a second copy of the rules that would drift.



Everything here is shared by all eight steps. Doing it once up front is what makes B repeatable.

1. **Schema** — `db/schema/eight-d.cds`, `Disciplines` (additive only; local sqlite heals without a reset):

   ```
   stepStatus  : String(20) default 'Draft';   // Draft | Complete — only two stored
   approvedBy  : String(120);
   approvedAt  : DateTime;
   ```

   `stepStatus` is never written by the AI (R0.2). **"In review" is not stored** — it is derived at read time: any `SuggestionAudit` row for this step with outcome `accepted` or `edited`, while `stepStatus = 'Draft'`.

2. **Service actions** on `EightDService`:
   - `setDisciplineStatus(disciplineID, status)` — the only writer of `stepStatus`.
   - `recordSuggestionOutcome(reportID, stepCode, suggestionKey, outcome, payload)` — writes `SuggestionAudit`; `outcome ∈ shown | accepted | rejected | edited`. This is also the source of the derived "In review" state, so it earns its keep twice (R0.7).
   - `closeReport(reportID)` — computes the D1–D7 gate server-side, rejects with the list of incomplete steps, sets `status = Closed`.
   - `getDisciplineActivity(reportID)` — audit rows plus derived per-step state, one call for the whole report.

3. **Audit on show** — `saveResult` in `eightDService.ts` writes one `shown` row per emitted suggestion, so a rejected suggestion still leaves a trace.

4. **One configurable-steps constant.** Export `CONFIGURABLE_STEP_CODES` from `srv/src/domain/eightd/types.ts` (beside `DISCIPLINE_CODES`), set to all eight, and replace every hard-coded list and `/^D[1-4]$/` regex: [aiAdminService.ts:372](../srv/src/services/aiAdminService.ts:372), [:400](../srv/src/services/aiAdminService.ts:400), [eightDAnalyzer.ts:216](../srv/src/domain/eightd/eightDAnalyzer.ts:216), [:475](../srv/src/domain/eightd/eightDAnalyzer.ts:475), [configRepository.ts:203](../srv/src/domain/eightd/precedent/configRepository.ts:203), and the two duplicated `ENRICHED_STEPS` copies in the UI — which should import one shared frontend constant rather than each declaring its own.

5. **Validation parity** — lift the D1–D4-only save validation to all steps, and add the R3.2 checks (duplicate output paths, Data-Schema/Form-Mapping mismatch) in **both** the CAP handler and `step-prompt-editor/json.ts`, so browser and server reject identically.

6. **Shared per-step UI shell** — status pill (Draft / In review / Complete), `Mark complete` / `Reopen`, and an accept/edit/reject control any suggestion list can drop in. Built once in `schema-discipline-card.tsx`; every slice in B reuses it.

*Unblocks acceptance tests 5, 16, 17.*

### B — Per-step vertical slices (×8, repeatable) — 🟡 **IN PROGRESS**

**Done:** structured configuration authored for **D5, D6, D7, D8** — all eight steps now carry `combinedPrompt` + `inputSchemaJson` + `formSchemaJson` + `constraintsJson` and pass the same structural contract test D1–D4 did (`runtimeConfig.test.ts` now loops all eight, not four).

**D6 went further than planned.** The slice as written said "no prompt guide is authored". That is weaker than R2.6.1, which says *no D6 content is model-generated* — and the first implementation only computed D6's structured `data`, leaving its narrative to the model. Since constraints only inspect `data`, that left the single most dangerous sentence in the whole report ("the corrective action was confirmed effective") free to appear in prose that nothing checks. `d6Verification.ts` now computes the checklist, the summary, the markdown body, the action items and the sources; the model's D6 output is **discarded rather than trusted**.

That rework also surfaced a real ordering bug: the computation originally ran inside `generateReport`, but `postProcess` back-fills disciplines the model omitted with a "Not generated" placeholder — so whenever the model forgot D6, the placeholder overwrote the computed step and D6 came out empty. It now runs *after* `postProcess`, and creates the discipline when absent. Both cases are pinned by tests.

**Remaining:** the D8 slice cannot finish until **C** lands (`precedentLessons`, `precedentStatus` and `recurrence.*` have schema and constraints, but nothing computes them yet), and D1–D4 still need their HITL wiring — per-suggestion accept/reject and D1's *Accept all suggested*.

**Caveat on verification.** This environment runs `MOCK_LLM=true` with no AI Core credentials, so the D5/D7/D8 prompts and constraints are verified as *configuration* (seeded, normalized, validated, rendered) but their **output quality is unverified** — the mock returns no disciplines at all. D6 is the exception: being computed, it is fully verified end-to-end and in fact produced correct output from a run where the model contributed nothing.



Each slice delivers one step, both halves at once: **HITL controls wired** and **structured configuration authored**. Definition of done per step:

- structured defaults in `defaults.ts` matching the `STRUCTURED_CONFIG_OVERRIDES` shape D1–D4 already use — `combinedPrompt`, `inputSchemaJson` via `outputDataSchemaFromForm(...)`, `formSchemaJson`, `constraintsJson`;
- all four editor tabs live for the step, plus Similarity;
- the step's empty-state string from R2 enforced as a constraint rule;
- status and approve wired; accept/reject wired where the step suggests;
- its acceptance-matrix rows pass.

Suggested order — **D5, D7, D6, D8**, then revisit **D1–D4** for HITL wiring only, since their config already exists:

| Slice | Notes specific to it |
|---|---|
| **D5** | `origin: recorded \| proposal` as a structural field, plus `linkedCauseStep` (R2.5.2); constraint `D5_SOURCES` scoped to corrective actions, root cause, 5-Why and precedents |
| **D7** | preventive actions plus `fmeaLink { fmeaId, description, status }`; constraint forbidding any "FMEA updated" assertion (R2.7.2) |
| **D6** | checklist form schema only. **No prompt guide is authored — D6 must make zero model calls** (R2.6.1). Its Prompt Guide tab is *disabled with that reason shown*, not silently hidden |
| **D8** | largest slice; depends on C. Four-part form schema (`gate`, `summary`, `precedentLessons[]`, `recurrenceFlags[]`), the two distinct empty-state strings (R2.8.7), the computed-gate override (R2.8.2), and *Accept all suggested* |
| **D1–D4** | config already exists; these slices are HITL wiring only — plus D1's *Accept all suggested* and D2's new rendering from C |

*Unblocks acceptance test 13 for every step, and 15.*

### C — AI logic gaps (feeds the D2 and D8 slices) — ✅ **DONE**

**Done:** GD 17 in `CaseContext` and `blindEvidence` · deterministic `isIsNot.ts` · `d8Closure.ts` (`extractLessons`, `findPrecedentLessons`, `scanRecurrence`). 534 tests passing.

Acceptance criteria **8** and **10** now reproduce exactly from arithmetic — IS = 3/4 (75%), IS NOT = 0/3 (0%), all seven lot IDs cited; visual defect with no measurable characteristic returns *not applicable* rather than a fabricated pair.

Three decisions worth recording:
- **Not-applicable returns `null`, not `''`.** The existing `dirtyData.test.ts` caught the first version: an empty string is a blank placeholder that a renderer will print as a real but meaningless IS box. Every text field in `CaseContext` is now either `null` or has content, with nothing in between.
- **A dataset-supplied `is_is_not` row still wins, but the computed value is the default** — and the difference shows in the output: the override carries *no* `citedLotIds`, so a reader cannot recount it. That asymmetry is the argument for the computed path.
- **`scanRecurrence` recomputes `maxScore` the same way `findPrecedents` does**, so `7/11` means the same thing in the recurrence panel as in the precedent panel on the same page.

**C.3 — 5W2H projection, done.** `fiveW2H.ts` resolves the six boxes once and writes them into D2 after post-processing; the model keeps only `problem.statement`. R2.2.1 now holds by construction: paragraph and grid cannot disagree because there is one source. The D2 form schema gained the missing **How** box and an `isIsNotStatus` field, and the six grid fields were made *not required* — forcing the model to fill values that get overwritten only buys a wasted repair round-trip.

**The D8 slice is now complete too** — `applyD8Search` writes `precedentLessons`, `precedentStatus` and `recurrence.*` from real retrieval, leaving `summary.*` to the model (drafting is genuine authorship; a search result is not). `gate.*` is deliberately *not* written at generation time: it depends on human-set `stepStatus`, which changes after the report exists, so it is computed at read time.

Verified end-to-end with the mock model contributing nothing:

```
D2  what   Flange edge burr above limit (DEF-0489) — measured 0.32mm against spec
    who    Not tracked — Q3 internal defects have no reporter field in this dataset.
    IS     EQ-MILL07-002 — 3/4 lots nonconforming (75%)
    IS NOT EQ-MILL07-005 — 0/3 lots nonconforming (0%)
D8  precedentStatus  Lessons found (6)
    fmeaToConfirm    FMEA-MILL07-03 (Deburring tool wear) — confirm it was updated per D7.
```

And on a case with no GD 17 lots, both honesty paths hold: `isIsNotStatus` carries *"Not applicable — no historical inspection lots recorded for Porosity area ratio"* instead of two blank boxes, and D8 reports *"No precedent lessons available"*.



1. **GD 17 into the context.** Add `historicalInspectionLots: InspectionLotRow[]` to `CaseContext`; map it in `caseMapper.ts`; include it in `blindEvidence.ts` — the lot population contains no recorded answer, so the blind diagnosis should see it.

2. **`srv/src/domain/eightd/isIsNot.ts`** — pure and deterministic:

   ```
   computeIsIsNot(lots, materialId, characteristic, minContrast)
     → { applicable, is, isNot, citedLotIds[], reason }
   ```

   Group by `equipment`; rate = nonconforming / total; **IS** = highest, **IS NOT** = lowest comparable; `applicable = false` when fewer than 2 groups or the contrast is below `minContrast` (TUNABLE). The model may only phrase the sentence around these numbers, and post-processing verifies they came back unchanged. [`caseMapper.ts:370`](../srv/src/domain/eightd/caseMapper.ts:370) keeps a dataset-supplied `isIsNot` as an override; the computed value becomes the default.

3. **5W2H as a projection.** Resolve the six fields once in the mapper and pass the *same* resolved object to both the paragraph prompt and the grid, so R2.2.1 holds by construction rather than by instruction. Unresolved fields carry an explicit gap string (R2.2.2).

4. **`srv/src/domain/eightd/d8Closure.ts`**:
   - `findPrecedentLessons(context)` — reuse `findPrecedents`, pull each qualifying case's GD 11; **distinguish *no precedent* from *precedent with no lessons*** (R2.8.7);
   - `scanRecurrence(context)` — the same scorer run against **open** notifications; returns flags only, never writes (R2.8.9);
   - `computeClosureGate(reportID)` — reads `stepStatus` from A.

*Unblocks acceptance tests 8, 9, 10, 11, 12, 18.*

### D — Worklist (fully independent — can start day one)

**Final columns:** Notification · Origin *(badge, SAP app name as sub-line)* · Symptom + defect · Material · Work center · Found · **Age** · Quantity · **Status** · Action.

- **Age** — days since `foundDate`; amber > 3d, red > 7d. The prioritisation signal the table currently lacks entirely.
- **Status** — `New` / `8D open` badge, with `sapStatus` as a sub-line. `sapStatus` is fetched today and thrown away.
- **Drop** the standalone *Source (SAP)* column — 1:1 derivable from Origin, and it costs `w-44` on a table that scrolls.
- **Add `batchId`** to `LIST_COLUMNS` — it is on the `WorklistItem` type today but never fetched.
- **Work center stays** — it is the heaviest similarity criterion (+4), so it is the column an engineer scans for repeats.

**Two entry paths, both landing in this list:**

- **Sync from SAP** (existing) — bulk, idempotent.
- **New defect** (new) — split-button opening a dialog with two tabs:
  - *Form* — typed fields → **`createWorklistItem(fields)`**, a new CAP action that builds the Golden-Dataset payload **server-side** with a shared builder and feeds it through the same ingestion path `syncWorklist` uses. The browser never owns the dataset shape, so it cannot drift from `extractDeepCase`.
  - *Advanced — paste JSON* — the current `analyze-dialog`, **moved here** from the 8D Reports page. It now creates a worklist row rather than an orphan report, so the two lists stop disagreeing about how many defects exist.

Plus: search over notification / material / symptom, an origin filter, and sortable Age and Found columns.

### E — Detail page (depends on A; D2/D8 rendering depends on C)

1. **Report-first, two-column.** Header → case facts → **the eight disciplines** → run trace, with the Precedent and Independent-reasoning panels in a **collapsible sidebar beside** the disciplines. The precedent panel still fills in early (~2s) where it sits; the 8D stops being the fourth section on its own page.
2. **Per-step workspace** — the shell from A.6 on every tab: status pill, `Mark complete`, and per-suggestion accept / edit / reject. D1 and D8 additionally get **Accept all suggested**.
3. **D2 rendering** — paragraph (editable) · 5W2H six-box grid (read-only, visibly derived) · IS/IS-NOT pair with lot-ID citations, or the "not applicable" state.
4. **D8 rendering** — the gate as a checklist of D1–D7 showing each step's real status with a link to any incomplete one · editable summary · precedent-lessons list · recurrence flags labelled *informational only*.
5. **Export** — `Print / Export 8D`: a print stylesheet over the eight disciplines with sources. Q1 cases get a second export using `customerSummary` only, with the R0.6 guard stated on the page.
6. **Demote `Source JSON`** into an overflow menu with `Re-analyze`; add a confirm to `Re-analyze` stating that existing disciplines will be replaced.
7. **Nav** — group into **Work** (Worklist, 8D Reports) and **Configure** (Organization, Workflow, Object Schema, AI Settings).

### F — Documentation hygiene (trailing)

- ✅ Stale synchronous-execution comment on `analyzeFromJson` in `srv/EightDService.cds` fixed (§1.5) — it now states the action returns immediately and the client polls `status`.
- Extend `docs/AI-SETTINGS-D1-CONFIGURATION.md` to cover D5–D8 once B lands.

---

## 4. Sequencing

```
A (plumbing)  ──┬──> B: D5 → D7 → D6 → D8 → D1..D4 (HITL only)
                └──> E (detail page)
C (AI logic)  ─────> B: D8 slice,  E: D2/D8 rendering
D (worklist)    independent — start immediately, in parallel with A
F               trailing
```

**A and D start together.** C has no dependency on A and can start as soon as someone is free. B cannot start until A lands, and B's D8 slice cannot finish until C does.

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| Adding `stepStatus` changes the D8 gate's meaning mid-demo — existing reports have no statuses | Default `'Draft'`. A report analysed before A shows every step as Draft, which is the truthful state. **Do not backfill `Complete`.** |
| "In review" is derived, so it depends on the audit table being written correctly | The `shown` write in A.3 is the same code path as `accepted`/`rejected`. If audit breaks, the state visibly disappears rather than silently going stale — a loud failure, which is the point of deriving it. |
| D5–D8 form schemas change how existing reports render | R0.8 snapshots already cover this — verify with acceptance test 15 before shipping each slice. |
| GD 17 is illustrative for 3 of the 4 cases | Keep the caveat visible: the Is/Is-Not panel cites lot IDs, which makes the population inspectable rather than authoritative. Demo the mechanism, not the learning. |
| Two creation paths diverge again | Enforced structurally — `createWorklistItem` builds the payload with the same server-side builder and feeds the same ingestion path as `syncWorklist`. Neither path lets the browser define the dataset shape. |
