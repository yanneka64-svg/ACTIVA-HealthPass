// === AMÉLIORATION AJOUTÉE : réfaction post-contrôle médical, avant paiement (2026-09-10, sur
// demande explicite de l'utilisateur). Ouverte depuis un bouton dédié sur la ligne d'une facture
// approuvée non payée (InvoicesView.tsx), derrière le flag `hp2_reimbursement_tracking`, pour
// Admin et Superviseur (même règle que "Mark as Paid" — voir InvoicesView.tsx::canMarkPaid).
// Acte médical par acte médical : montant retenu modifiable (jamais au-delà du montant original),
// rejeté calculé automatiquement, motif obligatoire dès qu'un acte est réduit. Le montant original
// de la facture (`amount`) n'est jamais modifié — seul un nouveau `payableAmountUSD` dérivé est
// écrit, utilisé ensuite pour le paiement et la réconciliation.
import React, { useState } from 'react';
import { X, ScanSearch, Plus, Trash2 } from 'lucide-react';
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
  // === AMÉLIORATION AJOUTÉE : quand la facture n'a pas de détail par acte (facture créée via
  // un formulaire à montant unique, ex. "New Claim" côté Admin/Superviseur — voir
  // ClaimsView.tsx), elle retombait sur UNE SEULE ligne en lecture seule ("Pharmacy &
  // Prescription Drugs", montant total figé), rendant la réfaction impossible à détailler acte
  // par acte (retour utilisateur, 2026-09-10 : "ce n'est pas aussi détaillé"). La réfaction
  // portant sur le CONTRÔLE MÉDICAL post-service — indépendant de la façon dont la réclamation a
  // été saisie en amont — cette ligne de repli devient désormais scindable directement ici :
  // nom et montant éditables, ajout/suppression de lignes, tant que leur somme reste égale au
  // montant original de la facture (jamais modifié). Une facture qui a déjà un détail par acte
  // réel (`invoice.medicalActs`, hérité du formulaire Agent détaillé) reste en lecture seule
  // sur nom/montant, comme avant — seuls Retained/Rejected/Reason y sont éditables.
  const hasOriginalBreakdown = !!(invoice.medicalActs && invoice.medicalActs.length > 0);
  const initialActs = hasOriginalBreakdown
    ? invoice.medicalActs!.map((a) => ({ name: a.name, amount: a.amount, category: a.category }))
    : [{ name: invoice.careType, amount: invoice.amount, category: undefined as string | undefined }];

  const [acts, setActs] = useState(initialActs);
  const [retained, setRetained] = useState<number[]>(initialActs.map((a) => a.amount));
  const [reasons, setReasons] = useState<string[]>(initialActs.map(() => ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalOriginal = acts.reduce((s, a) => s + a.amount, 0);
  const totalRetained = retained.reduce((s, v) => s + v, 0);
  const totalRefacted = Math.max(0, totalOriginal - totalRetained);
  const linesMismatch = Math.abs(totalOriginal - invoice.amount) > 0.01;

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

  const handleActNameChange = (i: number, name: string) => {
    setActs((prev) => prev.map((a, idx) => (idx === i ? { ...a, name } : a)));
  };

  const handleActAmountChange = (i: number, raw: string) => {
    const v = Math.max(0, Number(raw) || 0);
    setActs((prev) => prev.map((a, idx) => (idx === i ? { ...a, amount: v } : a)));
    // Le montant retenu de cette ligne ne peut jamais dépasser son nouveau montant original.
    setRetained((prev) => prev.map((r, idx) => (idx === i ? Math.min(r, v) : r)));
  };

  const addActLine = () => {
    setActs((prev) => [...prev, { name: '', amount: 0, category: undefined }]);
    setRetained((prev) => [...prev, 0]);
    setReasons((prev) => [...prev, '']);
  };

  const removeActLine = (i: number) => {
    if (acts.length <= 1) return;
    setActs((prev) => prev.filter((_, idx) => idx !== i));
    setRetained((prev) => prev.filter((_, idx) => idx !== i));
    setReasons((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (linesMismatch) {
      setError(`Line amounts must add up to the original invoice total (${formatAmount(invoice.amount)}). Currently: ${formatAmount(totalOriginal)}.`);
      return;
    }

    const refactions: InvoiceActRefaction[] = [];
    for (let i = 0; i < acts.length; i++) {
      const rejected = Math.max(0, acts[i].amount - retained[i]);
      if (rejected > 0) {
        if (!reasons[i].trim()) {
          setError(`A reason is required for "${acts[i].name || `Line ${i + 1}`}" — its retained amount is below the original.`);
          return;
        }
        refactions.push({
          actIndex: i,
          actName: acts[i].name || `Line ${i + 1}`,
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
          {/* === AMÉLIORATION AJOUTÉE : paragraphe d'instructions retiré au-dessus des champs
              (2026-09-10, demande explicite de l'utilisateur) — le comportement (retenu jamais
              au-delà de l'original, motif obligatoire dès qu'un acte est réduit, etc.) est
              inchangé, seul ce texte d'introduction disparaît de l'affichage. === */}
          <div className="p-6 space-y-4 overflow-y-auto">
            {error && (
              <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                {error}
              </div>
            )}

            <div className="space-y-3">
              {acts.map((act, i) => {
                const rejected = Math.max(0, act.amount - retained[i]);
                return (
                  // === AMÉLIORATION AJOUTÉE : réalignement horizontal ET vertical des champs
                  // (2026-09-10, demande explicite) — chaque colonne (Medical Act / Original /
                  // bouton Supprimer) porte désormais un libellé de même hauteur au-dessus
                  // (invisible pour le bouton Supprimer, qui n'en a pas besoin) afin que leurs
                  // champs démarrent tous à la même ligne, au lieu du décalage précédent
                  // (`mt-4` approximatif sur le bouton, absence de libellé au-dessus du nom).
                  // Aucune donnée ni logique n'a changé, uniquement la mise en page.
                  <div key={i} className={`p-3.5 rounded-xl border space-y-2.5 ${rejected > 0 ? 'border-orange-200 bg-orange-50/30' : 'border-slate-200'}`}>
                    <div className="flex items-start gap-2.5">
                      <div className="min-w-0 flex-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Medical Act</label>
                        {hasOriginalBreakdown ? (
                          <>
                            <div className="font-bold text-xs text-slate-900 truncate py-1.5">{act.name}</div>
                            {act.category && <div className="text-[10px] text-slate-400">{act.category}</div>}
                          </>
                        ) : (
                          <input
                            type="text"
                            value={act.name}
                            onChange={(e) => handleActNameChange(i, e.target.value)}
                            placeholder={`Medical act / item name (e.g. Amoxicillin 500mg)`}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                          />
                        )}
                      </div>
                      <div className="shrink-0 w-24">
                        <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wide mb-1 text-right">Original</div>
                        {hasOriginalBreakdown ? (
                          <div className="font-bold text-xs text-slate-700 text-right py-1.5">{formatAmount(act.amount)}</div>
                        ) : (
                          <input
                            type="number"
                            value={act.amount}
                            min={0}
                            step="0.01"
                            onChange={(e) => handleActAmountChange(i, e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 text-right"
                          />
                        )}
                      </div>
                      {!hasOriginalBreakdown && acts.length > 1 && (
                        <div className="shrink-0">
                          <div className="mb-1 h-[14px]" aria-hidden="true" />
                          <button
                            type="button"
                            onClick={() => removeActLine(i)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Remove this line"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
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

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Reason</label>
                      <input
                        type="text"
                        value={reasons[i]}
                        onChange={(e) => setReasons((r) => r.map((x, idx) => (idx === i ? e.target.value : x)))}
                        placeholder={rejected > 0 ? 'Reason for rejection (required)' : 'Reason for rejection (only required if an amount is rejected)'}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {!hasOriginalBreakdown && (
              <button
                type="button"
                onClick={addActLine}
                className="w-full py-2 rounded-xl border border-dashed border-slate-300 text-slate-500 hover:text-orange-700 hover:border-orange-300 hover:bg-orange-50/40 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Split into another line</span>
              </button>
            )}

            {!hasOriginalBreakdown && (
              <p className={`text-[10.5px] font-semibold ${linesMismatch ? 'text-rose-600' : 'text-slate-400'}`}>
                Lines total: {formatAmount(totalOriginal)} of {formatAmount(invoice.amount)} — must match the original invoice amount exactly.
              </p>
            )}

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
