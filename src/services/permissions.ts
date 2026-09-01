import { UserProfile } from '../types';

/**
 * Standard Permission Actions
 * VIEW    → View records / dashboards
 * CREATE  → Create new records
 * EDIT    → Modify records
 * SUBMIT  → Submit for approval
 * APPROVE → Validate / Approve
 * REJECT  → Reject
 * RETURN  → Return for correction
 * ASSIGN  → Assign record to an agent
 * DELETE  → Permanently delete
 * EXPORT  → Export data (Excel, CSV, PDF)
 * REPORT  → Generate analytical reports
 * ADMIN   → Administer (Users, Permissions, Settings, Audit Trail)
 */
export type PermissionAction =
  | 'VIEW'
  | 'CREATE'
  | 'EDIT'
  | 'SUBMIT'
  | 'APPROVE'
  | 'REJECT'
  | 'RETURN'
  | 'ASSIGN'
  | 'DELETE'
  | 'EXPORT'
  | 'REPORT'
  | 'ADMIN';

export type ResourceScope =
  | 'dashboard'
  | 'claims'
  | 'enrollments'
  | 'medical_forms'
  | 'invoices'
  | 'members'
  | 'organizations'
  | 'providers'
  | 'ceilings'
  | 'accounts'
  | 'logs'
  | 'reports';

export interface MatrixRow {
  id: string;
  feature: string;
  category: 'Access & Dashboard' | 'Records Management' | 'Workflow & Validation' | 'Statistics & Reports' | 'Administration & Security';
  action: PermissionAction;
  agent: boolean | 'scope'; // true, false, 'scope' = "Within assigned scope"
  supervisor: boolean;
  admin: boolean;
  description: string;
  sodRule?: boolean; // Separation of Duties rule applies
}

/**
 * Recommended ACTIVA HealthPass Entitlements Matrix
 */
