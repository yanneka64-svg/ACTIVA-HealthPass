// === AMÉLIORATION AJOUTÉE : tests end-to-end (préparation Go-Live, 2026-09-07) ===
// Pas de `webServer` ici volontairement : l'ordre de démarrage (émulateurs → seed → serveur de
// dev) est géré explicitement par e2e/global-setup.ts, car le seed doit impérativement avoir
// terminé avant que l'app ne serve la moindre page de test — voir ce fichier pour le détail.
import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// package.json declare "type": "module" pour ce dépôt (ESM) : `require.resolve` n'existe pas
// dans ce contexte, d'où cette résolution de chemin absolu compatible ESM.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: path.resolve(__dirname, './e2e/global-setup.ts'),
  globalTeardown: path.resolve(__dirname, './e2e/global-teardown.ts'),
  // Le test #3 (chaîne enrôlement -> approbation -> sinistre -> approbation, 2 connexions et
  // 2 replis Cloud Function -> transaction Firestore d'environ 13-15s chacun dans cet
  // environnement, voir e2e/helpers.ts FALLBACK_TIMEOUT) dépasse la marge des 60s par défaut de
  // Playwright une fois cumulé avec les logins/navigations — vérifié par une reproduction
  // manuelle qui aboutit sans erreur, juste plus lentement que ce budget.
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Chromium préinstallé de l'environnement d'exécution (voir PLAYWRIGHT_BROWSERS_PATH) —
          // surchargeable via PLAYWRIGHT_CHROMIUM_PATH sur une machine où ce chemin diffère
          // (ex. après `npx playwright install`, qui utilise un autre répertoire de cache).
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
        },
      },
    },
  ],
});
