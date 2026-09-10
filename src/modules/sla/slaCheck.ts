// === AMÉLIORATION AJOUTÉE : HealthPass 2.0, Phase 4 — SLA Tracking (module src/modules/sla/),
// derrière le flag `hp2_sla_tracking` (désactivé par défaut, voir src/config/featureFlags.ts).
// Mode silencieux STRICT, comme Fraud Detection / Preauthorization / BillAudit : indicateur
// informatif uniquement, n'intercepte jamais l'approbation/le rejet (workflowService.ts).
//
// Réutilise le seuil DÉJÀ affiché dans ReportsView.tsx ("Target SLA turnaround < 48h") plutôt que
// d'inventer une nouvelle valeur — ce module ajoute le suivi PAR CLAIM qui manquait (voir
// HEALTHPASS_2_0_DISCOVERY.md, section 3) : ReportsView affiche déjà une moyenne réelle après
// coup, mais rien ne signale qu'UN claim précis, encore en attente, a déjà dépassé ce seuil.
import { Claim } from '../../types';

export const SLA_TARGET_HOURS = 48;

export interface SlaCheckResult {
  breached: boolean;
  hoursElapsed: number;
}

/** Ne s'applique qu'aux claims encore `pending` — un claim déjà décidé (approved/rejected) a son
 *  propre temps de traitement réel, déjà couvert par la moyenne de ReportsView. */
export function checkSlaBreach(claim: Claim, now: Date = new Date()): SlaCheckResult {
  if (claim.status !== 'pending') {
    return { breached: false, hoursElapsed: 0 };
  }
  const submitted = new Date(claim.submissionDate).getTime();
  if (Number.isNaN(submitted)) {
    return { breached: false, hoursElapsed: 0 };
  }
  const hoursElapsed = Math.max(0, (now.getTime() - submitted) / (1000 * 60 * 60));
  return { breached: hoursElapsed > SLA_TARGET_HOURS, hoursElapsed };
}
