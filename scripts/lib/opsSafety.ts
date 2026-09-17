/**
 * Aide partagée pour les scripts d'opérations "break-glass" (scripts/*.ts).
 *
 * === AMÉLIORATION AJOUTÉE : sécurité (durcissement Phase 1, 2026-09-17) ===
 * Ajoute deux garde-fous strictement additifs, sans changer le comportement existant
 * d'aucun script appelant :
 *   1. Une confirmation interactive avant toute écriture réelle (contournable
 *      explicitement par CONFIRM=yes pour un usage non interactif assumé) ;
 *   2. Un journal d'exécution horodaté persisté sur disque (scripts/logs/, gitignoré),
 *      EN COMPLÉMENT de la sortie console existante — jamais à sa place.
 *
 * Voir PHASE1_AUDIT_SCRIPTS_ET_SECURITE.md §1.bis pour le contexte de cet ajout.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

export interface OpsLog {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  logFilePath: string;
}

/**
 * Crée un journal d'exécution horodaté pour `scriptName` sous scripts/logs/.
 * Les méthodes retournées écrivent à la fois sur la console (comportement inchangé)
 * et, en plus, dans le fichier de log (écriture synchrone pour survivre à process.exit()).
 */
export function startOpsLog(scriptName: string): OpsLog {
  const logsDir = path.resolve(process.cwd(), 'scripts', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFilePath = path.join(logsDir, `${scriptName}-${timestamp}.log`);

  const persist = (level: 'LOG' | 'ERROR', args: unknown[]) => {
    const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] [${level}] ${line}\n`);
  };

  return {
    log: (...args: unknown[]) => {
      console.log(...args);
      persist('LOG', args);
    },
    error: (...args: unknown[]) => {
      console.error(...args);
      persist('ERROR', args);
    },
    logFilePath,
  };
}

/**
 * Demande une confirmation interactive ("OUI") avant de laisser l'appelant poursuivre
 * vers une écriture réelle. CONFIRM=yes dans l'environnement contourne explicitement
 * l'invite (usage non interactif assumé, ex. exécution scriptée par un opérateur).
 * Lève une erreur si la confirmation est refusée, absente d'un TTY sans CONFIRM=yes,
 * ou si la réponse n'est pas exactement "OUI".
 */
export async function confirmLiveWrite(actionDescription: string): Promise<void> {
  if (process.env.CONFIRM === 'yes') {
    console.log(`[confirmLiveWrite] CONFIRM=yes fourni — confirmation interactive ignorée pour : ${actionDescription}`);
    return;
  }
  if (!process.stdin.isTTY) {
    throw new Error(
      `Confirmation interactive impossible (pas de TTY) pour : ${actionDescription}. ` +
        `Relancez avec la variable d'environnement CONFIRM=yes pour un usage non interactif explicitement assumé.`
    );
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer: string = await new Promise((resolve) => {
    rl.question(
      `\n⚠️  Cette action va effectuer une écriture réelle : ${actionDescription}\nTapez OUI en majuscules pour confirmer : `,
      resolve
    );
  });
  rl.close();
  if (answer.trim() !== 'OUI') {
    throw new Error('Confirmation refusée ou invalide — opération annulée, aucune écriture effectuée.');
  }
}
