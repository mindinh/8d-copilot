# What the other teams are doing — and where 8D Copilot should stand

**Sources read:** DEVI Blink *Customer Success Agent* (PDF, ~10 slides) · Team Coming Soon *SupplierPath* (29 slides) · Team B-YOND *PRISM* (9 slides)
**Purpose:** find the house pattern, find the gaps in our deck, find our wedge. **Not** to copy.

---

## 1. The house pattern

Three decks, three different products, and the same skeleton underneath:

| Beat | DEVI Blink | SupplierPath | PRISM | **Us (submitted deck)** |
|---|---|---|---|---|
| Title + one-line positioning | ✅ | ✅ | ✅ | ✅ |
| **Team slide** | ✅ named, incl. advisors | — | — | ❌ |
| **Agenda / TOC** | ✅ 5 items | ✅ 6 items | ✅ 6 items | ❌ |
| Problem, quantified | ✅ **external cited stats** | ✅ AS-IS 9-step chain | ✅ 5 challenge bullets | ⚠️ qualitative only |
| Solution in one frame | ✅ IS → BE | ✅ Understand/Guide/Validate | ✅ Challenge↔Solution | ✅ |
| **Business Value slide** | ✅ "Why us" | ✅ Today → With X | ✅ its own section | ❌ |
| How it works / pipeline | ✅ | ✅ INPUT→PROCESS→OUTPUT | ✅ agentic loop | ✅ |
| **Demo section divider + journey map** | ✅ | ✅ 9 steps, YOU DO / AI DOES | ✅ numbered 1–6 | ❌ |
| Architecture | ✅ | ✅ ×2 slides | ✅ | ✅ |
| Guardrails / "never does" | ✅ two columns | ✅ | ✅ | ✅ |
| **Roadmap with dates** | ✅ timeline | ✅ | ✅ **Q3-26 → Q3-27** | ⚠️ Now/Next/Then/Later, no dates |
| Appendix for Q&A | — | ✅ explicit | — | ❌ |

**Six things everyone else has that we don't:** agenda, team slide, business-value slide, demo journey map, dated roadmap, appendix.

Of those, only three are worth the minutes in a 10-minute slot: **business value**, **demo journey map**, **dated roadmap**. An agenda slide in a 10-minute talk spends 20 seconds telling people what you're about to tell them — DEVI Blink and PRISM can afford it, we can't. Skip it.

---

## 2. The three devices worth borrowing (adapted, not copied)

**A. DEVI Blink's cited external stats.** Their problem slide runs hard numbers with sources named on the slide — ITIC 2025, Uptime Institute 2025, Oxford Economics — under the line *"This money is already lost. Your books record it as normal operations."* That reframing is the strongest single move in any of the three decks: it converts an operational nuisance into a bill already being paid.

→ **For us:** this solves my open question about a business-value number. We don't need a customer's figure — we need **cost-of-poor-quality research**, cited on the slide. And we have a bonus the others don't: our own demo case carries a real `costCopq` field (**€8,600** on 8D-10048651). One case, one number, on screen, in the live app. *Needs sourcing work — see the open item at the end.*

**B. SupplierPath's "IN THE MVP" vs "TARGET FLOW" badges.** Every walkthrough slide carries one badge or the other, and slide 19 is titled *"Prototype Proof: What Judges Can Try."* They never blur what's built with what's planned, and they say so on every single slide rather than in one apologetic footnote.

→ **For us:** better than our current approach, which buries limitations in a paragraph on the last slide. Put a small **BUILT / NEXT** badge on the demo journey map so honesty is structural, not a confession. Technical Execution (20%) is scored on how far the demo runs — being visibly precise about the boundary reads as confidence.

**C. PRISM's numbered demo journey.** Their slide 7 is a 6-step map — Connect → Define → Validate → Explain → Remediate → Correct — shown *before* the live demo so the audience knows the shape of what they're about to watch.

→ **For us:** we have the same need and a harder demo to follow (eight disciplines, a blind diagnosis, two summaries). A numbered map before the demo is worth 30 seconds. It also doubles as the fallback slide if the live app fails.

---

## 3. What we do better — and must not bury

**Independent validation.** None of the other three has anything like 8D-2612: our AI, with no access to Galileon's published answer, independently named the same fixture. SupplierPath proves *"the flow runs end to end."* PRISM proves *"the rules generate."* We can prove **the reasoning is correct against an external ground truth.** That is a different and higher class of evidence, and it is currently slide 9 of 10 in our deck — nearly last.

