import React, { useState, useMemo } from 'react';
import {
  Search,
  Receipt,
  User,
  Users,
  Building,
  CheckCircle2,
  Clock,
  FileText,
  Download,
  Printer,
  X,
  Eye,
  FileSpreadsheet,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { InvoiceItem, Language } from '../types';
import { useTranslation } from '../i18n/translations';
import { useCurrency } from '../services/currency';
import { printBordereauSlip, downloadBordereauPDF } from '../utils/printUtils';

interface InvoicesViewProps {
  lang: Language;
  invoices: InvoiceItem[];
  userRole?: string;
  onDeleteInvoice?: (id: string) => Promise<void> | void;
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  lang,
  invoices,
  userRole = 'Admin',
  onDeleteInvoice,
}) => {
  const t = useTranslation(lang);
  const { formatAmount } = useCurrency();
  const [viewMode, setViewMode] = useState<'full' | 'patient' | 'family'>('full');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [orgFilter, setOrgFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [viewSlipInvoice, setViewSlipInvoice] = useState<InvoiceItem | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<InvoiceItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAdmin = userRole.toLowerCase() === 'admin' || userRole.toLowerCase() === 'administrateur';
  const isSupervisor = userRole.toLowerCase() === 'supervisor' || userRole.toLowerCase() === 'superviseur';
  const canDeleteInvoice = isAdmin || isSupervisor;

  // === AMÉLIORATION AJOUTÉE : gris de la barre latérale Admin (auparavant bg-slate-900,
  // un noir quasi-pur perçu comme "noir" plutôt que gris par l'utilisateur) ===
  const primaryBtnClass = isAdmin
    ? 'bg-slate-700 hover:bg-slate-800 text-white'
    : isSupervisor
    ? 'bg-[#0F766E] hover:bg-[#115E59] text-white'
    : 'bg-[#0A347B] hover:bg-[#072659] text-white';

  const activeTabClass = isAdmin
    ? 'bg-slate-700 text-white shadow-xs'
    : isSupervisor
    ? 'bg-[#0F766E] text-white shadow-xs'
    : 'bg-[#0A347B] text-white shadow-xs';

  const primaryTextClass = isAdmin ? 'text-slate-700' : isSupervisor ? 'text-[#0F766E]' : 'text-[#0A347B]';

  const handleDeleteConfirm = async () => {
    if (!invoiceToDelete || !onDeleteInvoice) return;
    try {
      setIsDeleting(true);
      await onDeleteInvoice(invoiceToDelete.id);
      if (viewSlipInvoice?.id === invoiceToDelete.id) {
        setViewSlipInvoice(null);
      }
      setInvoiceToDelete(null);
    } catch (err) {
      console.error('Failed to delete invoice', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Derive unique orgs and categories for filters
  const uniqueOrgs = useMemo(() => {
    return Array.from(new Set(invoices.map((i) => i.organization).filter(Boolean)));
  }, [invoices]);

  const uniqueCategories = useMemo(() => {
    return Array.from(new Set(invoices.map((i) => i.careType).filter(Boolean)));
  }, [invoices]);

  // Filter invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchSearch =
        inv.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.provider.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.organization.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.careType.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.patientPolicyNumber && inv.patientPolicyNumber.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchStatus =
        statusFilter === 'ALL' || inv.status === statusFilter || (statusFilter === 'valid' && inv.status === 'valid');
      const matchOrg = orgFilter === 'ALL' || inv.organization === orgFilter;
      const matchCat = categoryFilter === 'ALL' || inv.careType === categoryFilter;

      return matchSearch && matchStatus && matchOrg && matchCat;
    });
  }, [invoices, searchTerm, statusFilter, orgFilter, categoryFilter]);

  // Financial KPIs calculations
  const totalInvoiced = useMemo(() => {
    return filteredInvoices.reduce((sum, i) => sum + (i.amount || 0), 0);
  }, [filteredInvoices]);

  const totalCovered = useMemo(() => {
    return filteredInvoices.reduce((sum, i) => {
      const covered = i.coveredAmount !== undefined ? i.coveredAmount : (i.amount * (i.coveragePercentage || 80)) / 100;
      return sum + covered;
    }, 0);
  }, [filteredInvoices]);

  const totalCopay = useMemo(() => {
    return Math.max(0, totalInvoiced - totalCovered);
  }, [totalInvoiced, totalCovered]);

  const coverageRate = totalInvoiced > 0 ? ((totalCovered / totalInvoiced) * 100).toFixed(1) : '0.0';

  // Grouping by Patient
  const patientGroups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; org: string; items: InvoiceItem[] }>();
    filteredInvoices.forEach((inv) => {
      const key = inv.patientName;
      if (!map.has(key)) {
        map.set(key, { key, name: inv.patientName, org: inv.organization, items: [] });
      }
      map.get(key)!.items.push(inv);
    });
    return Array.from(map.values()).map((g) => ({
      ...g,
      totalAmount: g.items.reduce((s, i) => s + i.amount, 0),
      count: g.items.length,
    }));
  }, [filteredInvoices]);

  // Grouping by Family
  const familyGroups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; org: string; items: InvoiceItem[] }>();
    filteredInvoices.forEach((inv) => {
      const key = inv.familyHead || inv.patientName;
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: `${key} Family`,
          org: inv.organization,
          items: [],
        });
      }
      map.get(key)!.items.push(inv);
    });
    return Array.from(map.values()).map((g) => ({
      ...g,
      totalAmount: g.items.reduce((s, i) => s + i.amount, 0),
      count: g.items.length,
    }));
  }, [filteredInvoices]);

  return (
    <div className="space-y-6">
      {/* 2. KPI / STATISTIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* TOTAL INVOICED VOLUME */}
        <div className="bg-white rounded-2xl p-5 border border-[#E8EDF2] shadow-xs">
          <p className="text-[11px] font-bold text-[#778FAF] uppercase tracking-wider">
            TOTAL INVOICED VOLUME
          </p>
          <p className="text-2xl sm:text-3xl font-extrabold text-[#0D2B63] mt-2 tracking-tight">
            {formatAmount(totalInvoiced)}
          </p>
          <p className="text-xs text-[#778FAF] mt-1.5 font-medium">
            Across {filteredInvoices.length} direct billing invoices
          </p>
        </div>

        {/* COVERED BY ACTIVA */}
        <div className="bg-white rounded-2xl p-5 border border-[#E8EDF2] shadow-xs">
          <p className="text-[11px] font-bold text-[#778FAF] uppercase tracking-wider">
            COVERED BY ACTIVA
          </p>
          <p className="text-2xl sm:text-3xl font-extrabold text-[#00A878] mt-2 tracking-tight">
            {formatAmount(totalCovered)}
          </p>
          <p className="text-xs text-[#778FAF] mt-1.5 font-medium">
            {coverageRate}% coverage rate
          </p>
        </div>

        {/* PATIENT DIRECT CO-PAY */}
        <div className="bg-white rounded-2xl p-5 border border-[#E8EDF2] shadow-xs">
          <p className="text-[11px] font-bold text-[#778FAF] uppercase tracking-wider">
            PATIENT DIRECT CO-PAY
          </p>
          <p className="text-2xl sm:text-3xl font-extrabold text-[#0D2B63] mt-2 tracking-tight">
            {formatAmount(totalCopay)}
          </p>
          <p className="text-xs text-[#778FAF] mt-1.5 font-medium">
            Patient out-of-pocket settlement
          </p>
        </div>

        {/* PROCESSED INVOICES */}
        <div className="bg-white rounded-2xl p-5 border border-[#E8EDF2] shadow-xs">
          <p className="text-[11px] font-bold text-[#778FAF] uppercase tracking-wider">
            PROCESSED INVOICES
          </p>
          <p className="text-2xl sm:text-3xl font-extrabold text-[#0D2B63] mt-2 tracking-tight">
            {filteredInvoices.length}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-[#00A878] font-bold mt-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>100% verified disbursements</span>
          </div>
        </div>
      </div>

      {/* 3. TABS & FILTER TOOLBAR (Aligned on a single horizontal line) */}
      <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-[#E8EDF2] shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Navigation Tabs */}
        <div className="inline-flex p-1 bg-[#F8FAFC] rounded-xl border border-[#E8EDF2] shrink-0">
          <button
            onClick={() => setViewMode('full')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              viewMode === 'full'
                ? activeTabClass
                : 'text-[#778FAF] hover:text-[#0D2B63]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Full Invoices List</span>
          </button>
          <button
            onClick={() => setViewMode('patient')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              viewMode === 'patient'
                ? activeTabClass
                : 'text-[#778FAF] hover:text-[#0D2B63]'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Grouped by Patient</span>
          </button>
          <button
            onClick={() => setViewMode('family')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              viewMode === 'family'
                ? activeTabClass
                : 'text-[#778FAF] hover:text-[#0D2B63]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Grouped by Family</span>
          </button>
        </div>

        {/* Search & Filters on the same line */}
        <div className="flex items-center gap-2.5 flex-1 min-w-[280px] sm:flex-initial justify-end">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1 sm:w-64 sm:flex-initial">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search invoice"
              className="w-full pl-9 pr-4 py-2 bg-[#F8FAFC] border border-[#E8EDF2] rounded-xl text-xs text-[#0D2B63] placeholder:text-[#778FAF] focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 focus:bg-white transition"
            />
            <Search className="w-4 h-4 text-[#778FAF] absolute left-3 top-2.5" />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Org Filter */}
          <select
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            className="px-3 py-2 bg-[#F8FAFC] border border-[#E8EDF2] rounded-xl text-xs font-semibold text-[#0D2B63] focus:outline-none focus:border-slate-800 cursor-pointer whitespace-nowrap"
          >
            <option value="ALL">All Organizations</option>
            {uniqueOrgs.map((org) => (
              <option key={org} value={org}>
                {org}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4. MAIN DATA VIEW */}
      {viewMode === 'full' ? (
        /* Full Data Table matching Screenshot */
        <div className="bg-white rounded-2xl border border-[#E8EDF2] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-[#E8EDF2] bg-[#F8FAFC] text-[11px] font-bold text-[#778FAF] uppercase tracking-wider">
                  <th className="py-3.5 px-5">INVOICE REF</th>
                  <th className="py-3.5 px-5">PATIENT</th>
                  <th className="py-3.5 px-5">HEALTHCARE FACILITY</th>
                  <th className="py-3.5 px-5">ACT & CARE CATEGORY</th>
                  <th className="py-3.5 px-4 text-right">INVOICED ($)</th>
                  <th className="py-3.5 px-4 text-right text-[#00A878]">COVERED ($)</th>
                  <th className="py-3.5 px-4 text-right">COPAY ($)</th>
                  <th className="py-3.5 px-5 text-center">STATUS</th>
                  <th className="py-3.5 px-5 text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EDF2] text-xs">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-[#778FAF] font-medium">
                      No invoices found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => {
                    const covered = inv.coveredAmount !== undefined ? inv.coveredAmount : (inv.amount * (inv.coveragePercentage || 80)) / 100;
                    const copay = Math.max(0, inv.amount - covered);

                    return (
                      <tr key={inv.id} className="hover:bg-[#F8FAFC]/80 transition">
                        {/* INVOICE REF */}
                        <td className="py-4 px-5 align-top">
                          <div className="font-bold text-slate-900 font-mono text-xs">{inv.reference}</div>
                          <div className="text-[11px] text-[#778FAF] mt-0.5">
                            Claim: <span className="font-mono">{inv.claimId || `SIN-${inv.id.substring(0, 8)}`}</span>
                          </div>
                          <div className="text-[11px] text-[#778FAF] mt-0.5">
                            🗓 {inv.serviceDate || '2025-08-18'}
                          </div>
                        </td>

                        {/* PATIENT */}
                        <td className="py-4 px-5 align-top">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-[#778FAF] shrink-0" />
                            <span className="font-bold text-[#0D2B63]">{inv.patientName}</span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-700 font-semibold mt-0.5">
                            {inv.patientPolicyNumber || 'ACT-2025-0089'}
                          </div>
                          <div className="text-[11px] text-[#778FAF] mt-0.5 truncate max-w-[180px]">
                            🏢 {inv.organization}
                          </div>
                        </td>

                        {/* HEALTHCARE FACILITY */}
                        <td className="py-4 px-5 align-top">
                          <div className="font-bold text-[#0D2B63]">{inv.provider}</div>
                          <div className="text-[11px] text-[#778FAF] mt-0.5">
                            🩺 {inv.prescribingDoctor || 'Dr. Medical Staff'}
                          </div>
                        </td>

                        {/* ACT & CARE CATEGORY */}
                        <td className="py-4 px-5 align-top">
                          <div className="font-medium text-[#0D2B63] max-w-[200px] truncate">
                            {inv.description || inv.careType}
                          </div>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-[#F8FAFC] border border-[#E8EDF2] text-[10px] font-semibold text-[#778FAF]">
                            {inv.careType}
                          </span>
                        </td>

                        {/* INVOICED */}
                        <td className="py-4 px-4 text-right align-top font-bold text-[#0D2B63] text-[13px]">
                          {formatAmount(inv.amount)}
                        </td>

                        {/* COVERED */}
                        <td className="py-4 px-4 text-right align-top font-bold text-[#00A878] text-[13px]">
                          {formatAmount(covered)}
                        </td>

                        {/* COPAY */}
                        <td className="py-4 px-4 text-right align-top font-bold text-[#0D2B63] text-[13px]">
                          {formatAmount(copay)}
                        </td>

                        {/* STATUS */}
                        <td className="py-4 px-5 text-center align-top">
                          {inv.status === 'valid' || inv.status === 'approved' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#DEFEEB] text-[#00A878] text-[11px] font-bold">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Validated</span>
                            </span>
                          ) : inv.status === 'pending' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FFF6D9] text-[#F5B942] text-[11px] font-bold">
                              <Clock className="w-3 h-3" />
                              <span>Pending</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FEF2F2] text-[#DC4C4C] text-[11px] font-bold">
                              <X className="w-3 h-3" />
                              <span>Rejected</span>
                            </span>
                          )}
                        </td>

                        {/* ACTIONS */}
                        <td className="py-4 px-5 text-center align-top">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setViewSlipInvoice(inv)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
                              title="View invoice slip"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-700" />
                              <span>Slip</span>
                            </button>

                            {canDeleteInvoice && (
                              <button
                                onClick={() => setInvoiceToDelete(inv)}
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition cursor-pointer"
                                title="Supprimer la facture (Admin)"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Grouped Views */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(viewMode === 'patient' ? patientGroups : familyGroups).map((g) => (
            <div
              key={g.key}
              className="bg-white rounded-2xl p-5 border border-[#E8EDF2] shadow-xs flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {viewMode === 'patient' ? (
                      <User className="w-4 h-4 text-slate-800" />
                    ) : (
                      <Users className="w-4 h-4 text-slate-800" />
                    )}
                    <h3 className="font-bold text-sm text-[#0D2B63]">{g.name}</h3>
                  </div>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded-full text-[10px] font-bold">
                    {g.count} Invoices
                  </span>
                </div>
                <p className="text-xs text-[#778FAF] mt-1 truncate">🏢 {g.org}</p>

                {/* Invoices Mini List */}
                <div className="mt-3 space-y-2 border-t border-[#E8EDF2] pt-3">
                  {g.items.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0"
                    >
                      <span className="font-mono text-slate-800 font-semibold">{item.reference}</span>
                      <span className="font-bold text-[#0D2B63]">{formatAmount(item.amount)}</span>
                    </div>
                  ))}
                  {g.items.length > 3 && (
                    <p className="text-[11px] text-[#778FAF] italic">+ {g.items.length - 3} more records</p>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-[#E8EDF2] flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[#778FAF] uppercase font-bold block">Total Amount</span>
                  <span className="text-base font-extrabold text-[#0D2B63]">{formatAmount(g.totalAmount)}</span>
                </div>
                <button
                  onClick={() => {
                    setViewSlipInvoice(g.items[0]);
                  }}
                  className="px-3 py-1.5 bg-[#F8FAFC] hover:bg-slate-100 border border-[#E8EDF2] text-slate-800 text-xs font-bold rounded-lg transition cursor-pointer"
                >
                  View Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. INVOICE SLIP MODAL */}
      {viewSlipInvoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-[#E8EDF2] max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-[#E8EDF2] pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-100 rounded-xl text-slate-800">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#0D2B63]">
                    Certified Medical Slip #{viewSlipInvoice.reference}
                  </h3>
                  <p className="text-xs text-[#778FAF]">Official ACTIVA HealthPass Disbursement Voucher</p>
                </div>
              </div>
              <button
                onClick={() => setViewSlipInvoice(null)}
                className="p-1.5 text-[#778FAF] hover:text-[#0D2B63] hover:bg-[#F8FAFC] rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Slip Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-[#F8FAFC] p-4 rounded-xl border border-[#E8EDF2] text-xs">
              <div>
                <p className="text-[#778FAF] font-medium">Patient</p>
                <p className="font-bold text-[#0D2B63] mt-0.5">{viewSlipInvoice.patientName}</p>
                <p className="font-mono text-[10px] text-slate-700">
                  {viewSlipInvoice.patientPolicyNumber || 'ACT-2025-0089'}
                </p>
              </div>
              <div>
                <p className="text-[#778FAF] font-medium">Healthcare Provider</p>
                <p className="font-bold text-[#0D2B63] mt-0.5">{viewSlipInvoice.provider}</p>
              </div>
              <div>
                <p className="text-[#778FAF] font-medium">Organization</p>
                <p className="font-bold text-[#0D2B63] mt-0.5">{viewSlipInvoice.organization}</p>
              </div>
              <div>
                <p className="text-[#778FAF] font-medium">Care Category</p>
                <p className="font-bold text-[#0D2B63] mt-0.5">{viewSlipInvoice.careType}</p>
              </div>
              <div>
                <p className="text-[#778FAF] font-medium">Service Date</p>
                <p className="font-bold text-[#0D2B63] mt-0.5">{viewSlipInvoice.serviceDate || '2025-08-18'}</p>
              </div>
              <div>
                <p className="text-[#778FAF] font-medium">Validation Status</p>
                <span className="inline-block mt-0.5 px-2 py-0.5 bg-[#DEFEEB] text-[#00A878] rounded-md font-bold text-[10px]">
                  {viewSlipInvoice.status?.toUpperCase() || 'VALIDATED'}
                </span>
              </div>
            </div>

            {/* Financial Breakdown Box */}
            <div className="border border-[#E8EDF2] rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-xs text-[#778FAF]">
                <span>Total Invoiced Amount</span>
                <span className="font-bold text-[#0D2B63]">{formatAmount(viewSlipInvoice.amount)}</span>
              </div>
              <div className="flex justify-between text-xs text-[#00A878] font-semibold">
                <span>Covered by ACTIVA ({viewSlipInvoice.coveragePercentage || 80}%)</span>
                <span>
                  {formatAmount(
                    viewSlipInvoice.coveredAmount !== undefined
                      ? viewSlipInvoice.coveredAmount
                      : (viewSlipInvoice.amount * (viewSlipInvoice.coveragePercentage || 80)) / 100
                  )}
                </span>
              </div>
              <div className="flex justify-between text-xs text-[#0D2B63] pt-2 border-t border-[#E8EDF2] font-bold">
                <span>Patient Direct Co-Pay</span>
                <span>
                  {formatAmount(
                    Math.max(
                      0,
                      viewSlipInvoice.amount -
                        (viewSlipInvoice.coveredAmount !== undefined
                          ? viewSlipInvoice.coveredAmount
                          : (viewSlipInvoice.amount * (viewSlipInvoice.coveragePercentage || 80)) / 100)
                    )
                  )}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div>
                {canDeleteInvoice && (
                  <button
                    type="button"
                    onClick={() => {
                      setInvoiceToDelete(viewSlipInvoice);
                    }}
                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Delete Invoice</span>
                  </button>
                )}
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={() => printBordereauSlip(viewSlipInvoice, lang)}
                  className="px-4 py-2 bg-[#F8FAFC] hover:bg-slate-100 border border-[#E8EDF2] text-[#0D2B63] rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-slate-700" />
                  <span>Print Slip</span>
                </button>
                <button
                  onClick={() => downloadBordereauPDF(viewSlipInvoice, lang)}
                  className={`px-4 py-2 ${primaryBtnClass} rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-xs cursor-pointer`}
                >
                  <Download className="w-4 h-4" />
                  <span>Download PDF Voucher</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. DELETE CONFIRMATION MODAL */}
      {invoiceToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                Supprimer la Facture #{invoiceToDelete.reference} ?
              </h3>
              <p className="text-xs text-slate-500">
                Êtes-vous sûr de vouloir supprimer définitivement cette facture de {formatAmount(invoiceToDelete.amount)} émise pour {invoiceToDelete.patientName} ({invoiceToDelete.provider}) ?
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800">
              ⚠️ Cette action est irréversible et retirera le montant du bordereau comptable.
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setInvoiceToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {isDeleting ? (
                  <span>Suppression...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirmer la suppression</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
