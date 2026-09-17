import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { CurrencyProvider } from './services/currency.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// === AMÉLIORATION AJOUTÉE : ErrorBoundary racine (retour utilisateur — page blanche par
// moments) — voir components/ErrorBoundary.tsx pour le détail de la cause. Aucun changement
// de comportement quand tout fonctionne normalement.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <CurrencyProvider>
        <App />
      </CurrencyProvider>
    </ErrorBoundary>
  </StrictMode>,
);