export const PERMISSIONS_MATRIX: MatrixRow[] = [
  {
    id: 'login',
    feature: 'Sign In / Authenticate',
    category: 'Access & Dashboard',
    action: 'VIEW',
    agent: true,
    supervisor: true,
    admin: true,
    description: 'Secure access to the authenticated workspace'
  },
  {
    id: 'view_dashboard',
    feature: 'View Management Dashboard',
    category: 'Access & Dashboard',
    action: 'VIEW',
    agent: 'scope',
    supervisor: true,
    admin: true,
    description: 'Agent: personal activities | Supervisor: team oversight | Admin: organization-wide'
  },
  {
    id: 'create_record',
    feature: 'Create Claim / Enrollment Record',
    category: 'Records Management',
    action: 'CREATE',
    agent: true,
    supervisor: true,
    admin: true,
    description: 'Direct entry of coverage vouchers, benefit claims, and enrollments'
  },
  {
    id: 'edit_own_records',
    feature: 'Edit Own Draft Records',
    category: 'Records Management',
    action: 'EDIT',
    agent: true,
    supervisor: true,
    admin: true,
    description: 'Modifications allowed prior to final supervisor approval'
  },
  {
    id: 'edit_other_records',
    feature: 'Edit Records Created by Others',
    category: 'Records Management',
    action: 'EDIT',
    agent: false,
    supervisor: true,
    admin: true,
    description: 'Supervisory review and corrections across all team members'
  },
  {
    id: 'view_records',
    feature: 'View Claims & Enrollments',
    category: 'Records Management',
    action: 'VIEW',
    agent: 'scope',
    supervisor: true,
    admin: true,
    description: 'Agent: assigned / created records | Supervisor & Admin: all records'
  },
  {
    id: 'delete_record',
    feature: 'Delete Record Permanently',
    category: 'Records Management',
    action: 'DELETE',
    agent: false,
    supervisor: false,
    admin: true,
    description: 'Permanent deletion (Strictly reserved for System Administrator)'
  },
  {
    id: 'submit_record',
    feature: 'Submit Record for Validation',
    category: 'Workflow & Validation',
    action: 'SUBMIT',
    agent: true,
    supervisor: true,
    admin: true,
    description: 'Submission to the medical review queue for supervisor evaluation'
  },
  {
    id: 'approve_record',
    feature: 'Validate / Approve Record',
    category: 'Workflow & Validation',
    action: 'APPROVE',
    agent: false,
    supervisor: true,
    admin: true,
    description: 'Final approval. SoD Rule: strict prohibition of self-approval',
    sodRule: true
  },
  {
    id: 'reject_record',
    feature: 'Reject Record with Reason',
    category: 'Workflow & Validation',
    action: 'REJECT',
    agent: false,
    supervisor: true,
    admin: true,
    description: 'Formal rejection with mandatory compliance reasoning and policyholder notice'
  },
  {
    id: 'return_record',
    feature: 'Return Record for Correction',
    category: 'Workflow & Validation',
    action: 'RETURN',
    agent: false,
    supervisor: true,
    admin: true,
    description: 'Return record back to drafting agent with explanatory feedback'
  },
  {
    id: 'assign_record',
    feature: 'Assign / Reassign Record',
    category: 'Workflow & Validation',
    action: 'ASSIGN',
    agent: false,
    supervisor: true,
    admin: true,
    description: 'Assign workload and queue items to specific operational agents'
  },
  {
    id: 'view_own_stats',
    feature: 'View Personal Productivity Stats',
    category: 'Statistics & Reports',
    action: 'VIEW',
    agent: true,
    supervisor: true,
    admin: true,
    description: 'Individual intake volume, processing turnaround, and approval rates'
  },
  {
    id: 'view_team_stats',
    feature: 'View Team & Operations Stats',
    category: 'Statistics & Reports',
    action: 'REPORT',
    agent: false,
    supervisor: true,
    admin: true,
    description: 'Team-wide operational throughput, rejection rates, and provider volumes'
  },
  {
    id: 'generate_reports',
    feature: 'Generate Analytical Reports',
    category: 'Statistics & Reports',
    action: 'REPORT',
    agent: false,
    supervisor: true,
    admin: true,
    description: 'Consolidated analyses by provider, employer organization, and period'
  },
  {
    id: 'export_data',
    feature: 'Export Data (Excel, CSV, PDF)',
    category: 'Statistics & Reports',
    action: 'EXPORT',
    agent: false,
    supervisor: true,
    admin: true,
    description: 'Secure export in Excel (.xlsx), CSV, and PDF formats'
  },
  {
    id: 'manage_users',
    feature: 'Manage User Accounts',
    category: 'Administration & Security',
    action: 'ADMIN',
    agent: false,
    supervisor: false,
    admin: true,
    description: 'End-to-end administration of system user lifecycle and roles'
  },
  {
    id: 'create_account',
    feature: 'Create User Account',
    category: 'Administration & Security',
    action: 'ADMIN',
    agent: false,
    supervisor: false,
    admin: true,
    description: 'Provisioning accounts with temporary passwords and mobile access flags'
  },
  {
    id: 'edit_permissions',
    feature: 'Configure Entitlements & Permissions',
    category: 'Administration & Security',
    action: 'ADMIN',
    agent: false,
    supervisor: false,
    admin: true,
    description: 'Assigning user roles (Agent, Supervisor, Admin) and granular permission toggles'
  },
  {
    id: 'disable_account',
    feature: 'Suspend / Deactivate Account',
    category: 'Administration & Security',
    action: 'ADMIN',
    agent: false,
    supervisor: false,
    admin: true,
    description: 'Immediate revocation of application access'
  },
  {
    id: 'reset_password',
    feature: 'Reset User Password',
    category: 'Administration & Security',
    action: 'ADMIN',
    agent: false,
    supervisor: false,
    admin: true,
    description: 'Issuance of single-use temporary password with mandatory change on next login'
  },
  {
    id: 'configure_app',
    feature: 'Configure Master Settings',
    category: 'Administration & Security',
    action: 'ADMIN',
    agent: false,
    supervisor: false,
    admin: true,
    description: 'Setting coverage ceilings, healthcare provider network, and employer policies'
  },
  {
    id: 'view_audit_logs',
    feature: 'View Security Audit Trail & Logs',
    category: 'Administration & Security',
    action: 'ADMIN',
    agent: false,
    supervisor: false,
    admin: true,
    description: 'Comprehensive immutable traceability of logins, operations, and security events'
  },
  {
    id: 'view_all_data',
    feature: 'Unrestricted Data Access',
    category: 'Administration & Security',
    action: 'ADMIN',
    agent: false,
    supervisor: false,
    admin: true,
    description: 'Full global visibility across all entities and historical registries'
  }
];

export interface CurrentUserRef {
  uid?: string;
  email?: string;
  username?: string;
  fullName?: string;
}

export interface RecordAuthorRef {
  createdBy?: string;
  createdById?: string;
  creatorEmail?: string;
  creatorName?: string;
  agentId?: string;
  agentName?: string;
  status?: string;
}

/**
 * Check basic role permission
 */
export function hasPermission(
  role: UserProfile | string | undefined,
  action: PermissionAction,
  _resource?: ResourceScope
): boolean {
  const normRole = (role || '').toLowerCase();
  if (normRole === 'admin') return true;

  if (normRole === 'superviseur' || normRole === 'supervisor') {
    // Supervisor can VIEW, CREATE, EDIT, SUBMIT, APPROVE, REJECT, RETURN, ASSIGN, REPORT, EXPORT
    // Supervisor CANNOT: DELETE, ADMIN (manage accounts, configure app, audit logs)
    if (['DELETE', 'ADMIN'].includes(action)) return false;
    return true;
  }

  if (normRole === 'agent') {
    // Agent can VIEW (own scope), CREATE, EDIT (own unvalidated), SUBMIT
    // Agent CANNOT: APPROVE, REJECT, RETURN, ASSIGN, REPORT, EXPORT, DELETE, ADMIN
    if (['VIEW', 'CREATE', 'EDIT', 'SUBMIT'].includes(action)) return true;
    return false;
  }

  return false;
}

