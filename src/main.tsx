import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import { CurrencyProvider } from './services/currency.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { queryClient } from './lib/queryClient.ts';
import './index.css';

// === AMÉLIORATION AJOUTÉE : ErrorBoundary racine (retour utilisateur — page blanche par
// moments) — voir components/ErrorBoundary.tsx pour le détail de la cause. Aucun changement
// de comportement quand tout fonctionne normalement.
// === AMÉLIORATION AJOUTÉE : Phase 3 (2026-09-17) — QueryClientProvider (voir
// src/lib/queryClient.ts). N'affecte aucun rendu tant qu'aucun composant ne lit depuis ce
// cache — voir src/features/claims/useClaimsQuery.ts pour son premier usage.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <CurrencyProvider>
          <App />
        </CurrencyProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
