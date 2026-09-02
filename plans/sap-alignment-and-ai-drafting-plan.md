# Implementation Plan — SAP Alignment (Gaps A–G) + AI-Drafting Features

**Date:** 2026-08-26

## Status

| Phase | State |
|---|---|
| 1 — In Process step state (Gap C) | ✅ done |
| 2 — Record defect ≠ start 8D (Gap D) | ✅ done |
| 3 — Defect class + code-group cascade (Gaps A, B) | ✅ done — **no deploy needed** |
| 4 — Open tasks block closure (Gap F) | ✅ done |
| 6 — Team contacts (Gap G) | ✅ done |
| 7 — Trust pack (#1 consistency check, #2 re-draft step) | ✅ done |
| 0 — Schema migration | ⛔ **blocked** |
| 5 — Attachments (Gap E) | ⛔ blocked by Phase 0 |

**Six of seven gaps closed. 571 tests passing. Both typechecks clean.**

### How Phase 3 avoided the deploy

The plan assumed `defectClass` needed a column on `HistoricalCases`. It did not.

`ValueHelpList.staticEntries` is an **existing** `LargeString`, and
`handleStaticSource` returns entries untouched — so arbitrary extra columns flow
through `returnMapping` to the form. `DEFECT_CODE` moved from `sourceType:
'reference'` to `'static'`, carrying `defectClass` and `codeGroup` per code, with
an idempotent upgrade in the seeder that only touches a row still on `reference`.

Trade-off accepted: the code list no longer auto-tracks the case library. A
defect catalogue is maintained master data rather than something that grows from
transactions, and this is closer to the eventual `sourceType: 'external'` shape.

Only **Gap E** still needs the migration — a file store genuinely requires a table.

### Why Phase 0 is blocked

The `.cds` changes are written and compile to valid HDI artifacts
(`HistoricalCases.defectClass`, entity `Attachments`). What failed was *pushing*
them from this machine:

1. `cds deploy --to hana` reads `db/` instead of the built `gen/db`, hitting the
   `src/.gitkeep` compile-unit error that `mta.yaml` already documents at line 60.
   Failed at the make stage — nothing changed.
2. Running `@sap/hdi-deploy` directly from `gen/db` with
   `--simulate-make --no-auto-undeploy` hung for 17 minutes with no output and
   was killed.

Container verified untouched afterwards. The schema will deploy through the
team's normal `npm run deploy`; Phases 3 and 5 resume once it has.

### Decisions taken

- **Defect class:** derive from the 13 existing codes, documented in the seeder
- **Team contacts:** maintained `PARTNER` value help — no fabricated addresses
- **Phase 7 order:** Trust pack first
- **volt.io link:** excluded — it is Volt's payments API documentation, no 8D content

---

## North star

> Build an app that guides AI to read old data and draft each 8D step for the
> user, **instead of manual typing**.

Every item below is judged against two questions:

1. Does it **remove typing**?
2. Does it **increase trust** in what was drafted?

Anything that does neither is out of scope, however "correct" it looks next to SAP.

---

## What the competitors actually do

| Source | Capability | We have it? |
|---|---|---|
| doubleSlash | Auto-extract incoming complaint data into structure | ✅ `analyzeFromJson` + `caseMapper` |
| doubleSlash | Context-related suggestion per D step | ✅ per-step AI drafts |
| doubleSlash | Semantic search over internal knowledge base for similar cases | ✅ embeddings + 16-point precedent scoring |
| doubleSlash | Human-in-the-loop — "AI suggests, quality experts decide" | ✅ per-step review gate + audit trail |
| doubleSlash | **Automatic completeness & consistency check before release** | ⚠️ engine exists (`constraintsJson`), never surfaced to the user |
| Praxie | 5W2H · Is/Is-Not · Ishikawa · 5-Why | ✅ D2/D4 form schemas |
| Praxie | **Read-across to similar parts / lines / suppliers** | ❌ |
| Praxie | **Recurrence detection** | ❌ |
| Praxie | **Before/after effectiveness evidence** (D6) | ❌ (needs attachments) |
| Qualityze | Audit-ready trail | ✅ `ReviewEvents` |
| Qualityze | **Customer-facing 8D export** | ⚠️ `customerSummary` exists, no export |

> **Note on the fourth link:** `docs.volt.io/.../requesting-payment` is Volt's
> payments API documentation. It contains nothing about 8D, quality management
> or defects. I've excluded it — please re-send if you meant a different page.

**Conclusion:** our retrieval and human-in-the-loop layers already match the
closest competitor. The three things we are missing are all about *closing the
loop*: a pre-release check, per-step re-draft, and read-across/recurrence.

---

## The constraint that shapes the sequencing

Local dev connects to the **shared** HANA HDI container
(`cnma_proresolve_db`, `proconarum-sandbox-system/Training`). Adding a column
means `npm run build:cf` + `cf deploy`, which affects the whole team.

So: **all schema changes are batched into one deploy (Phase 0)**, and every
other phase is ordered so it lands without one.

| Gap | Needs a deploy? | Why |
|---|---|---|
| A defect class | **Yes** | new column on `HistoricalCases` |
| B code group | No | value-help config only |
| C In Process | No | `reviewStatus` is `String(16)` — new *value*, not new column |
| D start 8D separately | No | service action + existing `status` field |
| E attachments | **Yes** | new entity |
| F task gate | No | reads `caseContext` JSON, logic only |
| G team email/phone | No | columns already exist |

---

## Phase 0 — One schema migration (needs your approval)

**Files:** `db/schema/case-library.cds`, `db/schema/eight-d.cds`

1. `HistoricalCases.defectClass : String(20)` — Critical / Major / Minor
2. New entity `Attachments : cuid, managed`
   - `report : Association to Reports`
   - `disciplineCode : String(4)` (nullable — which D it supports)
   - `fileName : String(255)`, `mimeType : String(100)`, `fileSize : Integer`
   - `content : LargeBinary`
   - `uploadedBy : String(120)`

Then `npm run build:cf && cf deploy` — **once**.

> ⚠️ This is the only step that touches the shared container. I will not run it
> without an explicit go-ahead.

---

## Phase 1 — Gap C: the missing "In Process" state

The biggest *behavioural* gap. An engineer two days into D4 is currently
indistinguishable from one who has not opened it, and the worklist "Current
step" cannot tell "next to do" from "being done now".

**Backend**
- `REVIEW_STATUSES` → `['Draft', 'InProcess', 'Approved', 'ChangeRequested']`
- `ReviewDecision` → add `'start'`
- `reviewDiscipline` accepts `start`; writes a `ReviewEvent` like any other transition
- `computeClosureGate` **unchanged** — only `Approved` counts toward closure

**Frontend**
- `DisciplineReviewBox`: "Start working" button when `Draft`
- `CaseStepper` / `ClosureGateBar`: three-state dots; relabel `Draft` → **"Not started"** (SAP's word)
- `getCaseWorkload`: add `inProgressStep`; worklist "Current step" shows *in process* distinctly
- Filter bar gains **"In process"**

**Files:** `srv/src/domain/eightd/review.ts`, `srv/src/services/eightDService.ts`,
`app/…/services/eightd-service.ts`, `review-controls.tsx`, `case-stepper.tsx`,
`lib/case-workload.ts`, `pages/eight-d/index.tsx`
**Tests:** extend `review.test.ts` — start transition, gate still requires Approved

---

## Phase 2 — Gap D: recording a defect ≠ starting an 8D

SAP: *Record Defect* → defect number → **"Start Problem-Solving Process"** →
8D number generated against the defect. Ours fires a ~3-minute AI run on every
defect, and no defect can exist without an 8D.

**Backend**
- `analyzeFromJson(payload, title, startAnalysis: Boolean default true)`
  — when `false`, create the report at `status: 'Draft'` and skip `runInBackground`
- New action `startProblemSolving(reportID)` — guarded to `Draft`/`Failed`

**Frontend**
- Create-defect: primary **"Record Defect"**, secondary "Record & Start 8D"
- Detail page: a `Draft` report shows a *Start Problem-Solving Process* call to
  action instead of eight empty disciplines
- Worklist: `Draft` rows show "Not started" + inline start

**Files:** `srv/EightDService.cds`, `srv/src/services/eightDService.ts`,
`create-defect/index.tsx`, `pages/eight-d/detail.tsx`, `pages/eight-d/index.tsx`

---

## Phase 4 — Gap F: open tasks block closure

SAP requires all tasks complete before a defect closes. Our gate only checks
D1–D7 approved; the D6 checklist is display-only.

- `computeClosureGate` also reads `caseContext.actions`; blocks while any
  containment / corrective / preventive action is not `Completed`/`Verified`
- Gate reason names the blocking actions
- `ActionChecklist` marks which rows block closure

**Files:** `review.ts`, `action-checklist.tsx`, `review-controls.tsx`
**Tests:** `review.test.ts`

*(Runs before Phase 3 because it needs no deploy.)*

---

## Phase 3 — Gaps A + B: the defect catalogue as SAP models it

**A — defect class is derived, not chosen.** Selecting a defect code
auto-assigns critical/major/minor from catalog type 9.

- Seed `defectClass` for the 13 existing codes (documented mapping in the seeder, editable after)
- Add to `DEFECT_CODE` value help `returnMapping` → new **read-only** "Defect Class" field beside the code
- **Keep `Priority`** (urgency — a business decision) **and add Defect Class** (severity — a property of the code). They are genuinely different axes.
- `lib/case-workload.ts` priority rule uses real Defect Class instead of inferring severity from origin + cost

**B — code group → code cascade.** `ValueHelpList.dependsOn` supports this natively.
- New `DEFECT_CODE_GROUP` value help; `DEFECT_CODE` gains `dependsOn`
- `CaseContext.product` gains `defectClass`, `defectCodeGroup`

**Files:** `valueHelpSeeder.ts`, `caseMapper.ts`, `types.ts`,
`create-defect/index.tsx`, `lib/case-workload.ts`
**Tests:** `caseMapper.test.ts`

---

## Phase 5 — Gap E: attachments

- Upload / download / delete actions with size cap + mime allowlist
- Per-step attachment strip on the detail page; attach at record time
- Feeds Phase 7 item 6 (before/after evidence)

**Files:** `srv/EightDService.cds`, new `srv/src/services/attachmentService.ts`,
new `app/…/components/ui/AttachmentStrip.tsx`, `create-defect/index.tsx`, `detail.tsx`

---

## Phase 6 — Gap G: team email + phone

The columns exist; `librarySeeder` writes `null` because the mock data has none.

**I will not synthesise email addresses.** A fabricated address in a
customer-facing 8D is worse than a blank. Three honest options:

| | Approach | Trade-off |
|---|---|---|
| **a** | Real BP master data via a value help | Correct; needs data from you |
| **b** | `PARTNER` static value help holding email/phone as config | Works today, maintained by hand |
| **c** | Hide the columns until data exists | Zero fabrication, zero function |

**Recommend (b) now, (a) when S/4 connects.** Needs your pick.

---

## Phase 7 — Goal-aligned features (ranked by typing removed / trust gained)

| # | Feature | Why it matters | Cost |
|---|---|---|---|
| **1** | **Pre-release completeness & consistency check** — surface the existing per-step `constraintsJson` rules as a blocking panel before closure, listing every unmet rule with the step it belongs to | doubleSlash's headline feature. **The engine already exists** and is invisible today. Highest value, lowest cost. | S |
| **2** | **"Re-draft this step" button** per D step — re-run one step's AI in isolation | Today a single weak step means a 3-minute full re-analysis. This is the most direct answer to *"instead of manual typing"*. | M |
| **3** | **Read-across** — "the same failure mode appears on these other parts / lines" from the existing embedding index, surfaced in D7 | Praxie's D7 differentiator; our vector index already supports it | M |
| **4** | **Recurrence detection** — at record time, "3 similar defects on this work centre in 90 days" | Turns the library from a lookup into a warning system | M |
| **5** | **Customer-facing 8D export** — print/PDF view of D1–D8 using the existing `customerSummary` | Standard 8D deliverable; we generate the content but cannot hand it over | M |
| **6** | **Before/after effectiveness evidence** (D6) — paired attachments + measurement delta | Closes the D6 "no verification evidence" gap honestly | M (needs Phase 5) |

---

## Sequencing

```
Phase 0 (deploy, approval needed)
   │
   ├─ Phase 1  In Process state          no deploy
   ├─ Phase 2  Record ≠ Start 8D         no deploy
   ├─ Phase 4  Task gate                 no deploy
   │
   ├─ Phase 3  Defect class + cascade    needs Phase 0
   ├─ Phase 5  Attachments               needs Phase 0
   ├─ Phase 6  Team contacts             needs your pick
   │
   └─ Phase 7  AI-drafting features      your selection
```

Phases 1, 2 and 4 can start **immediately** and deliver every behavioural fix
without touching the shared database.

---

## Definition of done, per phase

- Backend change covered by jest (currently **554 passing**)
- `tsc --noEmit` clean on both sides
- Screenshot verification of the changed screen
- No fabricated data anywhere — a missing value stays missing and is reported as a gap

---

## Open questions

1. **Approve the single HDI deploy** (Phase 0)? It touches the shared container.
2. **Defect class source** — derive from the 13 existing codes with a documented mapping, or do you have the real catalogue?
3. **Gap G** — option (a), (b) or (c)?
4. **Phase 7** — which items, and in what order?
5. **The volt.io link** is a payments API doc. Did you mean a different page?
