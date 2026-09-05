// === AMÉLIORATION AJOUTÉE : configuration Vitest explicite (Phase 3) — sans ce fichier,
// Vitest découvrait aussi functions/lib/*.test.js (sortie compilée CommonJS de
// functions/src/validation.test.ts, qui a sa PROPRE suite/config), provoquant un échec
// ("Vitest cannot be imported in a CommonJS module using require()") sans rapport avec les
// tests réels de ce dossier. Restreint la découverte à tests/*.test.ts uniquement.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'functions', 'dist'],
  },
});
