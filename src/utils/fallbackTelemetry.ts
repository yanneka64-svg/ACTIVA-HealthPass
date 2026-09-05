// === AMÉLIORATION AJOUTÉE : fiabilité (audit 2026-09-05, FIAB-02) ===
// Constat : plusieurs décisions métier sensibles (statut de police, génération de numéro de
// carte) tentent d'abord une Cloud Function, puis retombent SILENCIEUSEMENT sur un calcul
// client en cas d'échec pour quelque raison que ce soit (voir policyEngine.ts,
// cardNumberService.ts) — volontairement, pour ne jamais bloquer un utilisateur légitime tant
// que l'infrastructure serveur (Cloud Functions) n'est pas confirmée déployée (voir
// docs/security/PHASE5_CLOUD_FUNCTIONS_WIRING.md). Le revers documenté de ce choix : rien
// n'alerte l'équipe technique qu'une Cloud Function est indisponible, une dégradation qui peut
// donc passer inaperçue indéfiniment.
//
// Ce module journalise chaque repli dans `auditLogs` (schéma déjà imposé par firestore.rules,
// voir DATA-03) SANS jamais bloquer l'appelant ni changer son comportement en cas d'échec de la
// journalisation elle-même. Un anti-spam en mémoire (par onglet navigateur) limite à une entrée
// toutes les 5 minutes par nom de repli, pour éviter d'inonder le journal en cas de panne
// prolongée d'une Cloud Function très sollicitée (ex. génération de numéro de carte).
import { FirestoreService } from '../services/firestore';

const lastLoggedAt: Record<string, number> = {};
const MIN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Records that a server-side (Cloud Function) call fell back to client-side logic. Fire-and-
 * forget: never throws, never delays the caller.
 */
export function recordServerFallback(fallbackName: string, detail?: string): void {
  const now = Date.now();
  const last = lastLoggedAt[fallbackName] || 0;
  if (now - last < MIN_INTERVAL_MS) return;
  lastLoggedAt[fallbackName] = now;

  try {
    // Best-effort: uses whatever identity is available; auth may not be initialized in every
    // caller context. Falls back to 'system' rather than failing the whole telemetry call.
    import('../lib/firebase').then(({ auth }) => {
      FirestoreService.addLog({
        userId: auth.currentUser?.uid || 'system',
        userName: auth.currentUser?.displayName || auth.currentUser?.email || 'System',
        userRole: 'System',
        action: 'SERVER_FALLBACK_TRIGGERED',
        category: 'Reliability',
        entityId: fallbackName,
        entityType: 'system',
        details: `Cloud Function "${fallbackName}" unavailable — degraded to client-side logic.${detail ? ` ${detail}` : ''}`,
      }).catch(() => {
        // Non-fatal: telemetry must never surface an error to the caller.
      });
    }).catch(() => {});
  } catch {
    // Never let telemetry break the caller.
  }
}
