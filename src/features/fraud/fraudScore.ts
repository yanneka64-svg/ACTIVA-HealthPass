// === AMÉLIORATION AJOUTÉE : HealthPass 2.0, Phase 2 — Fraud Detection (module src/modules/fraud/),
// derrière le flag `hp2_fraud_detection` (désactivé par défaut, voir src/config/featureFlags.ts).
// Mode silencieux (shadow mode) STRICT : ce module ne calcule qu'un score informatif affiché au
// Superviseur — il ne bloque, ne modifie et n'intercepte JAMAIS approveClaim/rejectClaim
// (src/services/workflowService.ts), qui restent entièrement inchangés.
//
// Généralise, pour la vue Superviseur (tous les claims en attente), deux signaux qui existaient
// déjà mais uniquement côté Agent à la saisie (voir duplicateWarning/frequencyWarning dans
// AgentClaimsView.tsx) — plutôt que dupliquer une logique déjà écrite, ce module ajoute un
// troisième signal (montant inhabituel vs historique de l'assuré) et les combine en un score
// unique 0-100 utile au moment de la validation, pas seulement à la saisie.
import { Claim } from '../../types';

export interface FraudSignal {
  label: string;
  weight: number;
}

export type FraudPriority = 'high' | 'medium' | 'low' | 'none';

export interface FraudScoreResult {
  score: number; // 0-100
  priority: FraudPriority;
  signals: FraudSignal[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: string, b: string): number {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Infinity;
  return Math.abs(ta - tb) / DAY_MS;
}

/**
 * Score de risque fraude purement informatif pour UN claim, calculé à partir de l'historique
 * complet des claims du même assuré (peu importe leur statut — pending/approved/rejected).
 * Fonction pure, aucun accès réseau : peut être appelée pour chaque ligne d'une liste sans coût
 * de requête supplémentaire.
 */
export function computeFraudScore(claim: Claim, allClaims: Claim[]): FraudScoreResult {
  const signals: FraudSignal[] = [];
  const cardNo = (claim.memberCardNo || '').toLowerCase().trim();
  if (!cardNo) return { score: 0, priority: 'none', signals };

  const sameMemberOtherClaims = allClaims.filter(
    (c) => c.id !== claim.id && (c.memberCardNo || '').toLowerCase().trim() === cardNo
  );

  // Signal 1 : réclamation en double — même prestataire, à moins de 48h.
  const hasDuplicate = sameMemberOtherClaims.some(
    (c) =>
      (c.provider || '').toLowerCase().trim() === (claim.provider || '').toLowerCase().trim() &&
      daysBetween(c.serviceDate || c.submissionDate, claim.serviceDate || claim.submissionDate) <= 2
  );
  if (hasDuplicate) {
    signals.push({ label: 'Duplicate claim within 48h at the same provider', weight: 40 });
  }

  // Signal 2 : fréquence élevée — 3 réclamations ou plus (celle-ci incluse) en 30 jours.
  const recentCount =
    1 +
    sameMemberOtherClaims.filter(
      (c) => daysBetween(c.serviceDate || c.submissionDate, claim.serviceDate || claim.submissionDate) <= 30
    ).length;
  if (recentCount >= 3) {
    signals.push({ label: `${recentCount} claims within 30 days for this insured member`, weight: 35 });
  }

  // Signal 3 : montant inhabituel — plus de 3x la moyenne historique de l'assuré (si au moins 2
  // réclamations antérieures existent — sinon pas assez d'historique pour être significatif).
  if (sameMemberOtherClaims.length >= 2) {
    const avg =
      sameMemberOtherClaims.reduce((sum, c) => sum + (Number(c.amount) || 0), 0) / sameMemberOtherClaims.length;
    if (avg > 0 && Number(claim.amount) > avg * 3) {
      signals.push({ label: `Amount is ${(Number(claim.amount) / avg).toFixed(1)}x this member's average claim`, weight: 25 });
    }
  }

  const score = Math.min(100, signals.reduce((sum, s) => sum + s.weight, 0));
  const priority: FraudPriority = score >= 70 ? 'high' : score >= 40 ? 'medium' : score > 0 ? 'low' : 'none';

  return { score, priority, signals };
}
