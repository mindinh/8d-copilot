# Graph Retrieval — Replacing Similarity Scoring with SAP HANA Graph + openCypher

**Date:** 2026-09-03
**Branch:** `feat/graph-retrieval` (cut from `dev/Thien`)
**Status:** design — approved for implementation
**Supersedes:** the similarity engine described in `PRECEDENT-RETRIEVAL-REVIEW.md`; that document's findings R2, R3, R4 are resolved here.
**Related:** `AI Requirements - 8D Copilot POC.md` §2 (weights) · `CHAIN-ALIGNMENT-IMPLEMENTATION-PLAN.md` (Phase 1.3 supplies `defectCodeGroup`, a prerequisite)

---

## 1. The problem

Every one of the eight disciplines asks the retrieval engine the same question — *"which closed case looks like this one"* — and differs only in how it weights five signals. That is the wrong shape. D1 needs to know **who has handled this kind of defect**; D4 needs to know **how this part fails**. Those two questions rank the library in different orders, and a single similarity metric forces both to accept a compromise that is optimal for neither.

Two concrete failures are already recorded in `PRECEDENT-RETRIEVAL-REVIEW.md` and reproduce on the live dataset:

- **R3 — one shared word earns the full fallback score.** `MIN_SHARED_KEYWORDS = 1`, so *"Flange edge burr above limit"* matched *"Chatter marks and surface waviness on milled flange"* on the single word `flange`. A burr and chatter marks are different failure mechanisms.
- **R3(b) — the operator's own words are never read.** `defectKeywords` is built only from `product.defectText`. The live symptom *"…pocket depth also reading shallow"* scored **+0** against precedent `8D-10048880` (*"Pocket depth inconsistent across units"*), because the matching phrase sat in `symptomShortText` on both sides — a field the criterion does not look at.
- **R4 — cosine noise qualifies unrelated cases.** Measured over 78 pairs of the current library: unrelated cases already sit at median **0.636**, p75 **0.687**. The floor is 0.70 and the weight is 5, so `5 × 0.70 = 3.5` clears the threshold of 3. A brand-new defect that shares nothing gets a "precedent" built on writing style alone.

A graph does not merely re-encode these signals. It changes what can be asked: shared keywords become a **countable set of vertices**, defect codes roll up into **groups**, materials into **families**, and "what did we actually do about it" becomes a traversal into `Action → TaskCode` instead of a string.

---

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| D-1 | **SAP HANA Cloud Graph + openCypher** via `OPENCYPHER_TABLE` and a `.hdbgraphworkspace` HDI artifact | No new infrastructure; `npm run dev:backend` already binds HANA through the `hybrid` profile, so the engine is testable in dev, not only in production |
| D-2 | **Full knowledge graph** — 14 vertex kinds, 16 edge kinds | Multi-hop questions (defect *group* × material *family* × task code) are the point; a three-key graph would only re-encode today's flat metric |
| D-3 | **Cypher lives in TypeScript; admins tune parameters** | Queries get versioning, unit tests, and no injection surface. Admins keep the "tunable without redeploy" promise through a parameter table |
| D-4 | **Embedding demoted to a booster** | Ranks candidates the graph already justified; can never qualify a case on its own. This is option 1 of finding R4 |
| D-5 | **A dedicated HDI container** — `cnma_proresolve_db_graph` | `cnma_proresolve_db` is shared with `dev/Dung`, `dev/Minh`, `BA/Quyen`. HDI deploy is declarative over a whole container, so deploying this branch's model there could drop their artifacts |
| D-6 | **One global engine switch, never per-step** | See §6. A mixed report silently corrupts `precedents#N` numbering |

### Non-goals

- No `:SIMILAR_TO` edges. Precomputing them means recomputing on every new case, and D-4 already delivers the semantic contribution.
- No admin-authored Cypher in the database (rejected: needs a parser allowlist, and a bad query only fails at runtime).
- No change to the existing scoring engine. It stays, intact, as the fallback and the shadow-run comparator.

---

## 3. Graph model

**The graph carries structure; relational tables carry content.** Vertices and edges are SQL views over the tables that already exist — `HistoricalCases` remains the single source of truth, and no second copy of the data is created or synchronised. Cypher returns keys; SQL joins those keys back to the real tables for the payload.

