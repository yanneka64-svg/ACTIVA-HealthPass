// === AMÉLIORATION AJOUTÉE : Health Insurance Policy Management & Premium Monitoring ===
// Section dédiée "Health Insurance Policy Configuration" par organisation — volontairement
// séparée de la table principale des Organisations (voir OrganizationsView.tsx), qui ne
// contient toujours QUE Organization Name / Policy Number / Declared Members / Coverage Rate
// / Effective Period / Status / Actions, sans aucune colonne prime/paiement ajoutée.
import React, { useMemo, useState } from 'react';
import {
  X,
  ShieldAlert,
  DollarSign,
  Calendar,
  Users,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  Clock,
  PlusCircle,
  Trash2,
} from 'lucide-react';
import { HealthPolicy, HealthPolicyStatus, Organization, PolicyPayment, SuspensionReason } from '../types';
import { getPolicyCoverageStatus } from '../services/policyEngine';
import { useCurrency } from '../services/currency';

interface HealthPolicyConfigModalProps {
  organization: Organization;
  policy: HealthPolicy | null;
  payments: PolicyPayment[];
  coveredPrincipals: number;
  coveredDependents: number;
  onClose: () => void;
  onSave: (data: Partial<HealthPolicy>) => void;
  onAddPayment: (data: Partial<PolicyPayment>) => void;
  onDeletePayment: (id: string) => void;
}

const POLICY_STATUS_STYLES: Record<HealthPolicyStatus, string> = {
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Expiring Soon': 'bg-amber-50 text-amber-700 border-amber-200',
  Suspended: 'bg-rose-50 text-rose-700 border-rose-200',
  Expired: 'bg-red-100 text-red-800 border-red-300',
  'Pending Renewal': 'bg-slate-100 text-slate-600 border-slate-200',
};

