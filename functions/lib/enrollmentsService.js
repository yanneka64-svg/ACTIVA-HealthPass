"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processEnrollmentDecisionServer = processEnrollmentDecisionServer;
async function processEnrollmentDecisionServer(db, payload) {
    const enrollmentRef = db.doc(`enrollments/${payload.enrollmentId}`);
    return db.runTransaction(async (tx) => {
        const enrollmentSnap = await tx.get(enrollmentRef);
        if (!enrollmentSnap.exists) {
            throw new Error(`Enrollment ${payload.enrollmentId} does not exist.`);
        }
        const enrollment = enrollmentSnap.data() || {};
        // 1. Enforce Separation of Duties (approver cannot be submitter)
        // === AMÉLIORATION AJOUTÉE : sécurité (Phase 1.4) — voir claimsService.ts pour le détail :
        // createdByUid (vérifié serveur) préféré à createdBy (hérité, non vérifié) quand présent.
        const selfCreated = 'createdByUid' in enrollment
            ? enrollment.createdByUid === payload.approverId
            : enrollment.createdBy === payload.approverId;
        if (selfCreated) {
            throw new Error('Separation of Duties violation: A user cannot approve or reject an enrollment they submitted.');
        }
        // 2. Validate approver role
        if (payload.approverRole !== 'Admin' && payload.approverRole !== 'Supervisor' && payload.approverRole !== 'Superviseur') {
            throw new Error('Insufficient permissions: Only Supervisors or Administrators can validate enrollments.');
        }
        // 3. Update enrollment record
        const updateData = {
            status: payload.decision,
            decisionDate: new Date().toISOString().split('T')[0],
            reviewedBy: payload.approverId,
            reviewedByName: payload.approverName,
            approvedBy: payload.decision === 'approved' ? payload.approverName : null,
            updatedAt: new Date().toISOString(),
        };
        if (payload.rejectionReason) {
            updateData.rejectionReason = payload.rejectionReason;
        }
        tx.update(enrollmentRef, updateData);
        let createdMemberId;
        // 4. If approved, sync to members
        if (payload.decision === 'approved') {
            const isPrincipal = enrollment.relationship === 'Principal' ||
                enrollment.relationship === 'Primary' ||
                !enrollment.mainInsuredCardNo ||
                enrollment.mainInsuredCardNo.trim() === enrollment.cardNo?.trim();
            if (isPrincipal) {
                // Query if member already exists by cardNo
                const memberRef = db.collection('members').doc(enrollment.id || db.collection('members').doc().id);
                createdMemberId = memberRef.id;
                tx.set(memberRef, {
                    id: memberRef.id,
                    cardNo: enrollment.cardNo,
                    principalName: enrollment.fullName,
                    birthDate: enrollment.birthDate || '1990-01-01',
                    gender: enrollment.gender || 'M',
                    organization: enrollment.organization || 'ACTIVA Corporate',
                    phone: enrollment.phone || '',
                    email: enrollment.email || '',
                    relationship: 'Principal',
                    status: 'Actif',
                    hasPhoto: enrollment.hasPhoto ?? true,
                    photoUrl: enrollment.photoUrl || null,
                    hasBiometrics: enrollment.hasBiometrics ?? true,
                    fingerprintScore: enrollment.fingerprintScore || 96,
                    spouseName: '',
                    children: [],
                    dependents: [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    enrolledBy: enrollment.createdBy || null,
                    approvedBy: payload.approverId,
                }, { merge: true });
            }
            else {
                // Dependent
                const memberRef = db.collection('members').doc(enrollment.id || db.collection('members').doc().id);
                createdMemberId = memberRef.id;
                tx.set(memberRef, {
                    id: memberRef.id,
                    cardNo: enrollment.cardNo,
                    principalName: enrollment.fullName,
                    birthDate: enrollment.birthDate || '1995-01-01',
                    gender: enrollment.gender || 'M',
                    organization: enrollment.organization || 'ACTIVA Corporate',
                    phone: enrollment.phone || '',
                    email: enrollment.email || '',
                    relationship: enrollment.relationship || 'Dependent',
                    mainInsuredCardNo: enrollment.mainInsuredCardNo || '',
                    mainInsuredName: enrollment.mainInsuredName || '',
                    status: 'Actif',
                    hasPhoto: enrollment.hasPhoto ?? true,
                    photoUrl: enrollment.photoUrl || null,
                    hasBiometrics: enrollment.hasBiometrics ?? true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    enrolledBy: enrollment.createdBy || null,
                    approvedBy: payload.approverId,
                }, { merge: true });
            }
        }
        // 5. Append immutable audit log
        const auditRef = db.collection('auditLogs').doc();
        tx.set(auditRef, {
            id: auditRef.id,
            timestamp: new Date().toISOString(),
            userId: payload.approverId,
            userName: payload.approverName,
            userRole: payload.approverRole,
            action: `ENROLLMENT_${payload.decision.toUpperCase()}`,
            category: 'Enrollments',
            entityId: payload.enrollmentId,
            entityType: 'enrollment',
            details: `Enrollment ${payload.enrollmentId} for ${enrollment.fullName || 'beneficiary'} was ${payload.decision} by ${payload.approverName} (${payload.approverRole}).`,
        });
        // 6. Create notification for agent
        if (enrollment.createdBy) {
            const notifRef = db.collection('notifications').doc();
            tx.set(notifRef, {
                id: notifRef.id,
                recipientRole: 'Agent',
                recipientId: enrollment.createdBy,
                recipientEmail: enrollment.creatorEmail || null,
                title: payload.decision === 'approved' ? 'Enrollment Approved ✓' : 'Enrollment Rejected ✗',
                message: payload.decision === 'approved'
                    ? `Card #${enrollment.cardNo} (${enrollment.fullName}) has been approved by ${payload.approverName} and activated.`
                    : `Card #${enrollment.cardNo} (${enrollment.fullName}) was rejected by ${payload.approverName}. Reason: ${payload.rejectionReason || 'Policy criteria not met.'}`,
                timestamp: new Date().toISOString(),
                unread: true,
                type: 'enrollment',
                targetSection: 'enrollments',
                entityId: payload.enrollmentId,
            });
        }
        return { success: true, memberId: createdMemberId };
    });
}
//# sourceMappingURL=enrollmentsService.js.map