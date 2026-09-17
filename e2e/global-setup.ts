// === AMÉLIORATION AJOUTÉE : tests end-to-end (préparation Go-Live, 2026-09-07) ===
// Démarre, dans l'ordre, les émulateurs Firestore+Auth locaux, seed les données de test, PUIS
// démarre le serveur de développement de l'application (pointé sur ces émulateurs via
// VITE_USE_FIREBASE_EMULATOR=true — voir src/lib/firebase.ts). Contrôle explicite de l'ordre
// (plutôt que de s'appuyer sur `webServer` de Playwright) car le seed DOIT avoir terminé avant
// que l'app ne serve la moindre page de test. Les PID sont persistés dans un fichier temporaire
// pour que global-teardown.ts (exécuté dans un processus séparé) puisse les arrêter proprement.
import { spawn, spawnSync, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { E2E_PROJECT_ID, E2E_DATABASE_ID } from './e2e-constants';

// package.json déclare "type": "module" (ESM) : pas de __dirname global disponible.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PID_FILE = path.resolve(__dirname, '.e2e-pids.json');
const EMULATOR_LOG = path.resolve(__dirname, '.emulators.log');
const APP_LOG = path.resolve(__dirname, '.app-server.log');

function waitForPort(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      try {
        const res = await fetch(url);
        if (res.status < 500) {
          resolve();
          return;
        }
      } catch {
        // not ready yet
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(attempt, 500);
    };
    attempt();
  });
}

export default async function globalSetup() {
  const repoRoot = path.resolve(__dirname, '..');
  const logStream = fs.createWriteStream(EMULATOR_LOG, { flags: 'a' });

  const emulatorProc: ChildProcess = spawn(
    'npx',
    ['firebase', 'emulators:start', '--only', 'firestore,auth', '--project', E2E_PROJECT_ID],
    { cwd: repoRoot, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  emulatorProc.stdout?.pipe(logStream);
  emulatorProc.stderr?.pipe(logStream);

  await waitForPort('http://127.0.0.1:8080/', 60_000);
  await waitForPort('http://127.0.0.1:9099/', 60_000);

  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

  // Exécuté en sous-processus via `tsx` plutôt qu'importé directement (voir e2e/run-seed.ts) :
  // firebase-admin, chargé depuis le loader TypeScript propre à Playwright, provoque un conflit
  // de liage de modules ESM/CJS ("module not been linked") avec ses dépendances jose/jwks-rsa.
  const seedResult = spawnSync('npx', ['tsx', path.resolve(__dirname, 'run-seed.ts')], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (seedResult.status !== 0) {
    throw new Error(`[e2e] Seeding process exited with code ${seedResult.status}`);
  }
  // eslint-disable-next-line no-console
  console.log(`[e2e] Emulators ready (Firestore+Auth, project=${E2E_PROJECT_ID}, db=${E2E_DATABASE_ID}), data seeded.`);

  const appLogStream = fs.createWriteStream(APP_LOG, { flags: 'a' });
  const appProc: ChildProcess = spawn('npx', ['tsx', 'server.ts'], {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      VITE_USE_FIREBASE_EMULATOR: 'true',
      DISABLE_HMR: 'true',
    },
  });
  appProc.stdout?.pipe(appLogStream);
  appProc.stderr?.pipe(appLogStream);

  await waitForPort('http://127.0.0.1:3000/', 60_000);
  // eslint-disable-next-line no-console
  console.log('[e2e] App dev server ready on http://127.0.0.1:3000');

  fs.writeFileSync(
    PID_FILE,
    JSON.stringify({ emulatorPid: emulatorProc.pid, appPid: appProc.pid }, null, 2)
  );
}
