// === AMÉLIORATION AJOUTÉE : tests unitaires purs (Phase 3) pour policyEngine.ts — aucune
// dépendance à l'émulateur, exécutable via `npm test` (vitest run tests/policyEngine.test.ts).
import { describe, expect, it } from 'vitest';
import { getPolicyCoverageStatus, hasHealthcareAccess, isPolicyBlocking } from '../src/services/policyEngine';
import type { HealthPolicy } from '../src/types';

function basePolicy(overrides: Partial<HealthPolicy> = {}): HealthPolicy {
  return {
    id: 'OrgA',
    organizationId: 'OrgA',
    policyNumber: 'POL-1',
    effectiveDate: '2020-01-01',
    expirationDate: '2030-01-01',
    status: 'Active',
    annualPremium: 1000,
    currency: 'USD',
    paymentFrequency: 'Annual',
    installmentAmount: 1000,
    coverageBlocked: false,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Police expirée → couverture refusée', () => {
  it('une police dont la date d\'expiration est passée est Expired et bloquante', () => {
    const policy = basePolicy({ expirationDate: '2020-01-01' });
    const result = getPolicyCoverageStatus(policy, new Date('2026-01-01'));
    expect(result.status).toBe('Expired');
    expect(result.coverageBlocked).toBe(true);
  });

  it('hasHealthcareAccess refuse l\'accès pour une police expirée', () => {
    const policy = basePolicy({ expirationDate: '2020-01-01' });
    const result = hasHealthcareAccess({ status: 'Active' }, policy);
    expect(result.allowed).toBe(false);
  });
});

describe('Police suspendue → couverture refusée', () => {
  it('une police manuellement suspendue est Suspended et bloquante', () => {
    const policy = basePolicy({ manuallySuspended: true, suspensionReason: 'Administrative' });
    const result = getPolicyCoverageStatus(policy);
    expect(result.status).toBe('Suspended');
    expect(result.coverageBlocked).toBe(true);
  });

  it('une police en impayé au-delà du délai de grâce est Suspended (Non-payment) et bloquante', () => {
    const policy = basePolicy({
      nextPaymentDueDate: '2026-01-01',
      gracePeriodDays: 15,
      outstandingAmount: 500,
    });
    const result = getPolicyCoverageStatus(policy, new Date('2026-02-01'));
    expect(result.status).toBe('Suspended');
    expect(result.coverageBlocked).toBe(true);
    expect(result.suspensionReason).toBe('Non-payment');
  });

  it('hasHealthcareAccess refuse l\'accès pour une police suspendue', () => {
    const policy = basePolicy({ manuallySuspended: true });
    const result = hasHealthcareAccess({ status: 'Active' }, policy);
    expect(result.allowed).toBe(false);
  });

  it('isPolicyBlocking retourne true pour une police suspendue', () => {
    expect(isPolicyBlocking(basePolicy({ manuallySuspended: true }))).toBe(true);
  });
});

describe('Police active → couverture autorisée', () => {
  it('une police valide, à jour de paiement, est Active et non bloquante', () => {
    const policy = basePolicy();
    const result = getPolicyCoverageStatus(policy, new Date('2026-01-01'));
    expect(result.status).toBe('Active');
    expect(result.coverageBlocked).toBe(false);
  });

  it('hasHealthcareAccess autorise l\'accès pour une police active et un membre actif', () => {
    const policy = basePolicy();
    const result = hasHealthcareAccess({ status: 'Active' }, policy);
    expect(result.allowed).toBe(true);
  });

  it('isPolicyBlocking retourne false pour une police active', () => {
    expect(isPolicyBlocking(basePolicy())).toBe(false);
  });

  it('absence de police configurée : accès autorisé par défaut (opt-in)', () => {
    expect(isPolicyBlocking(null)).toBe(false);
    expect(hasHealthcareAccess({ status: 'Active' }, null).allowed).toBe(true);
  });
});

describe('Statut de membre (indépendant du statut de la police)', () => {
  it('un membre non-Actif est refusé même si la police est Active', () => {
    const policy = basePolicy();
    const result = hasHealthcareAccess({ status: 'Suspended' }, policy);
    expect(result.allowed).toBe(false);
  });
});
