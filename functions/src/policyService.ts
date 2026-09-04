import * as admin from 'firebase-admin';

export type PolicyStatus =
  | 'Active'
  | 'Expiring Soon'
  | 'Expired'
  | 'Suspended'
  | 'Suspended (Non-payment)';

export interface HealthPolicy {
  id?: string;
  organizationId: string;
  organizationName: string;
  policyNumber: string;
  effectiveDate: string;
  expirationDate: string;
  status: PolicyStatus;
  coverageBlocked: boolean;
  totalAnnualPremiumUSD: number;
  totalAnnualPremiumLRD: number;
  paymentFrequency: 'Annual' | 'Semi-Annual' | 'Quarterly' | 'Monthly';
  gracePeriodDays: number;
  expiringSoonWarningDays: number;
  manuallySuspended?: boolean;
  suspensionReason?: string;
  nextPaymentDueDate?: string;
  totalPaidUSD?: number;
  totalPaidLRD?: number;
  // === AMÉLIORATION AJOUTÉE : correctif MEDIUM — champ manquant dans cette interface locale,
  // pourtant présent et utilisé par le vrai type HealthPolicy (src/types/index.ts) et par le
  // moteur client (policyEngine.ts) pour décider si un retard de paiement doit réellement
  // bloquer la couverture. Son absence ici faisait diverger la logique serveur de la logique
  // cliente (voir evaluatePolicyServer ci-dessous).
  outstandingAmount?: number;
  lastEvaluatedAt?: string;
  updatedAt?: string;
}

export interface PolicyEvaluationResult {
  status: PolicyStatus;
  coverageBlocked: boolean;
  reason: string;
  daysUntilExpiration: number;
  daysPastDue: number;
  isInGracePeriod: boolean;
}

export function evaluatePolicyServer(policy: HealthPolicy, asOfDate: Date = new Date()): PolicyEvaluationResult {
  const now = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate()).getTime();

  // 1. Check expiration
  if (policy.expirationDate) {
    const expDate = new Date(policy.expirationDate).getTime();
    if (!isNaN(expDate)) {
      const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        return {
          status: 'Expired',
          coverageBlocked: true,
          reason: `Policy expired on ${policy.expirationDate} (${Math.abs(diffDays)} days ago).`,
          daysUntilExpiration: diffDays,
          daysPastDue: 0,
          isInGracePeriod: false,
        };
      }
    }
  }

  // 2. Check overdue payment & grace period
  // === AMÉLIORATION AJOUTÉE : correctif MEDIUM — aligné sur l'ordre de règles et les
  // conditions exactes du moteur client (src/services/policyEngine.ts) : (a) ne bloque QUE si
  // le retard dépasse le délai de grâce ET qu'un solde est réellement dû (outstandingAmount >
  // 0, comme côté client — auparavant absent ici, une police en retard de date mais déjà
  // soldée aurait été bloquée à tort) ; (b) ne retourne plus immédiatement "Active" quand le
  // paiement est simplement dans le délai de grâce — cela court-circuitait la vérification de
  // suspension manuelle ci-dessous : une police à la fois "en retard mais dans le délai de
  // grâce" ET "suspendue manuellement" était évaluée à tort comme Active par le serveur, alors
  // que le moteur client la bloque correctement.
  const graceDays = policy.gracePeriodDays ?? 15;
  let daysPastDue = 0;
  let isInGracePeriod = false;
  if (policy.nextPaymentDueDate) {
    const dueDate = new Date(policy.nextPaymentDueDate).getTime();
    if (!isNaN(dueDate)) {
      const diffPastDue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
      if (diffPastDue > 0) {
        if (diffPastDue > graceDays && (policy.outstandingAmount ?? 0) > 0) {
          return {
            status: 'Suspended (Non-payment)',
            coverageBlocked: true,
            reason: `Premium payment overdue by ${diffPastDue} days (grace period of ${graceDays} days exceeded).`,
            daysUntilExpiration: 999,
            daysPastDue: diffPastDue,
            isInGracePeriod: false,
          };
        }
        daysPastDue = diffPastDue;
        isInGracePeriod = true;
      }
    }
  }

  // 3. Check manual suspension
  if (policy.manuallySuspended) {
    return {
      status: 'Suspended',
      coverageBlocked: true,
      reason: policy.suspensionReason || 'Manually suspended by administrator.',
      daysUntilExpiration: 999,
      daysPastDue,
      isInGracePeriod,
    };
  }

  // 4. Check warning expiration
  const warningDays = policy.expiringSoonWarningDays ?? 30;
  if (policy.expirationDate) {
    const expDate = new Date(policy.expirationDate).getTime();
    if (!isNaN(expDate)) {
      const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
      if (diffDays <= warningDays) {
        return {
          status: 'Expiring Soon',
          coverageBlocked: false,
          reason: `Policy will expire in ${diffDays} days (${policy.expirationDate}). Renewal required.`,
          daysUntilExpiration: diffDays,
          daysPastDue,
          isInGracePeriod,
        };
      }
    }
  }

  return {
    status: 'Active',
    coverageBlocked: false,
    reason: isInGracePeriod
      ? `Premium payment is ${daysPastDue} days past due, but within the ${graceDays}-day grace period.`
      : 'Policy is active and all premiums are in good standing.',
    daysUntilExpiration: 999,
    daysPastDue,
    isInGracePeriod,
  };
}

export async function syncPolicyStatusServer(db: admin.firestore.Firestore, orgId: string): Promise<PolicyEvaluationResult> {
  const policyRef = db.doc(`healthPolicies/${orgId}`);
  const snap = await policyRef.get();
  if (!snap.exists) {
    throw new Error(`Health policy for organization ${orgId} not found.`);
  }

  const policy = snap.data() as HealthPolicy;
  const result = evaluatePolicyServer(policy);

  if (policy.status !== result.status || policy.coverageBlocked !== result.coverageBlocked) {
    await policyRef.update({
      status: result.status,
      coverageBlocked: result.coverageBlocked,
      lastEvaluatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return result;
}
