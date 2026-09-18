// === AMÉLIORATION AJOUTÉE : recouvrement manuel d'un montant refacté (2026-09-10, sur demande
// explicite de l'utilisateur — suivi manuel uniquement, aucune compensation automatique). Ouverte
// depuis un bouton dédié sur la ligne d'une facture refactée (InvoicesView.tsx), tant qu'il reste
// un montant refacté non récupéré, pour Admin et Superviseur.
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, Undo2 } from 'lucide-react';
import { InvoiceItem, InvoiceRecovery } from '../../types';
import { FirestoreService } from '../../services/firestore';
import { useCurrency } from '../../services/currency';
// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Voir
// recordRecoveryFormSchemas.ts : la borne de `amount` dépend de `pending` (calculé ci-dessous à
// partir de la facture ouverte), d'où la fabrique de schéma plutôt qu'un schéma statique.
import { createRecordRecoveryFormSchema, RecordRecoveryFormValues } from './recordRecoveryFormSchemas';

interface RecordRecoveryModalProps {
  invoice: InvoiceItem;
  currentUserName: string;
  currentUserRole: 'Admin' | 'Supervisor';
  onClose: () => void;
}

export const RecordRecoveryModal: React.FC<RecordRecoveryModalProps> = ({
  invoice,
  currentUserName,
  currentUserRole,
  onClose,
}) => {
  const { formatAmount } = useCurrency();
  const pending = Math.max(0, (invoice.refactionTotalUSD || 0) - (invoice.recoveredTotalUSD || 0));

  // === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Remplace les 4
  // useState de champs (amount/reference/notes/recordedAt) par un unique useForm. saving/error
  // restent en état séparé (état UI/soumission, non géré par le formulaire).
  const form = useForm<RecordRecoveryFormValues>({
    resolver: zodResolver(createRecordRecoveryFormSchema(pending)),
    defaultValues: {
      amount: pending,
      reference: '',
      notes: '',
      recordedAt: new Date().toISOString().slice(0, 10),
    },
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = form.handleSubmit(
    async (values) => {
      setError(null);
      setSaving(true);
      try {
        const recovery: InvoiceRecovery = {
          amountUSD: values.amount,
          recordedAt: new Date(values.recordedAt).toISOString(),
          recordedBy: currentUserName,
          recordedByRole: currentUserRole,
          reference: values.reference.trim() || undefined,
          notes: values.notes.trim() || undefined,
        };
        const recoveries = [...(invoice.recoveries || []), recovery];
        await FirestoreService.updateInvoice({
          ...invoice,
          recoveries,
          recoveredTotalUSD: (invoice.recoveredTotalUSD || 0) + values.amount,
        });
        onClose();
      } catch {
        setError('Could not save this recovery. Please try again.');
        setSaving(false);
      }
    },
    () => {
      setError(`Amount must be between 0 and the pending refacted amount (${formatAmount(pending)}).`);
    }
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
        <div className="bg-white border-b border-slate-200 px-6 py-4.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
              <Undo2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight text-slate-900">Record Recovery</h3>
              <p className="text-xs text-slate-500 mt-0.5">{invoice.reference} — {invoice.provider}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-700">Refacted amount pending recovery</span>
            <span className="font-black text-sm text-rose-700">{formatAmount(pending)}</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            The provider has produced supporting justification for the rejected act(s). Record how much of the refacted amount is being paid now — this is a manual entry only, no automatic payment is triggered.
          </p>

          {error && (
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Amount Recovered</label>
            <input
              type="number"
              value={form.watch('amount')}
              max={pending}
              min={0}
              step="0.01"
              onChange={(e) => form.setValue('amount', Math.max(0, Math.min(pending, Number(e.target.value) || 0)))}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Reference / Justification</label>
            <input
              type="text"
              {...form.register('reference')}
              placeholder="e.g. supporting medical file ref"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Notes (optional)</label>
            <input
              type="text"
              {...form.register('notes')}
              placeholder="Any additional context"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Recovery Date</label>
            <input
              type="date"
              {...form.register('recordedAt')}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
              required
            />
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-900/10 cursor-pointer disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Confirm Recovery'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
