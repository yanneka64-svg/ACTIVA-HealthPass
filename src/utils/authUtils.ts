import { NavSection } from '../types';

export type AppRole = 'Admin' | 'Supervisor' | 'Agent';

/**
 * Strictly normalizes any raw role string to one of the 3 validated application roles.
 * Returns null if the role is unrecognized or invalid (NO DEFAULT FALLBACK TO ADMIN/SUPERVISOR/AGENT).
 */
export function normalizeRole(rawRole: any): AppRole | null {
  if (!rawRole || typeof rawRole !== 'string') return null;
  const cleaned = rawRole.trim().toLowerCase();
  
  if (cleaned === 'admin' || cleaned === 'administrator' || cleaned === 'administrateur') {
    return 'Admin';
  }
  if (cleaned === 'supervisor' || cleaned === 'superviseur' || cleaned === 'medical_supervisor') {
    return 'Supervisor';
  }
  if (cleaned === 'agent' || cleaned === 'frontdesk' || cleaned === 'intake_agent') {
    return 'Agent';
  }
  
  return null;
}

/**
 * Returns the default home section for a given role.
 */
export function getDefaultSectionForRole(role: AppRole): NavSection {
  switch (role) {
    case 'Admin':
      return 'dashboard';
    case 'Supervisor':
      return 'claims_validation';
    case 'Agent':
      return 'identification';
  }
}

/**
 * List of allowed navigation sections for each role.
 */
export const ROLE_ALLOWED_SECTIONS: Record<AppRole, NavSection[]> = {
  Admin: [
    'dashboard',
    'claims',
    'invoices',
    'enrollments',
    'reports',
    'members',
    'organizations',
    'providers',
    'ceilings',
    'accounts',
    'logs',
    'identification',
    'medical_form',
    'claims_validation',
    'enrollments_validation',
    'receipts',
  ],
  Supervisor: [
    'dashboard',
    'medical_form',
    'claims_validation',
    'enrollments_validation',
    'receipts',
    'reports',
  ],
  Agent: [
    'identification',
    'medical_form',
    'claims',
    'enrollments',
  ],
};

/**
 * Checks whether a specific navigation section is strictly permitted for the given role.
 */
export function isSectionAllowedForRole(role: AppRole | null, section: NavSection): boolean {
  if (!role) return false;
  const allowedList = ROLE_ALLOWED_SECTIONS[role];
  return Boolean(allowedList && allowedList.includes(section));
}
