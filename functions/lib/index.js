"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAuditEvent = exports.validateCoverage = exports.syncPolicy = exports.evaluatePolicy = exports.bulkImportMembers = exports.processEnrollmentDecision = exports.processClaimDecision = exports.batchGenerateCardNumbers = exports.registerCardNumber = exports.generateCardNumber = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cardService_1 = require("./cardService");
const policyService_1 = require("./policyService");
const claimsService_1 = require("./claimsService");
const enrollmentsService_1 = require("./enrollmentsService");
const auditService_1 = require("./auditService");
const importService_1 = require("./importService");
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
/**
 * Robustly resolve verified user role from Firestore accounts collection
 */
async function resolveUserRole(uid, tokenRole) {
    if (tokenRole && (tokenRole === 'Admin' || tokenRole === 'Supervisor' || tokenRole === 'Agent')) {
        return { role: tokenRole, name: 'Staff User' };
    }
    try {
        const accSnap = await db.doc(`accounts/${uid}`).get();
        if (accSnap.exists) {
            const data = accSnap.data() || {};
            return {
                role: data.role || 'Agent',
                name: data.fullName || data.email || 'Staff User',
            };
        }
    }
    catch {
        // Fallback if accounts read fails
    }
    return { role: 'Agent', name: 'Staff User' };
}
/**
 * Cloud Function: Generate Next Card Number (Atomic, Server-Side)
 */
exports.generateCardNumber = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const { name } = await resolveUserRole(context.auth.uid, context.auth.token.role);
    const ctx = {
        organization: data.organization,
        memberId: data.memberId,
        insuredName: data.insuredName,
        assignedBy: context.auth.uid,
        assignedByName: name,
        method: data.method || 'AUTO_ENROLLMENT',
    };
    try {
        const cardNumber = await (0, cardService_1.generateNextCardNumberServer)(db, ctx);
        return { success: true, cardNumber };
    }
    catch (error) {
        throw new functions.https.HttpsError('internal', error?.message || 'Failed to generate card number');
    }
});
/**
 * Cloud Function: Register Existing Card Number (Case A)
 */
exports.registerCardNumber = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const cardNumber = data.cardNumber;
    if (!cardNumber || typeof cardNumber !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'cardNumber string is required.');
    }
    const { name } = await resolveUserRole(context.auth.uid, context.auth.token.role);
    const ctx = {
        organization: data.organization,
        memberId: data.memberId,
        insuredName: data.insuredName,
        assignedBy: context.auth.uid,
        assignedByName: name,
        method: data.method || 'MANUAL',
    };
    try {
        const result = await (0, cardService_1.registerExistingCardNumberServer)(db, cardNumber, ctx);
        return result;
    }
    catch (error) {
        throw new functions.https.HttpsError('failed-precondition', error?.message || 'Failed to register card number');
    }
});
/**
 * Cloud Function: Batch Generate Card Numbers
 */
exports.batchGenerateCardNumbers = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const count = data.count || 1;
    const ctxList = data.ctxList || [];
    try {
        const cardNumbers = await (0, cardService_1.batchGenerateCardNumbersServer)(db, count, ctxList);
        return { success: true, cardNumbers };
    }
    catch (error) {
        throw new functions.https.HttpsError('internal', error?.message || 'Failed to batch generate card numbers');
    }
});
/**
 * Cloud Function: Process Claim Decision (Separation of Duties enforced server-side)
 */
exports.processClaimDecision = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const { role, name } = await resolveUserRole(context.auth.uid, context.auth.token.role);
    const payload = {
        claimId: data.claimId,
        decision: data.decision,
        approverId: context.auth.uid,
        approverName: name,
        approverRole: role,
        rejectionReason: data.rejectionReason,
        approvedAmountUSD: data.approvedAmountUSD,
        approvedAmountLRD: data.approvedAmountLRD,
    };
    try {
        const result = await (0, claimsService_1.processClaimDecisionServer)(db, payload);
        return result;
    }
    catch (error) {
        throw new functions.https.HttpsError('failed-precondition', error?.message || 'Failed to process claim decision');
    }
});
/**
 * Cloud Function: Process Enrollment Decision (Separation of Duties enforced server-side)
 */
exports.processEnrollmentDecision = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const { role, name } = await resolveUserRole(context.auth.uid, context.auth.token.role);
    const payload = {
        enrollmentId: data.enrollmentId,
        decision: data.decision,
        approverId: context.auth.uid,
        approverName: name,
        approverRole: role,
        rejectionReason: data.rejectionReason,
    };
    try {
        const result = await (0, enrollmentsService_1.processEnrollmentDecisionServer)(db, payload);
        return result;
    }
    catch (error) {
        throw new functions.https.HttpsError('failed-precondition', error?.message || 'Failed to process enrollment decision');
    }
});
/**
 * Cloud Function: Bulk Member Import
 */
exports.bulkImportMembers = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const { role, name } = await resolveUserRole(context.auth.uid, context.auth.token.role);
    if (role !== 'Admin' && role !== 'Supervisor') {
        throw new functions.https.HttpsError('permission-denied', 'Only Admins or Supervisors can perform bulk import.');
    }
    const rows = (data.rows || []);
    const user = {
        uid: context.auth.uid,
        name,
        role,
    };
    try {
        const result = await (0, importService_1.processBulkMemberImportServer)(db, rows, user);
        return { success: true, result };
    }
    catch (error) {
        throw new functions.https.HttpsError('internal', error?.message || 'Failed to process bulk import');
    }
});
/**
 * Cloud Function: Evaluate Policy Status
 */
exports.evaluatePolicy = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const policy = data.policy;
    if (!policy) {
        throw new functions.https.HttpsError('invalid-argument', 'Policy data is required.');
    }
    const result = (0, policyService_1.evaluatePolicyServer)(policy);
    return { success: true, result };
});
/**
 * Cloud Function: Sync Policy Status
 */
exports.syncPolicy = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const orgId = data.organizationId;
    if (!orgId) {
        throw new functions.https.HttpsError('invalid-argument', 'organizationId is required.');
    }
    try {
        const result = await (0, policyService_1.syncPolicyStatusServer)(db, orgId);
        return { success: true, result };
    }
    catch (error) {
        throw new functions.https.HttpsError('internal', error?.message || 'Failed to sync policy status');
    }
});
/**
 * Cloud Function: Validate Coverage
 */
exports.validateCoverage = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const orgName = data.organization;
    const result = await (0, claimsService_1.validateHealthcareAccessServer)(db, orgName);
    return result;
});
/**
 * Cloud Function: Log Audit Event
 */
exports.logAuditEvent = functions.https.onCall(async (data, context) => {
    const entry = {
        userId: context.auth?.uid || data.userId || 'anonymous',
        userName: data.userName || context.auth?.token?.name || 'Anonymous User',
        userRole: context.auth?.token?.role || data.userRole || 'Public',
        action: data.action || 'UNKNOWN_ACTION',
        category: data.category || 'System',
        entityId: data.entityId,
        entityType: data.entityType,
        details: data.details || '',
        ip: context.rawRequest?.ip || data.ip,
        userAgent: context.rawRequest?.headers['user-agent'] || data.userAgent,
        severity: data.severity || 'INFO',
    };
    const id = await (0, auditService_1.logAuditEventServer)(db, entry);
    return { success: true, id };
});
//# sourceMappingURL=index.js.map