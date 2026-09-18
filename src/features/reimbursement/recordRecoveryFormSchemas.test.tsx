// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Verrouille le
// comportement de la fabrique de schéma AVANT tout changement futur : cette règle reproduit la
// vérification impérative qui existait déjà dans RecordRecoveryModal.tsx
// (`amount <= 0 || amount > pending`, voir recordRecoveryFormSchemas.ts), et une régression ici
// romprait silencieusement le blocage de soumission de la modale "Record Recovery".
import { describe, it, expect } from 'vitest';
import { createRecordRecoveryFormSchema } from './recordRecoveryFormSchemas';

describe('createRecordRecoveryFormSchema', () => {
  const pending = 500;
  const schema = createRecordRecoveryFormSchema(pending);
  const valid = {
    amount: 250,
    reference: 'REF-001',
    notes: '',
    recordedAt: '2026-09-18',
  };

  it('accepte un montant compris entre 0 (exclu) et le montant en attente', () => {
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ ...valid, amount: pending }).success).toBe(true);
  });

  it('rejette un montant nul ou négatif', () => {
    expect(schema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...valid, amount: -10 }).success).toBe(false);
  });

  it('rejette un montant supérieur au montant en attente', () => {
    expect(schema.safeParse({ ...valid, amount: pending + 0.01 }).success).toBe(false);
  });

  it("n'impose aucune contrainte sur reference/notes/recordedAt (jamais validés en JS auparavant)", () => {
    expect(schema.safeParse({ ...valid, reference: '', notes: '', recordedAt: '' }).success).toBe(true);
  });

  it('la borne suit la valeur de `pending` passée à la fabrique (pas une constante figée)', () => {
    const narrowerSchema = createRecordRecoveryFormSchema(100);
    expect(narrowerSchema.safeParse({ ...valid, amount: 250 }).success).toBe(false);
    expect(narrowerSchema.safeParse({ ...valid, amount: 100 }).success).toBe(true);
  });
});
