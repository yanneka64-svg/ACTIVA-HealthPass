export type Language = 'en';

export type UserProfile = 'Admin' | 'Supervisor' | 'Superviseur' | 'Agent';

export type PermissionKey =
  | 'enrollment'
  | 'identification'
  | 'card_generation'
  | 'claims_management'
  | 'claims_validation'
  | 'enrollment_validation'
  | 'reports';

export interface ActivaEntity {
  id: string;
  name: string;
  country: string;
  code: string;
  phoneCode: string;
  currency: 'USD' | 'LRD' | 'XAF' | 'XOF' | 'GHS' | 'GNF' | 'SLE';
}

export const ACTIVA_ENTITIES: ActivaEntity[] = [
  { id: 'liberia', name: 'ACTIVA Liberia', country: 'Liberia', code: 'LR', phoneCode: '+231', currency: 'USD' },
  { id: 'cameroon', name: 'ACTIVA Cameroon', country: 'Cameroon', code: 'CM', phoneCode: '+237', currency: 'XAF' },
  { id: 'cotedivoire', name: "ACTIVA Côte d'Ivoire", country: "Côte d'Ivoire", code: 'CI', phoneCode: '+225', currency: 'XOF' },
  { id: 'ghana', name: 'ACTIVA Ghana', country: 'Ghana', code: 'GH', phoneCode: '+233', currency: 'GHS' },
  { id: 'guinea', name: 'ACTIVA Guinea', country: 'Guinea', code: 'GN', phoneCode: '+224', currency: 'GNF' },
  { id: 'drc', name: 'ACTIVA DRC', country: 'DR Congo', code: 'CD', phoneCode: '+243', currency: 'USD' },
  { id: 'sierraleone', name: 'ACTIVA Sierra Leone', country: 'Sierra Leone', code: 'SL', phoneCode: '+232', currency: 'SLE' },
];

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  authEmail?: string;
  fullName: string;
  position: string;
  phone: string;
  phoneCountryCode: string;
  profile: UserProfile;
  permissions: PermissionKey[];
  isActive: boolean;
  entity?: string;
  country?: string;
  mobileAccessEnabled?: boolean;
  isTemporaryPassword?: boolean;
  mustChangePassword?: boolean;
  passwordChangedAt?: string;
  lastPasswordReset?: string;
  createdAt: string;
  lastLogin?: string;
  // === AMÉLIORATION AJOUTÉE : sécurité (audit) — password/tempPassword restent typés (lus en
  // fallback pour les comptes créés avant ce correctif, voir passwordUtils.ts / LoginView.tsx)
  // mais ne sont plus jamais écrits en clair pour un compte nouvellement créé ou réinitialisé :
  // seuls passwordHash + passwordSalt le sont désormais (voir src/utils/passwordUtils.ts).
  password?: string;
  tempPassword?: string;
  passwordHash?: string;
  passwordSalt?: string;
  // === AMÉLIORATION AJOUTÉE : sécurité (Phase 1.3 — isolation par organisation) — champ
  // optionnel, additif, absent par défaut sur tous les comptes existants. Quand il est
  // renseigné par un Admin, restreint la lecture/écriture Firestore de ce compte (via
  // firestore.rules hasOrgAccess()) aux organisations clientes listées (Organization.name /
  // Member.organization / Claim.organization, etc. — un concept distinct de `entity`/
  // `country` ci-dessus, qui désignent la filiale ACTIVA employant l'agent). Absent ou vide =
  // aucune restriction (comportement identique à avant ce correctif). Voir
  // docs/security/CODE_AUDIT_MAP.md section 11 pour le contexte de cette décision.
  assignedOrganizations?: string[];
}

export type RelationshipType = 'Primary' | 'Principal' | 'Spouse' | 'Conjoint' | 'Child' | 'Enfant' | 'Ascendant' | 'Dependent';
export type MemberStatus = 'Active' | 'Actif' | 'Suspended' | 'Suspendu' | 'Inactive' | 'Inactif';

