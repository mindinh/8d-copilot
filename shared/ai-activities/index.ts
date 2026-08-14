/**
 * CLAIR2 AI activity registry — the single source of truth for per-activity
 * model routing (@cnma/sap-aicore-integrate).
 *
 * Registered on BOTH bundles (the registry is per-bundle):
 * - backend: srv/server.ts (before bootstrap)
 * - frontend: app/cnma_ai_agent_extraction_ui/src/main.tsx (before first render)
 *
 * Keys are what call sites pass to resolveActivityModel(aiAgentConfig, key);
 * budgetKey names the aiAgentConfig field holding that activity's thinking
 * budget. Embeddings are deliberately NOT activities — the embedding model must
 * stay uniform across the stored vector corpus, so it cannot vary per object
 * type or per activity. Both embedding models are org-wide instead, picked in
 * Admin → AI Models → Embeddings and stored in the `EMBEDDING_MODELS`
 * SystemConfiguration row (see srv/lib/ai/EmbeddingModelConfig.ts). Changing one
 * requires re-embedding that corpus, which is why it lives on its own tab.
 */
import type { AiActivity } from '@cnma/sap-aicore-integrate/react/shared';

export const EIGHTD_ACTIVITIES: AiActivity[] = [
    {
        key: 'parseData',
        label: 'Parse input data',
        description:
            'Read the incoming data and turn it into structure: numbers, codes, tables. This is transcription rather than judgement, so a fast and cheap model is usually enough.',
        budgetKey: 'parseDataThinkingBudget',
    },
    {
        key: 'analyzeDefect',
        label: 'Analyse defect',
        description:
            'Reason over the parsed data to find the cause. This is the step that needs the strongest model — get it wrong and everything downstream is worthless.',
        budgetKey: 'analyzeDefectThinkingBudget',
    },
    {
        key: 'draftContent',
        label: 'Draft content',
        description:
            'Write prose from data that already exists. Needs phrasing, but must stay tied to the data.',
        budgetKey: 'draftContentThinkingBudget',
    },
    {
        key: 'reviewQuality',
        label: 'Review quality',
        description:
            'Grade content written by a human or by AI against fixed criteria. Keep temperature at 0 so the same input always yields the same verdict.',
        budgetKey: 'reviewQualityThinkingBudget',
    },
];
