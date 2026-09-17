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
  // === AMÉLIORATION AJOUTÉE : réfaction post-contrôle médical (2026-09-10, sur demande
  // explicite) — voir InvoiceItem.refactions / InvoiceItem.recoveries dans src/types/index.ts.
  refactedCount: number;
  refactedAmount: number;
  pendingRecoveryCount: number;
  pendingRecoveryAmount: number;
}

/** Montant réellement dû pour une facture : le montant payable après réfaction quand il existe,
 *  sinon le montant original — aucune régression pour les factures jamais refactées. */
function payable(inv: InvoiceItem): number {
  return inv.payableAmountUSD ?? inv.amount ?? 0;
}

/** Rapproche les factures APPROUVÉES (la seule population pertinente pour un décaissement) avec
 *  leur statut de paiement réel. `paymentStatus` absent est traité comme "unpaid" — aucune
 *  facture existante n'a ce champ avant ce correctif, donc tout ressort initialement comme
 *  "impayé" jusqu'à ce qu'un Admin la marque explicitement.
 *
 *  Approved/Paid/Outstanding se basent sur le montant PAYABLE (après réfaction quand elle
 *  existe) plutôt que sur le montant original facturé : la part refactée n'est plus un montant
 *  approuvé pour paiement, elle apparaît séparément dans Refacted/Pending Recovery. */
export function computeReconciliationSummary(invoices: InvoiceItem[]): ReconciliationSummary {
  const approved = invoices.filter(isApproved);
  const paid = approved.filter((i) => i.paymentStatus === 'paid');
  const outstanding = approved.filter((i) => i.paymentStatus !== 'paid');
  const refacted = approved.filter((i) => i.refactionApplied && (i.refactionTotalUSD || 0) > 0);
  const pendingRecovery = refacted.filter((i) => (i.refactionTotalUSD || 0) - (i.recoveredTotalUSD || 0) > 0);

  return {
    approvedCount: approved.length,
    approvedAmount: approved.reduce((sum, i) => sum + payable(i), 0),
    paidCount: paid.length,
    paidAmount: paid.reduce((sum, i) => sum + payable(i), 0),
    outstandingCount: outstanding.length,
    outstandingAmount: outstanding.reduce((sum, i) => sum + payable(i), 0),
    refactedCount: refacted.length,
    refactedAmount: refacted.reduce((sum, i) => sum + (i.refactionTotalUSD || 0), 0),
    pendingRecoveryCount: pendingRecovery.length,
    pendingRecoveryAmount: pendingRecovery.reduce((sum, i) => sum + ((i.refactionTotalUSD || 0) - (i.recoveredTotalUSD || 0)), 0),
  };
}
