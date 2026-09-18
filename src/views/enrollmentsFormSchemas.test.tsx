// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Verrouille le
// comportement de chaque schéma AVANT tout changement futur : ces règles reproduisent des
// vérifications impératives qui existaient déjà dans EnrollmentsView.tsx (voir
// enrollmentsFormSchemas.ts), et une régression ici romprait silencieusement le blocage de
// soumission de formulaires métier réels (Rejet/Retour/Assignation).
import { describe, it, expect } from 'vitest';
import {
  rejectEnrollmentSchema,
  returnEnrollmentSchema,
  assignEnrollmentSchema,
} from './enrollmentsFormSchemas';

describe('rejectEnrollmentSchema', () => {
  it('rejette un motif vide', () => {
    expect(rejectEnrollmentSchema.safeParse({ reason: '' }).success).toBe(false);
  });

  it('accepte un motif non vide', () => {
    const result = rejectEnrollmentSchema.safeParse({ reason: 'Invalid ID photo' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe('Invalid ID photo');
    }
  });
});

describe('returnEnrollmentSchema', () => {
  it('rejette une raison vide', () => {
    expect(returnEnrollmentSchema.safeParse({ reason: '' }).success).toBe(false);
  });

  it('rejette une raison composée uniquement d\'espaces (comme l\'ancien `.trim()`)', () => {
    expect(returnEnrollmentSchema.safeParse({ reason: '   ' }).success).toBe(false);
  });

  it('accepte une raison valide et NE LA TRANSFORME PAS (valeur brute conservée pour onReturn)', () => {
    const result = returnEnrollmentSchema.safeParse({ reason: '  Please resubmit photo  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe('  Please resubmit photo  ');
    }
  });
});

describe('assignEnrollmentSchema', () => {
  it('rejette un nom d\'agent vide ou uniquement composé d\'espaces', () => {
    expect(assignEnrollmentSchema.safeParse({ agentName: '' }).success).toBe(false);
    expect(assignEnrollmentSchema.safeParse({ agentName: '   ' }).success).toBe(false);
  });

  it('accepte un nom d\'agent valide sans le transformer', () => {
    const result = assignEnrollmentSchema.safeParse({ agentName: ' Jane Doe ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agentName).toBe(' Jane Doe ');
    }
  });
});
