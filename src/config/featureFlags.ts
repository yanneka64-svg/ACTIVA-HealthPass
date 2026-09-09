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
  | 'hp2_provider_digital_card';

// Tous désactivés par défaut : chaque module ne s'active qu'explicitement, une fois prêt à être
// montré en shadow mode (voir règle de processus dans HEALTHPASS_2_0_DISCOVERY.md, section 4 :
// un aperçu de l'interface est présenté et confirmé avant toute implémentation réelle).
const DEFAULT_FLAGS: Record<FeatureFlagKey, boolean> = {
  hp2_eligibility_engine: false,
  hp2_coverage_engine: false,
  hp2_tariff_engine: false,
  hp2_preauthorization: false,
  hp2_bill_audit: false,
  hp2_fraud_detection: false,
  hp2_provider_digital_card: false,
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
