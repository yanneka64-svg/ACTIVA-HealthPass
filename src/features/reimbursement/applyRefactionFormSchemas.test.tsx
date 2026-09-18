// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Verrouille le
// booléen de validité AVANT toute régression future : ces règles reproduisent exactement les
// vérifications impératives qui existaient déjà dans ApplyRefactionModal.tsx (voir
// applyRefactionFormSchemas.ts) — somme des lignes == montant original de la facture, motif
// obligatoire par ligne réduite, au moins une ligne réduite.
import { describe, it, expect } from 'vitest';
import { createApplyRefactionFormSchema } from './applyRefactionFormSchemas';

const baseAct = { name: 'Consultation', amount: 100, category: undefined, retained: 100, reason: '' };

describe('createApplyRefactionFormSchema', () => {
  it('rejette quand la somme des lignes ne correspond pas au montant original de la facture', () => {
    const schema = createApplyRefactionFormSchema(150);
    expect(
      schema.safeParse({ acts: [{ ...baseAct, amount: 100, retained: 50, reason: 'x' }] }).success
    ).toBe(false);
  });

  it("rejette quand une ligne réduite n'a pas de motif", () => {
    const schema = createApplyRefactionFormSchema(100);
    expect(
      schema.safeParse({ acts: [{ ...baseAct, retained: 50, reason: '' }] }).success
    ).toBe(false);
    expect(
      schema.safeParse({ acts: [{ ...baseAct, retained: 50, reason: '   ' }] }).success
    ).toBe(false);
  });

  it("rejette quand aucune ligne n'est réduite (retenu == original partout)", () => {
    const schema = createApplyRefactionFormSchema(100);
    expect(schema.safeParse({ acts: [{ ...baseAct, retained: 100 }] }).success).toBe(false);
  });

  it('accepte quand la somme correspond, au moins une ligne est réduite et son motif est renseigné', () => {
    const schema = createApplyRefactionFormSchema(100);
    expect(
      schema.safeParse({ acts: [{ ...baseAct, retained: 60, reason: 'Duplicate charge' }] }).success
    ).toBe(true);
  });

  it('accepte plusieurs lignes tant que la somme des montants originaux correspond', () => {
    const schema = createApplyRefactionFormSchema(150);
    expect(
      schema.safeParse({
        acts: [
          { ...baseAct, amount: 100, retained: 100, reason: '' },
          { ...baseAct, amount: 50, retained: 30, reason: 'Excessive dosage' },
        ],
      }).success
    ).toBe(true);
  });

  it('la borne (montant original) est bien dynamique par instance', () => {
    const narrower = createApplyRefactionFormSchema(80);
    const wider = createApplyRefactionFormSchema(100);
    const acts = [{ ...baseAct, amount: 100, retained: 60, reason: 'x' }];
    expect(narrower.safeParse({ acts }).success).toBe(false);
    expect(wider.safeParse({ acts }).success).toBe(true);
  });
});
