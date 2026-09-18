// === AMÉLIORATION AJOUTÉE : HealthPass 2.0, Phase 4 — Reimbursement & Reconciliation ===
// Modale ouverte depuis un bouton dédié sur la ligne d'une facture approuvée
// (InvoicesView.tsx), derrière le flag `hp2_reimbursement_tracking`. Saisie manuelle uniquement
// (périmètre confirmé avec l'utilisateur, 2026-09-10) : pas d'import de relevé, pas de
// rapprochement automatique — un Admin/Superviseur enregistre qu'un décaissement a eu lieu.
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, Wallet } from 'lucide-react';
import { InvoiceItem } from '../../types';
import { FirestoreService } from '../../services/firestore';
import { useCurrency } from '../../services/currency';
import { ADMIN_THEME } from '../../theme/roleTheme';
// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Voir
// markAsPaidFormSchemas.ts pour le détail de ce qui est/n'est pas couvert par ce schéma.
import { markAsPaidFormSchema, MarkAsPaidFormValues } from './markAsPaidFormSchemas';

interface MarkAsPaidModalProps {
  invoice: InvoiceItem;
  onClose: () => void;
}

export const MarkAsPaidModal: React.FC<MarkAsPaidModalProps> = ({ invoice, onClose }) => {
  const { formatMoney } = useCurrency();
  // === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Remplace les
  // 3 useState de champs (payee/paymentReference/paidAt) par un unique useForm. saving/error
  // restent en état séparé (état UI/soumission, non géré par le formulaire).
  const form = useForm<MarkAsPaidFormValues>({
    resolver: zodResolver(markAsPaidFormSchema),
    defaultValues: {
      payee: invoice.payee || 'provider',
      paymentReference: '',
      paidAt: new Date().toISOString().slice(0, 10),
    },
  });
  const watchedPayee = form.watch('payee');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = form.handleSubmit(
    async (values) => {
      setError(null);
      setSaving(true);
      try {
        await FirestoreService.updateInvoice({
          ...invoice,
          paymentStatus: 'paid',
          payee: values.payee,
          paymentReference: values.paymentReference.trim(),
          paidAt: new Date(values.paidAt).toISOString(),
        });
        onClose();
      } catch {
        setError('Could not save this payment. Please try again.');
        setSaving(false);
      }
    },
    () => {
      setError('Payment reference is required.');
    }
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
        {/* === AMÉLIORATION AJOUTÉE : cohérence des couleurs (audit design, 2026-09-11) —
            l'accent utilisait ici #0A347B, distinct du token officiel `brand-900` (#0a2e6b,
            roleTheme.ts) utilisé pour ce même rôle sémantique ailleurs. Unifié sur #0a2e6b. */}
        <div className="bg-white border-b border-slate-200 px-6 py-4.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-[#0a2e6b]">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight text-slate-900">Mark as Paid</h3>
              {/* === AMÉLIORATION AJOUTÉE : montant payable (après réfaction quand elle existe)
                  affiché ici au lieu du montant original — c'est ce montant qui est réellement
                  décaissé. Repli sur `invoice.amount` inchangé pour toute facture non refactée. === */}
              <p className="text-xs text-slate-500 mt-0.5">{invoice.reference} — {formatMoney(invoice.payableAmountUSD ?? invoice.amount, 'DUAL')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Paid to</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => form.setValue('payee', 'provider')}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  watchedPayee === 'provider' ? 'bg-[#0a2e6b] text-white border-[#0a2e6b]' : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                Provider ({invoice.provider})
              </button>
              <button
                type="button"
                onClick={() => form.setValue('payee', 'member')}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  watchedPayee === 'member' ? 'bg-[#0a2e6b] text-white border-[#0a2e6b]' : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                Insured ({invoice.patientName})
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Payment Reference</label>
            <input
              type="text"
              {...form.register('paymentReference')}
              placeholder="e.g. bank transfer ref, mobile money ref"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Payment Date</label>
            <input
              type="date"
              {...form.register('paidAt')}
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
              className={`px-5 py-2.5 rounded-xl ${ADMIN_THEME.palette.primaryColor} text-white text-xs font-bold shadow-md shadow-slate-900/20 cursor-pointer disabled:opacity-60`}
            >
              {saving ? 'Saving…' : 'Confirm Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
