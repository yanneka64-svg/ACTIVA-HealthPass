import { Enrollment, Claim, Member, Organization, InvoiceItem, AppNotification, DependentItem, DependentRelationship, HealthPolicy } from '../types';
import { FirestoreService } from './firestore';
import { getPolicyCoverageStatus } from './policyEngine';
// === AMÉLIORATION AJOUTÉE : câblage des Cloud Functions (Phase 3/5), sur demande explicite.
import { httpsCallable } from 'firebase/functions';
import { runTransaction, doc } from 'firebase/firestore';
import { functions, db, auth } from '../lib/firebase';
import { recordServerFallback } from '../utils/fallbackTelemetry';

// === AMÉLIORATION AJOUTÉE : sécurité (Réconciliation 2026-09-07, décision explicite) ===
// Le filet de sécurité client sur claims/enrollments (voir approveClaim/rejectClaim/
// approveEnrollment/rejectEnrollment ci-dessous) n'a jamais vérifié le statut courant du
// document avant d'écrire — exactement la même faille déjà corrigée côté serveur dans
// functions/src/claimsService.ts/enrollmentsService.ts (finding A2, 2026-09-06), mais restée
// ouverte sur CE chemin de repli. Décision explicite : garder le fallback (le supprimer
// bloquerait toute approbation si les Cloud Functions ne tournent pas), mais lui appliquer la
// même garde. Vérification par transaction Firestore juste avant l'écriture de repli (lecture +
// contrôle atomiques ; l'écriture elle-même reste hors transaction, comme le reste de ce chemin
// de repli déjà existant — voir FirestoreService.updateClaim/updateEnrollment) : réduit
// drastiquement, sans réécrire toute l'architecture de ce chemin de secours, la fenêtre pendant
// laquelle un double-clic ou deux superviseurs concurrents pourraient générer une facture ou un
// membre en double via CE chemin précis (le chemin serveur, prioritaire, est lui déjà protégé
// atomiquement par la transaction de claimsService.ts/enrollmentsService.ts).
export async function assertStillPendingForClientFallback(
  collectionName: 'claims' | 'enrollments',
  id: string
): Promise<void> {
  // === AMÉLIORATION AJOUTÉE : sécurité (revue 2026-09-11 — revalidation serveur du rôle sur le
  // fallback client) ===
  // Constat : ce chemin de repli écrit directement via le SDK Firestore, sans passer par
  // `processClaimDecision`/`processEnrollmentDecision` — son SEUL rempart contre une approbation
  // par un utilisateur non autorisé est donc `firestore.rules` (`userProfile()`/`isAdmin()`/
  // `isSupervisor()`/`isActiveUser()`), évalué à partir du jeton d'authentification que le
  // navigateur a EN MÉMOIRE. Or ce jeton n'est rafraîchi automatiquement par le SDK Firebase
  // Auth qu'environ une fois par heure : un utilisateur rétrogradé (Supervisor -> Agent) ou
  // désactivé par un Admin pendant ce délai continue de présenter un jeton portant l'ANCIEN rôle/
  // statut actif, même si `syncAccountClaims` (functions/src/index.ts) a déjà mis à jour le
  // Custom Claim côté serveur au moment même du changement — la même fenêtre existe côté Cloud
  // Function (`resolveUserRole` retombe aussi en priorité sur `context.auth.token.role`), mais
  // celle-ci est le chemin PRIORITAIRE, tandis que ce repli n'est emprunté qu'en cas
  // d'indisponibilité de la Cloud Function : il mérite une garde dédiée plutôt que de compter
  // sur le même délai de propagation.
  // Correctif : forcer le rafraîchissement du jeton juste avant la vérification de statut
  // ci-dessous — `getIdToken(true)` interroge Firebase Auth et obtient un jeton reflétant l'état
  // `accounts/{uid}` le plus récent, avant que `firestore.rules` n'évalue le rôle/statut actif
  // pour l'écriture de repli. Best-effort : un échec du rafraîchissement (ex. hors ligne) ne
  // bloque pas la vérification ci-dessous, qui reste protégée par firestore.rules avec le jeton
  // disponible, exactement comme avant ce correctif.
  if (auth.currentUser) {
    await auth.currentUser.getIdToken(true).catch(() => {});
  }

  await runTransaction(db, async (tx) => {
    const ref = doc(db, collectionName, id);
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new Error(`This ${collectionName === 'claims' ? 'claim' : 'enrollment'} no longer exists.`);
    }
    const status = (snap.data() as { status?: string }).status || 'pending';
    if (status !== 'pending') {
      throw new Error(
        `This ${collectionName === 'claims' ? 'claim' : 'enrollment'} has already been decided (current status: '${status}') and cannot be decided again.`
      );
    }
  });
}

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

    // === AMÉLIORATION AJOUTÉE : sécurité (Go-Live Santé / SoD) — Exécution autoritaire côté serveur
    // via la Cloud Function `processEnrollmentDecision`. Applique la séparation des tâches (SoD),
    // la mise à jour atomique dans une transaction Firestore, la synchronisation avec l'annuaire
    // des membres et l'écriture de l'audit log immuable.
    let handledByServer = false;
    try {
      const callProcessEnrollment = httpsCallable<
        { enrollmentId: string; decision: 'approved' | 'rejected'; approverName?: string; approverRole?: string },
        { success: boolean; memberId?: string }
      >(functions, 'processEnrollmentDecision');
      const result = await callProcessEnrollment({
        enrollmentId: enr.id,
        decision: 'approved',
        approverName: currentUser?.fullName || currentUser?.displayName || currentUser?.email,
        approverRole: currentUser?.profile || currentUser?.role,
      });
      handledByServer = !!result.data?.success;
    } catch (err) {
      console.warn('Cloud Function "processEnrollmentDecision" unavailable — falling back to client-side approval:', err);
      recordServerFallback('processEnrollmentDecision', `Approval fallback for ${enr.id}`);
    }

    if (!handledByServer) {
      await assertStillPendingForClientFallback('enrollments', enr.id);

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
    }
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

    // === AMÉLIORATION AJOUTÉE : câblage de la Cloud Function `processEnrollmentDecision` pour le rejet
    let handledByServer = false;
    try {
      const callProcessEnrollment = httpsCallable<
        { enrollmentId: string; decision: 'approved' | 'rejected'; approverName?: string; approverRole?: string; rejectionReason?: string },
        { success: boolean }
      >(functions, 'processEnrollmentDecision');
      const result = await callProcessEnrollment({
        enrollmentId: enr.id,
        decision: 'rejected',
        approverName: currentUser?.fullName || currentUser?.displayName || currentUser?.email,
        approverRole: currentUser?.profile || currentUser?.role,
        rejectionReason: reason,
      });
      handledByServer = !!result.data?.success;
    } catch (err) {
      console.warn('Cloud Function "processEnrollmentDecision" unavailable — falling back to client-side rejection:', err);
      recordServerFallback('processEnrollmentDecision', `Rejection fallback for ${enr.id}`);
    }

    if (!handledByServer) {
      await assertStillPendingForClientFallback('enrollments', enr.id);

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
    }
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
        // === AMÉLIORATION AJOUTÉE (v3) : Centralized Card Number Management System — sur
        // demande explicite, la génération automatique est retirée. Ce repli (déclenché
        // quand l'ayant droit approuvé référence un assuré principal introuvable dans
        // l'annuaire) n'est atteint QUE lorsque `enr.mainInsuredCardNo` est déjà renseigné —
        // voir `isPrincipal` plus haut, qui traite un enrôlement sans `mainInsuredCardNo`
        // comme son propre principal. Le numéro de carte du principal (déjà saisi
        // manuellement/importé à l'enrôlement, jamais fabriqué ici) est donc simplement
        // repris tel quel.
        const primaryCardNo = enr.mainInsuredCardNo;
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
  ): Promise<{ medicalFormLinkFailed: boolean }> => {
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

    const claimRef = await FirestoreService.addClaim(payload);

    // === AMÉLIORATION AJOUTÉE : lien bidirectionnel Claim <-> MedicalForm (retour utilisateur,
    // 2026-09-12) — quand l'Agent a rattaché une fiche maladie existante à ce claim (voir le
    // sélecteur "Link to Medical Form" dans AgentClaimsView.tsx), le claim porte déjà
    // medicalFormId/medicalFormReference (écrits ci-dessus avec le reste du payload) ; il ne
    // reste qu'à reporter le sens inverse sur la fiche elle-même, une fois l'id du nouveau claim
    // connu. Comportement inchangé pour tout claim soumis sans fiche associée (facturation
    // directe) : payload.medicalFormId est alors absent et ce bloc ne s'exécute pas.
    // === AMÉLIORATION AJOUTÉE : robustesse (auto-revue, 2026-09-12) — le claim ci-dessus est
    // DÉJÀ créé avec succès à ce stade ; une panne réseau/permission sur ce report ne doit
    // jamais faire échouer toute la soumission (l'agent perdrait sa saisie alors que le claim
    // existe déjà en base). L'échec est donc absorbé ici et signalé à l'appelant via la valeur
    // de retour, pour un message distinct côté UI plutôt qu'un échec silencieux.
    let medicalFormLinkFailed = false;
    if (payload.medicalFormId) {
      try {
        await FirestoreService.linkMedicalFormToClaim(payload.medicalFormId, claimRef.id, payload.reference);
      } catch (err) {
        console.error('linkMedicalFormToClaim failed (the claim itself was still created successfully):', err);
        medicalFormLinkFailed = true;
      }
    }

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

    return { medicalFormLinkFailed };
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
      recordServerFallback('processClaimDecision', `Approval fallback for ${claim.id}`);
    }

    if (!handledByServer) {
      await assertStillPendingForClientFallback('claims', claim.id);

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
        // === AMÉLIORATION AJOUTÉE : nouveau modèle de bordereau de règlement (voir
        // InvoicesView.tsx / printUtils.ts) — conserve la référence du claim d'origine et le
        // détail des actes médicaux, jusqu'ici perdus lors de la génération de la facture.
        claimId: claim.reference,
        medicalActs: claim.medicalActs,
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
      recordServerFallback('processClaimDecision', `Rejection fallback for ${claim.id}`);
    }

    if (!handledByServer) {
      await assertStillPendingForClientFallback('claims', claim.id);

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
