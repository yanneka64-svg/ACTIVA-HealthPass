// === AMÉLIORATION AJOUTÉE : HealthPass 2.0, Phase 4 — Reimbursement & Reconciliation ===
// Panneau de rapprochement, derrière le flag `hp2_reimbursement_tracking`. Ajouté SOUS la rangée
// de KPI existante (InvoicesView.tsx) plutôt que d'y modifier une carte — en particulier la carte
// "PROCESSED INVOICES" affiche déjà "100% verified disbursements", une mention décorative sans
// donnée réelle derrière ; ce panneau fournit le vrai chiffre à côté, sans toucher à l'existant.
import React from 'react';
import { Wallet, CheckCircle2, AlertCircle } from 'lucide-react';
import { useCurrency } from '../../services/currency';
import { ReconciliationSummary as ReconciliationSummaryData } from './reconciliation';

interface ReconciliationSummaryProps {
  summary: ReconciliationSummaryData;
}

export const ReconciliationSummary: React.FC<ReconciliationSummaryProps> = ({ summary }) => {
  const { formatMoney } = useCurrency();

  return (
    <div className="bg-white rounded-2xl border border-[#E8EDF2] shadow-xs p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-slate-100 text-[#0A347B] flex items-center justify-center">
          <Wallet className="w-4 h-4" />
        </div>
        <div>
          <h3 className="font-extrabold text-sm text-slate-900">Payment Reconciliation</h3>
          <p className="text-[10.5px] text-slate-400">Approved invoices matched against recorded disbursements</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Approved</p>
          <p className="text-lg font-black text-slate-900 mt-1">{formatMoney(summary.approvedAmount, 'DUAL')}</p>
          <p className="text-[10.5px] text-slate-400 mt-0.5">{summary.approvedCount} invoice(s)</p>
        </div>
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Paid
          </p>
          <p className="text-lg font-black text-emerald-700 mt-1">{formatMoney(summary.paidAmount, 'DUAL')}</p>
          <p className="text-[10.5px] text-emerald-600/80 mt-0.5">{summary.paidCount} invoice(s)</p>
        </div>
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Outstanding
          </p>
          <p className="text-lg font-black text-amber-700 mt-1">{formatMoney(summary.outstandingAmount, 'DUAL')}</p>
          <p className="text-[10.5px] text-amber-600/80 mt-0.5">{summary.outstandingCount} invoice(s)</p>
        </div>
      </div>
    </div>
  );
};