export type DependentRelationship = 'husband' | 'wife' | 'spouse' | 'child' | 'parent' | 'other';

export interface DependentItem {
  id?: string;
  cardNo?: string;
  fullName: string;
  relationship: DependentRelationship;
  age?: number | string;
  birthDate?: string;
  gender?: 'M' | 'F';
  hasBiometrics?: boolean;
}

export interface Member {
  outpatientBalanceUSD?: number;
  outpatientBalanceLRD?: number;
  inpatientBalanceUSD?: number;
  inpatientBalanceLRD?: number;
  outpatientCeilingUSD?: number;
  outpatientCeilingLRD?: number;
  inpatientCeilingUSD?: number;
  inpatientCeilingLRD?: number;
  id: string;
  cardNo: string;
  principalName: string;
  spouseName?: string;
  dependentRelationship?: DependentRelationship;
  dependents?: DependentItem[];
  children: string[]; // up to 4 or more
  birthDate: string;
  relationship: RelationshipType;
  organization: string;
  status: MemberStatus;
  hasPhoto: boolean;
  hasBiometrics: boolean;
  photoUrl?: string;
  fingerprintScore?: number;
  fingerprintSensor?: string;
  fingerprintDate?: string;
  nfiqQuality?: number;
  gender?: 'M' | 'F';
  phone?: string;
  email?: string;
  createdAt: string;
  // === AMÉLIORATION AJOUTÉE : le fichier Excel réel des assurés principaux (Staff) du
  // client porte une colonne "N° of Dependant" — un simple décompte déclaré des personnes
  // à charge, distinct du détail des ayants droit (importé séparément via le template
  // Dépendants). Champ optionnel pour ne perdre aucune information du fichier importé et
  // permettre plus tard une réconciliation "déclaré" vs "réellement enregistré".
  declaredDependentsCount?: number;
}

export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'returned';

export interface ClaimAttachment {
  id?: string;
  name: string;
  url: string;
  type: 'image' | 'pdf' | 'word' | 'document' | 'other';
  size?: string;
  uploadedAt?: string;
}

export interface Claim {
  currency?: 'USD' | 'LRD';
  doctorName?: string;
  medicalActs?: { name: string; amount: number; category?: string; description?: string }[];
  id: string;
  reference: string;
  memberCardNo: string;
  memberName: string;
  organization: string;
  provider: string;
  amount: number;
  serviceDate: string;
  submissionDate: string;
  status: ClaimStatus;
  careType: string;
  rejectionReason?: string;
  returnReason?: string;
  comments?: string;
  invoiceNumber?: string;
  approvedBy?: string;
  decisionDate?: string;
  photoUrl?: string;
  prescriptionUrl?: string;
  invoiceDocumentUrl?: string;
  attachments?: ClaimAttachment[];
  fingerprintSampleUrl?: string;
  fingerprintScore?: number;
  createdBy?: string;
  // === AMÉLIORATION AJOUTÉE : sécurité (Phase 1.4 — SoD, createdByUid déterminé serveur) —
  // distinct de `createdBy` ci-dessus (fourni par le client, jamais vérifié) : ce champ est
  // vérifié par firestore.rules (doit être égal à request.auth.uid quand il est présent), et
  // c'est lui qui gouverne désormais le test de non-auto-approbation à la mise à jour. Voir
  // firestore.rules et src/services/workflowService.ts.
  createdByUid?: string;
  creatorEmail?: string;
  creatorName?: string;
  assignedTo?: string;
  assignedAgentName?: string;
}

export type InvoiceStatus = 'valid' | 'pending' | 'rejected' | 'paid';

