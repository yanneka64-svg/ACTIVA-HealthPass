// === AMÉLIORATION AJOUTÉE : configuration Vitest explicite (Phase 3) — sans ce fichier,
// Vitest découvrait aussi functions/lib/*.test.js (sortie compilée CommonJS de
// functions/src/validation.test.ts, qui a sa PROPRE suite/config), provoquant un échec
// ("Vitest cannot be imported in a CommonJS module using require()") sans rapport avec les
// tests réels de ce dossier. Restreint la découverte à tests/*.test.ts uniquement.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // === AMÉLIORATION AJOUTÉE : tests de composants React (voir
    // FRONTEND_CRITICAL_ANALYSIS.md §8) — `src/**/*.test.tsx` s'ajoute à la découverte
    // existante, additif. L'environnement par défaut reste 'node' (comportement inchangé pour
    // les 111 tests existants sous tests/) ; chaque nouveau test de composant déclare
    // `// @vitest-environment jsdom` en tête de fichier pour obtenir un DOM, plutôt que de
    // changer l'environnement global.
    include: ['tests/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'functions', 'dist'],
    setupFiles: ['tests/setup/testing-library.ts'],
  },
});
