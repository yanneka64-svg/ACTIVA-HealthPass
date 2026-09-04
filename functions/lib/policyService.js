"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluatePolicyServer = evaluatePolicyServer;
exports.syncPolicyStatusServer = syncPolicyStatusServer;
function evaluatePolicyServer(policy, asOfDate = new Date()) {
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
    const graceDays = policy.gracePeriodDays ?? 15;
    if (policy.nextPaymentDueDate) {
        const dueDate = new Date(policy.nextPaymentDueDate).getTime();
        if (!isNaN(dueDate)) {
            const diffPastDue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
            if (diffPastDue > 0) {
                if (diffPastDue > graceDays) {
                    return {
                        status: 'Suspended (Non-payment)',
                        coverageBlocked: true,
                        reason: `Premium payment overdue by ${diffPastDue} days (grace period of ${graceDays} days exceeded).`,
                        daysUntilExpiration: 999,
                        daysPastDue: diffPastDue,
                        isInGracePeriod: false,
                    };
                }
                else {
                    return {
                        status: 'Active',
                        coverageBlocked: false,
                        reason: `Premium payment is ${diffPastDue} days past due, but within the ${graceDays}-day grace period.`,
                        daysUntilExpiration: 999,
                        daysPastDue: diffPastDue,
                        isInGracePeriod: true,
                    };
                }
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
            daysPastDue: 0,
            isInGracePeriod: false,
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
                    daysPastDue: 0,
                    isInGracePeriod: false,
                };
            }
        }
    }
    return {
        status: 'Active',
        coverageBlocked: false,
        reason: 'Policy is active and all premiums are in good standing.',
        daysUntilExpiration: 999,
        daysPastDue: 0,
        isInGracePeriod: false,
    };
}
async function syncPolicyStatusServer(db, orgId) {
    const policyRef = db.doc(`healthPolicies/${orgId}`);
    const snap = await policyRef.get();
    if (!snap.exists) {
        throw new Error(`Health policy for organization ${orgId} not found.`);
    }
    const policy = snap.data();
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
//# sourceMappingURL=policyService.js.map