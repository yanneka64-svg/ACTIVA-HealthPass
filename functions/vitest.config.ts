// === AMÉLIORATION AJOUTÉE : configuration Vitest locale à functions/ (Phase 2.1/3) — sans
// elle, Vitest remontait au vitest.config.ts de la racine (include: tests/**/*.test.ts,
// dossier qui n'existe pas ici), et ne trouvait donc aucun test alors que
// src/validation.test.ts existe bien.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // *.emulator.test.ts nécessite l'émulateur Firestore — exclu de `npm test` (voir
    // `npm run test:emulator`), pour ne pas faire échouer la suite unitaire pure par défaut.
    exclude: ['node_modules', 'src/**/*.emulator.test.ts'],
  },
});