### 3.1 Vertices (14)

| Label | Source |
|---|---|
| `Case` | `HistoricalCases.notificationId` |
| `OpenDefect` | `Defects.defectId` — open defects are part of the D2 comparison population |
| `WorkCenter` | distinct `workCenterId` across `HistoricalCases`, `Defects`, `InspectionLots`, `FmeaRegister` |
| `DefectCode` | distinct `defectCode` |
| `DefectGroup` | distinct `defectCodeGroup` |
| `Material` | distinct `materialId` |
| `MaterialFamily` | distinct `materialFamily` / `materialGroup` |
| `Keyword` | tokens of `defectKeywords` **and `symptomShortText`** |
| `Person` | `HistoricalTeamMembers.partnerId` |
| `Function` | distinct `functionTitle` |
| `Action` | `HistoricalActions` |
| `TaskCode` | distinct `taskCode` |
| `TaskCodeGroup` | distinct `taskCodeGroup` |
| `RootCause` | distinct `rootCauseCategory` |
| `Fmea` | `FmeaRegister.fmeaId` |
| `InspectionLot` | `InspectionLots.lotId` |

### 3.2 Edges (16)

```
(Case)-[:OCCURRED_AT]->(WorkCenter)         (Case)-[:STAFFED_BY {partnerRole}]->(Person)
(Case)-[:HAS_DEFECT]->(DefectCode)          (Person)-[:ACTS_AS]->(Function)
(DefectCode)-[:IN_GROUP]->(DefectGroup)     (Case)-[:RESOLVED_BY {actionType}]->(Action)
(Case)-[:ON_MATERIAL]->(Material)           (Action)-[:CODED_AS]->(TaskCode)
(Material)-[:IN_FAMILY]->(MaterialFamily)   (TaskCode)-[:IN_GROUP]->(TaskCodeGroup)
(Case)-[:MENTIONS]->(Keyword)               (Case)-[:CAUSED_BY]->(RootCause)
(OpenDefect)-[:OCCURRED_AT]->(WorkCenter)   (InspectionLot)-[:OF_MATERIAL]->(Material)
(OpenDefect)-[:HAS_DEFECT]->(DefectCode)    (InspectionLot)-[:AT]->(WorkCenter)
(OpenDefect)-[:ON_MATERIAL]->(Material)     (Fmea)-[:COVERS]->(WorkCenter|Material)
```

### 3.3 The two vertex kinds that do the real work

**`Keyword` as a vertex** turns keyword overlap from a boolean into `count(DISTINCT k)`. One shared word no longer scores what three shared words score — that is R3(a), closed. Because tokens are drawn from `symptomShortText` as well as `defectText`, *"pocket depth"* finally becomes visible on both sides — that is R3(b), closed.

**`OpenDefect` + `InspectionLot`** give D2 the **Is-Not** side, which a flat query can barely express: *same material, same characteristic, inspected at a different work centre, `conforming = true`* is a pattern, not an anti-join.

---

## 4. One question per discipline

| Step | The question it actually asks | Traversal |
|---|---|---|
| **D1** | Who has handled this kind of defect at this work centre? | `WorkCenter ← Case → DefectCode → DefectGroup`, then `Case → Person → Function`; `count(DISTINCT c)` **is** `servedOnCount` |
| **D2** | Where does this defect appear, and where does it not? | IS: `DefectCode ← Case → WorkCenter/Material`. IS-NOT: `Material → InspectionLot → WorkCenter` with no `HAS_DEFECT` path |
| **D3** | How was this contained last time? | `DefectGroup ← Case → Action{Containment} → TaskCode`, ranked by frequency |
| **D4** | How does this part fail? | `(c1)-[:MENTIONS]->(k)<-[:MENTIONS]-(c2)` with `count(DISTINCT k) >= minSharedKeywords`, same `DefectGroup`, then `→ RootCause` |
| **D5** | Which fix actually removed that cause? | `RootCause ← Case → Action{Corrective} → TaskCode`, restricted to closed cases |
| **D6** | What proves it is gone? | D5's task codes → closed cases → **no** later case on the same `WorkCenter + DefectCode` (non-recurrence) |
| **D7** | Where else is this risk? | `Material → MaterialFamily → Material → Case`, plus `Fmea -[:COVERS]-> WorkCenter/Material` |
| **D8** | Closure | Persons who closed comparable cases; `copqEur` along the matched branch |

