import '@fontsource/alfa-slab-one';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/700-italic.css';
import '@fontsource/barlow-condensed/800-italic.css';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './features/auth/AuthProvider';
import { ToastProvider } from './components/ui/ToastProvider';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { reportError, watchForErrors } from './lib/errorReporting';

watchForErrors();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <ErrorBoundary onError={reportError}>
              <App />
            </ErrorBoundary>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
