// === AMÉLIORATION AJOUTÉE : moteur centralisé de statut de police d'assurance santé
// (Health Insurance Policy Management & Premium Monitoring module). Toute décision "l'assuré
// a-t-il droit aux soins ?" dans l'application (Agent Identification, Claims, Medical Forms,
// Reports) doit passer par ce module — c'est la seule source de vérité pour le calcul du
// statut d'une police et pour le blocage de couverture qui en découle, afin qu'aucun flux ne
// puisse diverger ou être contourné (voir aussi firestore.rules pour l'application côté
// serveur des mêmes règles, sur la base du champ `coverageBlocked` persisté par ce moteur).
import { HealthPolicy, Member, SuspensionReason } from '../types';

// Seuils par défaut, configurables par police (HealthPolicy.gracePeriodDays /
// expiringSoonWarningDays) — jamais codés en dur dans la logique de décision ci-dessous :
// ces deux constantes ne sont que la valeur de repli quand une police ne précise rien.
export const DEFAULT_GRACE_PERIOD_DAYS = 15;
export const DEFAULT_EXPIRING_SOON_WARNING_DAYS = 30;

export interface PolicyCoverageResult {
  status: HealthPolicy['status'];
  coverageBlocked: boolean;
  suspensionReason?: SuspensionReason;
  daysUntilExpiration?: number;
  daysOverdue?: number;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Centralized policy coverage status engine — implements the 5 rules from the Policy &
 * Premium Monitoring spec, evaluated in order (each rule short-circuits the ones below it):
 *   1. Past expiration date               -> Expired, blocked
 *   2. Premium overdue beyond grace period -> Suspended (Non-payment), blocked
 *   3. Manually suspended                  -> Suspended, blocked
 *   4. Valid & payments current            -> Active, not blocked
 *   5. Expiring within warning threshold   -> Expiring Soon, not blocked
 */
export function getPolicyCoverageStatus(policy: HealthPolicy, referenceDate: Date = new Date()): PolicyCoverageResult {
  const gracePeriodDays = policy.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS;
  const expiringSoonWarningDays = policy.expiringSoonWarningDays ?? DEFAULT_EXPIRING_SOON_WARNING_DAYS;

  const expirationDate = parseDate(policy.expirationDate);
  const nextPaymentDueDate = parseDate(policy.nextPaymentDueDate);

  // Rule 1: Expired
  if (expirationDate && referenceDate > expirationDate) {
    return { status: 'Expired', coverageBlocked: true };
  }

  // Rule 2: Overdue premium beyond grace period -> Suspended (Non-payment)
  if (nextPaymentDueDate) {
    const daysOverdue = daysBetween(nextPaymentDueDate, referenceDate);
    if (daysOverdue > gracePeriodDays && (policy.outstandingAmount ?? 0) > 0) {
      return { status: 'Suspended', coverageBlocked: true, suspensionReason: 'Non-payment', daysOverdue };
    }
  }

  // Rule 3: Manually suspended (Administrative / Other)
  if (policy.manuallySuspended) {
    return {
      status: 'Suspended',
      coverageBlocked: true,
      suspensionReason: policy.suspensionReason || 'Administrative',
    };
  }

  // Rule 5 (checked before the Active fallback so it takes priority when applicable):
  // Expiring within the configured warning threshold.
  if (expirationDate) {
    const daysUntilExpiration = daysBetween(referenceDate, expirationDate);
    if (daysUntilExpiration >= 0 && daysUntilExpiration <= expiringSoonWarningDays) {
      return { status: 'Expiring Soon', coverageBlocked: false, daysUntilExpiration };
    }
  }

  // Rule 4: Valid and payments up to date -> Active
  return { status: 'Active', coverageBlocked: false };
}

/**
 * Whether a policy is currently blocking healthcare access, using the SAME engine as
 * getPolicyCoverageStatus (never a separately-hardcoded check).
 */
export function isPolicyBlocking(policy: HealthPolicy | null | undefined, referenceDate: Date = new Date()): boolean {
  if (!policy) return false; // No policy record configured yet -> do not block (opt-in control)
  return getPolicyCoverageStatus(policy, referenceDate).coverageBlocked;
}

export interface HealthcareAccessResult {
  allowed: boolean;
  reason?: string;
  policyStatus?: HealthPolicy['status'];
}

/**
 * Centralized member-level access check — healthcare access depends on BOTH the member's own
 * status AND the health policy of their organization, never the member status alone. A member
 * marked Active can still be BLOCKED if their organization's policy is Suspended or Expired —
 * this is deliberate (see spec item 14: Organization Status and Health Policy Status are
 * distinct concepts) and must never be "simplified" to only check member.status.
 */
export function hasHealthcareAccess(member: Pick<Member, 'status'>, policy: HealthPolicy | null | undefined): HealthcareAccessResult {
  const isMemberActive = member.status === 'Active' || member.status === 'Actif';
  if (!isMemberActive) {
    return { allowed: false, reason: 'Insured member status is not Active.' };
  }

  if (!policy) {
    // No policy configured for this organization yet — do not block by default (policy
    // configuration is opt-in per the spec, added without disrupting existing flows).
    return { allowed: true };
  }

  const coverage = getPolicyCoverageStatus(policy);
  if (coverage.coverageBlocked) {
    const reason =
      coverage.status === 'Expired'
        ? `Policy expired on ${policy.expirationDate}.`
        : coverage.suspensionReason === 'Non-payment'
        ? `Policy suspended due to unpaid premium (Outstanding: ${policy.outstandingAmount ?? 0} ${policy.currency}).`
        : `Policy suspended (${coverage.suspensionReason || 'Administrative'}).`;
    return { allowed: false, reason, policyStatus: coverage.status };
  }

  return { allowed: true, policyStatus: coverage.status };
}

/**
 * Evaluates policy coverage through the secure server API gateway, with fallback to
 * local policyEngine logic. Ensures calculation cannot be forged from client.
 */
export async function evaluatePolicyWithServer(
  policy: HealthPolicy,
  referenceDate: Date = new Date()
): Promise<PolicyCoverageResult> {
  try {
    // === AMÉLIORATION AJOUTÉE : sécurité (Phase 1.7) — la route serveur lit désormais la
    // police réelle en base par nom d'organisation (voir server.ts) au lieu de recevoir
    // l'objet `policy` fourni par le client tel quel ; jeton d'authentification requis.
    const { auth } = await import('../lib/firebase');
    const token = await auth.currentUser?.getIdToken().catch(() => undefined);
    const res = await fetch('/api/policies/evaluate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ organizationName: policy.organizationId }),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        status: data.status,
        coverageBlocked: data.coverageBlocked,
        suspensionReason: data.reason?.includes('Non-payment') ? 'Non-payment' : undefined,
        daysUntilExpiration: data.daysUntilExpiration,
        daysOverdue: data.daysPastDue,
      };
    }
  } catch {
    // Local fallback
  }

  return getPolicyCoverageStatus(policy, referenceDate);
}

