# 8D Copilot — Deck Spec & Demo Script

**Slot:** 10 min · ConaSpark Demo Day, Fri 04 Sep 2026 · Team Friends of Bugs · position 4 of 6
**Opening:** Taste A — *the second opinion*
**Language rule:** full plain English. **Assume nobody in the room has ever seen an 8D.**
**Structure:** cold open → 6 slides → live demo at the centre → 4 appendix slides
**Companion docs:** [BENCHMARK.md](BENCHMARK.md) (why this structure) · [STORYLINE.md](STORYLINE.md) (timing, risks, build plan)

> **Status: content proposal. Nothing built.** Written to be spoken and to be read off a slide — redline it.

---

## The rule that governs every word below

**One frame, used everywhere: a second opinion is only worth something if the second doctor hasn't read the first one's notes.**

It is not decoration. It maps to the product all the way down:

| Your feature | How it's said |
|---|---|
| The 8D report | Working out why something broke and proving it won't happen again — written down |
| Independent diagnosis | A **blinded** second opinion |
| The agreement verdict | Two doctors disagreeing isn't a failure — it's the reason you asked |
| Precedent search | "Have we seen this before?" |
| Score below 3 → no result | A good doctor says *I don't know yet* instead of guessing |
| Source citations | Showing the test results, not just the diagnosis |

## Plain-English dictionary — apply to every slide and every spoken line

| Never say | Say |
|---|---|
| 8D | **the investigation report** (define once, then "the report") |
| Ishikawa | **cause categories** |
| 5-Why | **the chain of whys** |
| Is / Is-Not | **where it happens — and where it doesn't** |
| Containment action | **stop it now** |
| Corrective action | **fix the cause** |
| Preventive action | **stop it coming back** |
| Precedent / precedent search | **past cases** · "has this happened before?" |
| FMEA | **the risk register** |
| Notification | **the defect record** |
| Work center | **the production line** *(gloss once, then use freely)* |
| QALS / QAMR | **real inspection history from SAP** |
| Cp / Cpk | **some of the statistics** |
| COPQ | **the cost of getting it wrong** |

**Translate every number you say out loud.** The precision belongs on screen; the meaning belongs in your mouth.

| On screen | In your mouth |
|---|---|
| `1.45 sccm` vs `max 0.20 sccm` | "leaking **more than seven times** the allowed rate" |
| `1.85 µm` vs `max 0.80 µm` | "the sealing surface is **twice as rough** as it's allowed to be" |
| `0,32mm` vs `max 0,10mm` | "the burr is **three times taller** than allowed" |
| `7 / 11` | "seven points out of eleven" |

---

# THE DECK

| | Segment | Time | Running |
|---|---|---|---|
| — | Cold open — app on screen | 0:38 | 0:38 |
| S1 | What it is | 0:27 | 1:05 |
| S2 | What it's worth ★NEW | 0:50 | 1:55 |
| S3 | The eight steps + what you're about to watch | 0:30 | 2:25 |
| — | **LIVE DEMO** | 5:30 | 7:55 |
| S4 | Why it holds up | 0:45 | 8:40 |
| S5 | Proof + what it runs on | 0:35 | 9:15 |
| S6 | Where it goes + the ask | 0:45 | 10:00 |

---

## COLD OPEN · `0:00 – 0:38` · no slide, app on screen

**On screen:** the finished report, already open. Two seconds of silence before you speak.

> "When something goes wrong in a factory — a part fails, a customer complains — someone has to work out **why** it happened, and prove it won't happen again.
>
> That investigation is a document. It takes an engineer days to write.
>
> This one took forty seconds.
>
> *(pause — let them look)*
>
> But speed isn't what I want you to judge. Anything can generate text quickly. The question that matters is: **how do you know it's right?**
>
> When you get a serious diagnosis, you ask for a second opinion. And a second opinion is only worth something if the second doctor **hasn't read the first one's notes**.
>
> That's what we built. Let me show you."

