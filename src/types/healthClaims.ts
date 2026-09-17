// === AMÉLIORATION AJOUTÉE : ACTIVA Health Claims — Phase 1 (fondation, données uniquement) ===
// Voir ACTIVA_HEALTH_CLAIMS_DISCOVERY.md à la racine du dépôt pour l'analyse complète. Ce
// fichier est entièrement ADDITIF : aucun type existant dans src/types/index.ts (Claim,
// ClaimStatus, Member, Organization, Provider...) n'est modifié, renommé ou réutilisé pour ce
// nouveau module — le flux de remboursement Agent existant (AgentClaimsView.tsx, WorkflowService,
// la collection Firestore `claims`) continue de fonctionner exactement comme avant, dans ses
// propres collections. `ClaimCase` ci-dessous est un concept séparé (dossier de sinistre
// multi-étapes avec revue médicale/paiement/communications), stocké dans une collection
// Firestore distincte (`claimCases`), pour ne jamais risquer de collision avec `Claim`.
//
// Conformément à la discipline déjà en place pour les modules HealthPass 2.0/3.0
// (src/modules/README.md) : aucune vue/écran n'est construit dans cette passe — uniquement le
// modèle de données et son type de rattachement aux rôles (voir src/utils/authUtils.ts et
// src/theme/roleTheme.ts pour les rôles ajoutés en parallèle).

/** Les 6 rôles de la spécification ACTIVA Health Claims. `ClaimsAgent`, `MedicalReviewer`,
 * `Finance` et `Management` sont nouveaux ; `Admin`/`Supervisor` réutilisent les rôles existants
 * (voir src/utils/authUtils.ts AppRole, étendu additivement). */
export type HealthClaimsRole =
  | 'Admin'
  | 'ClaimsAgent'
  | 'MedicalReviewer'
  | 'Supervisor'
  | 'Finance'
  | 'Management';

// --- Workflow (§4 / §5 de la spécification) --------------------------------------------------

/** Statut par défaut d'un dossier de sinistre. Stocké comme DONNÉE (voir
 * `ClaimWorkflowConfig` ci-dessous), jamais comme enum codé en dur, pour rester "configurable
 * par l'administrateur" comme l'exige la spécification (§4). Ce type liste seulement les valeurs
 * fournies par défaut au premier démarrage du module. */
export type ClaimCaseStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'RECEIVED'
  | 'UNDER_REVIEW'
  | 'MEDICAL_REVIEW'
  | 'PENDING_INFORMATION'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAYMENT_PROCESSING'
  | 'PAID'
  | 'CLOSED'
  | 'CANCELLED'
  | 'ESCALATED'
  | 'FRAUD_REVIEW';

export interface ClaimWorkflowStateConfig {
  id: ClaimCaseStatus | string;
  label: string;
  /** États vers lesquels une transition est permise depuis celui-ci. */
  allowedNextStates: (ClaimCaseStatus | string)[];
  /** Terminal = plus aucune transition sortante attendue (ex: CLOSED, PAID). */
  isTerminal?: boolean;
  color?: string;
}

/** Document unique `claimWorkflowConfigs/default` — la liste éditable par l'Admin des états et
 * transitions autorisées. Le seed ci-dessous (`DEFAULT_CLAIM_WORKFLOW_STATES`) est la valeur de
 * référence tant qu'aucun Admin ne l'a personnalisée. */
