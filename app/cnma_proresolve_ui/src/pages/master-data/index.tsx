import { useState } from 'react';
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@cnma/react-ui';
import { Database, FolderKanban, Layers } from 'lucide-react';
import { HistoricalDefectsTab } from './HistoricalDefectsTab';
import { InspectionLotsTab } from './InspectionLotsTab';

export function MasterDataPage() {
    const [activeTab, setActiveTab] = useState<'historical-cases' | 'inspection-lots'>('historical-cases');

    return (
        <div className="p-6 md:p-8 w-full min-w-0 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                        <Database className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-foreground">Master Data Management</h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Manage historical defect precedents and QM inspection lot population data for AI 8D analysis and Is/Is-Not comparison
                        </p>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as 'historical-cases' | 'inspection-lots')}
                className="w-full space-y-6"
            >
                <TabsList className="grid w-full grid-cols-2 max-w-md bg-muted/60 p-1 rounded-xl border border-border/80 h-10 shadow-xs">
                    <TabsTrigger
                        value="historical-cases"
                        className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all border-b-0 data-[state=active]:border-b-0 data-[state=active]:border-transparent -mb-0 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs hover:text-foreground h-8 cursor-pointer"
                    >
                        <FolderKanban className="h-3.5 w-3.5" />
                        <span>Historical Defects</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="inspection-lots"
                        className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all border-b-0 data-[state=active]:border-b-0 data-[state=active]:border-transparent -mb-0 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs hover:text-foreground h-8 cursor-pointer"
                    >
                        <Layers className="h-3.5 w-3.5" />
                        <span>QM Inspection Lots</span>
                    </TabsTrigger>
                </TabsList>

                {/* Tab 1: Historical Cases */}
                <TabsContent value="historical-cases" className="mt-0 outline-none space-y-4">
                    <HistoricalDefectsTab />
                </TabsContent>

                {/* Tab 2: Inspection Lots */}
                <TabsContent value="inspection-lots" className="mt-0 outline-none space-y-4">
                    <InspectionLotsTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}

export default MasterDataPage;
