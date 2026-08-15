# Solution Architecture & Implementation Plan: Enriched AI Settings Step Prompts (D1, D2, D4)

## 📌 Executive Summary

We are upgrading the **AI Settings Step Prompts** engine from a basic `systemPrompt` text editor into a full 4-tab configurable pipeline for each 8D Discipline step (**D1**, **D2**, **D4** prioritized first).

Key design principles:
- **Tab-Level Visual / JSON Toggle**: Each tab independently contains its own `[ 🎨 Visual UI Config | 💻 Raw JSON Config ]` toggle bar.
- **Settings Layout**: Aligned with [`ref/ai-agent-extraction`](file:///d:/conarum/conaspark/cnma_proresolve/ref/ai-agent-extraction) patterns (SchemaEditor shell, sticky TabNavigation, 3-panel DnD form editor, rule set builder, and `JsonConfigEditor`).
- **Comprehensive Backend Integration**: CDS entity extension, CAP service handler updates, seed defaults, prompt builder interpolation, and runtime field/step constraint validation.

---

## 🏛️ 4-Tab Step Prompt Architecture (Tab-Level Dual Editing)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      STEP PROMPT CONFIGURATOR                           │
│  [ D1: Team ]  [ D2: Problem ]  [ D4: Root Cause ]  (D3, D5-D8 later)    │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      ▼                            ▼                            ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ 1. DATA SCHEMA   │     │ 2. PROMPT GUIDE  │     │ 3. FORM & MAPPING│     │ 4. CONSTRAINTS   │
├──────────────────┤     ├──────────────────┤     ├──────────────────┤     ├──────────────────┤
│ Mode:            │     │ Mode:            │     │ Mode:            │     │ Mode:            │
│ [Visual | JSON]  │     │ [Visual | JSON]  │     │ [Visual | JSON]  │     │ [Visual | JSON]  │
│                  │     │                  │     │                  │     │                  │
│ • Input fields   │     │ • Concise Prompt │     │ • 3-Panel DnD    │     │ • Rule sets      │
│ • Data types     │     │   (<80 lines)    │     │ • Field widgets  │     │ • Grounding      │
│ • Data sources   │     │ • Persona &      │     │ • Output mapping │     │ • Citations      │
│   (SAP, OCR, PDF)│     │   placeholders   │     │ • Field rules    │     │ • DataBacked flag│
└──────────────────┘     └──────────────────┘     └──────────────────┘     └──────────────────┘
```

---

## 🖥️ Backend (BE) Changes Required

### 1. Database Schema (`db/schema/retrieval-config.cds`)
Enrich `StepPrompts` entity to store the configuration of all 4 tabs:

```cds
namespace cnma.proresolve;

using { managed } from '@sap/cds/common';

/**
 * Enriched Step Prompts configuration entity for 8D steps (D1–D8).
 */
entity StepPrompts : managed {
    /** D1 … D8. */
    key stepCode           : String(4);

        label              : String(100);
        description        : String(500);

        /** Tab 1: Input Data Schema (JSON defining expected fields & sources) */
        inputSchemaJson    : LargeString;

        /** Tab 2: Combined Agent Guide & System Prompt (<80 lines budget) */
        combinedPrompt     : LargeString;

        /** Tab 3: Form Layout, Output Field Mapping & Field Constraints (JSON for DnD layout & field rules) */
        formSchemaJson     : LargeString;

        /** Tab 4: Step Constraints & Validation Rules (JSON for step-level guardrails) */
        constraintsJson    : LargeString;

        enabled            : Boolean default true;
        version            : Integer default 1;
}
```

### 2. CAP Admin Service (`srv/AiAdminService.cds` & `aiAdminService.ts`)
- **Projections**: Expose `inputSchemaJson`, `combinedPrompt`, `formSchemaJson`, and `constraintsJson` in `AiAdminService.StepPrompts`.
- **Reset Action**: Update `resetRetrievalConfig(scope = 'prompts')` to populate defaults for D1, D2, D4 for all 4 JSON fields.
- **Update Handler**: Validate incoming JSON fields on `PATCH StepPrompts` to ensure valid JSON syntax before saving to SQLite/HANA DB.

### 3. Prompt Builder & Domain Logic (`srv/src/domain/eightd/`)
- **`prompts.ts`**:
  - Update `buildEightDSystemPrompt()` to read custom `combinedPrompt` and `constraintsJson` from `StepPrompts`.
  - Update `buildEightDPrompt()` to structure `CaseContext` according to `inputSchemaJson`.
- **`defaults.ts`**:
  - Provide complete default JSON structures for D1, D2, and D4 for all 4 configuration areas.

### 4. Output Validation & Constraint Enforcement Engine (`srv/src/domain/eightd/`)
- **Field-Level Validation**: When LLM returns `EightDResult`, validate fields against `formSchemaJson` constraints:
  - `minLength` / `maxLength` on text strings.
  - `min` / `max` on numeric values.
  - `pattern` regex matching.
  - `required` / `minItems` mandatory checks.
- **Step-Level Validation**: Evaluate rules in `constraintsJson`:
  - Check citation validity (`sources[]`).
  - Enforce `dataBacked = false` when input schema fields are empty.
  - Enforce Independent Analysis disclosure in D4.
- **Auto-Repair & Reporting**: Append validation notices to `AnalyzeOutcome.repairs` if minor discrepancies are corrected, or flag errors if mandatory rules fail.

---

## 🎨 Tab Layout Breakdown (With Tab-Specific Visual/JSON Toggles)

### Tab 1: Data Schema (`DataSchemaTab`)
* **Controls**: `[ 🎨 Visual Form Builder | 💻 Raw JSON Editor ]`
* **Visual Mode**:
  - Input field key, label, data type (`string`, `number`, `integer`, `boolean`, `date`, `object`, `array`).
  - Source annotations (`sap_qm`, `pdf_ocr`, `image_extract`, `vector_search`, `manual_input`, `ai_enrichment`).
* **JSON Mode**: Edits `inputSchemaJson`.

### Tab 2: Agent Guide & Prompt (`AIPromptTab`)
* **Controls**: `[ 🎨 Visual Form / Preview | 💻 Raw Prompt / Template Editor ]`
* **Visual Mode**:
  - Prompt text area with live line-count indicator (<80 lines limit).
  - Insertable placeholder tags (`{{inputData}}`, `{{precedents}}`, `{{gaps}}`, `{{independent}}`).
* **JSON Mode**: Edits raw prompt markdown string & variable configuration.

### Tab 3: Form Editor & Output Mapping (`FormMappingTab`)
* **Controls**: `[ 🎨 3-Panel DnD Canvas | 💻 Raw Form Schema JSON ]`
* **Visual Mode (3-Panel Layout inspired by `UILayoutBuilder`)**:
  1. **Fields Panel (Left)**: Available fields from Tab 1 Input Schema.
  2. **Canvas Panel (Center)**: Drag-and-drop form canvas with groups, layout width (`100%`, `50%`, `33%`), and widget ordering.
  3. **Config Panel (Right)**: Widget selector (Input, Textarea, Select, DatePicker, Checkbox) + Output field binding + **Field-Level Constraints** (`required`, `minLength`, `maxLength`, `min`, `max`, `pattern` regex).
* **JSON Mode**: Edits `formSchemaJson`.

### Tab 4: Step Constraints (`StepConstraintsTab`)
* **Controls**: `[ 🎨 Visual Rules Builder | 💻 Raw Rule Sets JSON ]`
* **Visual Mode (Inspired by `ValidationConfig.tsx`)**:
  - Rule sets for step-level constraints (Grounding rules, Source citation enforcement, DataBacked rules, Independent Verification disclosure).
  - Outcome policies (Error, Warning, Info).
* **JSON Mode**: Edits `constraintsJson`.

---

## 📋 Concrete Specifications for D1, D2, and D4

### 1️⃣ D1 — Establish the Team
* **Data Schema (Inputs)**: `teamMembers` (array), `teamSize` (number), `precedentTeams` (array).
* **Prompt Guide (<80 lines)**:
  * Extract official leader & members with functions; explain skill mix rationale.
  * Fallback: Recommend historical team members from matching precedent cases (`precedents#N`).
  * If no data/precedents: state manual assignment required.
* **Form & Mapping Constraints**:
  * `leaderName` (text input, required: true, maxLength: 100)
  * `skillMixRationale` (textarea, minLength: 20, maxLength: 500)
  * `teamSources` (tag selector, regex: `"^(team\\.|precedents#)"`)
* **Step Constraints**: Grounding rule (no fake/placeholder names); set `dataBacked = false` if team data missing.

---

### 2️⃣ D2 — Describe the Problem (5W2H + Is/Is-Not)
* **Data Schema (Inputs)**: `symptomText` (string), `material` (object), `workCenter` (string), `inspections` (array), `isIsNot` (object), `derivedFacts` (array).
* **Prompt Guide (<80 lines)**:
  * Formulate 5W2H narrative; quantify measured vs spec limits using `derivedFacts` (e.g. deviation ratios).
  * Use Is / Is-Not to bound the problem domain.
* **Form & Mapping Constraints**:
  * `problemTitle` (text input, required: true, maxLength: 150)
  * `narrative5W2H` (textarea, required: true, minLength: 50, maxLength: 1000)
  * `measuredVsSpec` (data table, minItems: 1)
* **Step Constraints**: Numerical citation rule (every measurement must match `inspections` or `derivedFacts`).

---

### 3️⃣ D4 — Root Cause Analysis (5-Why + Ishikawa 6M)
* **Data Schema (Inputs)**: `fiveWhy` (array), `ishikawa` (array), `rootCause` (object), `independent` (object), `precedents` (array).
* **Prompt Guide (<80 lines)**:
  * Walk 5-Why chain with evidence citations; evaluate 6M Ishikawa categories.
  * Mandatory "Independent verification" section: report agreement/discrepancy with `IndependentAnalysis`.
  * Fallback: present precedent root causes as hypotheses to check.
* **Form & Mapping Constraints**:
  * `confirmedCategory` (select box, required: true, options: `["Man", "Machine", "Method", "Material", "Measurement", "Environment"]`)
  * `fiveWhyChain` (stepper / list, minItems: 1)
  * `independentVerdict` (callout box, required: true)
* **Step Constraints**: Independent disclosure rule (must report agreement/disagreement); 6M Ishikawa coverage rule.

---

## 🎯 Verification & Testing Plan

### Automated Verification
1. **CDS Schema Verification**: Run `npx cds compile db/schema/retrieval-config.cds` to verify schema compilation.
2. **Backend Unit Tests**: Unit test prompt builder with dynamic JSON configurations (`inputSchemaJson`, `combinedPrompt`).
3. **Runtime Validator Tests**: Test field-level constraint checker (`min`, `max`, `minLength`, `maxLength`, `pattern`) against AI outputs.
4. **Tab-Level Dual Mode Sync Tests**: Verify bi-directional sync between Visual UI and JSON mode for each of the 4 tabs.

### Manual Verification
1. Open **Admin → AI Settings → Step Prompts**.
2. Select **D1**, **D2**, or **D4**.
3. In each tab, test toggling between **Visual UI Config** and **Raw JSON Config**.
4. Save step prompts, run an 8D analysis preview, and confirm constraints and prompt templates apply cleanly.
