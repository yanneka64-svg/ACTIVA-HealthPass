// === AMÉLIORATION AJOUTÉE : HealthPass 2.0, Phase 4 — Reimbursement & Reconciliation (module
// src/modules/reimbursement/), derrière le flag `hp2_reimbursement_tracking` (désactivé par
// défaut, voir src/config/featureFlags.ts). Périmètre confirmé avec l'utilisateur (2026-09-10) :
// rapprochement "sinistres payés vs approuvés", saisie du statut de paiement manuelle par un
// Admin — aucun import bancaire, aucune automatisation dans ce premier incrément.
import { InvoiceItem } from '../../types';

function isApproved(inv: InvoiceItem): boolean {
  return inv.status === 'valid' || (inv.status as string) === 'approved';
}

export interface ReconciliationSummary {
  approvedCount: number;
  approvedAmount: number;
  paidCount: number;
  paidAmount: number;
  outstandingCount: number;
  outstandingAmount: number;
}

/** Rapproche les factures APPROUVÉES (la seule population pertinente pour un décaissement) avec
 *  leur statut de paiement réel. `paymentStatus` absent est traité comme "unpaid" — aucune
 *  facture existante n'a ce champ avant ce correctif, donc tout ressort initialement comme
 *  "impayé" jusqu'à ce qu'un Admin la marque explicitement. */
export function computeReconciliationSummary(invoices: InvoiceItem[]): ReconciliationSummary {
  const approved = invoices.filter(isApproved);
  const paid = approved.filter((i) => i.paymentStatus === 'paid');
  const outstanding = approved.filter((i) => i.paymentStatus !== 'paid');

  return {
    approvedCount: approved.length,
    approvedAmount: approved.reduce((sum, i) => sum + (i.amount || 0), 0),
    paidCount: paid.length,
    paidAmount: paid.reduce((sum, i) => sum + (i.amount || 0), 0),
    outstandingCount: outstanding.length,
    outstandingAmount: outstanding.reduce((sum, i) => sum + (i.amount || 0), 0),
  };
}