*Do not say "8D" yet. Do not say any number yet. The first 38 seconds buy attention and set the criterion — nothing else.*

---

## S1 · What it is · `0:38 – 1:05`

**Headline:** 8D Copilot
**Sub:** The investigation writes itself — with the evidence attached
**Chips:** SAP CAP + React · SAP BTP · Team Friends of Bugs

**Say:**
> "The document has a name — an 8D report. Eight steps, from *who investigates* through to *how we stop it coming back*. It's the standard in manufacturing quality, and every one of them starts as a blank page.
>
> The engineer fills it by hand, pulling data from six different screens. Days of collecting before any thinking starts.
>
> 8D Copilot writes the first draft of all eight steps from the factory's own data, shows you where every sentence came from, and hands each one back to the engineer to accept or throw away. **It never signs anything off itself.**"

*That last sentence is your entire human-in-the-loop story. One line. Teams 1 and 2 will each spend a full slide on it — you don't need to.*

---

## S2 · What it's worth · `1:05 – 1:55` ★ NEW SLIDE

**30% of your score, and it does not currently exist.** Name the user, name the task, attach a number.

**Headline:** You're already paying for this. It just isn't on a line item.
**Sub:** The investigation is what stops a defect coming back. It's also the slowest thing the quality team does.

| Who | What it costs them today | What changes |
|---|---|---|
| **The quality engineer** — in the tool every day | Days of collecting from separate screens before the thinking starts | Every step arrives drafted, with its sources. They edit instead of facing a blank page. |
| **Their manager**, who signs it off | Depth depends on who wrote it. The version sent to the customer is retyped by hand — and internal detail leaks. | One shape every time. Both versions written from one case. |
| **The factory** | The same machine gets diagnosed from scratch, over and over. The answer is in a closed file nobody can search. | Every closed investigation becomes searchable — automatically, on every new defect. |

**Number strip:**
- `[  ]` what poor quality costs manufacturers, as a share of revenue — ⚠️ **needs a source**
- `[  ]` engineer-days per investigation — ⚠️ **needs a source or your own figure**
- **€8,600** — the cost recorded against one single defect in our own data *(real: `costCopq` on case 8D-10048651)*

**Say:**
> "This is already being paid for. It just gets booked as normal operations."

---

## S3 · The eight steps, and what you're about to watch · `1:55 – 2:25`

**Headline:** Eight steps. One pipeline. Two ways in.
**Sub:** A defect we found ourselves, or a complaint from a customer — both run the same way.

**Top half — the eight steps in plain English** *(real names in small grey type underneath, once)*:

| | Step | |
|---|---|---|
| 1 | **Who investigates** | picked from who handled similar cases before |
| 2 | **What exactly went wrong** | written up, plus where it happens and where it doesn't |
| 3 | **Stop it now** | the immediate action, reused from a past case |
| 4 | **Why it happened** | the cause — plus a second opinion, taken blind |
| 5 | **Fix the cause** | the permanent fix |
| 6 | **Check the fix worked** | no drafting — just the list and its status |
| 7 | **Stop it coming back** | flagged against the risk register |
| 8 | **Close it** | won't close until steps 1–7 are done, and records what we learned |

**Bottom half — the demo map, numbered, each badged `LIVE` or `NEXT`:**

1. A defect from this morning — nothing but a symptom and two measurements · `LIVE`
2. Has this happened before? · `LIVE`
3. The second opinion — taken without the engineer's notes · `LIVE`
4. All eight steps drafted, every line sourced · `LIVE`
5. The same defect, as real messy factory data · `LIVE`
6. A defect nothing has ever seen before · `LIVE`

**Say:** "Six things, in that order." Then go to the app. *Thirty seconds — this is orientation, not content.*

---

# LIVE DEMO · `2:25 – 7:55` · 5 minutes 30

Three acts that escalate: **it works** → **it survives reality** → **it knows when to stop.**

