import { NavSection } from '../types';

// === AMÉLIORATION AJOUTÉE : ACTIVA Health Claims — Phase 1 (fondation, additif) ===
// 4 nouveaux rôles s'ajoutent aux 3 rôles historiques (Admin/Supervisor/Agent), pour le module
// ACTIVA Health Claims décrit dans ACTIVA_HEALTH_CLAIMS_DISCOVERY.md — qui note explicitement
// que cela va à l'encontre de la règle "3 rôles seulement" convenue lors de HealthPass 2.0
// (voir HEALTHPASS_2_0_DISCOVERY.md §4), remplacée ici par la spécification plus récente et
// détaillée. Aucun des 3 rôles existants, leur résolution, ni les écrans qu'ils voient
// aujourd'hui ne changent : ces 4 valeurs sont ignorées partout tant qu'aucun compte ne les
// porte réellement (aucune UI Admin ne permet encore de les attribuer — voir Phase 2/3 du
// rapport de découverte).
export type AppRole = 'Admin' | 'Supervisor' | 'Agent' | 'ClaimsAgent' | 'MedicalReviewer' | 'Finance' | 'Management';

/**
 * Strictly normalizes any raw role string to one of the validated application roles.
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
  // === AMÉLIORATION AJOUTÉE : ACTIVA Health Claims — Phase 1 (fondation, additif) ===
  if (cleaned === 'claimsagent' || cleaned === 'claims_agent' || cleaned === 'claims agent') {
    return 'ClaimsAgent';
  }
  if (cleaned === 'medicalreviewer' || cleaned === 'medical_reviewer' || cleaned === 'medical reviewer') {
    return 'MedicalReviewer';
  }
  if (cleaned === 'finance') {
    return 'Finance';
  }
  if (cleaned === 'management') {
    return 'Management';
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
    // === AMÉLIORATION AJOUTÉE : ACTIVA Health Claims — Phase 1 (fondation, additif) — aucun de
    // ces écrans n'existe encore (voir App.tsx) ; ces sections restent inatteignables tant
    // qu'aucun compte réel ne porte l'un de ces rôles et que les écrans de Phase 2/3 ne sont
    // pas construits, mais la résolution de rôle reste totale (pas de case manquant).
    case 'ClaimsAgent':
      return 'health_claims_list';
    case 'MedicalReviewer':
      return 'health_claims_medical_review';
    case 'Finance':
      return 'health_claims_payments';
    case 'Management':
      return 'health_claims_dashboard';
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
    // === AMÉLIORATION AJOUTÉE : "Identification" ajouté côté Superviseur (retour
    // utilisateur explicite, 2026-09-11 — "ajouter également l'identification comme sur le
    // profil agent") — même écran (AgentIdentificationView) que pour l'Agent. Voir aussi
    // src/components/Sidebar.tsx (filteredOverviewItems) pour l'entrée de menu correspondante.
    'identification',
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
  // === AMÉLIORATION AJOUTÉE : ACTIVA Health Claims — Phase 1 (fondation, additif) — voir
  // ACTIVA_HEALTH_CLAIMS_DISCOVERY.md §6 (matrice des rôles). Ces sections n'ont pas encore
  // d'écran construit (Phase 2/3) ; listées ici par avance pour que le modèle de permissions
  // soit complet dès maintenant.
  ClaimsAgent: [
    'health_claims_dashboard',
    'health_claims_list',
  ],
  MedicalReviewer: [
    'health_claims_dashboard',
    'health_claims_medical_review',
  ],
  Finance: [
    'health_claims_dashboard',
    'health_claims_payments',
  ],
  Management: [
    'health_claims_dashboard',
    'health_claims_list',
    'reports',
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