**Where the value actually lands.** Read from the form schemas in `defaults.ts`, only five disciplines consume precedents today: D1 (`sources` constrained to `^(team\.|precedents#)`, roster carries `servedOnCount`/`sourceCase`), D3, D5 and D7 (`origin: "recorded" | "precedents#N"`), and D4 (precedent root causes as hypotheses). D2 and D6 draw on different data — inspection lots and non-recurrence — and **D8 gains essentially nothing**; its closure gate is `manual_input` computed from the D1–D7 review status and its COPQ is read from SAP. That is the honest distribution and the plan does not pretend otherwise.

### 4.1 Evidence paths replace scores

Each precedent carries the traversal that justified it:

```
WC-MILL-07 ←OCCURRED_AT— 8D-10048880 —MENTIONS→ {pocket, depth, shallow}  (3 shared)
                                     —HAS_DEFECT→ D-0042 —IN_GROUP→ G-DIM
```

This replaces `"7/11 — Work center WC-MILL-07, Material MAT-10247"`. It explains **why**, not just **how much**, and it resolves finding R2: the hardcoded paragraph at `prompts.ts:137-139` (*"…out of 11"* — wrong formula and wrong ceiling) is generated from real evidence instead.

---

## 5. Database isolation and the way back

The isolation unit is the HDI container — which is also mandatory, since `.hdbgraphworkspace` is a container-scoped artifact.

| | Existing (untouched) | This branch |
|---|---|---|
| HANA | `cnma_proresolve_db` | **`cnma_proresolve_db_graph`** (hana / hdi-shared) |
| CAP profile | `hybrid` | **`graph`** |
| Command | `npm run dev:backend` | **`npm run dev:backend:graph`** |
| Local SQLite | `db.sqlite` | **`db.graph.sqlite`** |
| `mta.yaml` | not edited during development | — |

Four guarantees:

1. **The shared container is never touched** — not read, not written, not deployed to. The new container is seeded from the repository itself: `cds deploy` loads the 12 CSVs in `db/data/`, `librarySeeder` loads the 25 case JSONs. Seeding from the repo rather than copying data is deliberate: copying would require opening a connection to the shared container, which is a risk taken for no benefit.
2. **Teammates are unaffected.** `.cdsrc-private.json` is gitignored, so the new profile is local to one machine; `mta.yaml` is unchanged, so everyone else's `npm run deploy` still produces the current MTA.
3. **Revert is `git switch dev/Thien`.** There is no database step to undo, because the old database never changed. Full cleanup adds `cf delete-service cnma_proresolve_db_graph`.
4. **A cold snapshot exists.** Schema and row counts of the current container are exported read-only, once, to `db/backup/2026-09-03/` as a before/after reference point.

`mta.yaml` gains the graph container only at the point of a real CF deployment, and as a **second** resource beside the existing one — never as a replacement — so the team's current deployment stays reproducible.

---

## 6. One engine, globally — and why per-step rollout is wrong

The obvious risk-reduction move is a per-step flag: run D4 on graph, leave the rest on scoring, widen gradually. **That is incorrect, and it fails silently.**

`mergeStepPrecedents` folds all eight per-step results into a **single list numbered once**, keeping the highest-scoring version of each case:

```ts
if (!seen || p.score > seen.score) best.set(p.notificationId, p);
```

Under a mixed configuration that `>` compares a graph score (weighted evidence count) against a scoring score (0–16). `precedents#1` stops being the strongest case, and **nothing catches it**: `postProcess` validates citations against `^(team\.|precedents#)`, which a wrong-but-well-formed citation satisfies. This is precisely the failure the module's own comments warn about — *"an ambiguous citation that passes every existing check."*

Therefore:

