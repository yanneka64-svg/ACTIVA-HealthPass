import * as admin from 'firebase-admin';
import { evaluatePolicyServer, HealthPolicy } from './policyService';

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

export async function processClaimDecisionServer(
  db: admin.firestore.Firestore,
  payload: ClaimDecisionPayload
): Promise<{ success: boolean; invoiceId?: string }> {
  const claimRef = db.doc(`claims/${payload.claimId}`);

  return db.runTransaction(async (tx) => {
    const claimSnap = await tx.get(claimRef);
    if (!claimSnap.exists) {
      throw new Error(`Claim ${payload.claimId} does not exist.`);
    }

    const claim = claimSnap.data() || {};

    // 1. Enforce SoD (Separation of Duties)
    if (claim.createdBy && claim.createdBy === payload.approverId) {
      throw new Error('Separation of Duties violation: A user cannot approve or reject a claim they submitted.');
    }

    // 2. Validate approver role
    if (payload.approverRole !== 'Admin' && payload.approverRole !== 'Supervisor' && payload.approverRole !== 'Superviseur') {
      throw new Error('Insufficient permissions: Only Supervisors or Administrators can validate claims.');
    }

    // 3. Update claim status
    const updateData: Record<string, any> = {
      status: payload.decision,
      reviewedBy: payload.approverId,
      reviewedByName: payload.approverName,
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (payload.rejectionReason) {
      updateData.rejectionReason = payload.rejectionReason;
    }
    if (payload.approvedAmountUSD !== undefined) {
      updateData.approvedAmountUSD = payload.approvedAmountUSD;
    }
    if (payload.approvedAmountLRD !== undefined) {
      updateData.approvedAmountLRD = payload.approvedAmountLRD;
    }

    tx.update(claimRef, updateData);

    let generatedInvoiceId: string | undefined;

    // 4. Generate invoice/receipt if approved
    if (payload.decision === 'approved') {
      const invoiceRef = db.collection('invoices').doc();
      generatedInvoiceId = invoiceRef.id;

      const invoiceData = {
        id: invoiceRef.id,
        claimId: payload.claimId,
        invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
        memberId: claim.memberId || '',
        principalName: claim.principalName || '',
        cardNo: claim.cardNo || '',
        organization: claim.organization || '',
        provider: claim.provider || '',
        amountUSD: payload.approvedAmountUSD ?? claim.amountUSD ?? 0,
        amountLRD: payload.approvedAmountLRD ?? claim.amountLRD ?? 0,
        status: 'PAID',
        generatedAt: new Date().toISOString(),
        generatedBy: payload.approverId,
        generatedByName: payload.approverName,
      };

      tx.set(invoiceRef, invoiceData);
    }

    // 5. Append immutable audit log
    const auditRef = db.collection('auditLogs').doc();
    tx.set(auditRef, {
      id: auditRef.id,
      timestamp: new Date().toISOString(),
      userId: payload.approverId,
      userName: payload.approverName,
      userRole: payload.approverRole,
      action: `CLAIM_${payload.decision.toUpperCase()}`,
      category: 'Claims Management',
      entityId: payload.claimId,
      entityType: 'claim',
      details: `Claim ${payload.claimId} was ${payload.decision} by ${payload.approverName} (${payload.approverRole}).`,
    });

    return { success: true, invoiceId: generatedInvoiceId };
  });
}

/**
 * Validates whether an organization or member has active healthcare access before claim creation
 */
export async function validateHealthcareAccessServer(
  db: admin.firestore.Firestore,
  orgName: string
): Promise<{ allowed: boolean; reason?: string }> {
  if (!orgName) return { allowed: true };

  const policyRef = db.doc(`healthPolicies/${orgName}`);
  const snap = await policyRef.get();
  if (!snap.exists) {
    return { allowed: true };
  }

  const policy = snap.data() as HealthPolicy;
  const evalResult = evaluatePolicyServer(policy);

  if (evalResult.coverageBlocked) {
    return {
      allowed: false,
      reason: `Healthcare coverage is currently suspended for ${orgName}: ${evalResult.reason}`,
    };
  }

  return { allowed: true };
}
