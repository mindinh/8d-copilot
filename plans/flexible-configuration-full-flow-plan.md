# Flexible Step Configuration - Full-Flow Implementation Plan

## Goal

Make the D1-D4 configuration genuinely drive the complete analysis flow:

```text
Step configuration
  -> resolved AI input
  -> dynamic response contract
  -> validated result
  -> persisted schema snapshot and data
  -> schema-driven Report Detail UI
```

The field key in Form Editor is the AI output path. There is no separate output binding configuration.

## Current Gaps

- Prompt Guide is used by the AI runtime, but Data Schema only resolves selected top-level values.
- Form Schema is added to the prompt as guidance, while the AI response schema remains fixed.
- Only fixed discipline fields are persisted and rendered: `summary`, `content`, `actionItems`, `sources`, `confidence`, and `dataBacked`.
- Constraint handling is partial. `sourcePattern` and `requiredDisclosure` exist, but other configured rule types are not implemented generically.
- Report Detail does not load or render `formSchemaJson`.
- Existing tests do not prove config -> AI result -> persistence -> UI rendering.

## Implementation Phases

### 1. Define the Runtime Contract

- Normalize Data Schema, Form Schema, and Constraints into versioned runtime types.
- Treat Form Editor field keys as paths inside a discipline `resultJson` object.
- Separate data type and validation rules from presentation properties such as widget, group, width, columns, spans, and order.
- Reject unsupported or conflicting configurations during save instead of silently ignoring them.

### 2. Resolve Configured Input

- Replace top-level-only selection with a safe path resolver for nested objects and arrays.
- Build each step's configured input from `CaseContext`, enrichment, independent analysis, and precedents.
- Record diagnostics for resolved, missing, and type-invalid input paths.
- Preserve fallback behavior for disabled or blank step configurations.

### 3. Generate Dynamic AI Output Schema

- Build the AI response JSON Schema from the active D1-D4 Form Schemas.
- Keep required discipline metadata such as `code`, `sequence`, and `title` stable.
- Put configurable fields under a flexible `data` object.
- Continue using the legacy fixed schema for D5-D8 until those editors are enabled.
- Include only valid configured paths in the prompt and response schema.

### 4. Add Generic Validation and Repair

- Validate the model response against the generated schema.
- Implement configured rules consistently: required fields, length/range, enum, citations, source patterns, disclosure, and data-backed conditions.
- Distinguish `error` rules from `warning` rules.
- On errors, perform one focused AI repair attempt and validate again.
- Persist remaining violations and repair history for troubleshooting and UI display.

### 5. Persist Flexible Results and Snapshots

- Extend `Disciplines` with at least:
  - `resultJson`: flexible AI output data.
  - `formSchemaJson`: immutable schema/layout snapshot used for rendering.
  - `validationJson`: violations and repair results.
  - `configVersion`: configuration version or checksum.
- Keep legacy columns during migration.
- New reports write both flexible data and compatible legacy fields where possible.
- Old reports without snapshots continue to render with the existing component.

### 6. Build the Schema-Driven Result Renderer

- Port/adapt the relevant Review schema-renderer patterns from `ref/ai-agent-extraction`.
- Render groups, order, widths, columns, row/column spans, visibility, and spacers from the saved Form Schema snapshot.
- Support text, markdown, number, boolean/status, tags/sources, arrays, objects, and list-of-object tables.
- Show missing values and validation warnings without breaking the whole report.
- Use the current `DisciplineCard` as the legacy fallback.

### 7. Add Observability and Preview

- Expose the effective input, output schema, config version, violations, and repair history for an analysis run.
- Add an admin preview/test action that runs one selected step against a sample payload before a full analysis.
- Never expose secrets or unrestricted raw identity/AI credentials in diagnostics.

### 8. Test the Full Flow

- Unit tests:
  - nested input path resolution;
  - Form Schema -> AI JSON Schema conversion;
  - constraint evaluation and repair;
  - legacy fallback and schema normalization.
- Backend integration tests:
  - save configuration;
  - analyze a sample;
  - persist result and snapshot;
  - reload the same report after configuration changes.
- Frontend tests:
  - renderer widgets and layouts;
  - validation states;
  - legacy report rendering.
- E2E test:
  - add a new D2 field in Form Editor;
  - run analysis from the UI;
  - verify the field is generated, stored, and rendered in the configured group and layout.

## Delivery Order

1. Runtime types, normalization, and nested input resolver.
2. Dynamic response schema and generic constraint engine.
3. Database fields, persistence, and schema snapshots.
4. Schema-driven Report Detail renderer with legacy fallback.
5. Admin preview, diagnostics, automated integration tests, and UI E2E coverage.

## Acceptance Criteria

- Adding a valid field in D1-D4 Form Editor requires no backend or frontend code change.
- The AI returns that field at the configured path and it survives validation and persistence.
- Report Detail renders it using the saved widget, group, order, and layout.
- Changing the current configuration does not change historical reports.
- All enabled constraint types have observable and tested runtime behavior.
- Invalid configurations fail clearly; missing data never causes an empty JSON parse or a broken report screen.
- D5-D8 and legacy reports continue to work unchanged until explicitly migrated.

## UI Verification Scenario

1. Open AI Settings and add `problemStatement` to the D2 Form Editor.
2. Place it in a visible group, set a label/widget, and mark it required.
3. Save and run **Analyze new case** from the 8D Reports page.
4. Open the generated report and verify D2 shows `problemStatement` in the configured layout.
5. Change the D2 layout, run a second analysis, and confirm the first report retains its original snapshot while the second uses the new layout.
