// === AMÉLIORATION AJOUTÉE : configuration Vitest séparée pour les tests nécessitant
// l'émulateur Firestore (*.emulator.test.ts) — voir `npm run test:emulator`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.emulator.test.ts'],
  },
});
