import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { generateNextCardNumberServer, batchGenerateCardNumbersServer, AssignmentContext } from './cardService';
import { evaluatePolicyServer, syncPolicyStatusServer, HealthPolicy } from './policyService';
import { processClaimDecisionServer, validateHealthcareAccessServer, ClaimDecisionPayload } from './claimsService';
import { logAuditEventServer, AuditLogEntry } from './auditService';
import { processBulkMemberImportServer, ImportRowInput } from './importService';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Cloud Function: Generate Next Card Number (Atomic, Server-Side)
 */
export const generateCardNumber = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const ctx: AssignmentContext = {
    organization: data.organization,
    memberId: data.memberId,
    insuredName: data.insuredName,
    assignedBy: context.auth.uid,
    assignedByName: data.assignedByName || context.auth.token.name || 'Staff User',
    method: data.method || 'AUTO_ENROLLMENT',
  };

  try {
    const cardNumber = await generateNextCardNumberServer(db, ctx);
    return { success: true, cardNumber };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error?.message || 'Failed to generate card number');
  }
});

/**
 * Cloud Function: Batch Generate Card Numbers
 */
export const batchGenerateCardNumbers = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const count = data.count || 1;
  const ctxList: AssignmentContext[] = data.ctxList || [];

  try {
    const cardNumbers = await batchGenerateCardNumbersServer(db, count, ctxList);
    return { success: true, cardNumbers };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error?.message || 'Failed to batch generate card numbers');
  }
});

/**
 * Cloud Function: Evaluate Policy Status
 */
export const evaluatePolicy = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const policy = data.policy as HealthPolicy;
  if (!policy) {
    throw new functions.https.HttpsError('invalid-argument', 'Policy data is required.');
  }

  const result = evaluatePolicyServer(policy);
  return { success: true, result };
});

/**
 * Cloud Function: Sync Policy Status
 */
export const syncPolicy = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const orgId = data.organizationId;
  if (!orgId) {
    throw new functions.https.HttpsError('invalid-argument', 'organizationId is required.');
  }

  try {
    const result = await syncPolicyStatusServer(db, orgId);
    return { success: true, result };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error?.message || 'Failed to sync policy status');
  }
});

/**
 * Cloud Function: Process Claim Decision (Separation of Duties enforced)
 */
export const processClaimDecision = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const payload: ClaimDecisionPayload = {
    claimId: data.claimId,
    decision: data.decision,
    approverId: context.auth.uid,
    approverName: data.approverName || context.auth.token.name || 'Supervisor',
    approverRole: data.approverRole || (context.auth.token.role as string) || 'Supervisor',
    rejectionReason: data.rejectionReason,
    approvedAmountUSD: data.approvedAmountUSD,
    approvedAmountLRD: data.approvedAmountLRD,
  };

  try {
    const result = await processClaimDecisionServer(db, payload);
    return result;
  } catch (error: any) {
    throw new functions.https.HttpsError('failed-precondition', error?.message || 'Failed to process claim decision');
  }
});

/**
 * Cloud Function: Validate Coverage
 */
export const validateCoverage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const orgName = data.organization;
  const result = await validateHealthcareAccessServer(db, orgName);
  return result;
});

/**
 * Cloud Function: Bulk Member Import
 */
export const bulkImportMembers = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const rows = (data.rows || []) as ImportRowInput[];
  const user = {
    uid: context.auth.uid,
    name: data.userName || context.auth.token.name || 'Admin',
    role: data.userRole || (context.auth.token.role as string) || 'Admin',
  };

  try {
    const result = await processBulkMemberImportServer(db, rows, user);
    return { success: true, result };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error?.message || 'Failed to process bulk import');
  }
});

/**
 * Cloud Function: Log Audit Event
 */
export const logAuditEvent = functions.https.onCall(async (data, context) => {
  const entry: Omit<AuditLogEntry, 'timestamp'> = {
    userId: context.auth?.uid || data.userId || 'anonymous',
    userName: data.userName || context.auth?.token?.name || 'Anonymous User',
    userRole: (context.auth?.token?.role as string) || data.userRole || 'Public',
    action: data.action || 'UNKNOWN_ACTION',
    category: data.category || 'System',
    entityId: data.entityId,
    entityType: data.entityType,
    details: data.details || '',
    ip: context.rawRequest?.ip || data.ip,
    userAgent: context.rawRequest?.headers['user-agent'] || data.userAgent,
    severity: data.severity || 'INFO',
  };

  const id = await logAuditEventServer(db, entry);
  return { success: true, id };
});