export const HealthPolicyConfigModal: React.FC<HealthPolicyConfigModalProps> = ({
  organization,
  policy,
  payments,
  coveredPrincipals,
  coveredDependents,
  onClose,
  onSave,
  onAddPayment,
  onDeletePayment,
}) => {
  const { formatAmount } = useCurrency();

  const [policyType, setPolicyType] = useState(policy?.policyType || 'Group Health Policy');
  const [effectiveDate, setEffectiveDate] = useState(policy?.effectiveDate || organization.effectiveDate);
  const [expirationDate, setExpirationDate] = useState(policy?.expirationDate || organization.expirationDate);
  const [annualPremium, setAnnualPremium] = useState(String(policy?.annualPremium ?? 0));
  const [currency, setCurrency] = useState(policy?.currency || 'USD');
  const [paymentFrequency, setPaymentFrequency] = useState(policy?.paymentFrequency || 'Quarterly');
  const [installmentAmount, setInstallmentAmount] = useState(String(policy?.installmentAmount ?? 0));
  const [nextPaymentDueDate, setNextPaymentDueDate] = useState(policy?.nextPaymentDueDate || '');
  const [lastPaymentDate, setLastPaymentDate] = useState(policy?.lastPaymentDate || '');
  const [lastPaymentAmount, setLastPaymentAmount] = useState(String(policy?.lastPaymentAmount ?? ''));
  const [gracePeriodDays, setGracePeriodDays] = useState(String(policy?.gracePeriodDays ?? 15));
  const [expiringSoonWarningDays, setExpiringSoonWarningDays] = useState(String(policy?.expiringSoonWarningDays ?? 30));
  const [outstandingAmount, setOutstandingAmount] = useState(String(policy?.outstandingAmount ?? 0));
  const [manuallySuspended, setManuallySuspended] = useState(!!policy?.manuallySuspended);
  const [suspensionReason, setSuspensionReason] = useState<SuspensionReason>(policy?.suspensionReason || 'Non-payment');

  // New payment entry row
  const [newPaymentQuarter, setNewPaymentQuarter] = useState<1 | 2 | 3 | 4>(1);
  const [newPaymentAmount, setNewPaymentAmount] = useState('');
  const [newPaymentDate, setNewPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [newPaymentDueDate, setNewPaymentDueDate] = useState('');
  const [newPaymentStatus, setNewPaymentStatus] = useState<PolicyPayment['status']>('Paid');

  // Live-computed status preview from the current form values (same engine used everywhere)
  const previewPolicy: HealthPolicy = useMemo(
    () => ({
      id: organization.name,
      organizationId: organization.name,
      policyNumber: organization.policyNumber,
      policyType,
      effectiveDate,
      expirationDate,
      status: policy?.status || 'Active',
      suspensionReason,
      manuallySuspended,
      annualPremium: parseFloat(annualPremium) || 0,
      currency,
      paymentFrequency: paymentFrequency as HealthPolicy['paymentFrequency'],
      installmentAmount: parseFloat(installmentAmount) || 0,
      nextPaymentDueDate: nextPaymentDueDate || undefined,
      lastPaymentDate: lastPaymentDate || undefined,
      lastPaymentAmount: lastPaymentAmount ? parseFloat(lastPaymentAmount) : undefined,
      gracePeriodDays: parseInt(gracePeriodDays, 10) || 15,
      expiringSoonWarningDays: parseInt(expiringSoonWarningDays, 10) || 30,
      outstandingAmount: parseFloat(outstandingAmount) || 0,
      coverageBlocked: false,
      updatedAt: new Date().toISOString(),
    }),
    [
      organization,
      policy,
      policyType,
      effectiveDate,
      expirationDate,
      suspensionReason,
      manuallySuspended,
      annualPremium,
      currency,
      paymentFrequency,
      installmentAmount,
      nextPaymentDueDate,
      lastPaymentDate,
      lastPaymentAmount,
      gracePeriodDays,
      expiringSoonWarningDays,
      outstandingAmount,
    ]
  );

  const livePreview = useMemo(() => getPolicyCoverageStatus(previewPolicy), [previewPolicy]);

  const handleSave = () => {
    onSave({
      policyNumber: organization.policyNumber,
      policyType,
      effectiveDate,
      expirationDate,
      status: livePreview.status,
      suspensionReason: livePreview.suspensionReason || (manuallySuspended ? suspensionReason : undefined),
      manuallySuspended,
      annualPremium: parseFloat(annualPremium) || 0,
      currency,
      paymentFrequency: paymentFrequency as HealthPolicy['paymentFrequency'],
      installmentAmount: parseFloat(installmentAmount) || 0,
      nextPaymentDueDate: nextPaymentDueDate || undefined,
      lastPaymentDate: lastPaymentDate || undefined,
      lastPaymentAmount: lastPaymentAmount ? parseFloat(lastPaymentAmount) : undefined,
      gracePeriodDays: parseInt(gracePeriodDays, 10) || 15,
      expiringSoonWarningDays: parseInt(expiringSoonWarningDays, 10) || 30,
      outstandingAmount: parseFloat(outstandingAmount) || 0,
      coverageBlocked: livePreview.coverageBlocked,
      suspensionDate: manuallySuspended && !policy?.manuallySuspended ? new Date().toISOString().split('T')[0] : policy?.suspensionDate,
      reactivationDate: !manuallySuspended && policy?.manuallySuspended ? new Date().toISOString().split('T')[0] : policy?.reactivationDate,
    });
  };

  const handleAddPayment = () => {
    if (!newPaymentAmount) return;
    onAddPayment({
      policyId: organization.name,
      paymentDate: newPaymentDate,
      dueDate: newPaymentDueDate || newPaymentDate,
      amountDue: parseFloat(newPaymentAmount) || 0,
      amountPaid: newPaymentStatus === 'Pending' ? 0 : parseFloat(newPaymentAmount) || 0,
      currency,
      status: newPaymentStatus,
      quarter: paymentFrequency === 'Quarterly' ? newPaymentQuarter : undefined,
    });
    setNewPaymentAmount('');
  };

  // Q1-Q4 schedule preview for quarterly policies (spec item 10)
  const quarterlySchedule = useMemo(() => {
    if (paymentFrequency !== 'Quarterly') return null;
    const byQuarter: Record<1 | 2 | 3 | 4, PolicyPayment | undefined> = { 1: undefined, 2: undefined, 3: undefined, 4: undefined };
    payments.forEach((p) => {
      if (p.quarter) byQuarter[p.quarter] = p;
    });
    return byQuarter;
  }, [payments, paymentFrequency]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
        <div className="px-6 py-4.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-[#0A347B]" />
            <div>
              <h3 className="text-base font-black text-slate-900">Health Insurance Policy Configuration</h3>
              <p className="text-xs text-slate-500">{organization.name} — Policy {organization.policyNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Live computed status banner */}
          <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${POLICY_STATUS_STYLES[livePreview.status]}`}>
            <div className="flex items-center gap-2">
              {livePreview.coverageBlocked ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              <span className="text-xs font-black uppercase tracking-wide">Computed Status: {livePreview.status}</span>
            </div>
            <span className="text-[11px] font-bold">
              {livePreview.coverageBlocked ? 'Healthcare access BLOCKED for all covered members' : 'Healthcare access allowed'}
            </span>
          </div>

          {/* Policy fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Policy Type</label>
              <input value={policyType} onChange={(e) => setPolicyType(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Policy Number</label>
              <input value={organization.policyNumber} disabled className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Effective Date</label>
              <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Expiration Date</label>
              <input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
            </div>
          </div>

          {/* Premium */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-[#0A347B]" />
              <span>Premium & Payment Schedule</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Annual Premium</label>
                <input type="number" value={annualPremium} onChange={(e) => setAnnualPremium(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Currency</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold">
                  <option value="USD">USD ($)</option>
                  <option value="LRD">LRD (L$)</option>
                  <option value="XAF">XAF</option>
                  <option value="XOF">XOF</option>
                  <option value="GHS">GHS</option>
                  <option value="GNF">GNF</option>
                  <option value="SLE">SLE</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Frequency</label>
                <select value={paymentFrequency} onChange={(e) => setPaymentFrequency(e.target.value as HealthPolicy['paymentFrequency'])} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold">
                  <option value="Annual">Annual</option>
                  <option value="Semi-Annual">Semi-Annual</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Installment Amount</label>
                <input type="number" value={installmentAmount} onChange={(e) => setInstallmentAmount(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Next Payment Due Date</label>
                <input type="date" value={nextPaymentDueDate} onChange={(e) => setNextPaymentDueDate(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Outstanding Amount</label>
                <input type="number" value={outstandingAmount} onChange={(e) => setOutstandingAmount(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-rose-700" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Last Payment Date</label>
                <input type="date" value={lastPaymentDate} onChange={(e) => setLastPaymentDate(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Last Payment Amount</label>
                <input type="number" value={lastPaymentAmount} onChange={(e) => setLastPaymentAmount(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold" />
              </div>
            </div>
          </div>

          {/* Configurable thresholds */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#0A347B]" />
              <span>Configurable Thresholds</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Grace Period (days)</label>
                <input type="number" value={gracePeriodDays} onChange={(e) => setGracePeriodDays(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Expiring Soon Warning (days)</label>
                <input type="number" value={expiringSoonWarningDays} onChange={(e) => setExpiringSoonWarningDays(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold" />
              </div>
            </div>
          </div>

          {/* Manual suspension */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={manuallySuspended} onChange={(e) => setManuallySuspended(e.target.checked)} className="w-4 h-4 accent-amber-600" />
              <span className="text-xs font-extrabold text-amber-900">Manually suspend this policy (Administrative / Other)</span>
            </label>
            {manuallySuspended && (
              <div>
                <label className="block text-xs font-bold text-amber-900 mb-1">Suspension Reason</label>
                <select value={suspensionReason} onChange={(e) => setSuspensionReason(e.target.value as SuspensionReason)} className="w-full px-3.5 py-2 bg-white border border-amber-200 rounded-xl text-xs font-bold">
                  <option value="Non-payment">Non-payment</option>
                  <option value="Administrative">Administrative</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            )}
          </div>

          {/* Payment history / quarterly schedule */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-[#0A347B]" />
              <span>Payment History</span>
            </h4>

            {quarterlySchedule && (
              <div className="grid grid-cols-4 gap-2">
                {([1, 2, 3, 4] as const).map((q) => {
                  const p = quarterlySchedule[q];
                  const status = p?.status || 'Pending';
                  const styles: Record<string, string> = {
                    Paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    'Partially Paid': 'bg-amber-50 text-amber-700 border-amber-200',
                    Overdue: 'bg-rose-50 text-rose-700 border-rose-200',
                    Pending: 'bg-slate-100 text-slate-500 border-slate-200',
                  };
                  return (
                    <div key={q} className={`p-2.5 rounded-xl border text-center ${styles[status]}`}>
                      <div className="text-[10px] font-black uppercase tracking-wide">Q{q}</div>
                      <div className="text-[11px] font-bold">{status}</div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Due</th>
                    {paymentFrequency === 'Quarterly' && <th className="py-2 px-3">Qtr</th>}
                    <th className="py-2 px-3 text-right">Amount Paid</th>
                    <th className="py-2 px-3 text-center">Status</th>
                    <th className="py-2 px-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-4 px-3 text-center text-slate-400 italic">No payments recorded yet.</td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 px-3 font-mono">{p.paymentDate}</td>
                        <td className="py-2 px-3 font-mono text-slate-500">{p.dueDate}</td>
                        {paymentFrequency === 'Quarterly' && <td className="py-2 px-3">{p.quarter ? `Q${p.quarter}` : '—'}</td>}
                        <td className="py-2 px-3 text-right font-bold">{formatAmount(p.amountPaid)}</td>
                        <td className="py-2 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100">{p.status}</span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button onClick={() => onDeletePayment(p.id)} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Add payment row */}
            <div className="flex flex-wrap items-end gap-2 pt-1">
              {paymentFrequency === 'Quarterly' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Quarter</label>
                  <select value={newPaymentQuarter} onChange={(e) => setNewPaymentQuarter(Number(e.target.value) as 1 | 2 | 3 | 4)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold">
                    <option value={1}>Q1</option>
                    <option value={2}>Q2</option>
                    <option value={3}>Q3</option>
                    <option value={4}>Q4</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Payment Date</label>
                <input type="date" value={newPaymentDate} onChange={(e) => setNewPaymentDate(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Due Date</label>
                <input type="date" value={newPaymentDueDate} onChange={(e) => setNewPaymentDueDate(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Amount</label>
                <input type="number" value={newPaymentAmount} onChange={(e) => setNewPaymentAmount(e.target.value)} className="w-24 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Status</label>
                <select value={newPaymentStatus} onChange={(e) => setNewPaymentStatus(e.target.value as PolicyPayment['status'])} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold">
                  <option value="Paid">Paid</option>
                  <option value="Partially Paid">Partially Paid</option>
                  <option value="Overdue">Overdue</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>
              <button onClick={handleAddPayment} className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer">
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Record Payment</span>
              </button>
            </div>
          </div>

          {/* Covered population */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#0A347B]" />
              <span className="text-xs font-extrabold text-slate-800">Covered Population</span>
            </div>
            <span className="text-xs font-bold text-slate-600">
              {coveredPrincipals} principal insured &bull; {coveredDependents} dependents &bull; {coveredPrincipals + coveredDependents} total
            </span>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2.5 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-white cursor-pointer">Cancel</button>
          <button onClick={handleSave} className="px-5 py-2 rounded-xl bg-[#0A347B] hover:bg-[#08285e] text-white text-xs font-bold shadow-sm cursor-pointer">Save Policy Configuration</button>
        </div>
      </div>
    </div>
  );
};
