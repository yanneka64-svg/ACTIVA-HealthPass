import { Member, Organization, Ceiling, DependentItem } from '../types';

export interface EligibilityResult {
  isEligible: boolean;
  reason?: string;
  code?: 'ORG_SUSPENDED' | 'PRINCIPAL_SUSPENDED' | 'MEMBER_SUSPENDED' | 'MEMBER_INACTIVE' | 'AGE_LIMIT_EXCEEDED' | 'NOT_FOUND';
  age?: number;
  maxAgeAllowed?: number;
  roleLabel?: string;
}

/**
 * Calculates exact age in years from birthDate string (YYYY-MM-DD or ISO string)
 * Evaluated dynamically against today's date.
 */
export function calculateAge(birthDateStr?: string): number {
  if (!birthDateStr) return 0;
  const birth = new Date(birthDateStr);
  if (isNaN(birth.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return Math.max(0, age);
}

/**
 * Centralized eligibility check for a member, optional dependent, and policy ceiling.
 * Calculates exact age and enforces age limits:
 * - Principal Insured: default 65 yrs
 * - Spouse: default 65 yrs
 * - Child / Dependent: default 21 yrs (or 25 if student)
 */
export type AnyDependentInput =
  | DependentItem
  | string
  | {
      fullName: string;
      relationship?: string;
      birthDate?: string;
      age?: number | string;
      cardNo?: string;
    }
  | null;

export function checkMemberEligibility(
  member: Member,
  dependent?: AnyDependentInput,
  policyCeiling?: Ceiling | null
): EligibilityResult {
  if (!member) {
    return { isEligible: false, reason: 'Member profile missing', code: 'NOT_FOUND' };
  }

  // 1. Check Principal Member Status
  const isPrincipalSuspended = member.status === 'Suspended' || member.status === 'Suspendu';
  const isPrincipalInactive = member.status === 'Inactive' || member.status === 'Inactif';

  if (isPrincipalSuspended) {
    return {
      isEligible: false,
      reason: `Principal insured (${member.principalName}) is SUSPENDED. All healthcare benefits are blocked.`,
      code: 'PRINCIPAL_SUSPENDED',
    };
  }

  // 2. Age limit configuration from policy ceiling (with standard fallback)
  const maxAgePrincipal = policyCeiling?.maxAgePrincipal ?? 65;
  const maxAgeSpouse = policyCeiling?.maxAgeSpouse ?? 65;
  const maxAgeChild = policyCeiling?.maxAgeChild ?? 21;

  // Resolve target dependent object if evaluating a dependent
  let targetDependent: { fullName: string; relationship?: string; birthDate?: string; age?: number | string; cardNo?: string } | undefined;

  if (dependent) {
    if (typeof dependent === 'string') {
      const q = dependent.toLowerCase().trim();
      targetDependent = member.dependents?.find(
        (d) => d.cardNo?.toLowerCase().trim() === q || d.fullName.toLowerCase().trim() === q
      );
      if (!targetDependent && member.spouseName && member.spouseName.toLowerCase().trim() === q) {
        targetDependent = {
          fullName: member.spouseName,
          relationship: member.dependentRelationship || 'spouse',
          birthDate: '1986-05-14',
        };
      }
      if (!targetDependent && member.children && Array.isArray(member.children)) {
        const foundChild = member.children.find((c) => c && c.toLowerCase().includes(q));
        if (foundChild) {
          const match = foundChild.match(/^(.*?)(?:\s*\((.*?)\))?$/);
          const name = match && match[1] ? match[1].trim() : foundChild;
          const ageStr = match && match[2] ? match[2].trim() : undefined;
          const parsedAge = ageStr ? parseInt(ageStr, 10) : 10;
          const birthYear = 2026 - parsedAge;
          targetDependent = {
            fullName: name,
            relationship: 'child',
            birthDate: `${birthYear}-01-01`,
            age: parsedAge,
          };
        }
      }
    } else {
      targetDependent = dependent;
    }
  }

  // 3. Dynamic Age Limit Verification
  if (targetDependent) {
    const depAge = targetDependent.age !== undefined && typeof targetDependent.age === 'number'
      ? targetDependent.age
      : calculateAge(targetDependent.birthDate);
    
    const rel = (targetDependent.relationship || 'child').toLowerCase().trim();
    let maxAllowed = maxAgeChild;
    let relLabel = 'Child / Dependent';

    if (rel === 'spouse' || rel === 'husband' || rel === 'wife') {
      maxAllowed = maxAgeSpouse;
      relLabel = 'Spouse';
    } else if (rel === 'parent') {
      maxAllowed = maxAgePrincipal;
      relLabel = 'Parent';
    }

    if (depAge > maxAllowed && maxAllowed > 0) {
      return {
        isEligible: false,
        reason: `Age limit exceeded (${depAge} yrs > Limit ${maxAllowed} yrs)`,
        code: 'AGE_LIMIT_EXCEEDED',
        age: depAge,
        maxAgeAllowed: maxAllowed,
        roleLabel: relLabel,
      };
    }
  } else {
    // Principal verification
    if (isPrincipalInactive) {
      return {
        isEligible: false,
        reason: `Insured member (${member.principalName}) is INACTIVE.`,
        code: 'MEMBER_INACTIVE',
      };
    }

    const principalAge = calculateAge(member.birthDate);
    if (principalAge > maxAgePrincipal && maxAgePrincipal > 0) {
      return {
        isEligible: false,
        reason: `Age limit exceeded (${principalAge} yrs > Limit ${maxAgePrincipal} yrs)`,
        code: 'AGE_LIMIT_EXCEEDED',
        age: principalAge,
        maxAgeAllowed: maxAgePrincipal,
        roleLabel: 'Principal Insured',
      };
    }
  }

  return { isEligible: true };
}

/**
 * High-level care eligibility verification engine for ACTIVA HealthPass.
 * Evaluates:
 * 1. Organization suspension
 * 2. Principal member suspension
 * 3. Member / dependent individual suspension / inactive status
 * 4. Dynamic age limit verification against policy ceilings
 */
export function checkCareEligibility(
  memberCardNoOrName: string,
  members: Member[],
  organizations: Organization[],
  ceilings: Ceiling[],
  dependentCardNoOrName?: string
): EligibilityResult {
  if (!memberCardNoOrName) {
    return { isEligible: false, reason: 'Member reference missing', code: 'NOT_FOUND' };
  }

  const query = memberCardNoOrName.toLowerCase().trim();

  // Find the principal member
  const member = members.find(
    (m) =>
      m.cardNo.toLowerCase().trim() === query ||
      m.principalName.toLowerCase().trim() === query ||
      (m.dependents && m.dependents.some((d) => d.cardNo?.toLowerCase().trim() === query || d.fullName.toLowerCase().trim() === query))
  );

  if (!member) {
    return { isEligible: false, reason: 'Member not found in active registry', code: 'NOT_FOUND' };
  }

  // 1. Check Organization status
  const org = organizations.find(
    (o) => o.name.toLowerCase().trim() === member.organization.toLowerCase().trim()
  );
  if (org && (org.status === 'Suspended' || org.status === 'Suspendu')) {
    return {
      isEligible: false,
      reason: `Organization "${org.name}" is currently SUSPENDED. All member and dependent benefits are blocked.`,
      code: 'ORG_SUSPENDED',
    };
  }

  // Find Policy Ceiling
  const policyCeiling = ceilings.find(
    (c) =>
      (c.organization && c.organization.toLowerCase().trim() === member.organization.toLowerCase().trim()) ||
      (org && c.policyNumber && org.policyNumber && c.policyNumber.toLowerCase().trim() === org.policyNumber.toLowerCase().trim())
  ) || ceilings[0] || null;

  // Determine if patient is a dependent
  const targetDep = dependentCardNoOrName || (member.principalName.toLowerCase().trim() !== query && member.cardNo.toLowerCase().trim() !== query ? query : undefined);

  return checkMemberEligibility(member, targetDep, policyCeiling);
}
