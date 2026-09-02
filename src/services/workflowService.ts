import { Enrollment, Claim, Member, Organization, InvoiceItem, AppNotification, DependentItem, DependentRelationship } from '../types';
import { FirestoreService } from './firestore';

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
   * 1. Updates enrollment status to 'approved'
   * 2. Automatically syncs / registers into Insured Members (`members` collection)
   * 3. Sends persistent notification to the submitting Agent
   */
  approveEnrollment: async (
    enr: Enrollment,
    members: Member[],
    currentUser: any
  ): Promise<void> => {
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
  },

  /**
   * Supervisor rejects an enrollment
   */
  rejectEnrollment: async (
    enr: Enrollment,
    reason: string,
    currentUser: any
  ): Promise<void> => {
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
        // Create primary holder entry and attach dependent
        await FirestoreService.addMember({
          cardNo: enr.mainInsuredCardNo || `ACT-PRI-${Math.floor(10000 + Math.random() * 90000)}`,
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
    const updated: Claim = {
      ...claim,
      status: 'approved',
      decisionDate: new Date().toISOString().split('T')[0],
      approvedBy: currentUser?.fullName || currentUser?.displayName || currentUser?.email || 'Medical Supervisor',
      comments: claim.comments || 'Direct billing approval confirmed.',
    };
    await FirestoreService.updateClaim(updated);

    // Notify submitting Agent
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
    const updated: Claim = {
      ...claim,
      status: 'rejected',
      decisionDate: new Date().toISOString().split('T')[0],
      rejectionReason: reason,
      comments: comments || 'Medical justification not met.',
    };
    await FirestoreService.updateClaim(updated);

    // Notify submitting Agent
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
};
