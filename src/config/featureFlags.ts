// === AMÉLIORATION AJOUTÉE : fondation feature-flag (HealthPass 2.0, Phase 0 — Étape 0.2) ===
// Objectif : permettre à chaque module HealthPass 2.0 (Eligibility/Coverage/Tariff Engines,
// Preauthorization/BillAudit/FraudDetection, etc.) de démarrer désactivé par défaut et en
// "shadow mode" (visible/informatif, jamais bloquant) avant toute promotion en production —
// conformément à la RÈGLE ABSOLUE du plan HealthPass 2.0 (voir HEALTHPASS_2_0_DISCOVERY.md,
// section 4). Ce module ne modifie AUCUN comportement existant : aucun flag n'est encore lu
// nulle part dans l'application au moment de sa création.
//
// Portée volontairement minimale pour cette étape : un registre typé de clés + une fonction de
// lecture, avec une seule source de dérogation locale (localStorage) pour permettre de tester un
// module en développement sans l'activer pour tout le monde. Aucune dépendance à Firestore/
// Remote Config ici — si un pilotage à distance (par un Admin, en production) devient
// nécessaire, il s'ajoutera plus tard comme une SOURCE supplémentaire, sans changer la signature
// de `isFeatureEnabled`.
export type FeatureFlagKey =
  | 'hp2_eligibility_engine'
  | 'hp2_coverage_engine'
  | 'hp2_tariff_engine'
  | 'hp2_preauthorization'
  | 'hp2_bill_audit'
  | 'hp2_fraud_detection'
  | 'hp2_provider_digital_card'
  | 'hp2_sla_tracking'
  | 'hp2_reimbursement_tracking';

// === AMÉLIORATION AJOUTÉE : promotion explicite en production (2026-09-10, demande directe de
// l'utilisateur — "rendre tout ça visible... pour que tout le monde puisse le voir") ===
// Chaque module listé ci-dessous a été validé individuellement (aperçu confirmé avant
// implémentation, composant réel vérifié avant commit — voir HEALTHPASS_2_0_DISCOVERY.md) avant
// cette promotion groupée. `hp2_eligibility_engine`/`hp2_coverage_engine` restent sans effet :
// aucun module ne lit ces deux clés (décision documentée de garder l'existant
// eligibilityService.ts + le taux de couverture par organisation plutôt que de le remplacer).
//
// État réel de chaque module une fois ce flag actif pour tout le monde (voir
// HEALTHPASS_2_0_DISCOVERY.md, section 6, pour le détail) :
//  - hp2_fraud_detection / hp2_preauthorization / hp2_bill_audit / hp2_sla_tracking : purement
//    client, aucune dépendance de déploiement — pleinement fonctionnels.
//  - hp2_reimbursement_tracking : écrit sur `invoices`, déjà couvert par les règles Firestore
//    existantes (aucune nouvelle règle requise) — pleinement fonctionnel.
//  - hp2_tariff_engine : le bouton "Tariffs" est visible, mais la lecture/écriture de
//    `medicalTariffs` échoue tant que la règle Firestore correspondante (déjà committée) n'est
//    pas déployée — échoue silencieusement vers un catalogue vide (voir correctif du
//    2026-09-10 dans firestore.ts), plus de bannière globale.
//  - hp2_provider_digital_card : le bouton "Digital Card" (écran Agent uniquement) est visible,
//    mais la génération/vérification de signature échoue tant que CARD_SIGNING_KEY et les
//    Cloud Functions associées ne sont pas déployés — message d'erreur clair affiché dans la
//    modale, jamais un blocage silencieux.
const DEFAULT_FLAGS: Record<FeatureFlagKey, boolean> = {
  hp2_eligibility_engine: true,
  hp2_coverage_engine: true,
  hp2_tariff_engine: true,
  hp2_preauthorization: true,
  hp2_bill_audit: true,
  hp2_fraud_detection: true,
  hp2_provider_digital_card: true,
  hp2_sla_tracking: true,
  hp2_reimbursement_tracking: true,
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