- `GraphRetrievalSettings.engine` is **one global value**, `'graph' | 'scoring'`, seeded to `'scoring'` so day one has a zero-behaviour diff.
- Risk is managed by **shadow runs**, not by mixed reports: `scripts/shadow-retrieval.mjs` runs one case through both engines and prints a per-step diff. That answers *"does graph find `8D-10048880` where scoring missed it"* with a table rather than an impression.

---

## 7. Code architecture

```
srv/src/domain/eightd/graph/
  model.ts           label + edge-type constants — one source; views, Cypher and tests all read it
  cypherLiteral.ts   allowlist + escaping. No API accepts free-form Cypher
  graphClient.ts     runCypher() → OPENCYPHER_TABLE via cds.run, then joins back to real tables
  params.ts          reads GraphRetrievalSettings / GraphStepParams
  engine.ts          picks graph | scoring, by global flag AND by db kind
  evidencePath.ts    Cypher rows → human-readable evidence paths
  queries/           d1Team · d2IsIsNot · d3Containment · d4RootCause
                     d5Corrective · d6Verification · d7Preventive · d8Closure
db/schema/graph.cds            vertex/edge views — views only, no new data tables
db/schema/graph-config.cds     GraphRetrievalSettings, GraphStepParams
db/src/GW_8D.hdbgraphworkspace
```

**The `PerStepPrecedents` / `Precedent` contract does not change.** `eightDAnalyzer`, `prompts`, `postProcess`, `buildRuntimeSources` and the UI all read that shape. Keeping it means the engine is swappable behind one flag and rollback is a configuration change, not a revert. `Precedent` gains `evidencePath: string[]`; `score` now means weighted evidence count and `breakdown` lists path kinds, so existing UI keeps working unmodified.

**Fallback.** `engine.ts` falls back to the untouched `findPrecedentsByStep` when `cds.db.kind !== 'hana'` or the graph workspace is absent. This is what keeps `jest` and `npm run dev:backend:local` green.

---

## 8. Risks and the two spikes that run first

Both spikes can change the design, so they are the **first** tasks, not the last.

**S1 — does `OPENCYPHER_TABLE` support bind parameters?** SAP's documentation does not settle it. If it does not, every value is interpolated into a Cypher string literal and injection is real. Mitigation regardless of the answer: exactly one `cypherLiteral()` function, allowlist `^[A-Za-z0-9._\-/ ]{1,60}$`, single quotes doubled, everything else rejected — and no other path puts a string into a query. Tested with attack strings.

**S2 — does this HANA Cloud instance accept multiple vertex/edge tables with `LABEL`?** The documentation says heterogeneous graphs are supported, but it must be confirmed against the container just created. If not, fall back to one vertex table and one edge table carrying a `TYPE` column, with `MATCH (v) WHERE v.TYPE = 'Case'`. `model.ts` hides the difference behind one function, so only that function changes.

**Remaining risks**

- **`Keyword` is a very high-degree vertex.** A token like `surface` links hundreds of cases, and `(c1)-[:MENTIONS]->(k)<-[:MENTIONS]-(c2)` can blow up. Mitigation: filter by `DefectGroup` **before** joining keywords, and strip stopwords when the view is built. Measured on the 25-case library, not assumed.
- **Views are recomputed per query.** Fine at 25 cases. If it is slow, switch to physical tables plus a refresh job — decided after measurement, not in advance.
- **`cds build` must copy `db/src/*.hdbgraphworkspace`.** Likely, since CAP copies `db/src` wholesale, but it is verified rather than trusted.

---

## 9. Testing

| Layer | Runs where | Covers |
|---|---|---|
| Unit (jest, no DB) | anywhere | `cypherLiteral` against injection · Cypher generated from parameters · `evidencePath` · `engine.ts` branch selection |
| Integration (`graph` profile, real HANA) | developer machine | every query returns the right shape, plus **one business assertion per step** |
| Regression | anywhere | with `engine = 'scoring'`, output is **identical** to today |

**D4 acceptance test**, taken straight from the recorded failure: a case containing *"pocket depth also reading shallow"* **must** retrieve `8D-10048880` (*"Pocket depth inconsistent across units"*) — the precedent today's engine scores **+0** because both occurrences live in `symptomShortText`, a field it never reads.