export interface InvoiceItem {
  id: string;
  reference: string;
  patientName: string;
  familyHead: string;
  cardNo: string;
  organization: string;
  provider: string;
  amount: number;
  serviceDate: string;
  status: InvoiceStatus;
  careType: string;
  prescribingDoctor?: string;
  coveragePercentage: number;
  // === AMÉLIORATION AJOUTÉE : ces trois champs étaient déjà lus par InvoicesView.tsx sans
  // être déclarés ici — champs additifs formalisant un usage déjà existant, sans changement de
  // comportement.
  claimId?: string;
  coveredAmount?: number;
  patientPolicyNumber?: string;
  // === AMÉLIORATION AJOUTÉE : détail des actes médicaux (nouveau modèle de bordereau de
  // règlement — voir InvoicesView.tsx / printUtils.ts), miroir de Claim.medicalActs.
  // Optionnel : les factures antérieures à ce correctif n'en disposent pas et retombent sur un
  // affichage à ligne unique (careType/amount/coveredAmount).
  medicalActs?: { name: string; amount: number; category?: string; description?: string }[];
}

export interface Enrollment {
  id: string;
  reference: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  cardNo: string;
  birthDate: string;
  gender?: 'M' | 'F';
  organization: string;
  relationship: RelationshipType;
  mainInsuredName?: string;
  mainInsuredCardNo?: string;
  phone?: string;
  email?: string;
  submissionDate: string;
  hasPhoto: boolean;
  hasBiometrics: boolean;
  photoUrl?: string;
  fingerprintScore?: number;
  idDocumentUrl?: string;
  status: 'pending' | 'approved' | 'rejected' | 'returned';
  rejectionReason?: string;
  returnReason?: string;
  comments?: string;
  decisionDate?: string;
  approvedBy?: string;
  createdBy?: string;
  // === AMÉLIORATION AJOUTÉE : sécurité (Phase 1.4) — voir Claim.createdByUid ci-dessus.
  createdByUid?: string;
  creatorEmail?: string;
  creatorName?: string;
  assignedTo?: string;
  assignedAgentName?: string;
}

export interface MedicalAct {
  id?: string;
  category: string;
  description: string;
  amount: number;
}

export interface MedicalForm {
  id: string;
  securityNumber: string;
  barcode: string;
  memberId: string;
  memberName: string;
  memberCardNo: string;
  // === AMÉLIORATION AJOUTÉE : date de naissance et sexe de l'assuré, capturés au moment de
  // la génération du Medical Form pour remplacer l'affichage du solde disponible sur le PDF ===
  memberBirthDate?: string;
  memberGender?: 'M' | 'F';
  organization: string;
  providerId: string;
  providerName: string;
  // Care modality (Outpatient / Inpatient)
  coverageType: 'Outpatient' | 'Inpatient';
  // Consultation type (Generalist / Specialist) — French variants kept for backward
  // compatibility with existing/legacy French-tagged records.
  practitionerType?: 'Generalist' | 'Specialist' | 'Généraliste' | 'Spécialiste';
  doctorSpecialty?: string;
  outpatientBalanceUSD: number;
  inpatientBalanceUSD: number;
  issueDate: string;
  expiryDate?: string;
  status: 'issued' | 'used' | 'pending_return' | 'completed';
  doctorPrescription?: {
    presumedDiagnosis?: string;
    requestedExams?: string;
    treatmentOrder?: string;
  };
  doctorName?: string;
  doctorSignatureDate?: string;
  memberSignatureDate?: string;
  createdAt: string;
  // === AMÉLIORATION AJOUTÉE : sécurité (Phase 1.4) — voir Claim.createdByUid. Ajouté ici pour
  // cohérence/traçabilité (audit) ; aucune règle de SoD n'est appliquée sur ce champ pour
  // medicalForms, cette collection n'ayant pas de notion de transition d'approbation
  // (status: issued/used/pending_return/completed — voir docs/security/CODE_AUDIT_MAP.md).
  createdByUid?: string;
  // === AMÉLIORATION AJOUTÉE : protection des données (revue 2026-09-05, section 2.4) — date de
  // rétention indicative (voir src/config/dataRetention.ts), calculée uniquement pour les
  // formulaires créés après ce correctif. Absente sur l'historique existant : ne signifie jamais
  // "à purger immédiatement", seulement "pas encore évaluée". Purement informative — aucune
  // suppression automatique n'est déclenchée par ce champ.
  retentionUntil?: string;
}

