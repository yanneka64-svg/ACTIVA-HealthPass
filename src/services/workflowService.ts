import { Enrollment, Claim, Member, Organization, InvoiceItem, AppNotification, DependentItem, DependentRelationship, HealthPolicy } from '../types';
import { FirestoreService } from './firestore';
import { getPolicyCoverageStatus } from './policyEngine';
import { generateNextCardNumber } from './cardNumberService';
// === AMÉLIORATION AJOUTÉE : câblage des Cloud Functions (Phase 3/5), sur demande explicite.
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

/**
 * Service to execute end-to-end multi-role workflows and keep Firestore records,
 * member synchronization, and persistent notifications fully in sync.
 */
export const WorkflowService = {
  /**
   * Agent submits an enrollment for validation
   */
  submitEnrollment: async (
    enrData: Partial<Enrollment>,
    currentUser: any
  ): Promise<void> => {
    const payload: Partial<Enrollment> = {
      ...enrData,
      status: 'pending',
      submissionDate: enrData.submissionDate || new Date().toISOString().split('T')[0],
      createdBy: enrData.createdBy || currentUser?.uid || 'user_id',
      // === AMÉLIORATION AJOUTÉE : sécurité (Phase 1.4 — SoD, createdByUid déterminé serveur)
      // — TOUJOURS `currentUser?.uid`, jamais une valeur fournie par l'appelant (contrairement
      // à `createdBy` ci-dessus, conservé tel quel pour ne rien changer à son usage existant).
      // firestore.rules vérifie que cette valeur correspond bien à request.auth.uid : un appel
      // direct au SDK Firestore ne peut donc plus usurper l'identité du créateur pour
      // contourner la séparation des tâches à l'approbation.
      createdByUid: currentUser?.uid,
      creatorEmail: enrData.creatorEmail || currentUser?.email || 'agent@activa.lr',
      creatorName:
        enrData.creatorName ||
        currentUser?.fullName ||
        currentUser?.displayName ||
        currentUser?.email?.split('@')[0] ||
        'Medical Center Agent',
    };

    await FirestoreService.addEnrollment(payload);

    // Notify supervisors of the incoming enrollment
    await FirestoreService.addNotification({
      recipientRole: 'Supervisor',
      title: 'New Beneficiary Enrollment',
      message: `Card #${payload.cardNo} for ${payload.fullName} (${payload.relationship}) was submitted by ${payload.creatorName}.`,
      timestamp: new Date().toISOString(),
      unread: true,
      type: 'enrollment',
      targetSection: 'enrollments_validation',
    });
  },

  /**
   * Supervisor (or Admin) approves an enrollment:
   * 1. Validates Separation of Duties (approver cannot be submitter)
   * 2. Updates enrollment status to 'approved'
   * 3. Automatically syncs / registers into Insured Members (`members` collection)
   * 4. Sends persistent notification and records audit log
   */
  approveEnrollment: async (
    enr: Enrollment,
    members: Member[],
    currentUser: any
  ): Promise<void> => {
    if (enr.createdBy && currentUser?.uid && enr.createdBy === currentUser.uid) {
      throw new Error(
        'Separation of Duties violation: You cannot approve an enrollment that you submitted yourself.'
      );
    }

    const updated: Enrollment = {
      ...enr,
      status: 'approved',
      decisionDate: new Date().toISOString().split('T')[0],
      approvedBy: currentUser?.fullName || currentUser?.displayName || currentUser?.email || 'Medical Supervisor',
    };
    await FirestoreService.updateEnrollment(updated);

    // Sync into Insured Members
    await WorkflowService.syncApprovedEnrollmentToMembers(enr, members);

    // Persistent notification to the Agent
    await FirestoreService.addNotification({
      recipientRole: 'Agent',
      recipientEmail: enr.creatorEmail,
      recipientId: enr.createdBy,
      title: 'Enrollment Approved ✓',
      message: `Card #${enr.cardNo} (${enr.fullName}) has been approved by ${currentUser?.fullName || 'Supervisor'} and added to Insured Members.`,
      timestamp: new Date().toISOString(),
      unread: true,
      type: 'enrollment',
      targetSection: 'enrollments',
      entityId: enr.id,
    });

    // Enriched audit log
    await FirestoreService.addLog({
      userId: currentUser?.uid || 'supervisor',
      userName: currentUser?.fullName || currentUser?.displayName || currentUser?.email || 'Supervisor',
      userRole: currentUser?.role || 'Supervisor',
      action: 'ENROLLMENT_APPROVED',
      category: 'Enrollments',
      entityId: enr.id,
      entityType: 'enrollment',
      details: `Enrollment for ${enr.fullName} (Card #${enr.cardNo}) approved by ${currentUser?.fullName || 'Supervisor'}.`,
    });
  },

  /**
   * Supervisor rejects an enrollment
   */
  rejectEnrollment: async (
    enr: Enrollment,
    reason: string,
    currentUser: any
  ): Promise<void> => {
    if (enr.createdBy && currentUser?.uid && enr.createdBy === currentUser.uid) {
      throw new Error(
        'Separation of Duties violation: You cannot reject an enrollment that you submitted yourself.'
      );
    }

    const updated: Enrollment = {
      ...enr,
      status: 'rejected',
      decisionDate: new Date().toISOString().split('T')[0],
      rejectionReason: reason,
    };
    await FirestoreService.updateEnrollment(updated);

    // Persistent notification to the Agent
    await FirestoreService.addNotification({
      recipientRole: 'Agent',
      recipientEmail: enr.creatorEmail,
      recipientId: enr.createdBy,
      title: 'Enrollment Rejected ✗',
      message: `Card #${enr.cardNo} (${enr.fullName}) was rejected by Supervisor. Reason: ${reason}`,
      timestamp: new Date().toISOString(),
      unread: true,
      type: 'enrollment',
      targetSection: 'enrollments',
      entityId: enr.id,
    });

    // Enriched audit log
    await FirestoreService.addLog({
      userId: currentUser?.uid || 'supervisor',
      userName: currentUser?.fullName || currentUser?.displayName || currentUser?.email || 'Supervisor',
      userRole: currentUser?.role || 'Supervisor',
      action: 'ENROLLMENT_REJECTED',
      category: 'Enrollments',
      entityId: enr.id,
      entityType: 'enrollment',
      details: `Enrollment for ${enr.fullName} rejected by ${currentUser?.fullName || 'Supervisor'}. Reason: ${reason}`,
    });
  },

  /**
   * Synchronizes an approved enrollment with the `members` directory.
   * If Principal -> updates or creates the member.
   * If Dependent (Spouse/Child/etc) -> finds the primary insured and attaches the dependent.
   */
  syncApprovedEnrollmentToMembers: async (
    enr: Enrollment,
    members: Member[]
  ): Promise<void> => {
    const isPrincipal =
      enr.relationship === 'Principal' ||
      enr.relationship === 'Primary' ||
      !enr.mainInsuredCardNo ||
      enr.mainInsuredCardNo.trim() === enr.cardNo.trim();

    if (isPrincipal) {
      const existing = members.find(
        (m) => m.cardNo.toLowerCase().trim() === enr.cardNo.toLowerCase().trim()
      );

      if (existing) {
        await FirestoreService.updateMember({
          ...existing,
          principalName: enr.fullName || existing.principalName,
          birthDate: enr.birthDate || existing.birthDate,
          gender: enr.gender || existing.gender,
          organization: enr.organization || existing.organization,
          phone: enr.phone || existing.phone,
          email: enr.email || existing.email,
          hasPhoto: enr.hasPhoto ?? existing.hasPhoto,
          photoUrl: enr.photoUrl || existing.photoUrl,
          hasBiometrics: enr.hasBiometrics ?? existing.hasBiometrics,
          fingerprintScore: enr.fingerprintScore || existing.fingerprintScore,
          status: 'Actif',
        });
      } else {
        await FirestoreService.addMember({
          cardNo: enr.cardNo,
          principalName: enr.fullName,
          birthDate: enr.birthDate || '1990-01-01',
          gender: enr.gender || 'M',
          organization: enr.organization || 'ACTIVA Corporate',
          phone: enr.phone,
          email: enr.email,
          relationship: 'Principal',
          status: 'Actif',
          hasPhoto: enr.hasPhoto ?? true,
          photoUrl: enr.photoUrl,
          hasBiometrics: enr.hasBiometrics ?? true,
          fingerprintScore: enr.fingerprintScore || 96,
          spouseName: '',
          children: [],
          dependents: [],
          createdAt: new Date().toISOString(),
        });
      }
    } else {
      // Dependant (Spouse, Child, Parent, etc.)
      const primary = members.find(
        (m) =>
          (enr.mainInsuredCardNo &&
            m.cardNo.toLowerCase().trim() === enr.mainInsuredCardNo.toLowerCase().trim()) ||
          (enr.mainInsuredName &&
            m.principalName.toLowerCase().trim() === enr.mainInsuredName.toLowerCase().trim())
      );

      const relType: DependentRelationship =
        enr.relationship === 'Conjoint' || enr.relationship === 'Spouse'
          ? 'spouse'
          : enr.relationship === 'Enfant' || enr.relationship === 'Child'
          ? 'child'
          : enr.relationship === 'Ascendant'
          ? 'parent'
          : 'other';

      const newDepItem: DependentItem = {
        id: `dep-${Date.now()}`,
        cardNo: enr.cardNo,
        fullName: enr.fullName,
        relationship: relType,
        birthDate: enr.birthDate,
        gender: enr.gender,
        hasBiometrics: enr.hasBiometrics,
      };

      if (primary) {
        const currentDeps = [...(primary.dependents || [])];
        const existingIdx = currentDeps.findIndex(
          (d) =>
            d.cardNo === enr.cardNo ||
            d.fullName.toLowerCase().trim() === enr.fullName.toLowerCase().trim()
        );

        if (existingIdx >= 0) {
          currentDeps[existingIdx] = { ...currentDeps[existingIdx], ...newDepItem };
        } else {
          currentDeps.push(newDepItem);
        }

        const updatedSpouse = relType === 'spouse' ? enr.fullName : primary.spouseName;
        const updatedChildren =
          relType === 'child'
            ? Array.from(new Set([...(primary.children || []), enr.fullName]))
            : primary.children;

        await FirestoreService.updateMember({
          ...primary,
          spouseName: updatedSpouse,
          children: updatedChildren,
          dependents: currentDeps,
        });
      } else {
        // === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — sur demande
        // explicite. Ce repli (déclenché quand l'ayant droit approuvé référence un assuré
        // principal introuvable dans l'annuaire) générait auparavant un numéro aléatoire au
        // format obsolète "ACT-PRI-XXXXX", contournant le système de numérotation
        // centralisé. Génère désormais un numéro AMID-YYMMDD-NNNNN unique et transactionnel,
        // uniquement dans ce cas de repli (si `mainInsuredCardNo` est déjà renseigné, il est
        // conservé tel quel, sans y toucher).
        const primaryCardNo =
          enr.mainInsuredCardNo ||
          (await generateNextCardNumber({
            organization: enr.organization,
            insuredName: enr.mainInsuredName || 'Principal Insured',
            method: 'ENROLLMENT',
          }));
        // Create primary holder entry and attach dependent
        await FirestoreService.addMember({
          cardNo: primaryCardNo,
          principalName: enr.mainInsuredName || 'Principal Insured',
          birthDate: '1985-01-01',
          gender: 'M',
          organization: enr.organization || 'ACTIVA Corporate',
          relationship: 'Principal',
          status: 'Actif',
          hasPhoto: true,
          hasBiometrics: true,
          spouseName: relType === 'spouse' ? enr.fullName : '',
          children: relType === 'child' ? [enr.fullName] : [],
          dependents: [newDepItem],
          createdAt: new Date().toISOString(),
        });
      }
    }
  },

  /**
   * Agent submits a medical claim for validation
   */
  submitClaim: async (
    claimData: Partial<Claim>,
    currentUser: any
  ): Promise<void> => {
    const payload: Partial<Claim> = {
      ...claimData,
      status: 'pending',
      submissionDate: claimData.submissionDate || new Date().toISOString().split('T')[0],
      createdBy: claimData.createdBy || currentUser?.uid || 'user_id',
      // === AMÉLIORATION AJOUTÉE : sécurité (Phase 1.4) — voir submitEnrollment ci-dessus.
      createdByUid: currentUser?.uid,
      creatorEmail: claimData.creatorEmail || currentUser?.email || 'agent@activa.lr',
      creatorName:
        claimData.creatorName ||
        currentUser?.fullName ||
        currentUser?.displayName ||
        currentUser?.email?.split('@')[0] ||
        'Medical Provider Agent',
    };

    await FirestoreService.addClaim(payload);

    // Notify Supervisor of new claim submission
    await FirestoreService.addNotification({
      recipientRole: 'Supervisor',
      title: 'New Medical Claim Submitted',
      message: `Claim #${payload.reference} for ${payload.memberName} ($${payload.amount}) was submitted by ${payload.creatorName}.`,
      timestamp: new Date().toISOString(),
      unread: true,
      type: 'claim',
      targetSection: 'claims_validation',
    });
  },

  /**
   * Supervisor approves a claim
   * === ADDED IMPROVEMENT: now automatically generates the corresponding settlement
   * invoice/receipt (collection `invoices`, consumed by InvoicesView / the "Receipts"
   * screen). Before this fix, NOTHING in the application ever wrote to that collection:
   * the Invoices screen permanently displayed the initial demo data, never the claims
   * actually approved day to day.
   * `members`/`organizations` are optional (backward-compatible with an existing call
   * without these parameters) and are only used to enrich the receipt (family head's
   * name, the organization's real coverage rate); in their absence, reasonable defaults
   * are used and the receipt is still created.
   */
  approveClaim: async (
    claim: Claim,
    currentUser: any,
    members: Member[] = [],
    organizations: Organization[] = []
  ): Promise<void> => {
    if (claim.createdBy && currentUser?.uid && claim.createdBy === currentUser.uid) {
      throw new Error(
        'Separation of Duties violation: You cannot approve a medical claim that you submitted yourself.'
      );
    }

    // === AMÉLIORATION AJOUTÉE : câblage de la Cloud Function `processClaimDecision`
    // (Phase 3/5), sur demande explicite, avec repli automatique. Cette fonction applique
    // déjà, de façon atomique et côté serveur, la mise à jour du statut, la génération de la
    // quittance/facture, et la journalisation d'audit — si elle réussit, on ne refait donc PAS
    // ces trois écritures côté client (cela créerait notamment une facture en double). Seule
    // la notification (qui n'a pas d'équivalent serveur) reste envoyée dans tous les cas.
    let handledByServer = false;
    try {
      const callProcessClaimDecision = httpsCallable<
        { claimId: string; decision: 'approved' | 'rejected' | 'returned'; approverId?: string; approverName?: string; approverRole?: string },
        { success: boolean; invoiceId?: string }
      >(functions, 'processClaimDecision');
      const result = await callProcessClaimDecision({
        claimId: claim.id,
        decision: 'approved',
        approverId: currentUser?.uid,
        approverName: currentUser?.fullName || currentUser?.displayName || currentUser?.email,
        approverRole: currentUser?.profile,
      });
      handledByServer = !!result.data?.success;
    } catch (err) {
      console.warn('Cloud Function "processClaimDecision" unavailable — falling back to client-side approval:', err);
    }

    if (!handledByServer) {
      const updated: Claim = {
        ...claim,
        status: 'approved',
        decisionDate: new Date().toISOString().split('T')[0],
        approvedBy: currentUser?.fullName || currentUser?.displayName || currentUser?.email || 'Medical Supervisor',
        comments: claim.comments || 'Direct billing approval confirmed.',
      };
      await FirestoreService.updateClaim(updated);

      // Enriched audit log
      await FirestoreService.addLog({
        userId: currentUser?.uid || 'supervisor',
        userName: currentUser?.fullName || currentUser?.displayName || currentUser?.email || 'Supervisor',
        userRole: currentUser?.profile || currentUser?.role || 'Supervisor',
        action: 'CLAIM_APPROVED',
        category: 'Claims Management',
        entityId: claim.id,
        entityType: 'claim',
        details: `Claim #${claim.reference} for ${claim.memberName} ($${claim.amount}) approved by ${currentUser?.fullName || 'Supervisor'}.`,
      });

      // Generate the settlement invoice/receipt from the approved claim
      const member = members.find((m) => m.cardNo.toLowerCase().trim() === claim.memberCardNo.toLowerCase().trim());
      const isPrincipal = !member || member.principalName.toLowerCase().trim() === claim.memberName.toLowerCase().trim();
      const familyHead = isPrincipal ? claim.memberName : (member?.principalName || claim.memberName);
      const org = organizations.find((o) => o.name.toLowerCase().trim() === claim.organization.toLowerCase().trim());

      const newInvoice: Partial<InvoiceItem> = {
        reference: claim.reference ? claim.reference.replace(/^CLM/i, 'INV') : `INV-${Date.now()}`,
        patientName: claim.memberName,
        familyHead,
        cardNo: claim.memberCardNo,
        organization: claim.organization,
        provider: claim.provider,
        amount: claim.amount,
        serviceDate: claim.serviceDate,
        status: 'valid',
        careType: claim.careType,
        prescribingDoctor: claim.doctorName,
        coveragePercentage: org?.coverageRate ?? 80,
      };
      await FirestoreService.addInvoice(newInvoice);
    }

    // Notify submitting Agent (no server-side equivalent — always runs)
    await FirestoreService.addNotification({
      recipientRole: 'Agent',
      recipientEmail: claim.creatorEmail,
      recipientId: claim.createdBy,
      title: 'Medical Claim Approved ✓',
      message: `Claim #${claim.reference} for ${claim.memberName} ($${claim.amount}) has been approved for reimbursement/settlement.`,
      timestamp: new Date().toISOString(),
      unread: true,
      type: 'claim',
      targetSection: 'claims',
      entityId: claim.id,
    });
  },

  /**
   * Supervisor rejects a claim
   */
  rejectClaim: async (
    claim: Claim,
    reason: string,
    comments: string,
    currentUser: any
  ): Promise<void> => {
    if (claim.createdBy && currentUser?.uid && claim.createdBy === currentUser.uid) {
      throw new Error(
        'Separation of Duties violation: You cannot reject a medical claim that you submitted yourself.'
      );
    }

    // === AMÉLIORATION AJOUTÉE : câblage de la Cloud Function `processClaimDecision`, même
    // logique de repli que approveClaim ci-dessus.
    let handledByServer = false;
    try {
      const callProcessClaimDecision = httpsCallable<
        { claimId: string; decision: 'approved' | 'rejected' | 'returned'; approverId?: string; approverName?: string; approverRole?: string; rejectionReason?: string },
        { success: boolean }
      >(functions, 'processClaimDecision');
      const result = await callProcessClaimDecision({
        claimId: claim.id,
        decision: 'rejected',
        approverId: currentUser?.uid,
        approverName: currentUser?.fullName || currentUser?.displayName || currentUser?.email,
        approverRole: currentUser?.profile,
        rejectionReason: reason,
      });
      handledByServer = !!result.data?.success;
    } catch (err) {
      console.warn('Cloud Function "processClaimDecision" unavailable — falling back to client-side rejection:', err);
    }

    if (!handledByServer) {
      const updated: Claim = {
        ...claim,
        status: 'rejected',
        decisionDate: new Date().toISOString().split('T')[0],
        rejectionReason: reason,
        comments: comments || 'Medical justification not met.',
      };
      await FirestoreService.updateClaim(updated);

      // Enriched audit log
      await FirestoreService.addLog({
        userId: currentUser?.uid || 'supervisor',
        userName: currentUser?.fullName || currentUser?.displayName || currentUser?.email || 'Supervisor',
        userRole: currentUser?.profile || currentUser?.role || 'Supervisor',
        action: 'CLAIM_REJECTED',
        category: 'Claims Management',
        entityId: claim.id,
        entityType: 'claim',
        details: `Claim #${claim.reference} for ${claim.memberName} rejected by ${currentUser?.fullName || 'Supervisor'}. Reason: ${reason}`,
      });
    }

    // Notify submitting Agent (no server-side equivalent — always runs)
    await FirestoreService.addNotification({
      recipientRole: 'Agent',
      recipientEmail: claim.creatorEmail,
      recipientId: claim.createdBy,
      title: 'Medical Claim Rejected ✗',
      message: `Claim #${claim.reference} for ${claim.memberName} was rejected. Reason: ${reason}`,
      timestamp: new Date().toISOString(),
      unread: true,
      type: 'claim',
      targetSection: 'claims',
      entityId: claim.id,
    });
  },

  /**
   * Universal Audit and Notification Logger
   */
  logAction: async (
    actionType: string,
    entityType: 'member' | 'organization' | 'claim' | 'enrollment' | 'provider' | 'system',
    entityId: string,
    details: string,
    currentUser: any
  ): Promise<void> => {
    // 1. Add notification for supervisor and admin
    await FirestoreService.addNotification({
      recipientRole: 'Admin',
      title: `System Alert: ${actionType.replace(/_/g, ' ')}`,
      message: details,
      timestamp: new Date().toISOString(),
      unread: true,
      type: 'system',
      targetSection: entityType === 'organization' ? 'organizations' : entityType === 'member' ? 'members' : 'claims',
      entityId: entityId,
    });

    await FirestoreService.addNotification({
      recipientRole: 'Supervisor',
      title: `Audit: ${actionType.replace(/_/g, ' ')}`,
      message: details,
      timestamp: new Date().toISOString(),
      unread: true,
      type: 'system',
      targetSection: entityType === 'organization' ? 'organizations' : entityType === 'member' ? 'members' : 'claims',
      entityId: entityId,
    });
  },

  // === AMÉLIORATION AJOUTÉE : Health Insurance Policy Management & Premium Monitoring ===
  // Recalcule automatiquement le statut de CHAQUE police (moteur centralisé
  // policyEngine.getPolicyCoverageStatus — jamais un statut stocké qu'on ferait confiance
  // aveuglément) et, uniquement pour les polices dont le statut calculé diverge du dernier
  // statut persisté, met à jour Firestore + crée une notification pour les utilisateurs
  // opérationnels concernés (Admin/Supervisor). Sans backend planifié (Cloud Functions) dans
  // ce projet, cette fonction est appelée depuis App.tsx à chaque changement des données de
  // police ET sur un intervalle périodique, pour que les transitions basées sur la date
  // (expiration, fin de délai de grâce) soient détectées même sans écriture déclenchante.
  // Idempotent : une police déjà à jour (statut calculé == statut stocké) n'est jamais
  // réécrite, donc aucun risque de boucle infinie via le listener onSnapshot qui redéclenche
  // cette fonction.
  syncPolicyStatuses: async (policies: HealthPolicy[], members: Member[]): Promise<void> => {
    for (const policy of policies) {
      const computed = getPolicyCoverageStatus(policy);
      if (computed.status === policy.status && computed.coverageBlocked === policy.coverageBlocked) {
        continue; // Already accurate — nothing to persist or notify.
      }

      const wasBlocked = policy.coverageBlocked;
      const nowBlocked = computed.coverageBlocked;

      // === AMÉLIORATION AJOUTÉE : câblage de la Cloud Function `syncPolicy` (Phase 3/5), sur
      // demande explicite, avec repli automatique. Cette fonction relit la police et applique
      // le MÊME moteur (désormais aligné, voir functions/src/policyService.ts) avec les
      // privilèges admin du SDK serveur — c'est en particulier le seul chemin qui peut
      // réactiver une police (lever coverageBlocked) depuis une session Agent, la règle
      // Firestore réservant ce sens à Admin/Supervisor pour l'écriture cliente directe (voir
      // firestore.rules). En cas d'échec (fonction non déployée...), on retombe sur
      // l'écriture cliente ci-dessous, strictement inchangée.
      let syncedByServer = false;
      try {
        const callSyncPolicy = httpsCallable<{ organizationId: string }, { success: boolean }>(functions, 'syncPolicy');
        const result = await callSyncPolicy({ organizationId: policy.organizationId });
        syncedByServer = !!result.data?.success;
      } catch (err) {
        console.warn('Cloud Function "syncPolicy" unavailable — falling back to client-side sync:', err);
      }

      if (!syncedByServer) {
        await FirestoreService.upsertHealthPolicy(policy.organizationId, {
          status: computed.status,
          coverageBlocked: computed.coverageBlocked,
          suspensionReason: computed.suspensionReason,
          suspensionDate:
            !wasBlocked && nowBlocked && (computed.status === 'Suspended')
              ? new Date().toISOString().split('T')[0]
              : policy.suspensionDate,
          reactivationDate:
            wasBlocked && !nowBlocked ? new Date().toISOString().split('T')[0] : policy.reactivationDate,
        });
      }

      const orgMembers = members.filter(
        (m) => m.organization?.toLowerCase().trim() === policy.organizationId.toLowerCase().trim()
      );
      const dependentsCount = orgMembers.reduce(
        (sum, m) => sum + ((m.dependents?.length || 0) + (m.children?.length || 0) + (m.spouseName ? 1 : 0)),
        0
      );

      let title = '';
      let message = '';
      if (computed.status === 'Expired') {
        title = 'Policy Expired';
        message = `${policy.organizationId}\nPolicy ${policy.policyNumber} expired on ${policy.expirationDate}.\n\n${orgMembers.length} insured members affected\n${dependentsCount} dependents affected`;
      } else if (computed.status === 'Suspended') {
        title = 'Policy Suspended';
        message = `${policy.organizationId}\nPolicy ${policy.policyNumber} has been suspended${
          computed.suspensionReason === 'Non-payment' ? ' due to unpaid premium' : ''
        }.\n\n${orgMembers.length} insured members affected\n${dependentsCount} dependents affected`;
      } else if (computed.status === 'Expiring Soon') {
        title = 'Policy Expiring Soon';
        message = `${policy.organizationId}\nPolicy ${policy.policyNumber} expires on ${policy.expirationDate} (${computed.daysUntilExpiration} day(s) left).`;
      } else if (wasBlocked && !nowBlocked) {
        title = 'Policy Reactivated';
        message = `${policy.organizationId}\nPolicy ${policy.policyNumber} has been reactivated. Healthcare access restored for ${orgMembers.length} insured members and ${dependentsCount} dependents.`;
      }

      if (title) {
        await FirestoreService.addNotification({
          recipientRole: 'Admin',
          title,
          message,
          timestamp: new Date().toISOString(),
          unread: true,
          type: 'policy',
          targetSection: 'organizations',
          entityId: policy.id,
        });
        await FirestoreService.addNotification({
          recipientRole: 'Supervisor',
          title,
          message,
          timestamp: new Date().toISOString(),
          unread: true,
          type: 'policy',
          targetSection: 'organizations',
          entityId: policy.id,
        });
      }
    }
  },
};
