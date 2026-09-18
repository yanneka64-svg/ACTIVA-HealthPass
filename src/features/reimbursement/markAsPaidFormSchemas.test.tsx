// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Verrouille le
// comportement du schéma AVANT tout changement futur : cette règle reproduit la vérification
// impérative qui existait déjà dans MarkAsPaidModal.tsx (voir markAsPaidFormSchemas.ts), et une
// régression ici romprait silencieusement le blocage de soumission de la modale "Mark as Paid".
import { describe, it, expect } from 'vitest';
import { markAsPaidFormSchema } from './markAsPaidFormSchemas';

describe('markAsPaidFormSchema', () => {
  const valid = {
    payee: 'provider' as const,
    paymentReference: 'TXN-2026-0001',
    paidAt: '2026-09-18',
  };

  it('accepte un formulaire complet', () => {
    expect(markAsPaidFormSchema.safeParse(valid).success).toBe(true);
  });

  it('rejette une référence de paiement vide ou uniquement composée d\'espaces (comme l\'ancien `.trim()`)', () => {
    expect(markAsPaidFormSchema.safeParse({ ...valid, paymentReference: '' }).success).toBe(false);
    expect(markAsPaidFormSchema.safeParse({ ...valid, paymentReference: '   ' }).success).toBe(false);
  });

  it('accepte une référence valide sans la transformer (valeur brute conservée pour FirestoreService.updateInvoice)', () => {
    const result = markAsPaidFormSchema.safeParse({ ...valid, paymentReference: '  TXN-2026-0001  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.paymentReference).toBe('  TXN-2026-0001  ');
    }
  });

  it('accepte payee dans ses deux valeurs (provider/member)', () => {
    expect(markAsPaidFormSchema.safeParse({ ...valid, payee: 'provider' }).success).toBe(true);
    expect(markAsPaidFormSchema.safeParse({ ...valid, payee: 'member' }).success).toBe(true);
  });

  it('rejette une valeur payee invalide (garantie de typage)', () => {
    expect(markAsPaidFormSchema.safeParse({ ...valid, payee: 'other' }).success).toBe(false);
  });
});
