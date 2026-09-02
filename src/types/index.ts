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
  password?: string;
  tempPassword?: string;
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
  organization: string;
  providerId: string;
  providerName: string;
  // Care modality (Ambulatoire / Hospitalisation)
  coverageType: 'Outpatient' | 'Inpatient';
  // Consultation type (Généraliste / Spécialiste)
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
  action: string;
  module: string;
  details: string;
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
  type: 'claim' | 'enrollment' | 'invoice' | 'system';
  targetSection?: NavSection;
  entityId?: string;
}

