import {
    buildFlexibleResponseSchema,
    normalizeStepConfig,
    setPath,
    syncLegacyFields,
    validateFlexibleResult,
} from '../runtimeConfig';
import type { DisciplineDraft } from '../types';
import { DEFAULT_STEP_PROMPTS } from '../precedent/defaults';

describe('flexible step runtime configuration', () => {
    const config = normalizeStepConfig('D2', {
        version: 3,
        inputSchemaJson: JSON.stringify({ type: 'object', properties: { 'problem.statement': { type: 'string' } }, required: ['problem.statement'] }),
        formSchemaJson: JSON.stringify({ fields: [{ key: 'problem.statement', label: 'Problem statement', widget: 'textarea', dataType: 'string', constraints: { required: true, minLength: 10 } }], groups: [{ id: 'problem', label: 'Problem', fieldKeys: ['problem.statement'], columns: 1 }] }),
        constraintsJson: JSON.stringify({ enabled: true, rules: [{ id: 'D2_CITE', type: 'citationRequired', severity: 'warning', message: 'Cite evidence' }] }),
    });

    it('treats Data Schema as the output contract used by Form Editor', () => {
        expect(config.inputSchema?.properties['problem.statement']).toMatchObject({ type: 'string' });
        expect(config.formSchema?.fields[0]).toMatchObject({ key: 'problem.statement', type: 'string' });
    });

    it('keeps the Gemini serving schema lightweight while backend owns the data contract', () => {
        const schema = buildFlexibleResponseSchema({ D2: config });
        const serialized = JSON.stringify(schema);
        expect(serialized).toContain('D8');
        expect(serialized).toContain('"data":{"type":"object"}');
        expect(serialized).not.toContain('problem.statement');
        expect(serialized).not.toContain('anyOf');
        expect(serialized).not.toContain('minLength');
        expect(serialized).not.toContain('maxLength');
        expect(serialized).not.toContain('pattern');
        expect(serialized).not.toContain('minimum');
        expect(serialized).not.toContain('maximum');
    });

    it('rejects Data Schema and Form Editor field mismatches', () => {
        expect(() => normalizeStepConfig('D3', {
            inputSchemaJson: JSON.stringify({ type: 'object', properties: { 'containment.objective': { type: 'string' } } }),
            formSchemaJson: JSON.stringify({ fields: [{ key: 'containment.actions', widget: 'table', dataType: 'array' }] }),
        })).toThrow('fields must match');
    });

    it('validates configured fields and warning rules', () => {
        const data: Record<string, unknown> = {};
        setPath(data, 'problem.statement', 'short');
        const discipline: DisciplineDraft = { code: 'D2', sequence: 2, title: 'Problem', summary: '', content: '', actionItems: [], sources: [], confidence: 0, dataBacked: false, data };
        const violations = validateFlexibleResult(discipline, config, {});
        expect(violations).toEqual(expect.arrayContaining([
            expect.objectContaining({ path: 'data.problem.statement', severity: 'error' }),
            expect.objectContaining({ ruleId: 'D2_CITE', severity: 'warning' }),
        ]));
    });

    it('rejects unsupported rules instead of silently ignoring them', () => {
        expect(() => normalizeStepConfig('D2', { constraintsJson: JSON.stringify({ rules: [{ type: 'magicRule' }] }) })).toThrow('unsupported rule type');
    });

    it('ships structured defaults for ALL EIGHT steps, aligned with the renderer layout', () => {
        // Trước đây chỉ D1–D4 có cấu hình cấu trúc; D5–D8 rơi về prompt trần và
        // không cấu hình được. Vòng lặp này là chỗ giữ cho điều đó không tái diễn.
        for (const code of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'] as const) {
            const raw = DEFAULT_STEP_PROMPTS.find((item) => item.stepCode === code)!;
            const normalized = normalizeStepConfig(code, raw);
            expect(normalized.formSchema?.groups).toHaveLength(1);
            expect(normalized.formSchema?.fields.some((field) => field.widget === 'evidence-list')).toBe(true);
            expect(normalized.formSchema?.fields.some((field) => field.key.includes('.'))).toBe(true);
            expect(JSON.parse(raw.inputSchemaJson!).properties[normalized.formSchema!.fields[0].key]['x-source']).toBe('ai_enrichment');
        }
        const d1 = normalizeStepConfig('D1', DEFAULT_STEP_PROMPTS.find((item) => item.stepCode === 'D1')!);
        expect(d1.formSchema?.fields.find((field) => field.key === 'team.roster')).toMatchObject({ type: 'array', widget: 'table' });
        expect(d1.formSchema?.fields.map((field) => field.key)).toEqual(expect.arrayContaining([
            'team.selectionMethod',
            'team.problemCapabilities',
            'team.selectionRationale',
            'team.readinessRationale',
            'team.sourceSummary',
        ]));
        expect(d1.formSchema?.fields.find((field) => field.key === 'team.readinessStatus')?.constraints.enum).toEqual(['Ready', 'Partial', 'Needs assignment']);
    });

    it('normalizes dotted AI output keys into nested form data', () => {
        const discipline: DisciplineDraft = { code: 'D1', sequence: 1, title: 'Team', summary: '', content: '', actionItems: [], sources: [], confidence: 0, dataBacked: false, data: { 'team.objective': 'Create a cross-functional response team.' } };
        syncLegacyFields(discipline);
        expect(discipline.data).toEqual({ team: { objective: 'Create a cross-functional response team.' } });
    });
});
