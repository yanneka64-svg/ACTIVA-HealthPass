import React, { useState, useMemo } from 'react';
import {
  Search,
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
// === AMÉLIORATION AJOUTÉE : nouveau modèle de bordereau de règlement (Settlement Slip &
// Direct Billing Voucher) — voir la modale "INVOICE SLIP MODAL" plus bas.
import { LogoIcon } from '../components/Logo';
import { ExportDropdown } from '../components/ExportDropdown';

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

  // === AMÉLIORATION AJOUTÉE : lignes du détail "Medical Benefits Coverage Breakdown" du
  // nouveau bordereau de règlement — une ligne par acte médical (Claim.medicalActs, reporté sur
  // la facture par workflowService.ts). Les factures antérieures à ce correctif n'ont pas ce
  // détail : repli sur une ligne unique dérivée de careType/amount/coveredAmount, identique au
  // montant déjà affiché partout ailleurs dans cet écran.
  const slipBreakdownRows = useMemo(() => {
    if (!viewSlipInvoice) return [];
    if (viewSlipInvoice.medicalActs && viewSlipInvoice.medicalActs.length > 0) {
      return viewSlipInvoice.medicalActs.map((act) => ({
        description: act.name,
        category: act.category || viewSlipInvoice.careType,
        billed: act.amount,
        covered: (act.amount * (viewSlipInvoice.coveragePercentage || 80)) / 100,
      }));
    }
    return [
      {
        description: viewSlipInvoice.careType,
        category: viewSlipInvoice.careType,
        billed: viewSlipInvoice.amount,
        covered:
          viewSlipInvoice.coveredAmount !== undefined
            ? viewSlipInvoice.coveredAmount
            : (viewSlipInvoice.amount * (viewSlipInvoice.coveragePercentage || 80)) / 100,
      },
    ];
  }, [viewSlipInvoice]);

  const slipIsApproved = viewSlipInvoice ? viewSlipInvoice.status === 'valid' || (viewSlipInvoice.status as string) === 'approved' : false;
  const slipClaimRef = viewSlipInvoice ? viewSlipInvoice.claimId || `SIN-${viewSlipInvoice.id.substring(0, 8)}` : '';

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
          <p className="text-2xl sm:text-3xl font-extrabold text-[var(--brand-900)] mt-2 tracking-tight">
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
          <p className="text-2xl sm:text-3xl font-extrabold text-[#00A859] mt-2 tracking-tight">
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
          <p className="text-2xl sm:text-3xl font-extrabold text-[var(--brand-900)] mt-2 tracking-tight">
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
          <p className="text-2xl sm:text-3xl font-extrabold text-[var(--brand-900)] mt-2 tracking-tight">
            {filteredInvoices.length}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-[#00A859] font-bold mt-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>100% verified disbursements</span>
          </div>
        </div>
      </div>

      {/* 3. TABS & FILTER TOOLBAR */}
      {/* === AMÉLIORATION AJOUTÉE : sur mobile, la barre passait en dépassement horizontal
          (le champ de recherche et le filtre organisation gardaient une largeur minimale fixe
          qui dépassait l'écran, forçant toute la page à défiler horizontalement). Chaque bloc
          est maintenant en pleine largeur et empilé verticalement en dessous de `sm`, et
          redevient une seule ligne horizontale comme avant à partir de `sm`. ===  */}
      <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-[#E8EDF2] shadow-xs flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-3">
        {/* Navigation Tabs — scrollable horizontally instead of wrapping/overflowing on narrow screens */}
        <div className="flex sm:inline-flex p-1 bg-[#F8FAFC] rounded-xl border border-[#E8EDF2] shrink-0 overflow-x-auto">
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

        {/* Search & Filters: full-width stacked on mobile, inline on the same row from sm */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto sm:flex-1 sm:min-w-[280px] sm:justify-end">
          {/* Search */}
          <div className="relative w-full sm:w-64">
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
            className="w-full sm:w-auto px-3 py-2 bg-[#F8FAFC] border border-[#E8EDF2] rounded-xl text-xs font-semibold text-[#0D2B63] focus:outline-none focus:border-slate-800 cursor-pointer whitespace-nowrap"
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
        <>
        {/* === AMÉLIORATION AJOUTÉE : sur téléphone, le tableau (9 colonnes) forçait toute la
            page à défiler horizontalement et seules 2 colonnes restaient visibles à l'écran —
            une liste de fiches empilées verticalement le remplace en dessous de `sm`, avec
            exactement les mêmes informations et actions (Slip / Suppression) qu'une ligne du
            tableau. Le tableau original reste inchangé à partir de `sm`. === */}
        <div className="sm:hidden space-y-3">
          {filteredInvoices.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E8EDF2] p-8 text-center text-[#778FAF] font-medium text-xs">
              No invoices found matching your criteria.
            </div>
          ) : (
            filteredInvoices.map((inv) => {
              const covered = inv.coveredAmount !== undefined ? inv.coveredAmount : (inv.amount * (inv.coveragePercentage || 80)) / 100;
              const copay = Math.max(0, inv.amount - covered);
              const claimRef = inv.claimId || `SIN-${inv.id.substring(0, 8)}`;

              return (
                <div key={inv.id} className="bg-white rounded-2xl border border-[#E8EDF2] shadow-xs p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 font-mono text-xs truncate">{inv.reference}</div>
                      <div className="text-[10.5px] text-[#778FAF] truncate">{claimRef} · {inv.serviceDate || '2025-08-18'}</div>
                    </div>
                    {inv.status === 'valid' || inv.status === 'approved' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#DEFEEB] text-[#00A878] text-[10.5px] font-bold shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Validated</span>
                      </span>
                    ) : inv.status === 'pending' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FFF6D9] text-[#F5B942] text-[10.5px] font-bold shrink-0">
                        <Clock className="w-3 h-3" />
                        <span>Pending</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FEF2F2] text-[#DC4C4C] text-[10.5px] font-bold shrink-0">
                        <X className="w-3 h-3" />
                        <span>Rejected</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs">
                    <User className="w-3.5 h-3.5 text-[#778FAF] shrink-0" />
                    <span className="font-bold text-[#0D2B63] truncate">{inv.patientName}</span>
                    <span className="text-[10.5px] font-mono text-slate-500 shrink-0">{inv.patientPolicyNumber || 'ACT-2025-0089'}</span>
                  </div>

                  <div className="text-xs truncate">
                    <span className="font-bold text-[#0D2B63]">{inv.provider}</span>
                    <span className="text-[10.5px] text-[#778FAF]"> — {inv.prescribingDoctor || 'Dr. Medical Staff'}</span>
                  </div>

                  <span className="inline-block px-2 py-0.5 rounded-md bg-[#F8FAFC] border border-[#E8EDF2] text-[10.5px] font-semibold text-[#0D2B63]" title={inv.description || inv.careType}>
                    {inv.careType}
                  </span>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#E8EDF2] text-center">
                    <div>
                      <div className="text-[9.5px] text-[#778FAF] uppercase font-bold">Invoiced</div>
                      <div className="font-bold text-[#0D2B63] text-xs">{formatAmount(inv.amount)}</div>
                    </div>
                    <div>
                      <div className="text-[9.5px] text-[#778FAF] uppercase font-bold">Covered</div>
                      <div className="font-bold text-[#00A878] text-xs">{formatAmount(covered)}</div>
                    </div>
                    <div>
                      <div className="text-[9.5px] text-[#778FAF] uppercase font-bold">Copay</div>
                      <div className="font-bold text-[#0D2B63] text-xs">{formatAmount(copay)}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={() => setViewSlipInvoice(inv)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-700" />
                      <span>View Slip</span>
                    </button>
                    {canDeleteInvoice && (
                      <button
                        onClick={() => setInvoiceToDelete(inv)}
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition cursor-pointer"
                        title="Delete invoice (Admin)"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Full Data Table matching Screenshot — desktop/tablet only, see mobile cards above */}
        <div className="hidden sm:block bg-white rounded-2xl border border-[#E8EDF2] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            {/* === AMÉLIORATION AJOUTÉE : tableau réorganisé pour que chaque ligne (en-tête ET
                contenu) tienne sur une seule ligne — cellules en `whitespace-nowrap`/`truncate`
                au lieu de s'empiler sur 2-3 lignes, alignement vertical centré au lieu de
                `align-top`, padding uniformisé, et intitulés de colonnes allégés
                ("HEALTHCARE FACILITY" → "FACILITY", "ACT & CARE CATEGORY" → "CATEGORY").
                Les informations secondaires (n° de sinistre, date, organisation, médecin,
                libellé détaillé) restent accessibles via une infobulle (title) plutôt que
                d'occuper une ligne supplémentaire. === */}
            <table className="w-full text-left border-collapse min-w-[880px]">
              <thead>
                <tr className="border-b border-[#E8EDF2] bg-[#F8FAFC] text-[11px] font-bold text-[#778FAF] uppercase tracking-wider">
                  <th className="py-3 px-4 whitespace-nowrap">Invoice Ref</th>
                  <th className="py-3 px-4 whitespace-nowrap">Patient</th>
                  <th className="py-3 px-4 whitespace-nowrap">Facility</th>
                  <th className="py-3 px-4 whitespace-nowrap">Category</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Invoiced ($)</th>
                  <th className="py-3 px-4 text-right text-[#00A878] whitespace-nowrap">Covered ($)</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Copay ($)</th>
                  <th className="py-3 px-4 text-center whitespace-nowrap">Status</th>
                  <th className="py-3 px-4 text-center whitespace-nowrap">Actions</th>
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
                    const claimRef = inv.claimId || `SIN-${inv.id.substring(0, 8)}`;

                    return (
                      <tr key={inv.id} className="hover:bg-[#F8FAFC]/80 transition">
                        {/* INVOICE REF — reference + claim + date, all on one line */}
                        <td className="py-3 px-4 align-middle max-w-[190px]" title={`Claim: ${claimRef} • ${inv.serviceDate || '2025-08-18'}`}>
                          <div className="flex items-baseline gap-1.5 truncate">
                            <span className="font-bold text-slate-900 font-mono text-xs">{inv.reference}</span>
                            <span className="text-[10.5px] text-[#778FAF] truncate">
                              {claimRef} · {inv.serviceDate || '2025-08-18'}
                            </span>
                          </div>
                        </td>

                        {/* PATIENT — name + card number on one line, organization as tooltip */}
                        <td className="py-3 px-4 align-middle max-w-[200px]" title={inv.organization}>
                          <div className="flex items-center gap-1.5 truncate">
                            <User className="w-3.5 h-3.5 text-[#778FAF] shrink-0" />
                            <span className="font-bold text-[#0D2B63] truncate">{inv.patientName}</span>
                            <span className="text-[10.5px] font-mono text-slate-500 shrink-0">
                              {inv.patientPolicyNumber || 'ACT-2025-0089'}
                            </span>
                          </div>
                        </td>

                        {/* FACILITY — provider + doctor on one line */}
                        <td className="py-3 px-4 align-middle max-w-[190px]">
                          <div className="truncate">
                            <span className="font-bold text-[#0D2B63]">{inv.provider}</span>
                            <span className="text-[10.5px] text-[#778FAF]"> — {inv.prescribingDoctor || 'Dr. Medical Staff'}</span>
                          </div>
                        </td>

                        {/* CATEGORY — single badge, full description as tooltip */}
                        <td className="py-3 px-4 align-middle max-w-[160px]">
                          <span
                            className="inline-block max-w-full truncate align-bottom px-2 py-0.5 rounded-md bg-[#F8FAFC] border border-[#E8EDF2] text-[10.5px] font-semibold text-[#0D2B63]"
                            title={inv.description || inv.careType}
                          >
                            {inv.careType}
                          </span>
                        </td>

                        {/* INVOICED */}
                        <td className="py-3 px-4 text-right align-middle whitespace-nowrap font-bold text-[#0D2B63] text-[13px]">
                          {formatAmount(inv.amount)}
                        </td>

                        {/* COVERED */}
                        <td className="py-3 px-4 text-right align-middle whitespace-nowrap font-bold text-[#00A878] text-[13px]">
                          {formatAmount(covered)}
                        </td>

                        {/* COPAY */}
                        <td className="py-3 px-4 text-right align-middle whitespace-nowrap font-bold text-[#0D2B63] text-[13px]">
                          {formatAmount(copay)}
                        </td>

                        {/* STATUS */}
                        <td className="py-3 px-4 text-center align-middle whitespace-nowrap">
                          {inv.status === 'valid' || inv.status === 'approved' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#DEFEEB] text-[#00A859] text-[11px] font-bold">
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
                        <td className="py-3 px-4 text-center align-middle whitespace-nowrap">
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
                                title="Delete invoice (Admin)"
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
        </>
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
                    <h3 className="font-bold text-sm text-[var(--brand-900)]">{g.name}</h3>
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
                  <span className="text-base font-extrabold text-[var(--brand-900)]">{formatAmount(g.totalAmount)}</span>
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
      {/* === AMÉLIORATION AJOUTÉE : nouveau modèle "Settlement Slip & Direct Billing Voucher"
          (maquette fournie par l'utilisateur, sur demande explicite) — remplace l'ancien reçu
          "Certified Medical Slip". Le contenu (patient, prestataire, montants, actions
          suppression/impression/téléchargement) reste fonctionnellement identique ; seule la
          présentation change, en écran comme à l'impression/PDF (voir printUtils.ts). */}
      {viewSlipInvoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-[#E8EDF2] max-h-[90vh] overflow-y-auto">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-3 border-b border-[#E8EDF2] p-4 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2 min-w-0">
                <LogoIcon className="w-6 h-6 shrink-0" />
                <div className="min-w-0 leading-tight">
                  <span className="font-bold text-[var(--brand-900)] text-sm">ACTIVA HealthPass</span>
                  <span className="text-slate-300 mx-1.5 hidden sm:inline">|</span>
                  <span className="font-extrabold text-slate-800 uppercase tracking-wide text-[10.5px] block sm:inline">
                    Settlement Slip &amp; Direct Billing Voucher
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <ExportDropdown onExportPDF={() => downloadBordereauPDF(viewSlipInvoice, lang)} />
                <button
                  onClick={() => printBordereauSlip(viewSlipInvoice, lang)}
                  className="p-2 text-[#778FAF] hover:text-[#0D2B63] hover:bg-[#F8FAFC] rounded-lg transition cursor-pointer"
                  title="Print"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewSlipInvoice(null)}
                  className="p-2 text-[#778FAF] hover:text-[#0D2B63] hover:bg-[#F8FAFC] rounded-lg transition cursor-pointer"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Voucher card */}
              <div className="relative overflow-hidden rounded-2xl border border-[#E8EDF2] p-6">
                {slipIsApproved && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                    <span className="border-4 border-emerald-600/25 text-emerald-600/25 font-black text-2xl sm:text-3xl tracking-widest uppercase px-6 py-2 rounded-xl -rotate-[18deg] select-none">
                      Approved &amp; Covered
                    </span>
                  </div>
                )}

                <div className="relative z-[1] flex items-start justify-between gap-4 pb-4 border-b-2 border-slate-900">
                  <div>
                    <div className="flex items-center gap-2">
                      <LogoIcon className="w-7 h-7" />
                      <span className="font-extrabold text-[var(--brand-900)]">ACTIVA HealthPass</span>
                    </div>
                    <p className="text-[10px] text-[#778FAF] mt-0.5">Health • Safety • Serenity</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-[#778FAF] font-bold uppercase tracking-wide">Voucher Reference</p>
                    <p className="font-mono font-bold text-[var(--brand-900)]">{viewSlipInvoice.reference}</p>
                    <p className="text-[10px] text-slate-500 mt-1">Claim Ref: {slipClaimRef}</p>
                  </div>
                </div>

                <div className="relative z-[1] grid grid-cols-2 gap-x-6 gap-y-4 py-5 text-xs">
                  <div>
                    <p className="text-[#778FAF] font-bold uppercase tracking-wide text-[10px]">Beneficiary Name</p>
                    <p className="font-bold text-slate-900 mt-0.5">{viewSlipInvoice.patientName}</p>
                  </div>
                  <div>
                    <p className="text-[#778FAF] font-bold uppercase tracking-wide text-[10px]">Healthcare Facility</p>
                    <p className="font-bold text-slate-900 mt-0.5">{viewSlipInvoice.provider}</p>
                  </div>
                  <div>
                    <p className="text-[#778FAF] font-bold uppercase tracking-wide text-[10px]">HealthPass Card No.</p>
                    <p className="font-mono font-bold text-[var(--brand-900)] mt-0.5">
                      {viewSlipInvoice.cardNo || viewSlipInvoice.patientPolicyNumber || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#778FAF] font-bold uppercase tracking-wide text-[10px]">Date of Service</p>
                    <p className="font-bold text-slate-900 mt-0.5">{viewSlipInvoice.serviceDate || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[#778FAF] font-bold uppercase tracking-wide text-[10px]">Organization</p>
                    <p className="font-bold text-slate-900 mt-0.5">{viewSlipInvoice.organization}</p>
                  </div>
                  <div>
                    <p className="text-[#778FAF] font-bold uppercase tracking-wide text-[10px]">Prescriber / Practitioner</p>
                    <p className="font-bold text-slate-900 mt-0.5">{viewSlipInvoice.prescribingDoctor || 'Medical Staff'}</p>
                  </div>
                </div>

                <div className="relative z-[1] pt-4 border-t border-slate-100">
                  <p className="text-[#778FAF] font-bold uppercase tracking-wide text-[10px] mb-2">
                    Medical Benefits Coverage Breakdown
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] text-[#778FAF] font-bold uppercase tracking-wide border-b border-slate-200">
                          <th className="text-left py-2 pr-2">Act / Service Description</th>
                          <th className="text-left py-2 pr-2">Category</th>
                          <th className="text-right py-2 pr-2">Billed Amount</th>
                          <th className="text-right py-2">Covered Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slipBreakdownRows.map((row, idx) => (
                          <tr key={idx} className="border-b border-slate-50 last:border-0">
                            <td className="py-2 pr-2 font-semibold text-slate-800">{row.description}</td>
                            <td className="py-2 pr-2 text-slate-500">{row.category}</td>
                            <td className="py-2 pr-2 text-right text-slate-700">{formatAmount(row.billed)}</td>
                            <td className="py-2 text-right font-bold text-[#00A859]">{formatAmount(row.covered)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                    onClick={() => downloadBordereauPDF(viewSlipInvoice, lang)}
                    className={`px-4 py-2 ${primaryBtnClass} rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-xs cursor-pointer`}
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Voucher PDF</span>
                  </button>
                  <button
                    onClick={() => setViewSlipInvoice(null)}
                    className="px-4 py-2 bg-[#F8FAFC] hover:bg-slate-100 border border-[#E8EDF2] text-[#0D2B63] rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Close
                  </button>
                </div>
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
                Delete Invoice #{invoiceToDelete.reference}?
              </h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to permanently delete this invoice of {formatAmount(invoiceToDelete.amount)} issued for {invoiceToDelete.patientName} ({invoiceToDelete.provider})?
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800">
              ⚠️ This action is irreversible and will remove the amount from the accounting ledger.
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setInvoiceToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {isDeleting ? (
                  <span>Deleting...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Deletion</span>
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
