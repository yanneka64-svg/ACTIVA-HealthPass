// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Verrouille le
// booléen de validité du schéma AVANT toute régression future : ces règles reproduisent
// exactement les vérifications impératives qui existaient déjà dans AgentClaimsView.tsx (voir
// agentClaimsFormSchemas.ts) — éligibilité du bénéficiaire, prestataire sélectionné, montant
// total > 0. Les messages précis restent testés séparément dans AgentClaimsView.test.tsx.
import { describe, it, expect } from 'vitest';
import { createAgentClaimsFormSchema } from './agentClaimsFormSchemas';
import { Member, Organization } from '../../types';

const baseValues = {
  principalName: 'John Doe',
  memberCard: 'CARD-001',
  organization: 'Acme Corp',
  patientName: 'John Doe',
  patientRelationship: 'Principal',
  currency: 'USD' as const,
  selectedProviderName: 'City Clinic',
  doctorName: 'Dr. Smith',
  selectedMedicalFormId: '',
  medicalActs: [{ id: '1', category: 'General Practitioner Consultation', description: 'Consult', amount: 40 }],
};

const eligibleMember: Member = {
  id: 'm1',
  cardNo: 'CARD-001',
  principalName: 'John Doe',
  children: [],
  birthDate: '1980-01-01',
  relationship: 'Principal',
  organization: 'Acme Corp',
  status: 'Active',
  hasPhoto: false,
  hasBiometrics: false,
  createdAt: '2026-01-01',
};

const organization: Organization = {
  id: 'o1',
  name: 'Acme Corp',
  policyNumber: 'P-1',
  effectiveDate: '2026-01-01',
  expirationDate: '2027-01-01',
  declaredMembers: 10,
  coverageRate: 80,
  status: 'Active',
};

describe('createAgentClaimsFormSchema', () => {
  it('accepte un membre éligible, un prestataire sélectionné et un montant total positif', () => {
    const schema = createAgentClaimsFormSchema([eligibleMember], [organization], []);
    expect(schema.safeParse(baseValues).success).toBe(true);
  });

  it('rejette un bénéficiaire inéligible (membre suspendu)', () => {
    const suspendedMember: Member = { ...eligibleMember, status: 'Suspended' };
    const schema = createAgentClaimsFormSchema([suspendedMember], [organization], []);
    expect(schema.safeParse(baseValues).success).toBe(false);
  });

  it('rejette une soumission sans prestataire sélectionné', () => {
    const schema = createAgentClaimsFormSchema([eligibleMember], [organization], []);
    expect(schema.safeParse({ ...baseValues, selectedProviderName: '' }).success).toBe(false);
  });

  it('rejette une soumission dont le montant total est nul', () => {
    const schema = createAgentClaimsFormSchema([eligibleMember], [organization], []);
    expect(
      schema.safeParse({ ...baseValues, medicalActs: [{ ...baseValues.medicalActs[0], amount: 0 }] }).success
    ).toBe(false);
  });

  it('accepte une soumission sans carte ni nom principal renseignés (facturation directe/anonyme)', () => {
    // Comportement existant préservé : quand carte ET nom principal sont vides, l'éligibilité
    // n'est même pas évaluée (comme dans le code impératif d'origine, `eligibilityStatus` vaut
    // `null` dans ce cas précis) — seule la règle prestataire/montant s'applique encore.
    const schema = createAgentClaimsFormSchema([], [organization], []);
    expect(schema.safeParse({ ...baseValues, memberCard: '', principalName: '' }).success).toBe(true);
  });

  it("rejette quand une référence non vide ne correspond à aucun membre du registre", () => {
    const schema = createAgentClaimsFormSchema([], [organization], []);
    expect(schema.safeParse(baseValues).success).toBe(false);
  });

  it('la borne (registre de membres/organisations/plafonds) est bien dynamique par instance', () => {
    const withEligibleMember = createAgentClaimsFormSchema([eligibleMember], [organization], []);
    const suspendedMember: Member = { ...eligibleMember, status: 'Suspended' };
    const withSuspendedMember = createAgentClaimsFormSchema([suspendedMember], [organization], []);
    expect(withEligibleMember.safeParse(baseValues).success).toBe(true);
    expect(withSuspendedMember.safeParse(baseValues).success).toBe(false);
  });
});
