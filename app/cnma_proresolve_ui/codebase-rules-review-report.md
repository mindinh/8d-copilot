# Codebase Rules & Styling Review Report

Generated at: 2026-08-14T08:36:35.830Z

This report lists all detected codebase violations based on the zero-tolerance styling and component rules.

## §0 Hardcoded Pixels (`[10px]`, `w-[180px]`) (0 issues)

🎉 **No issues found in this category!**

---

## §0 Hardcoded Hex Colors (`[#ffffff]`) (0 issues)

🎉 **No issues found in this category!**

---

## §0 Raw Tailwind Colors (`bg-red-500`, `text-blue-500`) (0 issues)

🎉 **No issues found in this category!**

---

## §0 Raw HTML Component Primitives (`<button>`, `<input>`) (0 issues)

🎉 **No issues found in this category!**

---

## §0 Inline Styles (`style={{ ... }}`) (0 issues)

🎉 **No issues found in this category!**

---

## §0 Local Status/Color Mappings (0 issues)

🎉 **No issues found in this category!**

---

## §6 i18n / Hardcoded UI Text (198 issues)

### File: `src/components/common/error-boundary.tsx`
- [ ] **Line 41**: Hardcoded JSX Text: "Something went wrong" ``` Something went wrong ```
- [ ] **Line 48**: Hardcoded JSX Text: "Refresh Page" ``` Refresh Page ```

### File: `src/components/layouts/main-layout.tsx`
- [ ] **Line 268**: Hardcoded attribute [title]: "User Preferences" ``` title="User Preferences" ```

