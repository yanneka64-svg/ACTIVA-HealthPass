// === AMÉLIORATION AJOUTÉE : tests end-to-end (préparation Go-Live, 2026-09-07) ===
// Arrête les processus démarrés par global-setup.ts (émulateurs + serveur de dev). Tue le
// groupe de processus entier (PID négatif) plutôt que le seul PID de tête, car
// `firebase emulators:start` lance des sous-processus (Firestore, Auth) qui ne recevraient pas
// SIGTERM autrement et resteraient orphelins entre deux exécutions de la suite E2E.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// package.json déclare "type": "module" (ESM) : pas de __dirname global disponible.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PID_FILE = path.resolve(__dirname, '.e2e-pids.json');

export default async function globalTeardown() {
  if (!fs.existsSync(PID_FILE)) return;
  const { emulatorPid, appPid } = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));

  for (const pid of [appPid, emulatorPid]) {
    if (!pid) continue;
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // already dead
      }
    }
  }

  fs.rmSync(PID_FILE, { force: true });
}
