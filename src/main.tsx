import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
// === AMÉLIORATION AJOUTÉE : Phase 3 (2026-09-18) — première introduction de react-router-dom
// (BrowserRouter) dans ce dépôt, qui n'avait jusqu'ici AUCUN routage par URL (la navigation
// entre sections était un simple état React en mémoire, mirroré dans sessionStorage). Une seule
// route paramétrée `/:section?` (section optionnelle) rend le même `<App/>` qu'avant : App lit
// désormais la section active depuis l'URL (voir `useParams` dans App.tsx) au lieu d'un
// `useState` local — même valeurs, même logique de permissions par rôle, comportement
// utilisateur final inchangé, mais l'URL reflète enfin la section affichée (bouton précédent/
// suivant du navigateur, rechargement, lien partageable). Nécessite public/_redirects (règle de
// fallback SPA côté Netlify) pour que le rechargement d'une sous-page ne renvoie pas une 404.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <CurrencyProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/:section?" element={<App />} />
            </Routes>
          </BrowserRouter>
        </CurrencyProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