export type OrgStatus = 'Active' | 'Actif' | 'Expired' | 'Expiré' | 'Suspended' | 'Suspendu';

export interface Organization {
  id: string;
  name: string;
  policyNumber: string;
  effectiveDate: string;
  expirationDate: string;
  declaredMembers: number;
  coverageRate: number; // e.g. 80 (%)
  status: OrgStatus;
  contactEmail?: string;
  contactPhone?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  globalCeiling?: number;
}

// === AMÉLIORATION AJOUTÉE : module de gestion des polices d'assurance santé et suivi des
// primes (Health Insurance Policy Management & Premium Monitoring), intégré sans toucher au
// modèle Organization existant ni à sa table principale — voir src/services/policyEngine.ts
// pour le moteur de statut automatique et src/components/HealthPolicyConfigModal.tsx pour la
// configuration détaillée par organisation.
export type HealthPolicyStatus = 'Active' | 'Expiring Soon' | 'Expired' | 'Suspended' | 'Pending Renewal';
export type SuspensionReason = 'Non-payment' | 'Administrative' | 'Other';
export type PolicyPaymentFrequency = 'Annual' | 'Semi-Annual' | 'Quarterly' | 'Monthly';
export type PolicyPaymentStatus = 'Paid' | 'Partially Paid' | 'Overdue' | 'Pending';

export interface HealthPolicy {
  id: string;
  // NOTE : par construction (voir upsertHealthPolicy dans firestore.ts), `id` est
  // l'organisation exacte (Organization.name) — une police par organisation — ce qui permet
  // aux règles de sécurité Firestore de retrouver la police d'une réclamation/fiche médicale
  // par un simple get() sur /healthPolicies/{organization}, sans jointure côté serveur.
  organizationId: string;
  policyNumber: string;
  policyType?: string;
  effectiveDate: string;
  expirationDate: string;

  // Statut stocké : reflète le dernier calcul du moteur (getPolicyCoverageStatus), recalculé
  // et persisté à chaque chargement/écriture pertinente — jamais la seule source de vérité
  // affichée (l'UI recalcule toujours en direct à partir des dates/paiements réels).
  status: HealthPolicyStatus;
  suspensionReason?: SuspensionReason;
  manuallySuspended?: boolean;

  annualPremium: number;
  currency: string;

  paymentFrequency: PolicyPaymentFrequency;
  installmentAmount: number;

  nextPaymentDueDate?: string;
  lastPaymentDate?: string;
  lastPaymentAmount?: number;

  // Seuils configurables (jamais codés en dur dans le moteur) — voir
  // policyEngine.ts DEFAULT_GRACE_PERIOD_DAYS / DEFAULT_EXPIRING_SOON_WARNING_DAYS pour les
  // valeurs par défaut appliquées quand ces champs sont absents.
  gracePeriodDays?: number;
  expiringSoonWarningDays?: number;

  outstandingAmount?: number;
  coverageBlocked: boolean;

  suspensionDate?: string;
  reactivationDate?: string;

  updatedAt: string;
  updatedBy?: string;
}

export interface PolicyPayment {
  id: string;
  policyId: string;
  paymentDate: string;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  currency: string;

  status: PolicyPaymentStatus;

  paymentReference?: string;
  paymentMethod?: string;

  // Trimestre couvert par ce paiement (1-4), utilisé pour l'échéancier "Q1 Paid / Q2 Paid /
  // Q3 Overdue / Q4 Pending" des polices à fréquence trimestrielle.
  quarter?: 1 | 2 | 3 | 4;

  recordedBy?: string;
  createdAt: string;
}