### Act 1 — It works · `2:25 – 4:55` (2:30)

| # | Time | Screen | Say |
|---|---|---|---|
| **1 · The empty case** | 0:35 | the fuel regulator case | "A fuel valve failed its leak test this morning. 145 units pulled from the line. Here's everything the engineer has: it's **leaking more than seven times** the allowed rate, and the sealing surface is **twice as rough** as it should be. That's it. No cause. No chain of whys. Nobody has investigated anything. This is what day one actually looks like." |
| **2 · Start it** | 0:15 | Analyze → Start | "One click." **Then switch to the pre-warmed tab. Never watch the spinner.** |
| **3 · How it works** *(talk track)* | 0:30 | 4-step diagram | "Four steps. It reads the case → it forms its own opinion → it writes the report → it checks its own work. Each step runs on its own model, on SAP's AI platform." |
| **4 · The second opinion** ★ | 0:40 | reasoning panel + verdict | **The climax.** "It got there from two measurements and the library of past cases. And when a case *does* already have the engineer's conclusion in it — **we cut it out before we ask.** Then we compare. Agreement is a tick. *(point at verdict)* And **disagreement isn't a failure — it's the whole reason you asked for a second opinion.** That's the case telling you to look again." |
| **5 · Show your working** | 0:30 | scroll steps 1→8, stop on step 4 | "Every line points back to the record it came from. Nothing in here is unattributable — it shows you the test results, not just the diagnosis." |

### Act 2 — It survives reality · `4:55 – 6:10` (1:15) ★ the strongest 75 seconds in the talk

| # | Time | Screen | Say |
|---|---|---|---|
| **6 · Messy data** | 1:15 | dirty case, then both reports side by side | "Everything so far ran on tidy data. Real factory data is not tidy. **This is the same defect** — same worn tool, same measurement — as a real plant actually records it. *(point as you go)* The description is German shorthand. The measurement isn't in a field at all, it's inside a sentence. That's a **comma** where the decimal point should be. The limit is a dash — someone wrote *see drawing* instead of a number. The box marking the cause is a lowercase x. The chain of whys stops after one step. **Software written by hand dies right here.** *(show both)* Same cause, both times. **That's why this needs AI and not a script.**" |

*If this doesn't reproduce in rehearsal, cut the act and take back 75 seconds. Don't soften it into a claim you can't show.*

### Act 3 — It knows when to stop · `6:10 – 7:10` (1:00)

| # | Time | Screen | Say |
|---|---|---|---|
| **7 · Nothing like it** | 0:35 | issue-C welding case | "New production line, new part, new fault — nothing in the library resembles it. Watch. *(show)* **'No past case found.'** It scored every closed file, nothing scored high enough, and it says so. It doesn't hand you the closest match and hope. A good doctor says *I don't know yet*." |
| **8 · Nothing to compare** | 0:25 | Is/Is-Not on a visual defect | "Same idea. A scratch has nothing to measure, so there's nothing to compare against — and it says **not applicable** rather than inventing a comparison." |

### Act 4 — You can change how it thinks · `7:10 – 7:55` (0:45) — **overflow valve, cut first**

| # | Time | Screen | Say |
|---|---|---|---|
| **9 · Settings, not code** | 0:45 | AI Settings → step 4 instructions; matching weights | "An admin changes how the AI behaves — what it's told to look for, how much a matching production line counts. In the screen. No developer, no redeployment." |

**Cut order if long:** Act 4 → beat 8 → beat 5. **Beats 4 and 6 are untouchable.**

---

## S4 · Why it holds up · `7:55 – 8:40`

**Headline:** It would rather say nothing than guess
**Sub:** One way of asking "have we seen this before?" — used by five of the eight steps.

**How a past case is scored:**
- same production line **+4**
- same fault code **+4** *(similar wording +2)*
- same part **+3** *(same family +1)*
- descriptions that mean the same thing **+3** *(off by default)*

