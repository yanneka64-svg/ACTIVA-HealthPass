// === AMÉLIORATION AJOUTÉE : tests unitaires (Revue complète 2026-09-06, finding D1) pour
// evaluatePolicyServer() — copie serveur intentionnelle du moteur client policyEngine.ts (voir
// tests/policyEngine.test.ts), avec un risque de divergence explicitement documenté dans le
// commentaire du code (outstandingAmount manquant historiquement). Les mêmes scénarios métier
// sont portés ici pour garantir que cette copie reste correcte et alignée sur les mêmes règles
// (expiration, suspension manuelle, impayé au-delà du délai de grâce).
import { describe, expect, it } from 'vitest';
import { evaluatePolicyServer, HealthPolicy } from './policyService';

function basePolicy(overrides: Partial<HealthPolicy> = {}): HealthPolicy {
  return {
    organizationId: 'OrgA',
    organizationName: 'Org A',
    policyNumber: 'POL-1',
    effectiveDate: '2020-01-01',
    expirationDate: '2030-01-01',
    status: 'Active',
    coverageBlocked: false,
    totalAnnualPremiumUSD: 1000,
    totalAnnualPremiumLRD: 0,
    paymentFrequency: 'Annual',
    gracePeriodDays: 15,
    expiringSoonWarningDays: 30,
    ...overrides,
  };
}

describe('evaluatePolicyServer — police expirée', () => {
  it('une police dont la date d\'expiration est passée est Expired et bloquante', () => {
    const policy = basePolicy({ expirationDate: '2020-01-01' });
    const result = evaluatePolicyServer(policy, new Date('2026-01-01'));
    expect(result.status).toBe('Expired');
    expect(result.coverageBlocked).toBe(true);
  });
});

describe('evaluatePolicyServer — suspension manuelle', () => {
  it('une police manuellement suspendue est Suspended et bloquante', () => {
    const policy = basePolicy({ manuallySuspended: true, suspensionReason: 'Administrative' });
    const result = evaluatePolicyServer(policy);
    expect(result.status).toBe('Suspended');
    expect(result.coverageBlocked).toBe(true);
    expect(result.reason).toContain('Administrative');
  });
});

describe('evaluatePolicyServer — impayé au-delà du délai de grâce', () => {
  it('un solde dû ET un retard dépassant le délai de grâce bloque la couverture', () => {
    const policy = basePolicy({
      nextPaymentDueDate: '2026-01-01',
      gracePeriodDays: 15,
      outstandingAmount: 500,
    });
    const result = evaluatePolicyServer(policy, new Date('2026-02-01'));
    expect(result.status).toBe('Suspended (Non-payment)');
    expect(result.coverageBlocked).toBe(true);
  });

  it('un retard dépassant le délai de grâce mais SANS solde dû (déjà réglé) ne bloque PAS la couverture', () => {
    // Correctif documenté dans policyService.ts : une police en retard de date mais déjà
    // soldée (outstandingAmount absent ou 0) ne doit pas être bloquée à tort.
    const policy = basePolicy({
      nextPaymentDueDate: '2026-01-01',
      gracePeriodDays: 15,
      outstandingAmount: 0,
    });
    const result = evaluatePolicyServer(policy, new Date('2026-02-01'));
    expect(result.coverageBlocked).toBe(false);
  });

  it('un retard dans le délai de grâce reste Active (mais garde la trace du retard)', () => {
    const policy = basePolicy({
      nextPaymentDueDate: '2026-01-01',
      gracePeriodDays: 15,
      outstandingAmount: 500,
    });
    const result = evaluatePolicyServer(policy, new Date('2026-01-05'));
    expect(result.status).toBe('Active');
    expect(result.coverageBlocked).toBe(false);
    expect(result.isInGracePeriod).toBe(true);
    expect(result.daysPastDue).toBe(4);
  });

  it('une police en délai de grâce ET manuellement suspendue reste bloquée (la suspension manuelle prime)', () => {
    // Correctif documenté dans policyService.ts : ce cas ne doit plus court-circuiter la
    // vérification de suspension manuelle en retournant "Active" prématurément.
    const policy = basePolicy({
      nextPaymentDueDate: '2026-01-01',
      gracePeriodDays: 15,
      outstandingAmount: 500,
      manuallySuspended: true,
    });
    const result = evaluatePolicyServer(policy, new Date('2026-01-05'));
    expect(result.status).toBe('Suspended');
    expect(result.coverageBlocked).toBe(true);
  });
});

describe('evaluatePolicyServer — bientôt expirée', () => {
  it('une police à moins de expiringSoonWarningDays de son expiration est "Expiring Soon", non bloquante', () => {
    const policy = basePolicy({ expirationDate: '2026-01-20', expiringSoonWarningDays: 30 });
    const result = evaluatePolicyServer(policy, new Date('2026-01-01'));
    expect(result.status).toBe('Expiring Soon');
    expect(result.coverageBlocked).toBe(false);
  });
});

describe('evaluatePolicyServer — police active', () => {
  it('une police valide, à jour de paiement, loin de son expiration, est Active et non bloquante', () => {
    const policy = basePolicy();
    const result = evaluatePolicyServer(policy, new Date('2026-01-01'));
    expect(result.status).toBe('Active');
    expect(result.coverageBlocked).toBe(false);
  });

  it('une police sans nextPaymentDueDate ni expirationDate proche reste Active (aucune exception sur des champs optionnels absents)', () => {
    const policy = basePolicy({ nextPaymentDueDate: undefined });
    const result = evaluatePolicyServer(policy, new Date('2026-01-01'));
    expect(result.status).toBe('Active');
    expect(result.coverageBlocked).toBe(false);
  });
});