**Citation per statement.** Ours is the only deck where every generated sentence carries the source record.

---

## 4. The positioning wedge ★ the most useful thing in this analysis

Line the six products up by what the AI actually *does*:

| Team | What their AI does | Verb |
|---|---|---|
| DEVI Blink — Customer Success Agent | watches systems, flags problems early | **detects** |
| Coming Soon — SupplierPath | knows the rules, points to the field | **guides** |
| BigBOM — Smart-BOM | catches BOM errors on entry | **validates** |
| L.L.M — CLAIR Mail | reads an email, proposes actions | **suggests** |
| B-YOND — PRISM | checks master data, explains, proposes fixes | **validates** |
| **Friends of Bugs — 8D Copilot** | **works out why it broke, then proves it wasn't told** | **reasons** |

**Four of the other five are checking or guiding. We are the only team whose AI reaches a conclusion and then submits to a test of whether that conclusion was independently derived.** That is the Innovation argument (30%), and it is stronger stated as a contrast than stated alone.

Two consequences:

1. **Human-in-the-loop is now table stakes, not a differentiator.** DEVI Blink has *"Nothing runs until this step: Human Approve."* SupplierPath has *"No silent SAP writes."* PRISM has *"Human Approval."* Our current slide 7 is a whole slide on exactly this. By slot 4 the room will have heard it twice already. **Demote it to one line inside another slide.** Keep the promise, lose the slide.

2. **We present 4th, after three deck-heavy pitches.** Slots 1–3 are DEVI Blink, SupplierPath, BigBOM. The room will have sat through roughly 45 minutes and three architecture diagrams before we open our mouth. Attention is the scarce resource in slot 4, not information.
   → **Open cold with the live app, not with slides.** Every other team opens with a title and an agenda. Starting on a running screen at second zero is the cheapest possible way to be the one they remember at 10:45 when Audience Choice is voted.

---

## 5. Length calibration

SupplierPath's 29 slides cannot fit in 10 minutes — that deck is built for the judges to *read*, which is consistent with the rules ("judges read your one-pager, not your deck"). PRISM's 9 and DEVI Blink's 10 are presentation decks.

Our submitted deck has 10 dense slides, and 10 is the right ballpark **only if the demo is short**. It isn't — our demo is the product. So: **6 slides shown, 4 held as appendix.**

---

## 6. Revised recommendation for our structure

Changed from the previous draft in three ways, all driven by the above:

| # | Slide | Why | Change |
|---|---|---|---|
| — | **Cold open — live app on screen** | Slot 4, attention-starved room; nobody else does this | **NEW** |
| 1 | Hook — the blind-diagnosis promise | Innovation 30% | promoted from a sub-bullet |
| 2 | **The bill you're already paying** — COPQ, cited + €8,600 live | Business Value 30%; borrowed reframing from DEVI Blink | **NEW** |
| 3 | What we built + **demo journey map** with BUILT/NEXT badges | orientation before the demo; borrowed from PRISM + SupplierPath | **NEW**, merges old 3+4 |
| — | **LIVE DEMO ~5:30** | Technical Execution 20% | the centre |
| 4 | Why it holds up — similarity engine, refuses to guess *(+ one line on human-in-the-loop)* | old slides 6+7 merged; HITL demoted to a line | merged |
| 5 | Proof + BTP stack | 8D-2612 promoted; Effective Use of Tech 10% | old 8+9 merged, **9 promoted** |
| 6 | Dated roadmap + the ask | borrowed dating discipline from PRISM | old 10, add dates |

**Appendix (jump targets):** full D1–D8 grid · full similarity weights + worked example · Is/Is-Not detail · human-in-the-loop guarantees.

---

## Open items this analysis creates

1. **Source the COPQ statistic for S2.** DEVI Blink cited three research houses. We need the equivalent for cost of poor quality / quality-failure cost in manufacturing, sourced properly. **This is research I can do — say the word.** Until then S2 has a hole in it.
2. **Decide the cold open.** It is the highest-upside and highest-risk choice in this document. It only works if the app is up and rehearsed. Your call.
3. **Team slide?** DEVI Blink named theirs, including Stefan Bäumler as Business Advisor — and Stefan gives the opening speech. Whether that matters politically is your judgement, not mine. Costs ~15 seconds we don't have; could go in the appendix instead.
