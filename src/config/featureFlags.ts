// === AMÉLIORATION AJOUTÉE : fondation feature-flag (HealthPass 2.0, Phase 0 — Étape 0.2) ===
// Objectif : permettre à chaque module HealthPass 2.0 de démarrer désactivé par défaut et en
// "shadow mode" (visible/informatif, jamais bloquant) avant toute promotion en production —
// conformément à la RÈGLE ABSOLUE du plan HealthPass 2.0 (voir HEALTHPASS_2_0_DISCOVERY.md,
// section 4).
//
// === AMÉLIORATION AJOUTÉE : promotion en production (2026-09-10, demande directe de
// l'utilisateur) puis retrait de deux modules (même date, demande explicite) ===
// `hp2_tariff_engine` (Tariff Engine, Admin) et `hp2_provider_digital_card` (Digital Card + QR)
// ont été retirés du registre et leur code supprimé : le premier parce que les tarifs doivent
// rester sous le contrôle des prestataires médicaux (dynamiques, pas un référentiel centralisé
// dans l'app) ; le second parce qu'il dépendait d'un déploiement Cloud Functions hors de portée
// de cette session et ne correspondait pas au besoin réel. Voir HEALTHPASS_2_0_DISCOVERY.md pour
// le détail. `hp2_eligibility_engine`/`hp2_coverage_engine` restent sans effet : aucun module ne
// lit ces deux clés (décision documentée de garder l'existant eligibilityService.ts + le taux de
// couverture par organisation plutôt que de le remplacer).
export type FeatureFlagKey =
  | 'hp2_eligibility_engine'
  | 'hp2_coverage_engine'
  | 'hp2_preauthorization'
  | 'hp2_bill_audit'
  | 'hp2_fraud_detection'
  | 'hp2_sla_tracking'
  | 'hp2_reimbursement_tracking'
  // === AMÉLIORATION AJOUTÉE : HealthPass 3.0 — Claim 360 (revue 2026-09-12, roadmap de
  // modernisation) === Panneau à onglets agrégeant des données déjà chargées côté client
  // (membre/organisation/prestataire/historique d'audit) sur un claim — aucune nouvelle
  // collection Firestore, aucun nouveau calcul métier. Vérifié en navigateur réel (Playwright,
  // flag activé localement) sur ClaimsView.tsx et AgentClaimsView.tsx avant promotion — voir
  // commit d'introduction. Promu en production le 2026-09-12 (demande directe de l'utilisateur).
  | 'hp3_claim_360';

// Actifs pour tout le monde (voir HEALTHPASS_2_0_DISCOVERY.md, section 6) : Fraud Detection,
// Preauthorization, BillAudit, SLA Tracking et Reimbursement & Reconciliation sont purement
// client ou n'utilisent que des règles Firestore déjà déployées — pleinement fonctionnels.
const DEFAULT_FLAGS: Record<FeatureFlagKey, boolean> = {
  hp2_eligibility_engine: true,
  hp2_coverage_engine: true,
  hp2_preauthorization: true,
  hp2_bill_audit: true,
  hp2_fraud_detection: true,
  hp2_sla_tracking: true,
  hp2_reimbursement_tracking: true,
  hp3_claim_360: true,
};

const STORAGE_KEY_PREFIX = 'activa_ff_';

/**
 * true si le flag est activé. Ordre de résolution : dérogation locale (localStorage, pour le
 * développement/la démonstration ciblée d'un module) puis valeur par défaut du registre
 * ci-dessus. Ne lève jamais d'exception (environnement sans localStorage compris).
 */
export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  try {
    const override = localStorage.getItem(STORAGE_KEY_PREFIX + flag);
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch {
    // localStorage indisponible (SSR, mode privé restrictif...) : on retombe sur le défaut.
  }
  return DEFAULT_FLAGS[flag];
}

/** Dérogation locale explicite, réservée au développement/à la démonstration d'un module en
 * cours de construction — n'affecte jamais que le navigateur courant. */
export function setLocalFeatureFlagOverride(flag: FeatureFlagKey, enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + flag, String(enabled));
  } catch {
    // Ignoré : la dérogation locale est un confort de développement, jamais un chemin critique.
  }
}
