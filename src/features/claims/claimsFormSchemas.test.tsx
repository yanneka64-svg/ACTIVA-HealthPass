// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Verrouille le
// comportement de chaque schéma AVANT tout changement futur : ces règles reproduisent des
// vérifications impératives qui existaient déjà dans ClaimsView.tsx (voir claimsFormSchemas.ts),
// et une régression ici romprait silencieusement le blocage de soumission de formulaires
// métier réels (Rejet/Retour/Assignation/Nouveau Sinistre).
import { describe, it, expect } from 'vitest';
import {
  rejectClaimSchema,
  returnClaimSchema,
  assignClaimSchema,
  newClaimSchema,
} from './claimsFormSchemas';

describe('rejectClaimSchema', () => {
  it('rejette un motif vide avec le même message que l\'ancien contrôle impératif', () => {
    const result = rejectClaimSchema.safeParse({ reason: '', comments: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Please select a rejection reason.');
    }
  });

  it('accepte un motif non vide et conserve les commentaires tels quels', () => {
    const result = rejectClaimSchema.safeParse({ reason: 'Ceiling exceeded', comments: 'See note' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ reason: 'Ceiling exceeded', comments: 'See note' });
    }
  });
});

describe('returnClaimSchema', () => {
  it('rejette une raison vide', () => {
    expect(returnClaimSchema.safeParse({ reason: '' }).success).toBe(false);
  });

  it('rejette une raison composée uniquement d\'espaces (comme l\'ancien `.trim()`)', () => {
    expect(returnClaimSchema.safeParse({ reason: '   ' }).success).toBe(false);
  });

  it('accepte une raison valide et NE LA TRANSFORME PAS (valeur brute conservée pour onReturn)', () => {
    const result = returnClaimSchema.safeParse({ reason: '  Please resubmit invoice  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      // La valeur transmise doit rester EXACTEMENT celle saisie, espaces compris — l'ancien
      // code ne passait jamais la version « trimmée » à onReturn.
      expect(result.data.reason).toBe('  Please resubmit invoice  ');
    }
  });
});

describe('assignClaimSchema', () => {
  it('rejette un nom d\'agent vide ou uniquement composé d\'espaces', () => {
    expect(assignClaimSchema.safeParse({ agentName: '' }).success).toBe(false);
    expect(assignClaimSchema.safeParse({ agentName: '   ' }).success).toBe(false);
  });

  it('accepte un nom d\'agent valide sans le transformer', () => {
    const result = assignClaimSchema.safeParse({ agentName: ' Jane Doe ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agentName).toBe(' Jane Doe ');
    }
  });
});

describe('newClaimSchema', () => {
  const valid = {
    memberCardNo: 'CARD-001',
    memberName: 'John Doe',
    organization: 'Acme Corp',
    provider: 'City Clinic',
    amount: '150',
    careType: 'Consultation & Specialist Care',
    serviceDate: '2026-09-18',
  };

  it('accepte un formulaire complet', () => {
    expect(newClaimSchema.safeParse(valid).success).toBe(true);
  });

  it('rejette quand memberCardNo, provider, amount ou careType est vide (champs `required` du formulaire)', () => {
    expect(newClaimSchema.safeParse({ ...valid, memberCardNo: '' }).success).toBe(false);
    expect(newClaimSchema.safeParse({ ...valid, provider: '' }).success).toBe(false);
    expect(newClaimSchema.safeParse({ ...valid, amount: '' }).success).toBe(false);
    expect(newClaimSchema.safeParse({ ...valid, careType: '' }).success).toBe(false);
  });

  it('accepte memberName/organization/serviceDate vides (jamais validés dans l\'ancien code : dérivés ou par défaut)', () => {
    const result = newClaimSchema.safeParse({
      ...valid,
      memberName: '',
      organization: '',
      serviceDate: '',
    });
    expect(result.success).toBe(true);
  });
});
