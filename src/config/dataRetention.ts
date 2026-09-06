// === AMÉLIORATION AJOUTÉE : protection des données (revue 2026-09-05, section 2.4 — cycle de
// vie / rétention des données de santé) ===
// Étape 1 (non destructive) de la remédiation 2.4 : aucune donnée n'est jamais supprimée
// automatiquement par ce module. Il calcule uniquement, pour un NOUVEAU formulaire médical, une
// date `retentionUntil` indicative à partir d'une durée par défaut — et fournit une fonction pure
// pour déterminer si un formulaire l'a dépassée, utilisée par l'écran Admin/Supervisor pour
// signaler (jamais purger automatiquement) les dossiers arrivés à échéance.
//
// ⚠️ DURÉE PROVISOIRE — À CONFIRMER AVEC LA CONFORMITÉ AVANT TOUTE PURGE AUTOMATISÉE :
// ACTIVA opère dans 7 pays (Liberia, Cameroun, Côte d'Ivoire, Ghana, Guinée, RDC, Sierra Leone),
// chacun avec sa propre réglementation assurantielle sur la durée de conservation des dossiers
// médicaux/sinistres après la fin d'un contrat. Le modèle de données actuel (`Organization` — le
// client assuré, pas le pays — n'a pas de champ pays exploitable pour une règle par pays sans
// restructuration plus large. En attendant cette confirmation pays par pays, une durée unique et
// délibérément prudente (plus longue que nécessaire plutôt que trop courte, pour ne jamais
// signaler un dossier comme "à traiter" avant que ce soit réellement légal de le faire) est
// utilisée par défaut pour toutes les organisations. NE PAS construire de suppression automatique
// sur cette seule valeur sans validation explicite — voir
// docs/security/HEALTH_DATA_GOVERNANCE_REVIEW_2026-09-05.md section 2.4.
export const DEFAULT_MEDICAL_FORM_RETENTION_YEARS = 10;

/**
 * Calcule la date de rétention indicative d'un formulaire médical (issueDate + durée par
 * défaut). Ne supprime ni ne modifie rien : produit uniquement une date à stocker sur le document
 * pour permettre, plus tard, un rapport ou une revue manuelle.
 */
export function computeMedicalFormRetentionUntil(issueDateIso: string, retentionYears = DEFAULT_MEDICAL_FORM_RETENTION_YEARS): string {
  const issueDate = new Date(issueDateIso);
  const base = Number.isNaN(issueDate.getTime()) ? new Date() : issueDate;
  const retentionUntil = new Date(base);
  retentionUntil.setFullYear(retentionUntil.getFullYear() + retentionYears);
  return retentionUntil.toISOString();
}

/** true si `retentionUntilIso` est renseignée et déjà dépassée. Jamais vrai si absente (dossier
 * antérieur à ce correctif, ou durée pas encore calculée) : l'absence de valeur ne doit jamais
 * être interprétée comme "à purger immédiatement". */
export function isPastRetention(retentionUntilIso: string | undefined, now: Date = new Date()): boolean {
  if (!retentionUntilIso) return false;
  const retentionUntil = new Date(retentionUntilIso);
  if (Number.isNaN(retentionUntil.getTime())) return false;
  return retentionUntil.getTime() <= now.getTime();
}
