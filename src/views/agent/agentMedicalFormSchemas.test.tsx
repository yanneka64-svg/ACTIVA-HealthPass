// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Verrouille le
// booléen de validité des deux schémas AVANT toute régression future : ces règles reproduisent
// exactement les vérifications impératives qui existaient déjà dans AgentMedicalFormView.tsx (voir
// agentMedicalFormSchemas.ts). Les messages précis restent testés séparément dans
// AgentMedicalFormView.test.tsx.
import { describe, it, expect } from 'vitest';
import { generateMedicalFormSchema, createClearAllHistoryFormSchema } from './agentMedicalFormSchemas';
import { Member, Provider } from '../../types';

const testMember: Member = {
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

const testProvider: Provider = {
  id: 'p1',
  name: 'City Clinic',
  type: 'Clinic',
  location: 'Monrovia',
  conventionNumber: 'C-1',
  kypStatus: 'validated',
  contactPhone: '000',
};

const baseValues = {
  selectedMember: testMember,
  selectedProvider: testProvider,
  practitionerType: 'Generalist' as const,
  doctorSpecialty: 'Cardiology',
  customSpecialty: '',
  coverageType: 'Outpatient' as const,
  doctorName: '',
  presumedDiagnosis: '',
  requestedExams: '',
  treatmentOrder: '',
};

describe('generateMedicalFormSchema', () => {
  it('accepte quand un bénéficiaire et un prestataire sont tous deux sélectionnés', () => {
    expect(generateMedicalFormSchema.safeParse(baseValues).success).toBe(true);
  });

  it('rejette quand le bénéficiaire est absent', () => {
    expect(generateMedicalFormSchema.safeParse({ ...baseValues, selectedMember: null }).success).toBe(false);
  });

  it('rejette quand le prestataire est absent', () => {
    expect(generateMedicalFormSchema.safeParse({ ...baseValues, selectedProvider: null }).success).toBe(false);
  });

  it('rejette quand les deux sont absents', () => {
    expect(
      generateMedicalFormSchema.safeParse({ ...baseValues, selectedMember: null, selectedProvider: null }).success
    ).toBe(false);
  });
});

describe('createClearAllHistoryFormSchema', () => {
  const schema = createClearAllHistoryFormSchema('DELETE ALL');

  it('accepte la phrase exacte (insensible à la casse) et un motif renseigné', () => {
    expect(schema.safeParse({ confirmText: 'delete all', reason: 'Cleanup' }).success).toBe(true);
    expect(schema.safeParse({ confirmText: 'DELETE ALL', reason: 'Cleanup' }).success).toBe(true);
  });

  it('rejette une phrase de confirmation incorrecte', () => {
    expect(schema.safeParse({ confirmText: 'delete', reason: 'Cleanup' }).success).toBe(false);
  });

  it('rejette un motif vide ou uniquement composé d\'espaces', () => {
    expect(schema.safeParse({ confirmText: 'DELETE ALL', reason: '' }).success).toBe(false);
    expect(schema.safeParse({ confirmText: 'DELETE ALL', reason: '   ' }).success).toBe(false);
  });

  it('la phrase de confirmation est bien dynamique par instance', () => {
    const otherSchema = createClearAllHistoryFormSchema('CONFIRM DELETE');
    expect(otherSchema.safeParse({ confirmText: 'DELETE ALL', reason: 'Cleanup' }).success).toBe(false);
    expect(otherSchema.safeParse({ confirmText: 'CONFIRM DELETE', reason: 'Cleanup' }).success).toBe(true);
  });
});
