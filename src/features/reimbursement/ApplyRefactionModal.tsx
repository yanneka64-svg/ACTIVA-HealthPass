// === AMÉLIORATION AJOUTÉE : réfaction post-contrôle médical, avant paiement (2026-09-10, sur
// demande explicite de l'utilisateur). Ouverte depuis un bouton dédié sur la ligne d'une facture
// approuvée non payée (InvoicesView.tsx), derrière le flag `hp2_reimbursement_tracking`, pour
// Admin et Superviseur (même règle que "Mark as Paid" — voir InvoicesView.tsx::canMarkPaid).
// Acte médical par acte médical : montant retenu modifiable (jamais au-delà du montant original),
// rejeté calculé automatiquement, motif obligatoire dès qu'un acte est réduit. Le montant original
// de la facture (`amount`) n'est jamais modifié — seul un nouveau `payableAmountUSD` dérivé est
// écrit, utilisé ensuite pour le paiement et la réconciliation.
import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, ScanSearch, Plus, Trash2 } from 'lucide-react';
import { InvoiceItem, InvoiceActRefaction } from '../../types';
import { FirestoreService } from '../../services/firestore';
import { useCurrency } from '../../services/currency';
// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Voir
// applyRefactionFormSchemas.ts : useFieldArray remplace les 3 tableaux parallèles
// (acts/retained/reasons) par un unique tableau d'objets dans le formulaire ; le schéma
// n'encode que le booléen de validité, les messages précis restent construits ici (onInvalid).
import { createApplyRefactionFormSchema, ApplyRefactionFormValues } from './applyRefactionFormSchemas';

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

  const form = useForm<ApplyRefactionFormValues>({
    resolver: zodResolver(createApplyRefactionFormSchema(invoice.amount)),
    defaultValues: {
      acts: initialActs.map((a) => ({ name: a.name, amount: a.amount, category: a.category, retained: a.amount, reason: '' })),
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'acts' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const watchedActs = form.watch('acts');
  const totalOriginal = watchedActs.reduce((s, a) => s + a.amount, 0);
  const totalRetained = watchedActs.reduce((s, a) => s + a.retained, 0);
  const totalRefacted = Math.max(0, totalOriginal - totalRetained);
  const linesMismatch = Math.abs(totalOriginal - invoice.amount) > 0.01;

  const handleRetainedChange = (i: number, raw: string) => {
    const max = watchedActs[i].amount;
    const v = Math.max(0, Math.min(max, Number(raw) || 0));
    form.setValue(`acts.${i}.retained`, v);
  };

  // === AMÉLIORATION AJOUTÉE : le montant réfacté (rejeté) est désormais lui aussi saisissable
  // directement (2026-09-10, retour utilisateur — la case "Rejected" semblait inactive car elle
  // n'était qu'un affichage calculé). Les deux champs restent synchronisés : modifier l'un
  // recalcule l'autre, sans jamais dépasser le montant original de l'acte.
  const handleRefactedChange = (i: number, raw: string) => {
    const max = watchedActs[i].amount;
    const rejected = Math.max(0, Math.min(max, Number(raw) || 0));
    form.setValue(`acts.${i}.retained`, max - rejected);
  };

  const handleActAmountChange = (i: number, raw: string) => {
    const v = Math.max(0, Number(raw) || 0);
    form.setValue(`acts.${i}.amount`, v);
    // Le montant retenu de cette ligne ne peut jamais dépasser son nouveau montant original.
    const currentRetained = form.getValues(`acts.${i}.retained`);
    if (currentRetained > v) form.setValue(`acts.${i}.retained`, v);
  };

  const addActLine = () => {
    append({ name: '', amount: 0, category: undefined, retained: 0, reason: '' });
  };

  const removeActLine = (i: number) => {
    if (fields.length <= 1) return;
    remove(i);
  };

  const handleSubmit = form.handleSubmit(
    async (values) => {
      setError(null);

      const totalOriginalV = values.acts.reduce((s, a) => s + a.amount, 0);
      const totalRetainedV = values.acts.reduce((s, a) => s + a.retained, 0);
      const totalRefactedV = Math.max(0, totalOriginalV - totalRetainedV);

      const refactions: InvoiceActRefaction[] = [];
      values.acts.forEach((a, i) => {
        const rejected = Math.max(0, a.amount - a.retained);
        if (rejected > 0) {
          refactions.push({
            actIndex: i,
            actName: a.name || `Line ${i + 1}`,
            originalAmountUSD: a.amount,
            retainedAmountUSD: a.retained,
            rejectedAmountUSD: rejected,
            reason: a.reason.trim(),
          });
        }
      });

      setSaving(true);
      try {
        await FirestoreService.updateInvoice({
          ...invoice,
          refactionApplied: true,
          refactions,
          refactionTotalUSD: totalRefactedV,
          refactionAppliedAt: new Date().toISOString(),
          refactionAppliedBy: currentUserName,
          refactionAppliedByRole: currentUserRole,
          payableAmountUSD: totalRetainedV,
        });
        onClose();
      } catch {
        setError('Could not save this réfaction. Please try again.');
        setSaving(false);
      }
    },
    () => {
      // Reproduit exactement l'ordre de priorité des vérifications d'origine : la validation
      // zod ne fait que bloquer la soumission (booléen) ; le message précis (avec montants
      // formatés) est reconstruit ici à partir des valeurs courantes du formulaire.
      const values = form.getValues();
      const totalOriginalV = values.acts.reduce((s, a) => s + a.amount, 0);

      if (Math.abs(totalOriginalV - invoice.amount) > 0.01) {
        setError(`Line amounts must add up to the original invoice total (${formatAmount(invoice.amount)}). Currently: ${formatAmount(totalOriginalV)}.`);
        return;
      }

      for (let i = 0; i < values.acts.length; i++) {
        const rejected = Math.max(0, values.acts[i].amount - values.acts[i].retained);
        if (rejected > 0 && !values.acts[i].reason.trim()) {
          setError(`A reason is required for "${values.acts[i].name || `Line ${i + 1}`}" — its retained amount is below the original.`);
          return;
        }
      }

      setError('No act was reduced — lower at least one retained amount to apply a réfaction.');
    }
  );

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
              {fields.map((field, i) => {
                const act = watchedActs[i];
                const rejected = Math.max(0, act.amount - act.retained);
                return (
                  // === AMÉLIORATION AJOUTÉE : réalignement horizontal ET vertical des champs
                  // (2026-09-10, demande explicite) — chaque colonne (Medical Act / Original /
                  // bouton Supprimer) porte désormais un libellé de même hauteur au-dessus
                  // (invisible pour le bouton Supprimer, qui n'en a pas besoin) afin que leurs
                  // champs démarrent tous à la même ligne, au lieu du décalage précédent
                  // (`mt-4` approximatif sur le bouton, absence de libellé au-dessus du nom).
                  // Aucune donnée ni logique n'a changé, uniquement la mise en page.
                  <div key={field.id} className={`p-3.5 rounded-xl border space-y-2.5 ${rejected > 0 ? 'border-orange-200 bg-orange-50/30' : 'border-slate-200'}`}>
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
                            {...form.register(`acts.${i}.name`)}
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
                      {!hasOriginalBreakdown && fields.length > 1 && (
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

                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="flex flex-col">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 h-3.5 leading-[14px]">Original</label>
                        {hasOriginalBreakdown ? (
                          <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 text-right">
                            {formatAmount(act.amount)}
                          </div>
                        ) : (
                          <input
                            type="number"
                            value={act.amount}
                            min={0}
                            step="0.01"
                            onChange={(e) => handleActAmountChange(i, e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 text-right"
                          />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 h-3.5 leading-[14px]">Retained</label>
                        <input
                          type="number"
                          value={act.retained}
                          max={act.amount}
                          min={0}
                          step="0.01"
                          onChange={(e) => handleRetainedChange(i, e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 text-right"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 h-3.5 leading-[14px] truncate" title="Rejected (Réfaction)">Rejected</label>
                        <input
                          type="number"
                          value={rejected}
                          max={act.amount}
                          min={0}
                          step="0.01"
                          onChange={(e) => handleRefactedChange(i, e.target.value)}
                          className={`w-full px-3 py-2 rounded-lg text-xs font-bold border text-right ${rejected > 0 ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-white border-slate-200 text-slate-800'}`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Reason</label>
                      <input
                        type="text"
                        {...form.register(`acts.${i}.reason`)}
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
              <p className={`text-[11px] font-semibold ${linesMismatch ? 'text-rose-600' : 'text-slate-400'}`}>
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
