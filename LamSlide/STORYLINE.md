# 8D Copilot — Demo Day Run-of-Show

**Event:** ConaSpark 2026 Demo Day · Friday 04 Sep 2026 · 09:05 DE / 14:05 VN
**Team:** Friends of Bugs · Lead Quyen La · **Slot 4 of 6**
**Slot:** 10 min presentation · 5 min Q&A · 2 min handover
**Language:** English · Hybrid, VN office + online · Demo runs live on SAP BTP
**Baseline:** `Downloads/8DCopilotDeck.pptx` (10 slides, submitted 28 Aug) — this is a **re-cut of that deck, not a rebuild**

> **Superseded:** the earlier 21-slide storyline in this file assumed a 20-minute slot and no existing deck. Both assumptions were wrong. Discarded.

---

## The constraint that drives everything

**Ten minutes, and the demo has to be in it.** The submitted deck has 10 information-dense slides. Presenting all ten leaves roughly zero time to run the app — and Technical Execution (20%) is scored on *"how far the demo runs: smooth or still rough."* A deck-only presentation caps that criterion.

So: **6 slides on screen, ~5:30 in the live app.** Four existing slides become Q&A backup, not cut content — they stay in the file, moved behind the end slide, ready to jump to when a judge asks.

## Where the points are

| Criterion | Weight | Verdict on the current deck | What this run-of-show does about it |
|---|---|---|---|
| Innovation & Creativity | **30%** | Strong material, badly placed. Blind diagnosis is a sub-clause on slide 4's D4 box. | Promote blind diagnosis to **the opening hook** and **the demo's climax**. |
| Business / User Value | **30%** | **The real gap.** No user named, no saving quantified, no adoption path. | New slide S2 does nothing else. See the open question below — this needs a number from you. |
| Technical Execution | 20% | Good, but a stumble on stage costs more than a slide would. | Pre-warmed second tab; never watch a spinner on stage. |
| Effective Use of Technology | 10% | Covered by existing slide 8. | Fold into the close, plus say "running on BTP" out loud during the demo. |
| Demo & Storytelling | 10% | No run-of-show existed. | This document. |

**60% of the score is Innovation + Business Value.** Every cut below protects those two.

---

# The 10-minute run of show

### The one-sentence spine
> The AI is shown the defect but **not** the engineer's answer — and it reaches the same root cause anyway, citing the lot IDs it used.

That sentence is promised in the first 30 seconds and proved live at 6:30. Everything else supports it.

---

### `0:00 – 0:45` · S1 — Hook *(reuse existing slide 1, retitled)*
**Must land:** We hid the answer from the AI and it still found the root cause.
Say: an 8D takes days of assembly across separate SAP QM screens. We built a copilot that drafts all eight disciplines from the case's own data — and to prove it isn't just rephrasing the engineer's work, **we cut their 5-Why, Ishikawa and FMEA answers out of the prompt entirely.** You'll see the result live in about five minutes.
*Do not list features here. Make the promise and move.*

### `0:45 – 1:45` · S2 — Who this is for and what it saves ★ **NEW SLIDE**
**Must land:** A named user, a real task, a number.
This slide does not exist yet and is the single highest-value addition — it is 30% of the score and currently unaddressed. Contents:
- **Who:** the QM engineer running an 8D, plus the quality manager who signs it off.
- **The task today:** days of assembly before analysis starts; precedent that exists but can't be searched; report depth that varies by author; a customer summary hand-rewritten with leak risk.
- **The change:** every discipline arrives pre-drafted and cited; the engineer edits instead of facing a blank box.
- **The number:** ⚠️ *see open question 1 — I will not invent this.*
*Reuses the three problem cards from existing slide 2, but reframed from "here is a problem" to "here is who we save time for."*

### `1:45 – 2:15` · S3 — What we built, in one diagram *(compress existing slides 3 + 4)*
**Must land:** One pipeline, two origins, eight disciplines, and the engineer decides every one.
The D1–D8 strip from existing slide 4 with the three pillars from slide 3 as a single caption line: drafts every discipline · cites the source field · two summaries, one case. Then the rule, said once and clearly: **it never finalises a step on its own.**
*Thirty seconds. This is orientation, not content — the demo carries the detail.*

### `2:15 – 7:45` · LIVE DEMO — one divider slide, then the app
**Must land:** This is running software on SAP BTP, not a mockup.

| Beat | Time | What you show | What you say |
|---|---|---|---|
| 1 · Input | 0:40 | The case in the worklist, then the deep-structure JSON | "Ordinary SAP QM data — notification, material, batch, defect code, work center, inspection lots. And **this** — the engineer's 5-Why chain. Watch what we do with it." |
| 2 · Launch | 0:20 | Analyze → Start Analysis | "One action. The engineer's answers are stripped before the prompt is built." |
| 3 · Pipeline *(talk track over the wait)* | 0:40 | 4-step pipeline diagram | `enrichContext` → `diagnoseIndependently` → `generateReport` → `postProcess`. Four steps, each with its own model, on SAP AI Core. **Then switch to the pre-warmed tab — do not watch the spinner.** |
| 4 · Blind diagnosis ★ | 1:10 | Reasoning Panel + agreement verdict | **The climax.** "It never saw the engineer's chain — and it landed on the same branch." Then the line that wins Innovation: **"a disagreement here is a feature"** — the case flags itself for a second look. |
| 5 · Is/Is-Not | 1:00 | D2 card — IS / IS NOT with lot IDs | 75% vs 0% nonconforming on the same material and characteristic. "Only the difference matters." Then the honesty beat: where there's no measurable contrast it returns **not applicable** rather than inventing one. |
| 6 · Cited drafts | 0:50 | Scroll D1→D8, land on D4 | Root cause + matched precedent case ID + score. "Every statement carries the record it came from." |
| 7 · Two summaries | 0:30 | Internal vs Customer side by side | Same case, sensitive equipment and batch detail filtered out of the customer version. |
| 8 · Tune it live | 0:40 | AI Settings → Step Prompts D4 → save; Similarity weights | "An admin changes the AI's behaviour in the UI. No code change, no redeploy." *Cut this beat first if running long.* |

