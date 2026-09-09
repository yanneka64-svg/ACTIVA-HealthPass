// === AMÉLIORATION AJOUTÉE : HealthPass 2.0, Phase 2 — Preauthorization (module
// src/modules/preauthorization/), derrière le flag `hp2_preauthorization` (désactivé par défaut,
// voir src/config/featureFlags.ts). Mode silencieux STRICT, comme Fraud Detection : ce module
// n'est qu'un indicateur informatif pour le Superviseur — il ne bloque JAMAIS la soumission d'un
// claim (AgentClaimsView.tsx) ni sa validation (approveClaim/rejectClaim, workflowService.ts),
// qui restent entièrement inchangés. Une vraie porte bloquante (accord préalable obligatoire
// avant remboursement) est un changement de comportement métier bien plus lourd, hors périmètre
// de ce premier incrément — voir HEALTHPASS_2_0_DISCOVERY.md, règle "shadow mode d'abord".
import { Claim } from '../../types';

// Seuil provisoire en USD (devise de base de l'application) au-delà duquel un accord préalable
// serait normalement requis pour ce type d'assurance santé collective. Valeur simple et ronde en
// attendant qu'ACTIVA confirme un seuil réel par organisation/type de soin — à rendre
// configurable par Admin dans un incrément ultérieur plutôt que codé en dur indéfiniment.
export const PREAUTHORIZATION_THRESHOLD_USD = 500;

export interface PreauthorizationResult {
  required: boolean;
  thresholdUsd: number;
}

export function checkPreauthorizationNeeded(claim: Claim): PreauthorizationResult {
  const amount = Number(claim.amount) || 0;
  return {
    required: amount > PREAUTHORIZATION_THRESHOLD_USD,
    thresholdUsd: PREAUTHORIZATION_THRESHOLD_USD,
  };
}
