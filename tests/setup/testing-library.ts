// === AMÉLIORATION AJOUTÉE : infrastructure de tests de composants React — voir
// FRONTEND_CRITICAL_ANALYSIS.md §8 ("0 test de composant React"). Ce fichier est chargé une
// seule fois avant l'exécution des tests (voir vitest.config.ts `setupFiles`) — n'affecte que
// `expect`/le nettoyage entre tests, jamais l'environnement d'exécution des 111 tests
// existants (logique pure, environnement Vitest par défaut inchangé) : seuls les nouveaux
// tests de composants qui déclarent explicitement `// @vitest-environment jsdom` en tête de
// fichier ont besoin de ce qui est configuré ici.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

afterEach(() => {
  cleanup();
});
