import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Spinner } from '@cnma/react-ui';
import { ArrowRight, Blocks } from 'lucide-react';
import { toast } from 'sonner';
import { getStepPrompts, type StepPrompt } from '@/services/retrieval-service';

export function StepPromptsTab() {
    const navigate = useNavigate();
    const [prompts, setPrompts] = useState<StepPrompt[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getStepPrompts().then(setPrompts).catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Unable to load step prompts')).finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="flex items-center justify-center rounded-lg border p-10 text-sm text-muted-foreground"><Spinner className="mr-2 h-4 w-4" /> Loading disciplines...</div>;
    return <div className="grid gap-4 md:grid-cols-2">
        {prompts.map((prompt) => {
            const available = ['D1', 'D2', 'D3', 'D4'].includes(prompt.stepCode);
            return <Card key={prompt.stepCode} className={available ? 'transition-shadow hover:shadow-md' : 'opacity-70'}>
                <CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Blocks className="h-5 w-5 text-primary" /> {prompt.stepCode} - {prompt.label}</CardTitle><CardDescription className="mt-2">{prompt.description}</CardDescription></div><Badge variant={available ? 'secondary' : 'outline'}>{available ? 'Configurable' : 'Planned'}</Badge></div></CardHeader>
                <CardContent className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{available ? 'Data schema, prompt, form editor, and constraints.' : 'This step keeps its current runtime configuration.'}</p><Button disabled={!available} onClick={() => navigate(`/ai-settings/step-prompts/${prompt.stepCode}`)}>Open editor <ArrowRight className="h-4 w-4" /></Button></CardContent>
            </Card>;
        })}
    </div>;
}