**Biggest type on the slide:**
> **Under 3 points, it says "no past case found." It never fills the gap with a guess.**

**Worked example:** two real cases — same production line +4, same part +3, different fault → **7 out of 11.**

**Footer:** Every number here is editable in the settings screen. And every suggestion is accepted, edited or rejected by a person — the file can't close until they say so.

---

## S5 · Proof, and what it runs on · `8:40 – 9:15`

**Headline:** We tested it against an answer we didn't have
**Sub:** Another company published a real investigation. We gave our AI the same data — and not their conclusion.

**Front and centre:**
> With no access to the published answer, it independently pointed at **the same fixture the published case names.**

**Smaller, beneath:**
- On a second case, it names the machine that fails 3 lots out of 4 against the one that fails 0 out of 3 — matching the cause the engineers recorded themselves
- On a case with nothing measurable, it declines to answer
- **940 automated tests across 30 suites**, both type checkers clean *(2026-09-02)*

**Stack strip along the bottom:** React · SAP CAP on BTP Cloud Foundry · SAP AI Core — and every part of the AI's behaviour editable in the settings screen

*A strip, not a slide. Technology is 10% of the score — don't spend 10% of the talk on it.*

---

## S6 · Where it goes, and what we want · `9:15 – 10:00`

**Headline:** From one factory's investigations to the factory's memory

| When | What |
|---|---|
| **Today** | Both ways in, all eight steps, settings live. Tested against an outside case we couldn't see the answer to. |
| **Q4 2026** | Plug into real inspection history from SAP instead of our sample data |
| **Q1 2027** | Run it at one plant, tuned against that plant's own closed files |
| **Q2 2027** | Turn on meaning-based matching; warn other open cases that share the same cause |

**Smaller type — say it before a judge asks:**
> Who-was-on-the-team history is reconstructed, not real records. Some of the statistics are calculated rather than read from SAP. The where-it-happens comparison needs machines tracked individually.

**The ask:** ⚠️ `[ still open — see below ]`

**Close:**
> "Every investigation this factory has ever closed is the answer to a problem it's going to have again. Right now nobody can find it. That's what we built."

---

# APPENDIX — jump targets, not presented

| | Slide | Jump when asked |
|---|---|---|
| A1 | All eight steps in full detail | "What exactly does each step produce?" |
| A2 | Where-it-happens comparison in full — the two machines, the lot IDs | "How does that comparison actually work?" |
| A3 | Tidy vs messy data, field by field | "How bad does the data get?" |
| A4 | Architecture + guardrails | "How do you stop it making things up?" · "How is it deployed?" |

**Rehearse this one — you will get it:**
> *"Isn't it just agreeing with the engineer because it read their answer?"*
> Two answers, in this order. **One:** on the case I demoed there was no answer to read — the cause and the chain of whys were both empty. **Two:** the published case — we had no access to their conclusion and it named the same fixture.

---

# Open items

**1. The two numbers on S2.** DEVI Blink cite three research houses by name on their problem slide. You currently have no outside evidence, on the slide carrying 30% of your score. **I can research and source this properly — say the word.** I won't invent figures. Without them, S2 runs on the named users and the real €8,600 alone: honest, weaker.

**2. The ask on S6.** One plant, one quarter, real closed files? Something else? Ending on "thank you" wastes your last slide.

# Must be verified before it goes on a slide

I've read the data files and the READMEs. **I have not run the app.** Three claims below are stated as *expectations* in your own documentation, not observed behaviour:

- [ ] The empty fuel-regulator case actually produces a full, sourced report
- [ ] Tidy and messy versions actually reach the **same** cause — *Act 2 dies without this*
- [ ] The welding case actually returns "no past case found" — *Act 3 dies without this*
- [ ] The €8,600 figure is visible in the UI, not only in the JSON
- [ ] End-to-end run time — over 60 seconds means beat 3's talk track needs to be longer

Running the app and checking these is the highest-value next step.