/**
 * Separation of Duties (SoD) Rule Validation:
 * "An Agent or author user can NEVER approve their own record."
 */
export function canApproveRecord(
  role: UserProfile | string | undefined,
  currentUser: CurrentUserRef | null,
  record: RecordAuthorRef
): { allowed: boolean; reason?: string } {
  const normRole = (role || '').toLowerCase();

  // Agent role cannot approve any dossier
  if (normRole === 'agent') {
    return {
      allowed: false,
      reason: 'Operational agents do not possess approval entitlements (Separation of Duties rule).'
    };
  }

  // Must be at least Supervisor or Admin
  if (normRole !== 'superviseur' && normRole !== 'supervisor' && normRole !== 'admin') {
    return {
      allowed: false,
      reason: 'User profile is not authorized to validate dossiers.'
    };
  }

  // Check Self-Approval (SoD enforcement)
  if (currentUser) {
    const isSelfCreated =
      (currentUser.uid && (record.createdBy === currentUser.uid || record.createdById === currentUser.uid)) ||
      (currentUser.email && record.creatorEmail && record.creatorEmail.toLowerCase() === currentUser.email.toLowerCase()) ||
      (currentUser.username && record.agentName && record.agentName.toLowerCase() === currentUser.username.toLowerCase()) ||
      (currentUser.fullName && record.creatorName && record.creatorName.toLowerCase() === currentUser.fullName.toLowerCase());

    if (isSelfCreated) {
      return {
        allowed: false,
        reason: 'Separation of Duties: You cannot approve a record that you created or submitted yourself.'
      };
    }
  }

  return { allowed: true };
}

/**
 * Check if the user can edit a record
 */
export function canEditRecord(
  role: UserProfile | string | undefined,
  currentUser: CurrentUserRef | null,
  record: RecordAuthorRef
): { allowed: boolean; reason?: string } {
  const normRole = (role || '').toLowerCase();
  if (normRole === 'admin') return { allowed: true };

  if (normRole === 'superviseur' || normRole === 'supervisor') {
    return { allowed: true };
  }

  if (normRole === 'agent') {
    // If record is already approved, agent cannot edit
    if (record.status === 'approved') {
      return {
        allowed: false,
        reason: 'This record has already been approved and can no longer be modified.'
      };
    }

    // Agent can only edit their own records
    if (currentUser) {
      const isOwner =
        !record.createdBy ||
        (currentUser.uid && (record.createdBy === currentUser.uid || record.createdById === currentUser.uid)) ||
        (currentUser.email && record.creatorEmail && record.creatorEmail.toLowerCase() === currentUser.email.toLowerCase()) ||
        (currentUser.username && record.agentName && record.agentName.toLowerCase() === currentUser.username.toLowerCase());

      if (!isOwner) {
        return {
          allowed: false,
          reason: 'You may only edit your own assigned records.'
        };
      }
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'Access denied.' };
}

/**
 * Check if the user can delete a record (Only Admin)
 */
export function canDeleteRecord(role: UserProfile | string | undefined): boolean {
  const normRole = (role || '').toLowerCase();
  return normRole === 'admin';
}

/**
 * Check if user can export data (Supervisor & Admin)
 */
export function canExportData(role: UserProfile | string | undefined): boolean {
  const normRole = (role || '').toLowerCase();
  return normRole === 'superviseur' || normRole === 'supervisor' || normRole === 'admin';
}

/**
 * Check if user can assign / reassign a record to an agent (Supervisor & Admin)
 */
export function canAssignRecord(role: UserProfile | string | undefined): boolean {
  const normRole = (role || '').toLowerCase();
  return normRole === 'superviseur' || normRole === 'supervisor' || normRole === 'admin';
}

/**
 * Check if user can return a record for correction (Supervisor & Admin)
 */
export function canReturnRecord(role: UserProfile | string | undefined): boolean {
  const normRole = (role || '').toLowerCase();
  return normRole === 'superviseur' || normRole === 'supervisor' || normRole === 'admin';
}

/**
 * Check if user can manage user accounts and security (Only Admin)
 */
export function canManageUsers(role: UserProfile | string | undefined): boolean {
  const normRole = (role || '').toLowerCase();
  return normRole === 'admin';
}

/**
 * Check if user can configure master settings like ceilings, providers, orgs (Only Admin)
 */
export function canConfigureSettings(role: UserProfile | string | undefined): boolean {
  const normRole = (role || '').toLowerCase();
  return normRole === 'admin';
}

/**
 * Check if user can view audit trail / logs (Only Admin)
 */
export function canViewAuditLogs(role: UserProfile | string | undefined): boolean {
  const normRole = (role || '').toLowerCase();
  return normRole === 'admin';
}
