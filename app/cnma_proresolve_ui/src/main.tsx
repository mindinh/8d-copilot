import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import '@/styles/index.css';
import './i18n';
import App from '@/App';
import { queryClient } from '@/query-client';
import { FioriThemeProvider } from '@/contexts/fiori-theme-context';
import { initFLPMessageListener } from '@/hooks/use-flpsync';


// Initialize FLP postMessage listener for BTP Workzone iframe communication
initFLPMessageListener();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <FioriThemeProvider>
                <App />
            </FioriThemeProvider>
        </QueryClientProvider>
    </StrictMode>
);
