// === AMÉLIORATION AJOUTÉE : protection des données (revue 2026-09-05, section 2.2) ===
// Constat : aucune interface TypeScript ne portait de champ de classification — chaque
// nouvelle fonctionnalité devait « redécouvrir » manuellement qu'un champ est sensible (voir
// docs/security/HEALTH_DATA_GOVERNANCE_REVIEW_2026-09-05.md). Ce module centralise, pour
// référence, la classification de chaque champ identifié comme sensible dans les collections
// Firestore de l'application — sans changer aucun type existant ni le comportement de
// l'application (documentation-as-code, pas une contrainte d'exécution).
//
// À consulter avant d'ajouter un nouveau champ à `members`, `claims`, `enrollments` ou
// `medicalForms` : s'il révèle une information de santé, un identifiant biométrique, ou un
// identifiant direct de la personne, il doit être ajouté ici avec sa classification réelle.
export type DataSensitivity =
  | 'public' // Référentiel non personnel (organisations, prestataires, plafonds)
  | 'internal' // Opérationnel, non personnel (statuts, montants agrégés, compteurs)
  | 'personal' // Identifiant direct d'une personne (RGPD art. 4) sans catégorie particulière
  | 'health' // Donnée de santé (RGPD art. 9 / catégorie particulière)
  | 'biometric'; // Donnée biométrique identifiante (RGPD art. 9 / catégorie particulière)

export interface FieldClassification {
  collection: string;
  field: string;
  sensitivity: DataSensitivity;
  /** true si ce champ est chiffré applicativement (voir src/utils/sensitiveData.ts). */
  encryptedAtApplicationLevel?: boolean;
  notes?: string;
}

export const DATA_CLASSIFICATION: readonly FieldClassification[] = [
  // --- Données de santé (RGPD art. 9) ---
  // === AMÉLIORATION AJOUTÉE : sécurité/protection des données (revue 2026-09-05, section 2.1)
  // — depuis ce correctif, ces 3 champs ne vivent plus dans le document `medicalForms/{id}`
  // pour les NOUVEAUX formulaires : ils sont dans le document séparé
  // `medicalForms/{id}/clinical/content` (voir FirestoreService.addMedicalForm et
  // firestore.rules). Les documents créés avant ce correctif les gardent intégrés au document
  // parent (jamais migrés de force) — voir hydratePrescriptionFromSubcollection dans
  // sensitiveData.ts pour la logique de repli qui gère les deux formats.
  {
    collection: 'medicalForms/clinical',
    field: 'presumedDiagnosis',
    sensitivity: 'health',
    encryptedAtApplicationLevel: true,
    notes: 'Sous-collection medicalForms/{id}/clinical/content — voir note ci-dessus.',
  },
  {
    collection: 'medicalForms/clinical',
    field: 'requestedExams',
    sensitivity: 'health',
    encryptedAtApplicationLevel: true,
    notes: 'Sous-collection medicalForms/{id}/clinical/content — voir note ci-dessus.',
  },
  {
    collection: 'medicalForms/clinical',
    field: 'treatmentOrder',
    sensitivity: 'health',
    encryptedAtApplicationLevel: true,
    notes: 'Sous-collection medicalForms/{id}/clinical/content — voir note ci-dessus.',
  },
  {
    collection: 'medicalForms',
    field: 'coverageType',
    sensitivity: 'health',
    notes: 'Ambulatoire/hospitalisation — révèle la nature générale du soin.',
  },

  // --- Données biométriques (RGPD art. 9) ---
  { collection: 'members', field: 'fingerprintScore', sensitivity: 'biometric' },
  { collection: 'members', field: 'fingerprintSensor', sensitivity: 'biometric' },
  { collection: 'members', field: 'fingerprintDate', sensitivity: 'biometric' },
  { collection: 'members', field: 'nfiqQuality', sensitivity: 'biometric' },
  { collection: 'enrollments', field: 'fingerprintScore', sensitivity: 'biometric' },
  { collection: 'claims', field: 'fingerprintSampleUrl', sensitivity: 'biometric' },
  { collection: 'claims', field: 'fingerprintScore', sensitivity: 'biometric' },

  // --- Identifiants directs / PII ---
  { collection: 'members', field: 'photoUrl', sensitivity: 'personal', notes: 'Photo d\'identification.' },
  { collection: 'enrollments', field: 'photoUrl', sensitivity: 'personal' },
  { collection: 'enrollments', field: 'idDocumentUrl', sensitivity: 'personal', notes: 'Pièce d\'identité scannée.' },
  { collection: 'members', field: 'birthDate', sensitivity: 'personal' },
  { collection: 'members', field: 'gender', sensitivity: 'personal' },
  { collection: 'members', field: 'phone', sensitivity: 'personal' },
  { collection: 'members', field: 'email', sensitivity: 'personal' },
  { collection: 'members', field: 'principalName', sensitivity: 'personal' },
  { collection: 'claims', field: 'memberName', sensitivity: 'personal' },
  { collection: 'enrollments', field: 'fullName', sensitivity: 'personal' },
  { collection: 'medicalForms', field: 'memberName', sensitivity: 'personal' },
  { collection: 'medicalForms', field: 'memberBirthDate', sensitivity: 'personal' },
  { collection: 'medicalForms', field: 'memberGender', sensitivity: 'personal' },

  // --- Explicitement PAS des identifiants nationaux (vérifié en implémentant 3.1) ---
  {
    collection: 'medicalForms',
    field: 'securityNumber',
    sensitivity: 'internal',
    notes:
      'Code-barres interne au document (format AMID-YY-DD-XXXX, dérivé de la date d\'impression ' +
      'et des 4 derniers chiffres du numéro de carte — voir medicalFormUtils.ts). PAS un ' +
      'identifiant national de la personne : ne pas chiffrer, casserait la recherche/le scan.',
  },
  {
    collection: 'medicalForms',
    field: 'barcode',
    sensitivity: 'internal',
    notes: 'Identique à securityNumber — même code-barres document.',
  },

  // --- Financier lié à la santé (révèle indirectement la nature d'un acte) ---
  { collection: 'claims', field: 'amount', sensitivity: 'personal', notes: 'Recoupé avec careType, peut révéler la nature d\'un acte médical.' },
] as const;

/** Returns the classification entries for a given collection, for quick lookup. */
export function getClassificationForCollection(collection: string): FieldClassification[] {
  return DATA_CLASSIFICATION.filter((c) => c.collection === collection);
}

/** Returns true if any field in `collection` is classified as 'health' or 'biometric'. */
export function collectionHoldsSpecialCategoryData(collection: string): boolean {
  return DATA_CLASSIFICATION.some(
    (c) => c.collection === collection && (c.sensitivity === 'health' || c.sensitivity === 'biometric')
  );
}