export type ProviderType =
  | 'Hospital'
  | 'Hôpital'
  | 'Clinic'
  | 'Clinique'
  | 'Pharmacy'
  | 'Pharmacie'
  | 'Diagnostic Center'
  | 'Centre de diagnostic'
  | 'Dental Clinic'
  | 'Cabinet dentaire'
  | 'Optical Center'
  | 'Optique';

export type KYPStatus = 'validated' | 'pending' | 'rejected';
export type ProviderStatus = 'Contracted' | 'Conventionné' | 'Non-contracted' | 'Non conventionné' | 'Suspended' | 'Suspendu';

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  location: string;
  conventionNumber: string;
  kypStatus: KYPStatus;
  contactPhone: string;
  contactEmail?: string;
  tier?: string;
  city?: string;
  phone?: string;
  discountRate?: number;
  status?: ProviderStatus;
}

export type PeriodicityType = 'Annual' | 'Annuelle' | 'Per service' | 'Par acte' | 'Per stay' | 'Par séjour';

export interface Ceiling {
  id: string;
  organizationId?: string;
  organization?: string;
  policyNumber?: string;
  serviceCategory?: string;
  careType: string;
  
  // Age Limits per Policy Category
  maxAgePrincipal?: number; // e.g. 65
  maxAgeSpouse?: number;    // e.g. 65
  maxAgeChild?: number;     // e.g. 21 (or 25)
  maxAgeStudent?: number;   // e.g. 25 (if enrolled in school/university)
  
  // Specific Outpatient & Inpatient Monthly & Annual Limits
  outpatientMonthlyPrincipal?: number;
  outpatientMonthlyDependent?: number;
  inpatientMonthlyPrincipal?: number;
  inpatientMonthlyDependent?: number;

  outpatientAnnualPrincipal?: number;
  outpatientAnnualDependent?: number;
  inpatientAnnualPrincipal?: number;
  inpatientAnnualDependent?: number;

  // Backwards compatibility legacy fields
  monthlyLimit: number;
  individualLimit: number;
  familyLimit: number;
  periodicity: PeriodicityType;
  consumedPercentage?: number;
}

export interface CeilingConfig {
  id: string;
  organizationId: string;
  orgName: string;
  principalOutpatient: number;
  dependentsOutpatient: number;
  principalInpatient: number;
  dependentsInpatient: number;
  currency: string;
  lastUpdated?: string;
}

export interface LoginLog {
  id: string;
  userEmail: string;
  ipAddress: string;
  status: 'success' | 'failed';
  userAgent: string;
  timestamp: string;
  location?: string;
  username?: string;
  profile?: string;
  browser?: string;
  lastLogin?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  userName?: string;
  action: string;
  module: string;
  category?: string;
  details: string;
  userId?: string;
  userRole?: string;
  entityId?: string;
  entityType?: string;
  ip?: string;
  userAgent?: string;
  severity?: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  integrityHash?: string;
}

export type NavSection =
  | 'dashboard'
  | 'claims'
  | 'invoices'
  | 'enrollments'
  | 'reports'
  | 'members'
  | 'organizations'
  | 'providers'
  | 'ceilings'
  | 'accounts'
  | 'logs'
  | 'identification'
  | 'medical_form'
  | 'claims_validation'
  | 'enrollments_validation'
  | 'validated_history'
  | 'receipts';

export interface AppNotification {
  id: string;
  recipientId?: string;
  recipientEmail?: string;
  recipientRole?: UserProfile | string;
  title: string;
  message: string;
  time?: string;
  timestamp: string;
  unread: boolean;
  type: 'claim' | 'enrollment' | 'invoice' | 'system' | 'policy';
  targetSection?: NavSection;
  entityId?: string;
}

// === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — sur demande
// explicite. Voir src/services/cardNumberService.ts pour le moteur (génération
// transactionnelle, migration, unicité).
//
// === AMÉLIORATION AJOUTÉE (v2) : nouvelle structure de numéro AMID-YYMMDD-NNNNN — sur
// demande explicite, remplace l'ancienne structure AMID-XXXXX-XXXX (deux séquences
// indépendantes "printed"/"insured"). Le premier segment (6 chiffres) est désormais une
// date d'émission (année, mois, jour) et non plus un compteur ; seul le second segment (5
// chiffres, "assuredNumber") reste une séquence globale, unique et jamais réutilisée — un
// registre d'unicité (une entrée par numéro complet) et une trace d'audit par attribution
// (voir section 29 de la demande initiale) sont conservés à l'identique.
export type CardAssignmentMethod = 'ENROLLMENT' | 'EXCEL_IMPORT' | 'MANUAL' | 'MIGRATION';

// Document unique `counters/cardNumbers` — l'état courant de l'unique séquence restante
// (assuredNumber, segment XXXXX). Le segment de date n'est plus un compteur : il est
// recalculé à chaque émission à partir de la date d'émission de la carte concernée.
export interface CardNumberCounters {
  lastAssuredNumber: number; // ex: 496 (segment XXXXX)
  formatVersion?: 'v2'; // présent une fois la migration vers AMID-YYMMDD-NNNNN effectuée
  updatedAt?: string;
}

// Un document par numéro complet dans `cardNumberRegistry/{cardNumber}` — l'existence du
// document EST la contrainte d'unicité (deux assurés ne peuvent jamais créer le même id de
// document). Sert aussi de trace d'audit ("Who / What / When / How", voir section 29).
export interface CardNumberAssignment {
  id: string; // = cardNumber, ex: "AMID-260903-00496"
  cardNumber: string;
  issueDate: string; // "260903" (YYMMDD, segment XXXXXX)
  assuredNumber: string; // "00496" (segment XXXXX)
  organization?: string | null;
  memberId?: string | null;
  insuredName?: string | null;
  assignedBy?: string | null; // uid
  assignedByName?: string | null;
  assignedAt: string;
  method: CardAssignmentMethod;
}

// Une ligne de la prévisualisation d'import Excel (section 10) — calculée sans rien écrire
// en base tant que l'import n'est pas confirmé (section 23).
export interface CardNumberPreviewRow {
  rowIndex: number;
  insuredName: string;
  organization?: string;
  cardNoExcel: string; // '—' si vide dans le fichier
  cardNoFinal: string; // '—' si aucun numéro ne peut être attribué (doublon/invalide)
  action: 'Kept' | 'Generated' | 'None';
  status: 'Valid' | 'Duplicate' | 'Invalid';
  reason?: string;
}

export interface AssignmentContext {
  organization?: string | null;
  memberId?: string | null;
  insuredName?: string | null;
  assignedBy?: string | null;
  assignedByName?: string | null;
}

export interface ClaimDecisionPayload {
  claimId: string;
  decision: 'approved' | 'rejected' | 'returned';
  approverId: string;
  approverName: string;
  approverRole: string;
  rejectionReason?: string;
  approvedAmountUSD?: number;
  approvedAmountLRD?: number;
}

export interface EnrollmentDecisionPayload {
  enrollmentId: string;
  decision: 'approved' | 'rejected';
  approverId: string;
  approverName: string;
  approverRole: string;
  rejectionReason?: string;
}

export interface ImportRowInput {
  principalName: string;
  cardNoRaw?: string;
  organization: string;
  birthDate?: string;
  gender?: string;
  relationship?: string;
  phone?: string;
  email?: string;
}

export interface ImportReportItem {
  rowIndex: number;
  principalName: string;
  organization: string;
  cardNo: string;
  status: 'SUCCESS' | 'SKIPPED' | 'FAILED';
  reason?: string;
}

export interface ImportExecutionResult {
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  report: ImportReportItem[];
}

export interface AuditLogEntry {
  id?: string;
  timestamp: string;
  userId: string;
  userName?: string;
  userRole: string;
  action: string;
  category: string;
  entityId?: string;
  entityType?: string;
  details: string;
  ip?: string;
  userAgent?: string;
  severity?: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
}

