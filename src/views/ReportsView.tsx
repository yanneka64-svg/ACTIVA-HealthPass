import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  Building,
  Stethoscope,
  TrendingUp,
  Clock,
  CheckCircle2,
  DollarSign,
  Calendar,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Users,
  X,
} from 'lucide-react';
import { Language, Claim, Organization, Provider, InvoiceItem, HealthPolicy, PolicyPayment, Member } from '../types';
import { useTranslation } from '../i18n/translations';
import { exportReportsToExcel, exportReportsToPDF, exportPoliciesToExcel, exportPolicyDetailToPDF } from '../utils/excelUtils';
import { useCurrency } from '../services/currency';
import { getRoleTheme } from '../theme/roleTheme';
import { ExportDropdown } from '../components/ExportDropdown'; // === AMÉLIORATION AJOUTÉE : bouton Export unique (PDF + Excel) ===
import { getPolicyCoverageStatus } from '../services/policyEngine';
import { dedupeMembersByCardNo } from '../utils/memberUtils';
// === AMÉLIORATION AJOUTÉE : sécurité (audit 2026-09-05, SEC-07) — voir usage de
// `canExportData` ci-dessous.
import { canExportData } from '../services/permissions';

interface ReportsViewProps {
  lang: Language;
  claims: Claim[];
  invoices: InvoiceItem[];
  organizations: Organization[];
  providers: Provider[];
  // === AMÉLIORATION AJOUTÉE : rôle actif, utilisé pour aligner les couleurs des graphiques
  // (Recharts) sur la teinte de marque du rôle au lieu du bleu Activa codé en dur.
  userRole?: string;
  // === AMÉLIORATION AJOUTÉE : Health Insurance Policy Management & Premium Monitoring ===
  healthPolicies?: HealthPolicy[];
  policyPayments?: PolicyPayment[];
  members?: Member[];
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  lang,
  claims,
  invoices,
  organizations,
  providers,
  userRole = 'Admin',
  healthPolicies = [],
  policyPayments = [],
  members = [],
}) => {
  const t = useTranslation(lang);
  const { formatAmount } = useCurrency();
  // === AMÉLIORATION AJOUTÉE : couleurs alignées sur le rôle connecté (gris Admin / teal
  // Supervisor) au lieu du bleu marine Agent affiché en dur auparavant.
  const roleTheme = getRoleTheme(userRole);
  // === AMÉLIORATION AJOUTÉE : sécurité (audit 2026-09-05, SEC-07) ===
  // Constat : la matrice de permissions (permissions.ts) réserve l'export de données à
  // Supervisor/Admin (Agent: export = false), mais `canExportData()` n'était jamais appelée
  // dans cet écran — seul le menu latéral (Sidebar.tsx) masquait l'ONGLET "Reports" pour un
  // Agent, sans empêcher le rendu de ce composant ni de ses boutons d'export si la section
  // active était atteinte par un autre chemin (état React, navigation programmatique). Défense
  // en profondeur : les boutons d'export ne sont désormais rendus QUE pour un rôle autorisé.
  const canExport = canExportData(userRole);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  // === AMÉLIORATION AJOUTÉE : onglet "Policies & Premiums", ajouté sans restructurer le
  // reste de la page (le contenu existant devient l'onglet "Overview", inchangé). ===
  const [activeReportTab, setActiveReportTab] = useState<'overview' | 'policies'>('overview');

  // Policy filters
  const [policyOrgFilter, setPolicyOrgFilter] = useState('ALL');
  const [policyNumberFilter, setPolicyNumberFilter] = useState('');
  const [policyStatusFilter, setPolicyStatusFilter] = useState('ALL');
  const [policyCurrencyFilter, setPolicyCurrencyFilter] = useState('ALL');
  const [selectedPolicyDetail, setSelectedPolicyDetail] = useState<HealthPolicy | null>(null);

  // Live-computed status for every policy (never trust the stored status field alone)
  const livePolicies = useMemo(
    () => healthPolicies.map((p) => ({ policy: p, coverage: getPolicyCoverageStatus(p) })),
    [healthPolicies]
  );

  const filteredPolicies = useMemo(() => {
    return livePolicies.filter(({ policy, coverage }) => {
      if (policyOrgFilter !== 'ALL' && policy.organizationId !== policyOrgFilter) return false;
      if (policyNumberFilter && !policy.policyNumber.toLowerCase().includes(policyNumberFilter.toLowerCase())) return false;
      if (policyStatusFilter !== 'ALL' && coverage.status !== policyStatusFilter) return false;
      if (policyCurrencyFilter !== 'ALL' && policy.currency !== policyCurrencyFilter) return false;
      return true;
    });
  }, [livePolicies, policyOrgFilter, policyNumberFilter, policyStatusFilter, policyCurrencyFilter]);

  const policyKpis = useMemo(() => {
    const active = livePolicies.filter((p) => p.coverage.status === 'Active').length;
    const expiringSoon = livePolicies.filter((p) => p.coverage.status === 'Expiring Soon').length;
    const suspended = livePolicies.filter((p) => p.coverage.status === 'Suspended').length;
    const expired = livePolicies.filter((p) => p.coverage.status === 'Expired').length;
    const totalAnnualPremium = healthPolicies.reduce((sum, p) => sum + (p.annualPremium || 0), 0);
    const outstandingPremium = healthPolicies.reduce((sum, p) => sum + (p.outstandingAmount || 0), 0);
    const premiumPaid = policyPayments.filter((p) => p.status === 'Paid' || p.status === 'Partially Paid').reduce((sum, p) => sum + (p.amountPaid || 0), 0);
    const overduePremium = policyPayments.filter((p) => p.status === 'Overdue').reduce((sum, p) => sum + (p.amountDue - p.amountPaid), 0);
    return { active, expiringSoon, suspended, expired, totalAnnualPremium, outstandingPremium, premiumPaid, overduePremium };
  }, [livePolicies, healthPolicies, policyPayments]);

  const detailCoverage = selectedPolicyDetail ? getPolicyCoverageStatus(selectedPolicyDetail) : null;
  const detailPayments = useMemo(
    () => (selectedPolicyDetail ? policyPayments.filter((p) => p.policyId === selectedPolicyDetail.organizationId) : []),
    [selectedPolicyDetail, policyPayments]
  );
  const detailCoveredMembers = useMemo(() => {
    if (!selectedPolicyDetail) return { principals: 0, dependents: 0 };
    const orgMembers = dedupeMembersByCardNo(
      members.filter((m) => m.organization?.toLowerCase().trim() === selectedPolicyDetail.organizationId.toLowerCase().trim())
    );
    const dependents = orgMembers.reduce(
      (sum, m) => sum + ((m.dependents?.length || 0) + (m.children?.length || 0) + (m.spouseName ? 1 : 0)),
      0
    );
    return { principals: orgMembers.length, dependents };
  }, [selectedPolicyDetail, members]);

  const POLICY_STATUS_BADGE: Record<string, string> = {
    Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'Expiring Soon': 'bg-amber-50 text-amber-700 border-amber-200',
    Suspended: 'bg-rose-50 text-rose-700 border-rose-200',
    Expired: 'bg-red-100 text-red-800 border-red-300',
    'Pending Renewal': 'bg-slate-100 text-slate-600 border-slate-200',
  };

  // Date Range Filtering State (Calendar only)
  const defaultStartDate = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  }, []);
  
  const defaultEndDate = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);

  // Filtered Claims
  const filteredClaims = useMemo(() => {
    return claims.filter((c) => {
      const date = c.serviceDate || c.submissionDate;
      if (!date) return true;
      if (startDate && date < startDate) return false;
      if (endDate && date > endDate) return false;
      return true;
    });
  }, [claims, startDate, endDate]);

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((i) => {
      const date = i.serviceDate || i.submissionDate || i.period;
      if (!date) return true;
      if (startDate && date < startDate) return false;
      if (endDate && date > endDate) return false;
      return true;
    });
  }, [invoices, startDate, endDate]);

  // Consolidated statistics calculations
  const totalBilled = useMemo(() => {
    const invTotal = filteredInvoices.reduce((sum, i) => sum + i.amount, 0);
    return invTotal > 0 ? invTotal : filteredClaims.reduce((sum, c) => sum + c.amount, 0);
  }, [filteredInvoices, filteredClaims]);

  const totalReimbursed = useMemo(() => {
    return filteredClaims
      .filter((c) => c.status === 'approved')
      .reduce((sum, c) => sum + c.amount, 0);
  }, [filteredClaims]);

  // === AMÉLIORATION AJOUTÉE : temps de traitement moyen calculé à partir des vraies dates
  // de soumission/décision des sinistres, au lieu d'une valeur fixe "1.8 day(s)" jamais
  // recalculée. Affiche "—" tant qu'aucune décision avec les deux dates n'est disponible,
  // plutôt que d'inventer un chiffre.
  const avgProcessingTime = useMemo(() => {
    const durationsMs: number[] = [];
    filteredClaims.forEach((c) => {
      if (c.status === 'pending' || !c.submissionDate || !c.decisionDate) return;
      const submitted = new Date(c.submissionDate).getTime();
      const decided = new Date(c.decisionDate).getTime();
      if (!isNaN(submitted) && !isNaN(decided) && decided >= submitted) {
        durationsMs.push(decided - submitted);
      }
    });
    if (durationsMs.length === 0) return '—';
    const avgMs = durationsMs.reduce((sum, d) => sum + d, 0) / durationsMs.length;
    const avgDays = avgMs / (1000 * 60 * 60 * 24);
    return `${avgDays.toFixed(1)} day(s)`;
  }, [filteredClaims]);
  const totalDecisions = filteredClaims.filter((c) => c.status !== 'pending').length || 1;
  const rejectedCount = filteredClaims.filter((c) => c.status === 'rejected').length;
  const rejectionRate = Math.round((rejectedCount / totalDecisions) * 100) + ' %';

  // Provider Distribution
  const providerDistribution = useMemo(() => {
    return providers.map((prv) => {
      const pClaims = filteredClaims.filter(
        (c) => c.provider?.toLowerCase() === prv.name.toLowerCase()
      );
      const amount = pClaims.reduce((sum, c) => sum + c.amount, 0);
      return {
        provider: prv.name,
        type: prv.type,
        amount: amount,
        count: pClaims.length,
      };
    }).sort((a, b) => b.amount - a.amount);
  }, [providers, filteredClaims]);

  const maxProviderAmount = useMemo(() => {
    return Math.max(...providerDistribution.map((p) => p.amount), 1);
  }, [providerDistribution]);

  // Organization Distribution
  const orgDistribution = useMemo(() => {
    return organizations.map((org) => {
      const oClaims = filteredClaims.filter(
        (c) => c.organization?.toLowerCase() === org.name.toLowerCase()
      );
      const amount = oClaims.reduce((sum, c) => sum + c.amount, 0);
      return {
        org: org.name,
        policy: org.policyNumber,
        amount: amount,
        count: oClaims.length,
      };
    }).sort((a, b) => b.amount - a.amount);
  }, [organizations, filteredClaims]);

  const maxOrgAmount = useMemo(() => {
    return Math.max(...orgDistribution.map((o) => o.amount), 1);
  }, [orgDistribution]);

  // Handler: Export PDF
  const handleExportPDF = async () => {
    setIsExportingPdf(true);
    try {
      await new Promise((r) => setTimeout(r, 400));
      exportReportsToPDF(
        {
          totalBilled,
          totalReimbursed,
          avgTime: avgProcessingTime,
          rejectionRate,
        },
        providerDistribution,
        orgDistribution,
        lang
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Handler: Export Excel
  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    try {
      await new Promise((r) => setTimeout(r, 300));
      exportReportsToExcel(providerDistribution, orgDistribution, lang);
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* === AMÉLIORATION AJOUTÉE : bascule Overview / Policies & Premiums — le contenu
          existant (bandeau + KPI + graphiques) devient l'onglet "Overview", entièrement
          inchangé ; "Policies & Premiums" est le nouvel onglet du module de gestion des
          polices d'assurance santé et suivi des primes. === */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-xs inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setActiveReportTab('overview')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeReportTab === 'overview' ? `${roleTheme.palette.primaryColor} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Overview</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveReportTab('policies')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeReportTab === 'policies' ? `${roleTheme.palette.primaryColor} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Policies &amp; Premiums</span>
          {(policyKpis.suspended + policyKpis.expired) > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
              {policyKpis.suspended + policyKpis.expired}
            </span>
          )}
        </button>
      </div>

      {activeReportTab === 'overview' && (
      <>
      {/* Top Action Bar with integrated Calendar Date Range and Export Buttons */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
            {t.reports.title}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Statistical analytics, expenditure insights, and medical claims consolidation
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap xl:flex-nowrap justify-start xl:justify-end">
          {/* Integrated Date Pickers (From / To Calendar) */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition">
            <Calendar className={`w-3.5 h-3.5 ${roleTheme.palette.primaryText}`} />
            <span className="text-xs font-bold text-slate-500">From:</span>
            <input
              id="report-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition">
            <span className="text-xs font-bold text-slate-500">To:</span>
            <input
              id="report-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            />
          </div>

          <div className="h-6 w-px bg-slate-200 hidden sm:block mx-0.5"></div>

          {/* === AMÉLIORATION AJOUTÉE : "Export to PDF" et "Export to Excel (.xlsx)" fusionnés
              en un seul bouton "Export" (menu déroulant), coloré par rôle — gris Admin /
              vert Superviseur, alignés sur la couleur de la bande de menu (roleTheme.palette.primaryColor) === */}
          {canExport && (
            <ExportDropdown
              lang={lang}
              label="Export"
              accentButtonClass={roleTheme.palette.primaryColor}
              onExportPDF={handleExportPDF}
              onExportExcel={handleExportExcel}
            />
          )}
        </div>
      </div>

      {/* 4 Stats KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
        {/* Card 1: Total Billed */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {t.reports.totalBilled}
            </span>
            <div className={`w-10 h-10 rounded-xl bg-slate-100 ${roleTheme.palette.primaryText} flex items-center justify-center`}>
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900">
              {formatAmount(totalBilled)}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1 font-medium">
            {'Consolidated submitted invoices'}
          </p>
        </div>

        {/* Card 2: Total Reimbursed */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {t.reports.totalReimbursed}
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#00A859] flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-[#00A859]">
              {formatAmount(totalReimbursed)}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1 font-medium">
            {'Disbursed insurance coverage'}
          </p>
        </div>

        {/* Card 3: Average Processing Turnaround */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {t.reports.avgProcessingTime}
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900">{avgProcessingTime}</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1 font-medium">
            {'Target SLA turnaround < 48h'}
          </p>
        </div>

        {/* Card 4: Rejection Rate */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {t.reports.rejectionRate}
            </span>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-rose-600">{rejectionRate}</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1 font-medium">
            {'Prescription compliance rate'}
          </p>
        </div>
      </div>

      {/* 2 Horizontal Bar Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Horizontal Bar Chart 1: Invoicing by Provider */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg bg-slate-100 ${roleTheme.palette.primaryText} flex items-center justify-center`}>
                <Stethoscope className="w-4 h-4" />
              </div>
              <h3 className="font-extrabold text-sm text-slate-900">
                {t.reports.invoicesByProvider}
              </h3>
            </div>
            <span className="text-[11px] font-bold text-slate-400">
              {'Amounts'}
            </span>
          </div>

          <div className="space-y-4">
            {providerDistribution.map((item, idx) => {
              const widthPct = Math.max(Math.round((item.amount / maxProviderAmount) * 100), 5);
              return (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 truncate max-w-[240px]">
                      {item.provider}
                    </span>
                    <span className="font-black text-slate-900">
                      {formatAmount(item.amount)}
                    </span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: idx % 2 === 0 ? roleTheme.palette.sidebarBg : '#00A859',
                      }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 mt-6 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              {'Accredited provider network'}
            </span>
            <span className="font-semibold text-slate-600">
              {`Total: ${providers.length} centers`}
            </span>
          </div>
        </div>

        {/* Horizontal Bar Chart 2: Invoicing by Organization */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#00A859] flex items-center justify-center">
                <Building className="w-4 h-4" />
              </div>
              <h3 className="font-extrabold text-sm text-slate-900">{t.reports.invoicesByOrg}</h3>
            </div>
            <span className="text-[11px] font-bold text-slate-400">
              {'Breakdown'}
            </span>
          </div>

          <div className="space-y-4">
            {orgDistribution.map((item, idx) => {
              const widthPct = Math.max(Math.round((item.amount / maxOrgAmount) * 100), 5);
              return (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 truncate max-w-[240px]">
                      {item.org}
                    </span>
                    <span className="font-black text-slate-900">
                      {formatAmount(item.amount)}
                    </span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: idx % 2 === 0 ? '#00A859' : roleTheme.palette.sidebarBg,
                      }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 mt-6 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              {'Subscribed companies & policies'}
            </span>
            <span className="font-semibold text-slate-600">
              {`Total: ${organizations.length} policies`}
            </span>
          </div>
        </div>
      </div>
      </>
      )}

      {/* === AMÉLIORATION AJOUTÉE : onglet "Policies & Premiums" — KPI, filtres, tableau et
          panneau de détail par police, sans toucher au reste de la page Reports. === */}
      {activeReportTab === 'policies' && (
        <>
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">Policy & Premium Monitoring</h2>
              <p className="text-xs text-slate-500 mt-0.5">Automatic policy status, premium schedules, and payment tracking across all organizations</p>
            </div>
            {canExport && (
              <ExportDropdown
                lang={lang}
                label="Export"
                accentButtonClass={roleTheme.palette.primaryColor}
                onExportExcel={() => exportPoliciesToExcel(filteredPolicies.map((p) => p.policy))}
              />
            )}
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Policies</span>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><ShieldCheck className="w-5 h-5" /></div>
              </div>
              <div className="mt-3"><span className="text-2xl font-black text-emerald-600">{policyKpis.active}</span></div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Expiring Soon</span>
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Clock className="w-5 h-5" /></div>
              </div>
              <div className="mt-3"><span className="text-2xl font-black text-amber-600">{policyKpis.expiringSoon}</span></div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Suspended Policies</span>
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><AlertTriangle className="w-5 h-5" /></div>
              </div>
              <div className="mt-3"><span className="text-2xl font-black text-rose-600">{policyKpis.suspended}</span></div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Expired Policies</span>
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center"><XCircle className="w-5 h-5" /></div>
              </div>
              <div className="mt-3"><span className="text-2xl font-black text-red-700">{policyKpis.expired}</span></div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Annual Premium</span>
                <div className={`w-10 h-10 rounded-xl bg-slate-100 ${roleTheme.palette.primaryText} flex items-center justify-center`}><DollarSign className="w-5 h-5" /></div>
              </div>
              <div className="mt-3"><span className="text-2xl font-black text-slate-900">{formatAmount(policyKpis.totalAnnualPremium)}</span></div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Outstanding Premium</span>
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><AlertTriangle className="w-5 h-5" /></div>
              </div>
              <div className="mt-3"><span className="text-2xl font-black text-rose-600">{formatAmount(policyKpis.outstandingPremium)}</span></div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Premium Paid</span>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><CheckCircle2 className="w-5 h-5" /></div>
              </div>
              <div className="mt-3"><span className="text-2xl font-black text-emerald-600">{formatAmount(policyKpis.premiumPaid)}</span></div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Overdue Premium</span>
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center"><XCircle className="w-5 h-5" /></div>
              </div>
              <div className="mt-3"><span className="text-2xl font-black text-red-700">{formatAmount(policyKpis.overduePremium)}</span></div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap gap-2.5 items-center">
            <select value={policyOrgFilter} onChange={(e) => setPolicyOrgFilter(e.target.value)} className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
              <option value="ALL">All Organizations</option>
              {organizations.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
            </select>
            <input
              type="text"
              value={policyNumberFilter}
              onChange={(e) => setPolicyNumberFilter(e.target.value)}
              placeholder="Policy number..."
              className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400"
            />
            <select value={policyStatusFilter} onChange={(e) => setPolicyStatusFilter(e.target.value)} className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
              <option value="ALL">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Expiring Soon">Expiring Soon</option>
              <option value="Suspended">Suspended</option>
              <option value="Expired">Expired</option>
              <option value="Pending Renewal">Pending Renewal</option>
            </select>
            <select value={policyCurrencyFilter} onChange={(e) => setPolicyCurrencyFilter(e.target.value)} className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
              <option value="ALL">All Currencies</option>
              <option value="USD">USD</option>
              <option value="LRD">LRD</option>
              <option value="XAF">XAF</option>
              <option value="XOF">XOF</option>
              <option value="GHS">GHS</option>
              <option value="GNF">GNF</option>
              <option value="SLE">SLE</option>
            </select>
          </div>

          {/* Policy table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {filteredPolicies.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs font-medium">
                No health insurance policies configured yet. Open an organization's "Policy" button to configure one.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Organization</th>
                      <th className="py-3.5 px-4">Policy Number</th>
                      <th className="py-3.5 px-4">Effective Date</th>
                      <th className="py-3.5 px-4">Expiration Date</th>
                      <th className="py-3.5 px-4 text-right">Annual Premium</th>
                      <th className="py-3.5 px-4">Payment Frequency</th>
                      <th className="py-3.5 px-4">Next Payment Due</th>
                      <th className="py-3.5 px-4 text-right">Outstanding</th>
                      <th className="py-3.5 px-4 text-center">Policy Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPolicies.map(({ policy, coverage }) => (
                      <tr key={policy.id} onClick={() => setSelectedPolicyDetail(policy)} className="hover:bg-slate-50 cursor-pointer transition">
                        <td className="py-3 px-4 font-bold text-slate-800">{policy.organizationId}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-700">{policy.policyNumber}</td>
                        <td className="py-3 px-4 text-slate-600">{policy.effectiveDate}</td>
                        <td className="py-3 px-4 text-slate-600">{policy.expirationDate}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-800">{formatAmount(policy.annualPremium)}</td>
                        <td className="py-3 px-4 text-slate-600">{policy.paymentFrequency}</td>
                        <td className="py-3 px-4 text-slate-600">{policy.nextPaymentDueDate || '—'}</td>
                        <td className="py-3 px-4 text-right font-bold text-rose-600">{formatAmount(policy.outstandingAmount || 0)}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold border ${POLICY_STATUS_BADGE[coverage.status]}`}>{coverage.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* === AMÉLIORATION AJOUTÉE : panneau de détail d'une police (spec item 9), avec export
          Excel/PDF individuel — s'ouvre au clic sur une ligne du tableau ci-dessus. === */}
      {selectedPolicyDetail && detailCoverage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[88vh]">
            <div className="px-6 py-4.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black text-slate-900">Policy Details</h3>
                <p className="text-xs text-slate-500">{selectedPolicyDetail.organizationId} — {selectedPolicyDetail.policyNumber}</p>
              </div>
              <button onClick={() => setSelectedPolicyDetail(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${POLICY_STATUS_BADGE[detailCoverage.status]}`}>{detailCoverage.status}</span>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-slate-400 font-bold block">Coverage Period</span><span className="font-semibold text-slate-800">{selectedPolicyDetail.effectiveDate} → {selectedPolicyDetail.expirationDate}</span></div>
                <div><span className="text-slate-400 font-bold block">Annual Premium</span><span className="font-semibold text-slate-800">{formatAmount(selectedPolicyDetail.annualPremium)}</span></div>
                <div><span className="text-slate-400 font-bold block">Payment Frequency</span><span className="font-semibold text-slate-800">{selectedPolicyDetail.paymentFrequency}</span></div>
                <div><span className="text-slate-400 font-bold block">Installment Amount</span><span className="font-semibold text-slate-800">{formatAmount(selectedPolicyDetail.installmentAmount)}</span></div>
                <div><span className="text-slate-400 font-bold block">Outstanding Amount</span><span className="font-semibold text-rose-700">{formatAmount(selectedPolicyDetail.outstandingAmount || 0)}</span></div>
              </div>

              {selectedPolicyDetail.paymentFrequency === 'Quarterly' && (
                <div className="grid grid-cols-4 gap-2">
                  {([1, 2, 3, 4] as const).map((q) => {
                    const p = detailPayments.find((pp) => pp.quarter === q);
                    const status = p?.status || 'Pending';
                    return (
                      <div key={q} className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-center">
                        <div className="text-[10px] font-black uppercase text-slate-400">Q{q}</div>
                        <div className="text-[11px] font-bold text-slate-700">{status}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2"><Users className="w-4 h-4 text-slate-600" /><span className="text-xs font-extrabold text-slate-800">Covered Population</span></div>
                <span className="text-xs font-bold text-slate-600">{detailCoveredMembers.principals} principal &bull; {detailCoveredMembers.dependents} dependents &bull; {detailCoveredMembers.principals + detailCoveredMembers.dependents} total</span>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2.5 shrink-0">
              {canExport && (
                <ExportDropdown
                  lang={lang}
                  label="Export"
                  onExportExcel={() => exportPoliciesToExcel([selectedPolicyDetail])}
                  onExportPDF={() => exportPolicyDetailToPDF(selectedPolicyDetail, detailPayments, detailCoveredMembers.principals, detailCoveredMembers.dependents)}
                />
              )}
              <button onClick={() => setSelectedPolicyDetail(null)} className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold cursor-pointer">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