export interface ClaimWorkflowConfig {
  id: string;
  states: ClaimWorkflowStateConfig[];
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_CLAIM_WORKFLOW_STATES: ClaimWorkflowStateConfig[] = [
  { id: 'DRAFT', label: 'Draft', allowedNextStates: ['SUBMITTED', 'CANCELLED'] },
  { id: 'SUBMITTED', label: 'Submitted', allowedNextStates: ['RECEIVED', 'CANCELLED'] },
  { id: 'RECEIVED', label: 'Received', allowedNextStates: ['UNDER_REVIEW', 'CANCELLED'] },
  { id: 'UNDER_REVIEW', label: 'Under Review', allowedNextStates: ['MEDICAL_REVIEW', 'PENDING_INFORMATION', 'APPROVED', 'REJECTED', 'ESCALATED', 'FRAUD_REVIEW'] },
  { id: 'MEDICAL_REVIEW', label: 'Medical Review', allowedNextStates: ['PENDING_INFORMATION', 'APPROVED', 'REJECTED', 'ESCALATED', 'FRAUD_REVIEW'] },
  { id: 'PENDING_INFORMATION', label: 'Pending Information', allowedNextStates: ['UNDER_REVIEW', 'MEDICAL_REVIEW', 'CANCELLED'] },
  { id: 'FRAUD_REVIEW', label: 'Fraud Review', allowedNextStates: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ESCALATED'] },
  { id: 'ESCALATED', label: 'Escalated', allowedNextStates: ['UNDER_REVIEW', 'MEDICAL_REVIEW', 'APPROVED', 'REJECTED'] },
  { id: 'APPROVED', label: 'Approved', allowedNextStates: ['PAYMENT_PROCESSING'] },
  { id: 'REJECTED', label: 'Rejected', allowedNextStates: [], isTerminal: true },
  { id: 'PAYMENT_PROCESSING', label: 'Payment Processing', allowedNextStates: ['PAID'] },
  { id: 'PAID', label: 'Paid', allowedNextStates: ['CLOSED'], isTerminal: true },
  { id: 'CLOSED', label: 'Closed', allowedNextStates: [], isTerminal: true },
  { id: 'CANCELLED', label: 'Cancelled', allowedNextStates: [], isTerminal: true },
];

// --- Claim case & lines (§2, §3, §7, §20) -----------------------------------------------------

export type ServiceNature =
  | 'hospitalization'
  | 'consultation'
  | 'pharmacy'
  | 'laboratory'
  | 'imaging'
  | 'surgery'
  | 'maternity'
  | 'emergency'
  | 'other';

export type ClaimCasePriority = 'low' | 'normal' | 'high' | 'urgent';

/** Une ligne d'acte médical facturé, avec le détail d'évaluation (§7 — montant facturé/
 * éligible/exclu, franchise, quote-part, montant payable). Embarquée dans `ClaimCase.lines[]`,
 * suivant exactement le même choix de modélisation que `Claim.medicalActs[]` déjà existant
 * (voir src/types/index.ts) plutôt qu'une collection séparée. */
export interface ClaimLine {
  id?: string;
  description: string;
  serviceNature?: ServiceNature;
  billedAmount: number;
  eligibleAmount?: number;
  excludedAmount?: number;
  exclusionReason?: string;
  deductible?: number;
  copay?: number;
  payableAmount?: number;
}

/** Le dossier de sinistre "riche" de ACTIVA Health Claims — distinct de `Claim` (voir en-tête de
 * fichier). Référence l'assuré/organisation/prestataire existants (`Member.id`,
 * `Organization.name`, `Provider.id`) sans dupliquer leurs modèles. */
// === AMÉLIORATION AJOUTÉE : ACTIVA Health Claims — Phase 2 (assistant de création de dossier)
// === Ajout additif à `ClaimCase` (Phase 1) : aucun champ existant n'est modifié. Voir spec
// §3 étape 3 (pièces justificatives : nom, type, date d'ajout, utilisateur, statut de
// vérification).
export type ClaimDocumentType =
  | 'invoice'
  | 'prescription'
  | 'lab_result'
  | 'medical_report'
  | 'hospitalization_form'
  | 'receipt'
  | 'other';

export interface ClaimDocumentRef {
  id: string;
  name: string;
  type: ClaimDocumentType;
  url: string;
  addedAt: string;
  addedBy?: string;
  verificationStatus?: 'pending' | 'verified' | 'rejected';
}

export interface ClaimCase {
  id: string;
  reference: string;
  claimDate: string;
  declarationDate: string;

  memberId: string;
  memberCardNo: string;
  memberName: string;
  organization: string;

  providerId?: string;
  providerName?: string;
  doctorName?: string;

  serviceNature: ServiceNature;
  diagnosis?: string;
  currency: 'USD' | 'LRD';

  claimedAmount: number;
  eligibleAmount?: number;
  approvedAmount?: number;

  lines?: ClaimLine[];
  documents?: ClaimDocumentRef[];

  status: ClaimCaseStatus | string;
  priority?: ClaimCasePriority;
  slaDueAt?: string;

  assignedTo?: string;
  assignedToName?: string;

  fraudReviewFlagged?: boolean;
  fraudScore?: number;

  comments?: string;

  createdAt: string;
  createdBy?: string;
  createdByUid?: string;
  creatorName?: string;
}

// --- Medical review (§8) -----------------------------------------------------------------------

export type MedicalReviewOpinion =
  | 'APPROVED'
  | 'APPROVED_WITH_ADJUSTMENT'
  | 'PENDING'
  | 'REJECTED'
  | 'ESCALATED';

export interface MedicalReviewRecord {
  id: string;
  claimCaseId: string;
  claimCaseReference?: string;
  opinion: MedicalReviewOpinion;
  notes?: string;
  adjustedAmount?: number;
  reviewerId: string;
  reviewerName: string;
  reviewedAt: string;
}

// --- Fraud review (§9) --------------------------------------------------------------------------

export type FraudAnomalyType =
  | 'suspicious_invoice'
  | 'duplicate'
  | 'unusual_amount'
  | 'at_risk_provider'
  | 'abnormal_frequency'
  | 'diagnosis_mismatch'
  | 'suspect_document'
  | 'unusual_card_usage'
  | 'ceiling_overrun';

export interface FraudReviewRecord {
  id: string;
  claimCaseId: string;
  claimCaseReference?: string;
  anomalies: FraudAnomalyType[];
  score?: number;
  notes?: string;
  decision?: 'cleared' | 'confirmed_fraud' | 'escalated';
  reviewerId?: string;
  reviewerName?: string;
  reviewedAt?: string;
  createdAt: string;
}

// --- Payment (§12) ------------------------------------------------------------------------------

export type ClaimPaymentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'PROCESSING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED';

export interface ClaimPayment {
  id: string;
  claimCaseId: string;
  claimCaseReference?: string;
  approvedAmount: number;
  currency: 'USD' | 'LRD';
  beneficiary: string;
  beneficiaryType: 'provider' | 'member';
  paymentMode?: string;
  paymentReference?: string;
  status: ClaimPaymentStatus;
  expectedDate?: string;
  actualDate?: string;
  recordedBy?: string;
  createdAt: string;
}

// --- Communications (§11) ----------------------------------------------------------------------

export interface ClaimCommunicationAttachment {
  name: string;
  url: string;
}

/** Message unique dans le fil de discussion d'un dossier — création uniquement (append-only) :
 * voir le bloc `claimCommunications` dans firestore.rules (`allow update: if false`), pour
 * satisfaire l'exigence spec §15 "l'historique ne doit pas être modifiable depuis le frontend"
 * appliquée ici aussi aux communications. */
export interface ClaimCommunication {
  id: string;
  claimCaseId: string;
  claimCaseReference?: string;
  authorId: string;
  authorName: string;
  authorRole?: HealthClaimsRole | string;
  message: string;
  isDocumentRequest?: boolean;
  attachments?: ClaimCommunicationAttachment[];
  createdAt: string;
}
