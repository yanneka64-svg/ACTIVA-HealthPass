"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncApprovedEnrollmentToMembersServer = syncApprovedEnrollmentToMembersServer;
exports.processEnrollmentDecisionServer = processEnrollmentDecisionServer;
const cardService_1 = require("./cardService");
// === AMÉLIORATION AJOUTÉE : sécurité/correctif (câblage "tout câbler") ===
// Problème trouvé en préparant le câblage de processEnrollmentDecision : la logique de
// synchronisation vers `members` de cette Cloud Function (ci-dessous, avant correctif)
// divergeait du modèle de données RÉEL utilisé par le client
// (WorkflowService.syncApprovedEnrollmentToMembers, src/services/workflowService.ts) :
// - Elle créait TOUJOURS un nouveau document `members/{enrollmentId}` pour un ayant droit
//   (dépendant), alors que le client attache un dépendant approuvé au tableau
//   `dependents[]` du document du PRINCIPAL déjà existant (Member.dependents,
//   src/types/index.ts) — jamais un document `members` séparé par ayant droit.
// - Pour un principal déjà existant (retrouvé par cardNo), elle créait/fusionnait un
//   document à l'id `enrollmentId` au lieu de METTRE À JOUR le document existant (retrouvé
//   par cardNo, à son id d'origine) — ce qui aurait produit un doublon du même assuré sous
//   deux identifiants Firestore différents.
// Câbler cette fonction sans corriger cela aurait donc silencieusement corrompu l'annuaire
// des assurés dès la première approbation d'enrollment passée par cette voie — exactement le
// type de régression que la règle absolue "ne jamais casser une fonctionnalité existante"
// interdit. Corrigé ci-dessous pour reproduire fidèlement l'algorithme client (même critère
// de principal/dépendant, même règle de correspondance par cardNo/nom, même construction du
// tableau `dependents`), y compris son repli si le principal référencé est introuvable
// (génération d'un nouveau numéro de carte AMID-YYMMDD-NNNNN via le système transactionnel
// centralisé, jamais un identifiant improvisé).
// Exportée pour être testable directement (voir enrollmentsService.emulator.test.ts) — reste
// un détail d'implémentation de processEnrollmentDecisionServer pour tout appelant externe.
async function syncApprovedEnrollmentToMembersServer(db, enrollment, approverId) {
    const isPrincipal = enrollment.relationship === 'Principal' ||
        enrollment.relationship === 'Primary' ||
        !enrollment.mainInsuredCardNo ||
        String(enrollment.mainInsuredCardNo).trim() === String(enrollment.cardNo || '').trim();
    if (isPrincipal) {
        const existingSnap = await db
            .collection('members')
            .where('cardNo', '==', enrollment.cardNo)
            .limit(1)
            .get();
        if (!existingSnap.empty) {
            const existingDoc = existingSnap.docs[0];
            await existingDoc.ref.update({
                principalName: enrollment.fullName || existingDoc.data().principalName,
                birthDate: enrollment.birthDate || existingDoc.data().birthDate,
                gender: enrollment.gender || existingDoc.data().gender,
                organization: enrollment.organization || existingDoc.data().organization,
                phone: enrollment.phone || existingDoc.data().phone,
                email: enrollment.email || existingDoc.data().email,
                hasPhoto: enrollment.hasPhoto ?? existingDoc.data().hasPhoto,
                photoUrl: enrollment.photoUrl || existingDoc.data().photoUrl,
                hasBiometrics: enrollment.hasBiometrics ?? existingDoc.data().hasBiometrics,
                fingerprintScore: enrollment.fingerprintScore || existingDoc.data().fingerprintScore,
                status: 'Actif',
                updatedAt: new Date().toISOString(),
            });
            return existingDoc.id;
        }
        const newRef = db.collection('members').doc();
        await newRef.set({
            id: newRef.id,
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
            approvedBy: approverId,
        });
        return newRef.id;
    }
    // Dependent (Spouse, Child, Parent, etc.) — attached to the principal's own `dependents[]`
    // array, exactly like the client (never a separate top-level `members` document).
    let primaryDoc;
    if (enrollment.mainInsuredCardNo) {
        const byCardNo = await db.collection('members').where('cardNo', '==', enrollment.mainInsuredCardNo).limit(1).get();
        if (!byCardNo.empty)
            primaryDoc = byCardNo.docs[0];
    }
    if (!primaryDoc && enrollment.mainInsuredName) {
        const byName = await db.collection('members').where('principalName', '==', enrollment.mainInsuredName).limit(1).get();
        if (!byName.empty)
            primaryDoc = byName.docs[0];
    }
    const relType = enrollment.relationship === 'Conjoint' || enrollment.relationship === 'Spouse'
        ? 'spouse'
        : enrollment.relationship === 'Enfant' || enrollment.relationship === 'Child'
            ? 'child'
            : enrollment.relationship === 'Ascendant'
                ? 'parent'
                : 'other';
    const newDepItem = {
        id: `dep-${Date.now()}`,
        cardNo: enrollment.cardNo,
        fullName: enrollment.fullName,
        relationship: relType,
        birthDate: enrollment.birthDate,
        gender: enrollment.gender,
        hasBiometrics: enrollment.hasBiometrics,
    };
    if (primaryDoc) {
        const primary = primaryDoc.data();
        const currentDeps = Array.isArray(primary.dependents) ? [...primary.dependents] : [];
        const existingIdx = currentDeps.findIndex((d) => d.cardNo === enrollment.cardNo || String(d.fullName || '').toLowerCase().trim() === String(enrollment.fullName || '').toLowerCase().trim());
        if (existingIdx >= 0) {
            currentDeps[existingIdx] = { ...currentDeps[existingIdx], ...newDepItem };
        }
        else {
            currentDeps.push(newDepItem);
        }
        const updatedSpouse = relType === 'spouse' ? enrollment.fullName : primary.spouseName;
        const updatedChildren = relType === 'child'
            ? Array.from(new Set([...(primary.children || []), enrollment.fullName]))
            : primary.children;
        await primaryDoc.ref.update({
            spouseName: updatedSpouse,
            children: updatedChildren,
            dependents: currentDeps,
            updatedAt: new Date().toISOString(),
        });
        return primaryDoc.id;
    }
    // No primary found: create one, exactly as the client's own fallback does (never an
    // improvised card number — always the centralized transactional sequence).
    const primaryCardNo = enrollment.mainInsuredCardNo ||
        (await (0, cardService_1.generateNextCardNumberServer)(db, {
            organization: enrollment.organization,
            insuredName: enrollment.mainInsuredName || 'Principal Insured',
            method: 'AUTO_ENROLLMENT',
        }));
    const newRef = db.collection('members').doc();
    await newRef.set({
        id: newRef.id,
        cardNo: primaryCardNo,
        principalName: enrollment.mainInsuredName || 'Principal Insured',
        birthDate: '1985-01-01',
        gender: 'M',
        organization: enrollment.organization || 'ACTIVA Corporate',
        relationship: 'Principal',
        status: 'Actif',
        hasPhoto: true,
        hasBiometrics: true,
        spouseName: relType === 'spouse' ? enrollment.fullName : '',
        children: relType === 'child' ? [enrollment.fullName] : [],
        dependents: [newDepItem],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        enrolledBy: enrollment.createdBy || null,
        approvedBy: approverId,
    });
    return newRef.id;
}
async function processEnrollmentDecisionServer(db, payload) {
    const enrollmentRef = db.doc(`enrollments/${payload.enrollmentId}`);
    // === AMÉLIORATION AJOUTÉE : la synchronisation vers `members` (ci-dessous, après le commit
    // de la transaction) nécessite des requêtes `where(...)` sur toute la collection `members`,
    // que Firestore n'autorise pas à l'intérieur d'une transaction déjà engagée sur des documents
    // spécifiques de la même façon qu'un simple get() par référence. Le statut de l'enrollment,
    // la vérification SoD, l'audit et la notification restent atomiques (transaction ci-dessous,
    // comportement inchangé) ; la synchronisation membre s'exécute juste après, dans la même
    // fenêtre temporelle que le fait déjà le code client actuel (deux appels non-atomiques
    // successifs : updateEnrollment() PUIS syncApprovedEnrollmentToMembers()) — donc AUCUNE
    // garantie d'atomicité nouvelle n'est perdue par rapport à ce qui existe déjà côté client.
    let enrollmentForSync;
    const txResult = await db.runTransaction(async (tx) => {
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
        enrollmentForSync = { ...enrollment, ...updateData };
        // 4. Append immutable audit log
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
        // 5. Create notification for agent
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
        return { success: true };
    });
    let memberId;
    if (txResult.success && payload.decision === 'approved' && enrollmentForSync) {
        memberId = await syncApprovedEnrollmentToMembersServer(db, enrollmentForSync, payload.approverId);
    }
    return { success: txResult.success, memberId };
}
//# sourceMappingURL=enrollmentsService.js.map