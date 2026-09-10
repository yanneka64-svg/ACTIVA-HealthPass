// === AMÉLIORATION AJOUTÉE : réfaction post-contrôle médical, avant paiement (2026-09-10, sur
// demande explicite de l'utilisateur). Ouverte depuis un bouton dédié sur la ligne d'une facture
// approuvée non payée (InvoicesView.tsx), derrière le flag `hp2_reimbursement_tracking`, pour
// Admin et Superviseur (même règle que "Mark as Paid" — voir InvoicesView.tsx::canMarkPaid).
// Acte médical par acte médical : montant retenu modifiable (jamais au-delà du montant original),
// rejeté calculé automatiquement, motif obligatoire dès qu'un acte est réduit. Le montant original
// de la facture (`amount`) n'est jamais modifié — seul un nouveau `payableAmountUSD` dérivé est
// écrit, utilisé ensuite pour le paiement et la réconciliation.
import React, { useState } from 'react';
import { X, ScanSearch } from 'lucide-react';
import { InvoiceItem, InvoiceActRefaction } from '../../types';
import { FirestoreService } from '../../services/firestore';
import { useCurrency } from '../../services/currency';

interface ApplyRefactionModalProps {
  invoice: InvoiceItem;
  currentUserName: string;
  currentUserRole: 'Admin' | 'Supervisor';
  onClose: () => void;
}

export const ApplyRefactionModal: React.FC<ApplyRefactionModalProps> = ({
  invoice,
  currentUserName,
  currentUserRole,
  onClose,
}) => {
  const { formatAmount } = useCurrency();
  // Repli sur une ligne unique quand la facture n'a pas de détail par acte (factures
  // antérieures à ce correctif) — même logique de repli que le bordereau de règlement.
  const acts = invoice.medicalActs && invoice.medicalActs.length > 0
    ? invoice.medicalActs
    : [{ name: invoice.careType, amount: invoice.amount, category: undefined as string | undefined }];

  const [retained, setRetained] = useState<number[]>(acts.map((a) => a.amount));
  const [reasons, setReasons] = useState<string[]>(acts.map(() => ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalOriginal = acts.reduce((s, a) => s + a.amount, 0);
  const totalRetained = retained.reduce((s, v) => s + v, 0);
  const totalRefacted = Math.max(0, totalOriginal - totalRetained);

  const handleRetainedChange = (i: number, raw: string) => {
    const max = acts[i].amount;
    const v = Math.max(0, Math.min(max, Number(raw) || 0));
    setRetained((r) => r.map((x, idx) => (idx === i ? v : x)));
  };

  // === AMÉLIORATION AJOUTÉE : le montant réfacté (rejeté) est désormais lui aussi saisissable
  // directement (2026-09-10, retour utilisateur — la case "Rejected" semblait inactive car elle
  // n'était qu'un affichage calculé). Les deux champs restent synchronisés : modifier l'un
  // recalcule l'autre, sans jamais dépasser le montant original de l'acte.
  const handleRefactedChange = (i: number, raw: string) => {
    const max = acts[i].amount;
    const rejected = Math.max(0, Math.min(max, Number(raw) || 0));
    setRetained((r) => r.map((x, idx) => (idx === i ? max - rejected : x)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const refactions: InvoiceActRefaction[] = [];
    for (let i = 0; i < acts.length; i++) {
      const rejected = Math.max(0, acts[i].amount - retained[i]);
      if (rejected > 0) {
        if (!reasons[i].trim()) {
          setError(`A reason is required for "${acts[i].name}" — its retained amount is below the original.`);
          return;
        }
        refactions.push({
          actIndex: i,
          actName: acts[i].name,
          originalAmountUSD: acts[i].amount,
          retainedAmountUSD: retained[i],
          rejectedAmountUSD: rejected,
          reason: reasons[i].trim(),
        });
      }
    }

    if (refactions.length === 0) {
      setError('No act was reduced — lower at least one retained amount to apply a réfaction.');
      return;
    }

    setSaving(true);
    try {
      await FirestoreService.updateInvoice({
        ...invoice,
        refactionApplied: true,
        refactions,
        refactionTotalUSD: totalRefacted,
        refactionAppliedAt: new Date().toISOString(),
        refactionAppliedBy: currentUserName,
        refactionAppliedByRole: currentUserRole,
        payableAmountUSD: totalRetained,
      });
      onClose();
    } catch {
      setError('Could not save this réfaction. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-white border-b border-slate-200 px-6 py-4.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
              <ScanSearch className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight text-slate-900">Apply Réfaction</h3>
              <p className="text-xs text-slate-500 mt-0.5">{invoice.reference} — {invoice.provider}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Review each medical act following the post-service medical control. Reduce the retained amount and give a reason for any act that is partially or fully rejected. Only the retained total will be paid — the refacted portion is tracked separately and can be recovered later if the provider provides justification.
            </p>

            {error && (
              <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                {error}
              </div>
            )}

            <div className="space-y-3">
              {acts.map((act, i) => {
                const rejected = Math.max(0, act.amount - retained[i]);
                return (
                  <div key={`${act.name}-${i}`} className={`p-3.5 rounded-xl border space-y-2.5 ${rejected > 0 ? 'border-orange-200 bg-orange-50/30' : 'border-slate-200'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate">{act.name}</div>
                        {act.category && <div className="text-[10px] text-slate-400">{act.category}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Original</div>
                        <div className="font-bold text-xs text-slate-700">{formatAmount(act.amount)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Retained Amount</label>
                        <input
                          type="number"
                          value={retained[i]}
                          max={act.amount}
                          min={0}
                          step="0.01"
                          onChange={(e) => handleRetainedChange(i, e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Rejected (Réfaction)</label>
                        <input
                          type="number"
                          value={rejected}
                          max={act.amount}
                          min={0}
                          step="0.01"
                          onChange={(e) => handleRefactedChange(i, e.target.value)}
                          className={`w-full px-3 py-2 rounded-lg text-xs font-bold border ${rejected > 0 ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-white border-slate-200 text-slate-800'}`}
                        />
                      </div>
                    </div>

                    <input
                      type="text"
                      value={reasons[i]}
                      onChange={(e) => setReasons((r) => r.map((x, idx) => (idx === i ? e.target.value : x)))}
                      placeholder={rejected > 0 ? 'Reason for rejection (required)' : 'Reason for rejection (only required if an amount is rejected)'}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400"
                    />
                  </div>
                );
              })}
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Total Refacted</div>
                <div className="font-black text-sm text-orange-700">{formatAmount(totalRefacted)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Payable Amount</div>
                <div className="font-black text-lg text-slate-900">{formatAmount(totalRetained)}</div>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-md shadow-orange-900/10 cursor-pointer disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Confirm Réfaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
