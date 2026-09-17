import { describe, it, expect } from 'vitest';
import { computeReconciliationSummary } from '../src/features/reimbursement/reconciliation';
import { InvoiceItem } from '../src/types';

// === AMÉLIORATION AJOUTÉE : sécurité/robustesse (Phase 2 du plan de durcissement, 2026-09-17) ===
// Test de caractérisation : documente le comportement ACTUEL de computeReconciliationSummary
// (calcul de rapprochement des remboursements — zone à risque financier, jusqu'ici sans aucune
// couverture de test bien qu'utilisée en production dans InvoicesView.tsx et ReportsView.tsx).
// Aucune correction de comportement ici, uniquement une base de non-régression avant tout futur
// refactor (Phase 3).

function invoice(overrides: Partial<InvoiceItem> = {}): InvoiceItem {
  return {
    id: 'inv-1',
    reference: 'REF-1',
    patientName: 'Jean Dupont',
    familyHead: 'Jean Dupont',
    cardNo: 'AMID-260101-00001',
    organization: 'ORG_A',
    provider: 'Clinique X',
    amount: 100,
    serviceDate: '2026-01-01',
    status: 'valid',
    careType: 'Consultation',
    coveragePercentage: 80,
    ...overrides,
  };
}

describe('computeReconciliationSummary', () => {
  it('ignores non-approved invoices (pending/rejected) entirely', () => {
    const result = computeReconciliationSummary([
      invoice({ status: 'pending', amount: 500 }),
      invoice({ status: 'rejected', amount: 500 }),
    ]);
    expect(result.approvedCount).toBe(0);
    expect(result.approvedAmount).toBe(0);
    expect(result.paidCount).toBe(0);
    expect(result.outstandingCount).toBe(0);
  });

  it('treats the legacy string "approved" as an approved status, same as "valid"', () => {
    const result = computeReconciliationSummary([
      invoice({ status: 'valid', amount: 100 }),
      invoice({ status: 'approved' as InvoiceItem['status'], amount: 200 }),
    ]);
    expect(result.approvedCount).toBe(2);
    expect(result.approvedAmount).toBe(300);
  });

  it('treats a missing paymentStatus as unpaid (outstanding), never as paid', () => {
    const result = computeReconciliationSummary([invoice({ amount: 100, paymentStatus: undefined })]);
    expect(result.paidCount).toBe(0);
    expect(result.outstandingCount).toBe(1);
    expect(result.outstandingAmount).toBe(100);
  });

  it('classifies paid vs outstanding approved invoices independently', () => {
    const result = computeReconciliationSummary([
      invoice({ id: 'a', amount: 100, paymentStatus: 'paid' }),
      invoice({ id: 'b', amount: 250, paymentStatus: 'unpaid' }),
    ]);
    expect(result.paidCount).toBe(1);
    expect(result.paidAmount).toBe(100);
    expect(result.outstandingCount).toBe(1);
    expect(result.outstandingAmount).toBe(250);
  });

  it('uses payableAmountUSD (post-réfaction) instead of amount when present, for approved/paid/outstanding', () => {
    const result = computeReconciliationSummary([
      invoice({ amount: 500, payableAmountUSD: 350, refactionApplied: true, refactionTotalUSD: 150 }),
    ]);
    expect(result.approvedAmount).toBe(350);
    expect(result.outstandingAmount).toBe(350);
  });

  it('falls back to amount when payableAmountUSD is absent (no réfaction ever applied)', () => {
    const result = computeReconciliationSummary([invoice({ amount: 500 })]);
    expect(result.approvedAmount).toBe(500);
  });

  it('reports refacted count/amount only for invoices with a positive refactionTotalUSD', () => {
    const result = computeReconciliationSummary([
      invoice({ id: 'a', amount: 500, payableAmountUSD: 350, refactionApplied: true, refactionTotalUSD: 150 }),
      invoice({ id: 'b', amount: 200, refactionApplied: false }),
    ]);
    expect(result.refactedCount).toBe(1);
    expect(result.refactedAmount).toBe(150);
  });

  it('computes pendingRecoveryAmount as refactionTotalUSD minus recoveredTotalUSD, only when positive', () => {
    const fullyRecovered = computeReconciliationSummary([
      invoice({ refactionApplied: true, refactionTotalUSD: 100, recoveredTotalUSD: 100 }),
    ]);
    expect(fullyRecovered.pendingRecoveryCount).toBe(0);
    expect(fullyRecovered.pendingRecoveryAmount).toBe(0);

    const partiallyRecovered = computeReconciliationSummary([
      invoice({ refactionApplied: true, refactionTotalUSD: 100, recoveredTotalUSD: 40 }),
    ]);
    expect(partiallyRecovered.pendingRecoveryCount).toBe(1);
    expect(partiallyRecovered.pendingRecoveryAmount).toBe(60);
  });

  it('returns an all-zero summary for an empty invoice list', () => {
    const result = computeReconciliationSummary([]);
    expect(result).toEqual({
      approvedCount: 0,
      approvedAmount: 0,
      paidCount: 0,
      paidAmount: 0,
      outstandingCount: 0,
      outstandingAmount: 0,
      refactedCount: 0,
      refactedAmount: 0,
      pendingRecoveryCount: 0,
      pendingRecoveryAmount: 0,
    });
  });

  it('sums approvedAmount/outstandingAmount/paidAmount across multiple invoices consistently', () => {
    const result = computeReconciliationSummary([
      invoice({ id: 'a', amount: 100, paymentStatus: 'paid' }),
      invoice({ id: 'b', amount: 200, paymentStatus: 'paid' }),
      invoice({ id: 'c', amount: 300, paymentStatus: 'unpaid' }),
      invoice({ id: 'd', status: 'rejected', amount: 9999 }),
    ]);
    expect(result.approvedCount).toBe(3);
    expect(result.approvedAmount).toBe(600);
    expect(result.paidAmount).toBe(300);
    expect(result.outstandingAmount).toBe(300);
  });
});