### File: `src/pages/ai-settings/criterion-step-card.tsx`
- [ ] **Line 80**: Hardcoded JSX Text: "Step" ``` Step ```
- [ ] **Line 85**: Hardcoded attribute [placeholder]: "e.g. Work centre" ``` placeholder="e.g. Work centre" ```
- [ ] **Line 117**: Hardcoded JSX Text: "Weight" ``` Weight ```
- [ ] **Line 151**: Hardcoded JSX Text: "Compare field" ``` Compare field ```
- [ ] **Line 151**: Hardcoded JSX Text: "(on both cases)" ``` (on both cases) ```
- [ ] **Line 158**: Hardcoded attribute [placeholder]: "Pick a column" ``` placeholder="Pick a column" ```
- [ ] **Line 174**: Hardcoded JSX Text: "Reads from" ``` Reads from ```
- [ ] **Line 174**: Hardcoded JSX Text: "(shown on the criteria list)" ``` (shown on the criteria list) ```
- [ ] **Line 178**: Hardcoded attribute [placeholder]: "e.g. HistoricalCases · GD 4 WorkCenters" ``` placeholder="e.g. HistoricalCases · GD 4 WorkCenters" ```
- [ ] **Line 184**: Hardcoded JSX Text: "Free text — it tells the next person which data this step depends on." ``` Free text — it tells the next person which data this step depends on. ```
- [ ] **Line 198**: Hardcoded JSX Text: "Minimum cosine (0–1)" ``` Minimum cosine (0–1) ```
- [ ] **Line 211**: Hardcoded JSX Text: "Two unrelated manufacturing write-ups already sit around 0.60 — they are
                                all English defect narratives. A floor below that scores every pair and
                                lets the baseline decide the ranking. Measure before changing it:" ``` Two unrelated manufacturing write-ups already sit around 0.60 — they are
                           ```
- [ ] **Line 234**: Hardcoded JSX Text: "Fallback when the main match misses" ``` Fallback when the main match misses ```
- [ ] **Line 241**: Hardcoded JSX Text: "Method" ``` Method ```
- [ ] **Line 249**: Hardcoded JSX Text: "Exact" ``` Exact ```
- [ ] **Line 250**: Hardcoded JSX Text: "Keyword" ``` Keyword ```
- [ ] **Line 251**: Hardcoded JSX Text: "Family (same group)" ``` Family (same group) ```
- [ ] **Line 256**: Hardcoded JSX Text: "Field" ``` Field ```
- [ ] **Line 262**: Hardcoded attribute [placeholder]: "Pick a column" ``` placeholder="Pick a column" ```
- [ ] **Line 271**: Hardcoded JSX Text: "Weight" ``` Weight ```
- [ ] **Line 286**: Hardcoded JSX Text: "Off — this step scores its full weight or nothing." ``` Off — this step scores its full weight or nothing. ```
- [ ] **Line 292**: Hardcoded JSX Text: "The fallback is only tried when the main match fails. The two never add
                                up — that would break the maximum score." ``` The fallback is only tried when the main match fails. The two never add
                            ```

### File: `src/pages/ai-settings/general-settings-tab.tsx`
- [ ] **Line 76**: Hardcoded JSX Text: "Loading configuration…" ``` Loading configuration… ```
- [ ] **Line 86**: Hardcoded JSX Text: "Model per processing step" ``` Model per processing step ```
- [ ] **Line 100**: Hardcoded JSX Text: "Raw configuration (JSON)" ``` Raw configuration (JSON) ```
- [ ] **Line 102**: Hardcoded JSX Text: "For keys that have no dedicated field above — for example" ``` For keys that have no dedicated field above — for example ```
- [ ] **Line 103**: Hardcoded JSX Text: "maxIterations" ``` maxIterations ```
- [ ] **Line 103**: Hardcoded JSX Text: "or" ``` or ```
- [ ] **Line 104**: Hardcoded JSX Text: "&lt;activity&gt;ThinkingBudget" ``` &lt;activity&gt;ThinkingBudget ```
- [ ] **Line 104**: Hardcoded JSX Text: ".
                            Editing here and editing above change the same data." ``` .
                            Editing here and editing above change the same data. ```
- [ ] **Line 121**: Hardcoded JSX Text: "Discard" ``` Discard ```

### File: `src/pages/ai-settings/index.tsx`
- [ ] **Line 25**: Hardcoded JSX Text: "AI Settings" ``` AI Settings ```
- [ ] **Line 27**: Hardcoded JSX Text: "Choose which model runs each processing step, and manage the model registry
                    synced from SAP AI Core." ``` Choose which model runs each processing step, and manage the model registry
                    syn ```
- [ ] **Line 39**: Hardcoded JSX Text: "General Settings" ``` General Settings ```
- [ ] **Line 46**: Hardcoded JSX Text: "Similarity" ``` Similarity ```
- [ ] **Line 53**: Hardcoded JSX Text: "Step Prompts" ``` Step Prompts ```
- [ ] **Line 60**: Hardcoded JSX Text: "Model Registry" ``` Model Registry ```

### File: `src/pages/ai-settings/similarity-tab.tsx`
- [ ] **Line 107**: Hardcoded JSX Text: "Loading retrieval configuration…" ``` Loading retrieval configuration… ```
- [ ] **Line 120**: Hardcoded JSX Text: "Visual editor" ``` Visual editor ```
- [ ] **Line 126**: Hardcoded JSX Text: "JSON" ``` JSON ```
- [ ] **Line 129**: Hardcoded JSX Text: "Maximum reachable score" ``` Maximum reachable score ```
- [ ] **Line 137**: Hardcoded JSX Text: "Configuration as JSON" ``` Configuration as JSON ```
- [ ] **Line 139**: Hardcoded JSX Text: "Read-only. Useful for pasting into a ticket or comparing two environments —
                            edit through the visual editor so every change goes through validation." ``` Read-only. Useful for pasting into a ticket or comparing two environments —
                        ```
- [ ] **Line 160**: Hardcoded JSX Text: "Matching pipeline" ``` Matching pipeline ```
- [ ] **Line 163**: Hardcoded JSX Text: "Every past case is scored against the open one, step by step.
                                        Unlike a waterfall," ``` Every past case is scored against the open one, step by step.
                                      ```
- [ ] **Line 164**: Hardcoded JSX Text: "all" ``` all ```
- [ ] **Line 164**: Hardcoded JSX Text: "steps run and their points add
                                        up — order only changes how the breakdown reads." ``` steps run and their points add
                                        up — order only changes how  ```
- [ ] **Line 187**: Hardcoded JSX Text: "Add step" ``` Add step ```
- [ ] **Line 196**: Hardcoded JSX Text: "No matching steps" ``` No matching steps ```
- [ ] **Line 198**: Hardcoded JSX Text: "Without a step nothing scores, and no precedent is ever shown." ``` Without a step nothing scores, and no precedent is ever shown. ```
- [ ] **Line 222**: Hardcoded JSX Text: "Turning a step off lowers the maximum score too, not just the score —
                                so 5 out of 8 still reads as a strong match." ``` Turning a step off lowers the maximum score too, not just the score —
                              ```
- [ ] **Line 231**: Hardcoded JSX Text: "Threshold and result size" ``` Threshold and result size ```
- [ ] **Line 233**: Hardcoded JSX Text: "Below the threshold nothing is shown at all. That is deliberate: a weak
                                precedent is worse than none, because it gets cited as if it meant something." ``` Below the threshold nothing is shown at all. That is deliberate: a weak
                            ```
- [ ] **Line 239**: Hardcoded JSX Text: "Minimum score" ``` Minimum score ```
- [ ] **Line 252**: Hardcoded JSX Text: "out of" ``` out of ```
- [ ] **Line 256**: Hardcoded JSX Text: "Precedents to show" ``` Precedents to show ```
- [ ] **Line 279**: Hardcoded JSX Text: "Closed cases only" ``` Closed cases only ```
- [ ] **Line 281**: Hardcoded JSX Text: "An open case has no verified outcome to learn from" ``` An open case has no verified outcome to learn from ```
- [ ] **Line 299**: Hardcoded JSX Text: "Restore defaults" ``` Restore defaults ```
- [ ] **Line 316**: Hardcoded JSX Text: "of" ``` of ```
- [ ] **Line 326**: Hardcoded JSX Text: "case" ``` case ```
- [ ] **Line 326**: Hardcoded JSX Text: "cannot be matched by the vector step" ``` cannot be matched by the vector step ```
- [ ] **Line 371**: Hardcoded JSX Text: "Score two cases" ``` Score two cases ```
- [ ] **Line 373**: Hardcoded JSX Text: "Runs the pipeline above against two cases from the library, without starting an
                        analysis. Use it to see what a weight change actually does." ``` Runs the pipeline above against two cases from the library, without starting an
                    ```
- [ ] **Line 380**: Hardcoded JSX Text: "Case A" ``` Case A ```
- [ ] **Line 382**: Hardcoded attribute [placeholder]: "Pick a case" ``` placeholder="Pick a case" ```
- [ ] **Line 393**: Hardcoded JSX Text: "Case B" ``` Case B ```
- [ ] **Line 395**: Hardcoded attribute [placeholder]: "Pick a case" ``` placeholder="Pick a case" ```
- [ ] **Line 420**: Hardcoded JSX Text: "Score" ``` Score ```
- [ ] **Line 448**: Hardcoded JSX Text: "Step" ``` Step ```
- [ ] **Line 449**: Hardcoded JSX Text: "Match" ``` Match ```
- [ ] **Line 450**: Hardcoded JSX Text: "Matched on" ``` Matched on ```
- [ ] **Line 451**: Hardcoded JSX Text: "Points" ``` Points ```

### File: `src/pages/ai-settings/step-prompts-tab.tsx`
- [ ] **Line 95**: Hardcoded JSX Text: "Loading step prompts…" ``` Loading step prompts… ```
- [ ] **Line 104**: Hardcoded JSX Text: "Discipline" ``` Discipline ```
- [ ] **Line 105**: Hardcoded JSX Text: "Pick a step to edit its prompt." ``` Pick a step to edit its prompt. ```
- [ ] **Line 126**: Hardcoded attribute [title]: "Custom prompt configured" ``` title="Custom prompt configured" ```
- [ ] **Line 159**: Hardcoded JSX Text: "Enabled" ``` Enabled ```
- [ ] **Line 166**: Hardcoded JSX Text: "Guidance for this discipline" ``` Guidance for this discipline ```
- [ ] **Line 169**: Hardcoded JSX Text: "DISCIPLINE GUIDE" ``` DISCIPLINE GUIDE ```
- [ ] **Line 169**: Hardcoded JSX Text: ".
                                The rules that stop the model inventing facts — grounding, citing
                                sources, admitting gaps — live in the code and are not editable here." ``` .
                                The rules that stop the model inventing facts — grounding, citing ```
- [ ] **Line 177**: Hardcoded attribute [placeholder]: "Empty — the guidance from srv/src/domain/eightd/prompts.ts is used." ``` placeholder="Empty — the guidance from srv/src/domain/eightd/prompts.ts is used." ```
- [ ] **Line 205**: Hardcoded JSX Text: "Restore code defaults" ``` Restore code defaults ```
- [ ] **Line 209**: Hardcoded JSX Text: "Unsaved changes" ``` Unsaved changes ```
- [ ] **Line 217**: Hardcoded JSX Text: "Discard" ``` Discard ```

### File: `src/pages/eight-d/analyze-dialog.tsx`
- [ ] **Line 188**: Hardcoded JSX Text: "Analyze from JSON" ``` Analyze from JSON ```
- [ ] **Line 190**: Hardcoded JSX Text: "Paste the JSON of one SAP QM defect case. The AI extracts the verified facts
                        and drafts all eight disciplines." ``` Paste the JSON of one SAP QM defect case. The AI extracts the verified facts
                       ```
- [ ] **Line 215**: Hardcoded JSX Text: "Upload file" ``` Upload file ```
- [ ] **Line 220**: Hardcoded JSX Text: "Clear" ``` Clear ```
- [ ] **Line 226**: Hardcoded JSX Text: "Case" ``` Case ```
- [ ] **Line 226**: Hardcoded JSX Text: "KB" ``` KB ```
- [ ] **Line 233**: Hardcoded JSX Text: "Or start from an incoming issue" ``` Or start from an incoming issue ```
- [ ] **Line 235**: Hardcoded JSX Text: "Freshly logged cases — symptom and context only, no root cause, no
                                actions, no team. That is what the Copilot is for." ``` Freshly logged cases — symptom and context only, no root cause, no
                                 ```
- [ ] **Line 269**: Hardcoded attribute [placeholder]: "{ "notificationId": "8D-10048412", "symptomShortText": "…", "inspections": [ … ] }" ``` placeholder='{ "notificationId": "8D-10048412", "symptomShortText": "…", "inspections": [ … ] }' ```
- [ ] **Line 283**: Hardcoded JSX Text: "Sample datasets live in" ``` Sample datasets live in ```
- [ ] **Line 283**: Hardcoded JSX Text: "mock-data/" ``` mock-data/ ```
- [ ] **Line 283**: Hardcoded JSX Text: "in the repository." ``` in the repository. ```
- [ ] **Line 293**: Hardcoded JSX Text: "Cancel" ``` Cancel ```

### File: `src/pages/eight-d/detail.tsx`
- [ ] **Line 95**: Hardcoded JSX Text: "Loading report…" ``` Loading report… ```
- [ ] **Line 104**: Hardcoded JSX Text: "Could not load this report" ``` Could not load this report ```
- [ ] **Line 109**: Hardcoded JSX Text: "Back to list" ``` Back to list ```
- [ ] **Line 129**: Hardcoded JSX Text: "8D Reports" ``` 8D Reports ```
- [ ] **Line 143**: Hardcoded JSX Text: "Source JSON" ``` Source JSON ```
- [ ] **Line 152**: Hardcoded JSX Text: "Re-analyze" ``` Re-analyze ```
- [ ] **Line 161**: Hardcoded JSX Text: "Analysis in progress — extracting facts, then drafting the eight disciplines.
                    This page updates automatically." ``` Analysis in progress — extracting facts, then drafting the eight disciplines.
                    T ```
- [ ] **Line 171**: Hardcoded JSX Text: "Analysis failed" ``` Analysis failed ```
- [ ] **Line 194**: Hardcoded attribute [label]: "Origin" ``` label="Origin" ```
- [ ] **Line 195**: Hardcoded attribute [label]: "SAP status" ``` label="SAP status" ```
- [ ] **Line 196**: Hardcoded attribute [label]: "Found" ``` label="Found" ```
- [ ] **Line 197**: Hardcoded attribute [label]: "Extent" ``` label="Extent" ```
- [ ] **Line 199**: Hardcoded attribute [label]: "Material" ``` label="Material" ```
- [ ] **Line 203**: Hardcoded attribute [label]: "Batch" ``` label="Batch" ```
- [ ] **Line 204**: Hardcoded attribute [label]: "Defect" ``` label="Defect" ```
- [ ] **Line 208**: Hardcoded attribute [label]: "Work center" ``` label="Work center" ```
- [ ] **Line 213**: Hardcoded attribute [label]: "Root cause" ``` label="Root cause" ```
- [ ] **Line 214**: Hardcoded attribute [label]: "Cost of poor quality" ``` label="Cost of poor quality" ```
- [ ] **Line 215**: Hardcoded attribute [label]: "FMEA" ``` label="FMEA" ```
- [ ] **Line 216**: Hardcoded attribute [label]: "Team size" ``` label="Team size" ```
- [ ] **Line 224**: Hardcoded JSX Text: "Internal summary" ``` Internal summary ```
- [ ] **Line 226**: Hardcoded JSX Text: "Customer summary" ``` Customer summary ```
- [ ] **Line 254**: Hardcoded JSX Text: "Eight disciplines" ``` Eight disciplines ```
- [ ] **Line 260**: Hardcoded JSX Text: "of" ``` of ```
- [ ] **Line 260**: Hardcoded JSX Text: "have no source data in the dataset" ``` have no source data in the dataset ```
- [ ] **Line 278**: Hardcoded JSX Text: "AI Models Used:" ``` AI Models Used: ```
- [ ] **Line 282**: Hardcoded JSX Text: "Parse:" ``` Parse: ```
- [ ] **Line 288**: Hardcoded JSX Text: "Analyze:" ``` Analyze: ```
- [ ] **Line 295**: Hardcoded JSX Text: "Generated:" ``` Generated: ```
- [ ] **Line 297**: Hardcoded JSX Text: "Tokens:" ``` Tokens: ```
- [ ] **Line 301**: Hardcoded JSX Text: "Duration:" ``` Duration: ```
- [ ] **Line 313**: Hardcoded JSX Text: "Source dataset —" ``` Source dataset — ```
- [ ] **Line 338**: Hardcoded JSX Text: "Loading…" ``` Loading… ```

### File: `src/pages/eight-d/discipline-card.tsx`
- [ ] **Line 74**: Hardcoded JSX Text: "No source data" ``` No source data ```
- [ ] **Line 85**: Hardcoded JSX Text: "Proposed by AI — the dataset holds no evidence for this discipline." ``` Proposed by AI — the dataset holds no evidence for this discipline. ```
- [ ] **Line 128**: Hardcoded JSX Text: "Sources" ``` Sources ```
- [ ] **Line 132**: Hardcoded JSX Text: "No source data — this discipline is a proposal." ``` No source data — this discipline is a proposal. ```

### File: `src/pages/eight-d/index.tsx`
- [ ] **Line 141**: Hardcoded JSX Text: "8D Reports" ``` 8D Reports ```
- [ ] **Line 151**: Hardcoded JSX Text: "Refresh" ``` Refresh ```
- [ ] **Line 155**: Hardcoded JSX Text: "Analyze from JSON" ``` Analyze from JSON ```
- [ ] **Line 163**: Hardcoded JSX Text: "analysis running — this page refreshes automatically. Each run takes 60–90 seconds." ``` analysis running — this page refreshes automatically. Each run takes 60–90 seconds. ```
- [ ] **Line 172**: Hardcoded JSX Text: "Why AI, unaided is highlighted when it disagrees:" ``` Why AI, unaided is highlighted when it disagrees: ```
- [ ] **Line 173**: Hardcoded JSX Text: "TheCopilot runs an independent diagnosis without seeing the recorded 5-Why chain or root cause flag.
                        Same conclusion confirms what you know; different conclusion points to a case worth double-checking." ``` TheCopilot runs an independent diagnosis without seeing the recorded 5-Why chain or root cause flag. ```
- [ ] **Line 183**: Hardcoded JSX Text: "Loading cases…" ``` Loading cases… ```
- [ ] **Line 187**: Hardcoded JSX Text: "Failed to load 8D cases:" ``` Failed to load 8D cases: ```
- [ ] **Line 193**: Hardcoded JSX Text: "No 8D reports yet" ``` No 8D reports yet ```
- [ ] **Line 195**: Hardcoded JSX Text: "Click "Analyze new case" to start from an incoming complaint or defect record." ``` Click "Analyze new case" to start from an incoming complaint or defect record. ```
- [ ] **Line 200**: Hardcoded JSX Text: "Analyze new case" ``` Analyze new case ```
- [ ] **Line 208**: Hardcoded JSX Text: "Notification" ``` Notification ```
- [ ] **Line 209**: Hardcoded JSX Text: "Origin" ``` Origin ```
- [ ] **Line 210**: Hardcoded JSX Text: "Symptom" ``` Symptom ```
- [ ] **Line 211**: Hardcoded JSX Text: "Material" ``` Material ```
- [ ] **Line 212**: Hardcoded JSX Text: "Work Center" ``` Work Center ```
- [ ] **Line 213**: Hardcoded JSX Text: "Root Cause" ``` Root Cause ```
- [ ] **Line 214**: Hardcoded JSX Text: "AI, unaided" ``` AI, unaided ```
- [ ] **Line 215**: Hardcoded JSX Text: "CoPQ" ``` CoPQ ```
- [ ] **Line 216**: Hardcoded JSX Text: "Status" ``` Status ```
- [ ] **Line 217**: Hardcoded JSX Text: "AI Models" ``` AI Models ```
- [ ] **Line 218**: Hardcoded JSX Text: "Analyzed" ``` Analyzed ```

### File: `src/pages/eight-d/precedent-panel.tsx`
- [ ] **Line 110**: Hardcoded JSX Text: "Confirmed root cause" ``` Confirmed root cause ```
- [ ] **Line 114**: Hardcoded JSX Text: "Cost of poor quality" ``` Cost of poor quality ```
- [ ] **Line 118**: Hardcoded JSX Text: "Where" ``` Where ```
- [ ] **Line 125**: Hardcoded JSX Text: "Team that solved it" ``` Team that solved it ```
- [ ] **Line 140**: Hardcoded JSX Text: "What they did" ``` What they did ```
- [ ] **Line 167**: Hardcoded JSX Text: "Searching past cases…" ``` Searching past cases… ```
- [ ] **Line 175**: Hardcoded JSX Text: "Could not search past cases:" ``` Could not search past cases: ```
- [ ] **Line 186**: Hardcoded JSX Text: "Similar past cases" ``` Similar past cases ```
- [ ] **Line 188**: Hardcoded JSX Text: "of" ``` of ```
- [ ] **Line 188**: Hardcoded JSX Text: "scored" ``` scored ```
- [ ] **Line 191**: Hardcoded JSX Text: "library" ``` library ```
- [ ] **Line 191**: Hardcoded JSX Text: "· threshold" ``` · threshold ```
- [ ] **Line 207**: Hardcoded JSX Text: "No comparable case found" ``` No comparable case found ```
- [ ] **Line 210**: Hardcoded JSX Text: "Nothing is shown rather than a weak match — a precedent that does not hold
                            still gets cited in the report as if it did." ``` Nothing is shown rather than a weak match — a precedent that does not hold
                         ```
- [ ] **Line 221**: Hardcoded JSX Text: "Suggested team (D1)" ``` Suggested team (D1) ```
- [ ] **Line 222**: Hardcoded JSX Text: "counted, not generated" ``` counted, not generated ```
- [ ] **Line 226**: Hardcoded JSX Text: "Functions these cases needed" ``` Functions these cases needed ```
- [ ] **Line 237**: Hardcoded JSX Text: "People, ranked by how often they worked a matching case" ``` People, ranked by how often they worked a matching case ```
- [ ] **Line 245**: Hardcoded JSX Text: "led" ``` led ```
- [ ] **Line 256**: Hardcoded JSX Text: "These names come from the teams of the cases below — nothing here is
                            inferred. The D1 draft further down should not contain a name that is
                            missing from this list." ``` These names come from the teams of the cases below — nothing here is
                            in ```

### File: `src/pages/eight-d/reasoning-panel.tsx`
- [ ] **Line 75**: Hardcoded JSX Text: "Independent diagnosis" ``` Independent diagnosis ```
- [ ] **Line 77**: Hardcoded JSX Text: "answer withheld from the model" ``` answer withheld from the model ```
- [ ] **Line 92**: Hardcoded JSX Text: "Quality engineer" ``` Quality engineer ```
- [ ] **Line 111**: Hardcoded JSX Text: "AI, unaided" ``` AI, unaided ```
- [ ] **Line 118**: Hardcoded JSX Text: "confidence" ``` confidence ```
- [ ] **Line 124**: Hardcoded JSX Text: "5-Why depth" ``` 5-Why depth ```
- [ ] **Line 128**: Hardcoded JSX Text: "vs" ``` vs ```
- [ ] **Line 153**: Hardcoded JSX Text: "The blind evidence check found" ``` The blind evidence check found ```
- [ ] **Line 153**: Hardcoded JSX Text: "leak" ``` leak ```
- [ ] **Line 154**: Hardcoded JSX Text: "This diagnosis may not be
                            independent." ``` This diagnosis may not be
                            independent. ```
- [ ] **Line 177**: Hardcoded JSX Text: "5-Why chain the AI built itself" ``` 5-Why chain the AI built itself ```
- [ ] **Line 199**: Hardcoded JSX Text: "Branches ruled out" ``` Branches ruled out ```
- [ ] **Line 214**: Hardcoded JSX Text: "Next most likely, and what would change the verdict" ``` Next most likely, and what would change the verdict ```
- [ ] **Line 227**: Hardcoded JSX Text: "Evidence the AI would ask for" ``` Evidence the AI would ask for ```

### File: `src/pages/home/index.tsx`
- [ ] **Line 19**: Hardcoded JSX Text: "CNMA Proresolve Dashboard" ``` CNMA Proresolve Dashboard ```
- [ ] **Line 22**: Hardcoded JSX Text: "Full-stack SAP CAP application integrated with @cnma/cap-identity." ``` Full-stack SAP CAP application integrated with @cnma/cap-identity. ```
- [ ] **Line 29**: Hardcoded JSX Text: "CAP Backend Connected" ``` CAP Backend Connected ```
- [ ] **Line 54**: Hardcoded JSX Text: "Open Organization" ``` Open Organization ```

---

## Summary

- Total Issues Found: **198**
  - §0 Hardcoded Pixels: **0**
  - §0 Hardcoded Hex Colors: **0**
  - §0 Raw Tailwind Colors: **0**
  - §0 Raw HTML Component Primitives: **0**
  - §0 Inline Styles: **0**
  - §0 Local Status/Color Mappings: **0**
  - §6 i18n / Hardcoded UI Text: **198**

Fix these issues to align with the Lead React Frontend Engineer guidelines.
