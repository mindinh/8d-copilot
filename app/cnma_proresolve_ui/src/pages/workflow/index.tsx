import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@cnma/react-ui';
import {
    BookOpen, Cpu, FileText, Sliders, Sparkles,
} from 'lucide-react';
import { useStepPrompts } from '@/hooks/use-step-prompts';
import { GeneralSettingsTab } from '../ai-settings/general-settings-tab';
import { DisciplineSection } from './discipline-section';

const DISCIPLINES = [
    { code: 'D1', title: 'Establish Team', engine: 'Rules + Precedents' },
    { code: 'D2', title: 'Describe Problem', engine: 'AI + SAP Facts' },
    { code: 'D3', title: 'Containment Actions', engine: 'AI + Precedents' },
    { code: 'D4', title: 'Root Cause Analysis', engine: 'AI + Blind Verification' },
    { code: 'D5', title: 'Corrective Actions', engine: 'AI + D4 Alignment' },
    { code: 'D6', title: 'Validate Actions', engine: 'Rules + Plan Generation' },
    { code: 'D7', title: 'Preventive Actions', engine: 'AI + FMEA Link' },
    { code: 'D8', title: 'Team Recognition', engine: 'AI + Summary' },
];

export function WorkflowPage() {
    const prompts = useStepPrompts();

    const [activeTab, setActiveTab] = useState<'global' | 'disciplines'>('global');
    const [selectedDiscipline, setSelectedDiscipline] = useState<string>('D1');

    return (
        <div className="p-6 space-y-6 w-full min-w-0">
            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                        <Sliders className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">8D Training Center</h1>
                        <p className="text-sm text-muted-foreground">
                            Configure global LLM models, precedent retrieval thresholds, and prompts for each 8D Discipline (D1 – D8).
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                        <Link to="/guide" className="flex items-center gap-1.5">
                            <BookOpen className="h-4 w-4" />
                            User Guide
                        </Link>
                    </Button>
                    <Button variant="default" size="sm" asChild>
                        <Link to="/ai-settings" className="flex items-center gap-1.5">
                            <Sparkles className="h-4 w-4" />
                            AI Settings
                        </Link>
                    </Button>
                </div>
            </div>

            {/* ── Top Level Category Switcher (Ordered from High-Level to Detailed) ── */}
            <div className="flex flex-wrap items-center gap-2 p-1.5 bg-muted/60 rounded-xl border">
                {/* Tab 1: Global AI Model Routing */}
                <Button
                    variant={activeTab === 'global' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveTab('global')}
                    className="text-xs rounded-lg font-medium"
                >
                    <Cpu className="h-3.5 w-3.5 mr-1.5" />
                    Global AI Model Routing
                </Button>

                {/* Tab 2: 8D Disciplines Configuration (D1 - D8) */}
                <Button
                    variant={activeTab === 'disciplines' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveTab('disciplines')}
                    className="text-xs rounded-lg font-medium"
                >
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                    8D Disciplines Configuration (D1 – D8)
                </Button>
            </div>

            {/* ─── TAB 1: GLOBAL AI MODEL ROUTING ─── */}
            {activeTab === 'global' && (
                <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">Global AI Activity Bindings</h2>
                        <p className="text-xs text-muted-foreground">
                            Configure which AI models handle data parsing, defect analysis, and quality reviews across all 8D steps.
                        </p>
                    </div>

                    <GeneralSettingsTab />
                </div>
            )}

            {/* ─── TAB 2: 8D DISCIPLINE CONFIGURATION (D1 to D8) ─── */}
            {activeTab === 'disciplines' && (
                <div className="space-y-6">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">8D Discipline Rules & Prompts</h2>
                        <p className="text-xs text-muted-foreground">
                            Select a discipline below to inspect its input schema, prompt guidance, form fields, and safety constraints.
                        </p>
                    </div>

                    {/* Discipline Tabs Bar (D1 -> D8) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                        {DISCIPLINES.map((d) => {
                            const isSelected = selectedDiscipline === d.code;
                            return (
                                <button
                                    key={d.code}
                                    type="button"
                                    onClick={() => setSelectedDiscipline(d.code)}
                                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                                        isSelected
                                            ? 'bg-primary text-primary-foreground border-primary shadow-sm ring-2 ring-primary/20'
                                            : 'bg-card hover:bg-accent hover:text-accent-foreground border-border'
                                    }`}
                                >
                                    <span className="font-mono text-sm font-bold">{d.code}</span>
                                    <span className="text-[11px] font-medium leading-tight line-clamp-1 mt-0.5">{d.title}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Selected Discipline Details Banner */}
                    {selectedDiscipline && (
                        <div className="space-y-4">
                            {/* Discipline Section Inspector & Inline Editor */}
                            <DisciplineSection
                                stepCode={selectedDiscipline}
                                prompt={prompts.byCode[selectedDiscipline] ?? null}
                                onReload={prompts.reload}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
