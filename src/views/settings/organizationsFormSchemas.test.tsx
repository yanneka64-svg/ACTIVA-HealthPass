// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Verrouille le
// comportement du schéma AVANT tout changement futur : cette règle reproduit la vérification
// impérative qui existait déjà dans OrganizationsView.tsx (voir organizationsFormSchemas.ts), et
// une régression ici romprait silencieusement le blocage de soumission du formulaire Créer/
// Modifier une organisation.
import { describe, it, expect } from 'vitest';
import { organizationFormSchema } from './organizationsFormSchemas';

describe('organizationFormSchema', () => {
  const valid = {
    name: 'Acme Corp',
    policyNumber: 'POL-2026-1234',
    effectiveDate: '2026-01-01',
    expirationDate: '2026-12-31',
    members: '120',
    rate: '80',
    status: 'Actif',
    contactPhone: '+231 770 11 22 33',
    contactEmail: 'contact@acme.com',
    policyType: 'Group Health Policy',
    annualPremium: '10000',
    policyCurrency: 'USD',
    paymentFrequency: 'Quarterly',
    installmentAmount: '2500',
    nextPaymentDueDate: '2026-04-01',
    lastPaymentDate: '2026-01-01',
    lastPaymentAmount: '2500',
    outstandingAmount: '0',
    gracePeriodDays: '15',
    expiringSoonWarningDays: '30',
    manuallySuspended: false,
    suspensionReason: 'Non-payment',
  };

  it('accepte un formulaire complet', () => {
    expect(organizationFormSchema.safeParse(valid).success).toBe(true);
  });

  it('rejette un nom vide ou uniquement composé d\'espaces (comme l\'ancien `.trim()`)', () => {
    expect(organizationFormSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
    expect(organizationFormSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
  });

  it('accepte un nom valide sans le transformer (valeur brute conservée pour onAddOrganization/onUpdateOrganization)', () => {
    const result = organizationFormSchema.safeParse({ ...valid, name: '  Acme Corp  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('  Acme Corp  ');
    }
  });

  it('n\'impose aucune contrainte sur les champs de la section police santé (jamais validés en JS auparavant)', () => {
    const result = organizationFormSchema.safeParse({
      ...valid,
      policyNumber: '',
      annualPremium: '',
      installmentAmount: '',
      nextPaymentDueDate: '',
      lastPaymentDate: '',
      lastPaymentAmount: '',
    });
    expect(result.success).toBe(true);
  });

  it('accepte manuallySuspended (booléen) dans les deux états', () => {
    expect(organizationFormSchema.safeParse({ ...valid, manuallySuspended: true }).success).toBe(true);
    expect(organizationFormSchema.safeParse({ ...valid, manuallySuspended: false }).success).toBe(true);
  });
});