**Total 5:30.** Beat 8 is the designated overflow valve. Beats 4 and 5 are untouchable.

### `7:45 – 8:45` · S4 — Why it holds up *(merge existing slides 6 + 7)*
**Must land:** It refuses to guess, and a person decides everything.
The similarity engine's weights (+4 work center, +4 defect code, +3 material, +3 semantic) with the rule that carries the slide: **below score 3 it says "no precedent found" instead of filling the gap.** Plus the three human-in-the-loop guarantees from existing slide 7.

### `8:45 – 9:20` · S5 — Built on BTP, tunable without code *(condense existing slide 8)*
**Must land:** SAP-native stack, and the behaviour is configuration, not code.
CAP (Node/TS) · React · AI Core · BTP Cloud Foundry with MTA, approuter, XSUAA. Three config surfaces: Model Registry, Similarity, Step Prompts D1–D8.
*Covers Effective Use of Technology (10%). Thirty-five seconds — do not linger.*

### `9:20 – 10:00` · S6 — Honest boundary and the ask *(condense existing slide 10)*
**Must land:** We know exactly what's real and what's next — and here's what we want.
Now / Next / Then / Later, plus the limitations stated by us rather than extracted by a judge: team rosters are backfilled, Cp/Cpk is calculated not read from SAP, fixtures must be tracked as Equipment records.
⚠️ *See open question 2 — the closing ask.*
*Stating your own limitations before Q&A converts the sharpest questions into agreement.*

---

# Q&A backup slides (in the file, behind S6 — jump to on demand)

| If asked | Jump to |
|---|---|
| "How does the precedent scoring actually work?" | existing slide 6 — full weights + the 7/11 worked example |
| "How do you know it works?" | existing slide 9 — three validation runs, including 8D-2612 |
| "What does each discipline produce?" | existing slide 4 — full D1–D8 grid |
| "What about hallucination?" | existing slide 7 — human-in-the-loop guarantees |

**Prepare an answer for the question you will get:** *"Isn't the AI just agreeing with the engineer because it saw the answer?"* — That is exactly what blind diagnosis rules out, and 8D-2612 is the proof: no access to Galileon's published answer, and it named the same fixture.

---

# Risks — ranked, with mitigations

1. **The 30–60s AI wait, live, in a 10-minute slot.** Up to 18% of the demo budget spent on a spinner.
   → **Two browser tabs.** Tab A: kick off the run. Tab B: an already-completed report of the same case. Start the run, talk over the pipeline slide, switch to Tab B. Never stand in silence.
2. **BTP deployment.** The agenda says teams demo live on BTP. ⚠️ *Open question 3.*
   → Whatever you demo on, have a local instance running as fallback and screenshots as fallback-to-the-fallback.
3. **Live model call fails on stage.** Network, quota, AI Core credential.
   → Tab B already covers this. A pre-recorded 60s screen capture is the third layer.
4. **Overrun.** Slot 4 of 6 — running long squeezes the teams after you and reads badly.
   → Beat 8 drops first, then S5 compresses to one spoken line. Rehearse with a timer.
5. **Hybrid audio/screen-share.** Remote attendees vote for Audience Choice.
   → Test screen share in the actual meeting link beforehand. Font sizes readable at 720p.

---

# Build plan — two days

**Today (02 Sep)**
- [ ] You answer the three open questions below
- [ ] Confirm the BTP deployment status and pick the demo case
- [ ] I draft the new S2 (Business Value) and the re-cut S3

**Tomorrow (03 Sep)**
- [ ] HTML deck in `LamSlide/effective-html/` — 6 slides + backups
- [ ] Full timed rehearsal with the live app; capture fallback screenshots during it
- [ ] Adjust from the rehearsal clock

**Thursday (04 Sep, morning)**
- [ ] Rebuild final in PPTX (Conarum branded)
- [ ] Screen-share test on the real link
- [ ] One last timed run

*If time gets tight, drop the HTML step and go straight to PPTX from this document. The HTML stage is for iterating on design — with two days and a working deck already in hand, that may be a luxury. Your call.*

---

# Open questions — blocking

**1. Business Value number (S2).** What does an 8D cost today — engineer-hours per report, reports per month, or a customer's stated figure? This is 30% of the score and the deck currently says nothing about it. If no real number exists, say so and I'll build the slide qualitatively around the named user and the named task instead. **I will not invent a figure.**

**2. The closing ask (S6).** What do you want from the room — a pilot on a real plant, a named design-partner customer, or headcount to continue? "Thanks for watching" wastes the last slide.

**3. Is 8D Copilot deployed to SAP BTP and working?** The agenda says the six teams demo live on BTP. If the demo will run on localhost, that is worth knowing now — it affects Technical Execution and Effective Use of Technology, and it changes the rehearsal plan.

# Open questions — non-blocking

**4. Demo case.** `8D-10048291` (Q3 internal defect) has the strongest Is/Is-Not evidence — 3/4 vs 0/3 nonconforming, real lot IDs, consistent with D4's own citation — and matches your registered scope, which the rules deck records as *"for internal defects."* `8D-10048651` (Q1 customer complaint) is the only one that exercises the Customer Summary. **Recommendation: demo 8D-10048291, and show the Customer Summary from a pre-loaded Q1 report in Tab B** — you get both without a second full run.

**5. Team credit.** Six presenters, one slot. Does the team get named on S1?
