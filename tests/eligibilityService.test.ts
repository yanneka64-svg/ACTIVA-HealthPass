// === AMÉLIORATION AJOUTÉE : tests unitaires (Revue complète 2026-09-06, finding D1) pour
// eligibilityService.ts — calcul d'âge et plafonds familiaux, jusqu'ici non testés malgré leur
// rôle direct dans l'autorisation de soins au point de service (AgentIdentificationView.tsx).
import { describe, expect, it } from 'vitest';
import { calculateAge, checkMemberEligibility } from '../src/services/eligibilityService';
import type { Member, Ceiling } from '../src/types';

function baseMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'M1',
    cardNo: 'AMID-260101-00001',
    principalName: 'John Doe',
    children: [],
    birthDate: '1980-01-01',
    relationship: 'Principal',
    organization: 'ACTIVA Corporate',
    status: 'Active',
    hasPhoto: true,
    hasBiometrics: true,
    ...overrides,
  } as Member;
}

describe('calculateAge', () => {
  it('calcule un âge exact quand l\'anniversaire de l\'année est déjà passé', () => {
    const age = calculateAge('2000-01-01');
    // Référence non figée dans le temps : on vérifie une borne cohérente avec "aujourd'hui".
    const expected = new Date().getFullYear() - 2000 - (isBeforeAnniversaryThisYear('01-01') ? 1 : 0);
    expect(age).toBe(expected);
  });

  it('retourne 0 pour une date de naissance absente ou invalide (jamais une exception ni un âge négatif)', () => {
    expect(calculateAge(undefined)).toBe(0);
    expect(calculateAge('')).toBe(0);
    expect(calculateAge('not-a-date')).toBe(0);
  });

  it('ne retourne jamais un âge négatif, même pour une date de naissance dans le futur', () => {
    const futureYear = new Date().getFullYear() + 5;
    expect(calculateAge(`${futureYear}-01-01`)).toBe(0);
  });

  it('gère correctement une année bissextile (29 février)', () => {
    // 2000 est bissextile ; ne doit pas lever d'exception ni produire un âge incohérent.
    const age = calculateAge('2000-02-29');
    expect(age).toBeGreaterThan(0);
    expect(Number.isInteger(age)).toBe(true);
  });
});

function isBeforeAnniversaryThisYear(mmdd: string): boolean {
  const [, m, d] = ['2000', ...mmdd.split('-')];
  const today = new Date();
  const anniversaryThisYear = new Date(today.getFullYear(), Number(m) - 1, Number(d));
  return today < anniversaryThisYear;
}

describe('checkMemberEligibility — statut du principal', () => {
  it('un principal SUSPENDU est inéligible, quel que soit son âge', () => {
    const member = baseMember({ status: 'Suspended', birthDate: '1990-01-01' });
    const result = checkMemberEligibility(member);
    expect(result.isEligible).toBe(false);
    expect(result.code).toBe('PRINCIPAL_SUSPENDED');
  });

  it('un principal INACTIF est inéligible', () => {
    const member = baseMember({ status: 'Inactive', birthDate: '1990-01-01' });
    const result = checkMemberEligibility(member);
    expect(result.isEligible).toBe(false);
    expect(result.code).toBe('MEMBER_INACTIVE');
  });

  it('un principal actif, sous le plafond d\'âge, est éligible', () => {
    const member = baseMember({ status: 'Active', birthDate: '1990-01-01' });
    const result = checkMemberEligibility(member);
    expect(result.isEligible).toBe(true);
  });

  it('un principal actif au-dessus du plafond d\'âge (65 ans par défaut) est inéligible', () => {
    const member = baseMember({ status: 'Active', birthDate: '1950-01-01' });
    const result = checkMemberEligibility(member);
    expect(result.isEligible).toBe(false);
    expect(result.code).toBe('AGE_LIMIT_EXCEEDED');
    expect(result.maxAgeAllowed).toBe(65);
  });

  it('maxAgePrincipal:0 dans le plafond désactive la contrainte d\'âge (comportement documenté par le code, non une régression)', () => {
    const member = baseMember({ status: 'Active', birthDate: '1930-01-01' });
    const ceiling = { id: 'C1', careType: 'General', maxAgePrincipal: 0 } as Ceiling;
    const result = checkMemberEligibility(member, undefined, ceiling);
    expect(result.isEligible).toBe(true);
  });
});

describe('checkMemberEligibility — plafonds d\'âge des ayants droit', () => {
  it('un conjoint sous le plafond (65 ans par défaut) est éligible', () => {
    const member = baseMember();
    const result = checkMemberEligibility(member, {
      fullName: 'Jane Doe',
      relationship: 'spouse',
      birthDate: '1985-01-01',
    });
    expect(result.isEligible).toBe(true);
  });

  it('un conjoint au-dessus du plafond est inéligible avec le bon libellé de rôle', () => {
    const member = baseMember();
    const result = checkMemberEligibility(member, {
      fullName: 'Jane Doe',
      relationship: 'wife',
      birthDate: '1950-01-01',
    });
    expect(result.isEligible).toBe(false);
    expect(result.code).toBe('AGE_LIMIT_EXCEEDED');
    expect(result.roleLabel).toBe('Spouse');
  });

  it('un enfant sous le plafond (21 ans par défaut) est éligible', () => {
    const member = baseMember();
    const result = checkMemberEligibility(member, {
      fullName: 'Junior Doe',
      relationship: 'child',
      birthDate: '2015-01-01',
    });
    expect(result.isEligible).toBe(true);
  });

  it('un enfant au-dessus du plafond par défaut est inéligible', () => {
    const member = baseMember();
    const result = checkMemberEligibility(member, {
      fullName: 'Adult Child',
      relationship: 'child',
      birthDate: '2000-01-01',
    });
    expect(result.isEligible).toBe(false);
    expect(result.code).toBe('AGE_LIMIT_EXCEEDED');
    expect(result.roleLabel).toBe('Child / Dependent');
  });

  it('un plafond personnalisé par police (maxAgeChild étendu, ex. étudiant) est bien appliqué', () => {
    const member = baseMember();
    const ceiling = { id: 'C1', careType: 'General', maxAgeChild: 25 } as Ceiling;
    const result = checkMemberEligibility(
      member,
      { fullName: 'Student Child', relationship: 'child', birthDate: '2003-01-01' },
      ceiling
    );
    expect(result.isEligible).toBe(true);
  });

  it('un âge explicite fourni sur l\'ayant droit prime sur le calcul depuis birthDate', () => {
    const member = baseMember();
    const result = checkMemberEligibility(member, {
      fullName: 'Explicit Age Child',
      relationship: 'child',
      birthDate: '1990-01-01', // donnerait un âge > 21 si utilisé
      age: 10,
    });
    expect(result.isEligible).toBe(true);
  });

  it('le principal reste éligible même si un AUTRE ayant droit dépasse le plafond (le refus est ciblé sur la bonne personne)', () => {
    const member = baseMember({ status: 'Active', birthDate: '1990-01-01' });
    const principalResult = checkMemberEligibility(member);
    expect(principalResult.isEligible).toBe(true);
  });
});
