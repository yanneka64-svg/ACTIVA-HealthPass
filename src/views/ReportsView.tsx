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
  Wallet,
  ScanSearch,
  Undo2,
  AlertCircle,
} from 'lucide-react';
import { Language, Claim, Organization, Provider, InvoiceItem, HealthPolicy, PolicyPayment, Member } from '../types';
import { useTranslation } from '../i18n/translations';
import { exportReportsToExcel, exportReportsToPDF, exportPoliciesToExcel, exportPolicyDetailToPDF, exportReconciliationToExcel, exportReconciliationToPDF } from '../utils/excelUtils';
import { useCurrency } from '../services/currency';
import { getRoleTheme } from '../theme/roleTheme';
import { ExportDropdown } from '../components/ExportDropdown'; // === AMÉLIORATION AJOUTÉE : bouton Export unique (PDF + Excel) ===
import { getPolicyCoverageStatus } from '../services/policyEngine';
import { dedupeMembersByCardNo } from '../utils/memberUtils';
// === AMÉLIORATION AJOUTÉE : sécurité (audit 2026-09-05, SEC-07) — voir usage de
// `canExportData` ci-dessous.
import { canExportData } from '../services/permissions';
// === AMÉLIORATION AJOUTÉE : protection des données (revue 2026-09-05, section 2.6) — voir
// logExportEvent ci-dessous.
import { auth } from '../lib/firebase';
import { FirestoreService } from '../services/firestore';
// === AMÉLIORATION AJOUTÉE : onglet "Reconciliation" (2026-09-10, sur demande explicite de
// l'utilisateur) — expose en rapport exportable les mêmes chiffres déjà affichés en direct sur
// l'écran Factures (ReconciliationSummary.tsx), derrière le même flag `hp2_reimbursement_tracking`.
import { isFeatureEnabled } from '../config/featureFlags';
import { computeReconciliationSummary } from '../modules/reimbursement/reconciliation';

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
  // === AMÉLIORATION AJOUTÉE : libellés traduits pour le statut de police (HealthPolicyStatus)
  // — la VALEUR stockée/calculée (policy.status, filtres) reste en anglais (type métier), seul
  // le texte affiché (badge, option de filtre) est traduit via cette table.
  const policyStatusLabels: Record<string, string> = {
    Active: t.reports.statusActive,
    'Expiring Soon': t.reports.statusExpiringSoon,
    Expired: t.reports.statusExpired,
    Suspended: t.reports.statusSuspended,
    'Pending Renewal': t.reports.statusPendingRenewal,
  };
  // === AMÉLIORATION AJOUTÉE : même principe que policyStatusLabels ci-dessus, appliqué à la
  // fréquence de paiement (policy.paymentFrequency) — la VALEUR stockée/comparée reste en
  // anglais, seul le texte affiché est traduit.
  const paymentFrequencyLabels: Record<string, string> = {
    Annual: t.reports.freqAnnual,
    'Semi-Annual': t.reports.freqSemiAnnual,
    Quarterly: t.reports.freqQuarterly,
    Monthly: t.reports.freqMonthly,
  };
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
  const reimbursementTrackingEnabled = isFeatureEnabled('hp2_reimbursement_tracking');
  // === AMÉLIORATION AJOUTÉE : protection des données (revue 2026-09-05, section 2.6) ===
  // Constat : les exports en masse (Excel/PDF) ne laissaient aucune trace de qui a exporté
  // quoi ni quand — seul le fait qu'un export ait eu lieu pouvait, au mieux, être déduit
  // indirectement. Journalise désormais chaque export dans `auditLogs` (même schéma métier
  // que les autres actions, voir DATA-03), en tâche de fond, sans jamais bloquer ni ralentir
  // l'export lui-même en cas d'échec de la journalisation.
  const logExportEvent = (format: 'Excel' | 'PDF', reportName: string, recordCount?: number) => {
    FirestoreService.addLog({
      userId: auth.currentUser?.uid || 'unknown',
      userName: auth.currentUser?.displayName || auth.currentUser?.email || 'Unknown',
      userRole: userRole || 'Unknown',
      action: 'DATA_EXPORTED',
      category: 'Reports',
      entityType: reportName,
      details: `Exported "${reportName}" as ${format}${recordCount !== undefined ? ` (${recordCount} record(s))` : ''}.`,
    }).catch(() => {
      // Non-fatal: telemetry must never block or fail the export itself.
    });
  };
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  // === AMÉLIORATION AJOUTÉE : onglet "Policies & Premiums", ajouté sans restructurer le
  // reste de la page (le contenu existant devient l'onglet "Overview", inchangé). ===
  const [activeReportTab, setActiveReportTab] = useState<'overview' | 'policies' | 'reconciliation'>('overview');

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

  // === AMÉLIORATION AJOUTÉE : réconciliation calculée sur les mêmes factures filtrées par
  // plage de dates que le reste de l'écran Rapports (mêmes bornes startDate/endDate),
  // via le moteur déjà utilisé par l'écran Factures (aucun recalcul divergent).
  const reconciliationSummary = useMemo(() => computeReconciliationSummary(filteredInvoices), [filteredInvoices]);
  const reconciliationInvoices = useMemo(
    () => filteredInvoices.filter((i) => i.status === 'valid' || (i.status as string) === 'approved'),
    [filteredInvoices]
  );

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
      logExportEvent('PDF', 'Analytical Reports');
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
      logExportEvent('Excel', 'Analytical Reports');
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
          <span>{t.reports.overviewTab}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveReportTab('policies')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeReportTab === 'policies' ? `${roleTheme.palette.primaryColor} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>{t.reports.policiesPremiumsTab}</span>
          {(policyKpis.suspended + policyKpis.expired) > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
              {policyKpis.suspended + policyKpis.expired}
            </span>
          )}
        </button>
        {reimbursementTrackingEnabled && (
          <button
            type="button"
            onClick={() => setActiveReportTab('reconciliation')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeReportTab === 'reconciliation' ? `${roleTheme.palette.primaryColor} text-white shadow-xs` : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>{t.reports.reconciliationTab}</span>
            {reconciliationSummary.pendingRecoveryCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
                {reconciliationSummary.pendingRecoveryCount}
              </span>
            )}
          </button>
        )}
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
            {t.reports.statsSubtitle}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap xl:flex-nowrap justify-start xl:justify-end">
          {/* Integrated Date Pickers (From / To Calendar) */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition">
            <Calendar className={`w-3.5 h-3.5 ${roleTheme.palette.primaryText}`} />
            <span className="text-xs font-bold text-slate-500">{t.reports.fromLabel}</span>
            <input
              id="report-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition">
            <span className="text-xs font-bold text-slate-500">{t.reports.toLabel}</span>
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
              label={t.reports.exportLabel}
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
            {t.reports.kpiConsolidatedInvoices}
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
            {t.reports.kpiDisbursedCoverage}
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
            {t.reports.kpiTargetSla}
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
            {t.reports.kpiPrescriptionCompliance}
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
              {t.reports.amountsLabel}
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
              {t.reports.accreditedNetwork}
            </span>
            <span className="font-semibold text-slate-600">
              {`${t.reports.totalPrefix} ${providers.length} ${t.reports.centersSuffix}`}
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
              {t.reports.breakdownLabel}
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
              {t.reports.subscribedCompanies}
            </span>
            <span className="font-semibold text-slate-600">
              {`${t.reports.totalPrefix} ${organizations.length} ${t.reports.policiesSuffix}`}
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
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">{t.reports.policyPremiumMonitoringTitle}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{t.reports.policyPremiumMonitoringSubtitle}</p>
            </div>
            {canExport && (
              <ExportDropdown
                lang={lang}
                label={t.reports.exportLabel}
                accentButtonClass={roleTheme.palette.primaryColor}
                onExportExcel={() => {
                  exportPoliciesToExcel(filteredPolicies.map((p) => p.policy));
                  logExportEvent('Excel', 'Health Policies', filteredPolicies.length);
                }}
              />
            )}
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.reports.activePoliciesKpi}</span>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><ShieldCheck className="w-5 h-5" /></div>
              </div>
              <div className="mt-3"><span className="text-2xl font-black text-emerald-600">{policyKpis.active}</span></div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.reports.expiringSoonKpi}</span>
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Clock className="w-5 h-5" /></div>
              </div>
              <div className="mt-3"><span className="text-2xl font-black text-amber-600">{policyKpis.expiringSoon}</span></div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.reports.suspendedPoliciesKpi}</span>
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><AlertTriangle className="w-5 h-5" /></div>
              </div>
              <div className="mt-3"><span className="text-2xl font-black text-rose-600">{policyKpis.suspended}</span></div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.reports.expiredPoliciesKpi}</span>
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center"><XCircle className="w-5 h-5" /></div>
              </div>
              <div className="mt-3"><span className="text-2xl font-black text-red-700">{policyKpis.expired}</span></div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.reports.totalAnnualPremiumKpi}</span>
                <div className={`w-10 h-10 rounded-xl bg-slate-100 ${roleTheme.palette.primaryText} flex items-center justify-center`}><DollarSign className="w-5 h-5" /></div>
              </div>
              <div className="mt-3"><span className="text-2xl font-black text-slate-900">{formatAmount(policyKpis.totalAnnualPremium)}</span></div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.reports.outstandingPremiumKpi}</span>
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><AlertTriangle className="w-5 h-5" /></div>
              </div>
              <div className="mt-3"><span className="text-2xl font-black text-rose-600">{formatAmount(policyKpis.outstandingPremium)}</span></div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.reports.premiumPaidKpi}</span>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><CheckCircle2 className="w-5 h-5" /></div>
              </div>
              <div className="mt-3"><span className="text-2xl font-black text-emerald-600">{formatAmount(policyKpis.premiumPaid)}</span></div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.reports.overduePremiumKpi}</span>
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center"><XCircle className="w-5 h-5" /></div>
              </div>
              <div className="mt-3"><span className="text-2xl font-black text-red-700">{formatAmount(policyKpis.overduePremium)}</span></div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap gap-2.5 items-center">
            <select value={policyOrgFilter} onChange={(e) => setPolicyOrgFilter(e.target.value)} className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
              <option value="ALL">{t.claims.orgFilterAll}</option>
              {organizations.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
            </select>
            <input
              type="text"
              value={policyNumberFilter}
              onChange={(e) => setPolicyNumberFilter(e.target.value)}
              placeholder={t.reports.policyNumberPlaceholder}
              className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400"
            />
            <select value={policyStatusFilter} onChange={(e) => setPolicyStatusFilter(e.target.value)} className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
              <option value="ALL">{t.claims.statusFilterAll}</option>
              <option value="Active">{t.reports.statusActive}</option>
              <option value="Expiring Soon">{t.reports.statusExpiringSoon}</option>
              <option value="Suspended">{t.reports.statusSuspended}</option>
              <option value="Expired">{t.reports.statusExpired}</option>
              <option value="Pending Renewal">{t.reports.statusPendingRenewal}</option>
            </select>
            <select value={policyCurrencyFilter} onChange={(e) => setPolicyCurrencyFilter(e.target.value)} className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
              <option value="ALL">{t.reports.allCurrenciesOption}</option>
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
                {t.reports.noPoliciesConfigured}
              </div>
            ) : (
              <>
              {/* === AMÉLIORATION AJOUTÉE : liste en cartes sous md (retour utilisateur — tableau
                  à 9 colonnes illisible sur petit écran). Mêmes données que le tableau ci-dessous
                  (organisation/prime/statut mis en avant, le reste en second plan), en carte au
                  lieu de colonnes. Tableau desktop inchangé, masqué sous md à la place. === */}
              <div className="md:hidden divide-y divide-slate-100">
                {filteredPolicies.map(({ policy, coverage }) => (
                  <div key={policy.id} onClick={() => setSelectedPolicyDetail(policy)} className="p-4 space-y-2.5 cursor-pointer active:bg-slate-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-800 truncate">{policy.organizationId}</p>
                        <p className="text-[11px] text-slate-500 font-mono">{policy.policyNumber}</p>
                      </div>
                      <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold border ${POLICY_STATUS_BADGE[coverage.status]}`}>{policyStatusLabels[coverage.status] || coverage.status}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span>{policy.effectiveDate} &rarr; {policy.expirationDate}</span>
                      <span className="font-bold text-slate-800">{formatAmount(policy.annualPremium)}{t.reports.perYearSuffix}</span>
                    </div>
                    {(policy.outstandingAmount || 0) > 0 && (
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-500">{t.reports.nextDuePrefix} {policy.nextPaymentDueDate || '—'} &bull; {paymentFrequencyLabels[policy.paymentFrequency] || policy.paymentFrequency}</span>
                        <span className="font-bold text-rose-600">{formatAmount(policy.outstandingAmount || 0)} {t.reports.dueSuffix}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">{t.members.organization}</th>
                      <th className="py-3.5 px-4">{t.reports.colPolicyNumber}</th>
                      <th className="py-3.5 px-4">{t.reports.colEffectiveDate}</th>
                      <th className="py-3.5 px-4">{t.reports.colExpirationDate}</th>
                      <th className="py-3.5 px-4 text-right">{t.reports.colAnnualPremium}</th>
                      <th className="py-3.5 px-4">{t.reports.colPaymentFrequency}</th>
                      <th className="py-3.5 px-4">{t.reports.colNextPaymentDue}</th>
                      <th className="py-3.5 px-4 text-right">{t.reports.colOutstanding}</th>
                      <th className="py-3.5 px-4 text-center">{t.reports.colPolicyStatus}</th>
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
                        <td className="py-3 px-4 text-slate-600">{paymentFrequencyLabels[policy.paymentFrequency] || policy.paymentFrequency}</td>
                        <td className="py-3 px-4 text-slate-600">{policy.nextPaymentDueDate || '—'}</td>
                        <td className="py-3 px-4 text-right font-bold text-rose-600">{formatAmount(policy.outstandingAmount || 0)}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${POLICY_STATUS_BADGE[coverage.status]}`}>{policyStatusLabels[coverage.status] || coverage.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        </>
      )}

      {/* === AMÉLIORATION AJOUTÉE : onglet "Reconciliation" — rapport exportable (Excel/PDF)
          des mêmes chiffres que le panneau "Payment Reconciliation" de l'écran Factures, avec
          en plus le détail facture par facture. === */}
      {activeReportTab === 'reconciliation' && reimbursementTrackingEnabled && (
        <>
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">{t.reports.reconciliationReportTitle}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{t.reports.reconciliationReportSubtitle}</p>
            </div>
            {canExport && (
              <ExportDropdown
                lang={lang}
                label={t.reports.exportLabel}
                accentButtonClass={roleTheme.palette.primaryColor}
                onExportExcel={() => {
                  exportReconciliationToExcel(reconciliationInvoices, reconciliationSummary);
                  logExportEvent('Excel', 'Payment Reconciliation', reconciliationInvoices.length);
                }}
                onExportPDF={() => {
                  exportReconciliationToPDF(reconciliationInvoices, reconciliationSummary);
                  logExportEvent('PDF', 'Payment Reconciliation', reconciliationInvoices.length);
                }}
              />
            )}
          </div>

          {/* KPI Cards — mêmes chiffres et mêmes couleurs que ReconciliationSummary.tsx (écran Factures) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{t.invoices.reconciliationApproved}</p>
              <p className="text-lg font-black text-slate-900 mt-1">{formatAmount(reconciliationSummary.approvedAmount)}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{reconciliationSummary.approvedCount} {t.invoices.invoiceCountSuffix}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {t.invoices.paidBadge}
              </p>
              <p className="text-lg font-black text-emerald-700 mt-1">{formatAmount(reconciliationSummary.paidAmount)}</p>
              <p className="text-[11px] text-emerald-600/80 mt-0.5">{reconciliationSummary.paidCount} {t.invoices.invoiceCountSuffix}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {t.invoices.outstandingBadge}
              </p>
              <p className="text-lg font-black text-amber-700 mt-1">{formatAmount(reconciliationSummary.outstandingAmount)}</p>
              <p className="text-[11px] text-amber-600/80 mt-0.5">{reconciliationSummary.outstandingCount} {t.invoices.invoiceCountSuffix}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-orange-50 border border-orange-200">
              <p className="text-[10px] font-bold text-orange-700 uppercase tracking-wide flex items-center gap-1">
                <ScanSearch className="w-3 h-3" /> {t.invoices.reconciliationRefacted}
              </p>
              <p className="text-lg font-black text-orange-700 mt-1">{formatAmount(reconciliationSummary.refactedAmount)}</p>
              <p className="text-[11px] text-orange-600/80 mt-0.5">{reconciliationSummary.refactedCount} {t.invoices.invoiceCountSuffix}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200">
              <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wide flex items-center gap-1">
                <Undo2 className="w-3 h-3" /> {t.invoices.reconciliationPendingRecovery}
              </p>
              <p className="text-lg font-black text-rose-700 mt-1">{formatAmount(reconciliationSummary.pendingRecoveryAmount)}</p>
              <p className="text-[11px] text-rose-600/80 mt-0.5">{reconciliationSummary.pendingRecoveryCount} {t.invoices.invoiceCountSuffix}</p>
            </div>
          </div>

          {/* Invoice-level detail table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {reconciliationInvoices.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs font-medium">
                {t.reports.noApprovedInvoicesRange}
              </div>
            ) : (
              <>
              <div className="md:hidden divide-y divide-slate-100">
                {reconciliationInvoices.map((inv) => (
                  <div key={inv.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-800 truncate">{inv.reference}</p>
                        <p className="text-[11px] text-slate-500 truncate">{inv.organization}</p>
                      </div>
                      <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold border ${inv.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {inv.paymentStatus === 'paid' ? t.invoices.paidBadge : t.invoices.outstandingBadge}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span>{inv.provider}</span>
                      <span className="font-bold text-slate-800">{formatAmount(inv.payableAmountUSD ?? inv.amount)}</span>
                    </div>
                    {inv.refactionApplied && (
                      <div className="text-[11px] text-orange-700 font-semibold">
                        {t.invoices.reconciliationRefacted} {formatAmount(inv.refactionTotalUSD || 0)}
                        {(inv.refactionTotalUSD || 0) - (inv.recoveredTotalUSD || 0) > 0 && ` — ${formatAmount((inv.refactionTotalUSD || 0) - (inv.recoveredTotalUSD || 0))} ${t.reports.pendingRecoverySuffix}`}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">{t.reports.colReference}</th>
                      <th className="py-3.5 px-4">{t.members.organization}</th>
                      <th className="py-3.5 px-4">{t.reports.colProvider}</th>
                      <th className="py-3.5 px-4 text-right">{t.reports.colPayableAmount}</th>
                      <th className="py-3.5 px-4 text-center">{t.reports.colPaymentStatus}</th>
                      <th className="py-3.5 px-4 text-right">{t.invoices.reconciliationRefacted}</th>
                      <th className="py-3.5 px-4 text-right">{t.invoices.reconciliationPendingRecovery}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reconciliationInvoices.map((inv) => {
                      const pendingRecovery = inv.refactionApplied ? Math.max(0, (inv.refactionTotalUSD || 0) - (inv.recoveredTotalUSD || 0)) : 0;
                      return (
                        <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-800">{inv.reference}</td>
                          <td className="py-3 px-4 text-slate-600 truncate max-w-[160px]">{inv.organization}</td>
                          <td className="py-3 px-4 text-slate-600 truncate max-w-[160px]">{inv.provider}</td>
                          <td className="py-3 px-4 text-right font-bold text-slate-800">{formatAmount(inv.payableAmountUSD ?? inv.amount)}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${inv.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                              {inv.paymentStatus === 'paid' ? t.invoices.paidBadge : t.invoices.outstandingBadge}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-orange-700 font-semibold">{inv.refactionApplied ? formatAmount(inv.refactionTotalUSD || 0) : '—'}</td>
                          <td className="py-3 px-4 text-right text-rose-700 font-semibold">{pendingRecovery > 0 ? formatAmount(pendingRecovery) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
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
                <h3 className="text-base font-black text-slate-900">{t.reports.policyDetailsTitle}</h3>
                <p className="text-xs text-slate-500">{selectedPolicyDetail.organizationId} — {selectedPolicyDetail.policyNumber}</p>
              </div>
              <button onClick={() => setSelectedPolicyDetail(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${POLICY_STATUS_BADGE[detailCoverage.status]}`}>{policyStatusLabels[detailCoverage.status] || detailCoverage.status}</span>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-slate-400 font-bold block">{t.reports.coveragePeriod}</span><span className="font-semibold text-slate-800">{selectedPolicyDetail.effectiveDate} → {selectedPolicyDetail.expirationDate}</span></div>
                <div><span className="text-slate-400 font-bold block">{t.reports.colAnnualPremium}</span><span className="font-semibold text-slate-800">{formatAmount(selectedPolicyDetail.annualPremium)}</span></div>
                <div><span className="text-slate-400 font-bold block">{t.reports.colPaymentFrequency}</span><span className="font-semibold text-slate-800">{paymentFrequencyLabels[selectedPolicyDetail.paymentFrequency] || selectedPolicyDetail.paymentFrequency}</span></div>
                <div><span className="text-slate-400 font-bold block">{t.reports.installmentAmount}</span><span className="font-semibold text-slate-800">{formatAmount(selectedPolicyDetail.installmentAmount)}</span></div>
                <div><span className="text-slate-400 font-bold block">{t.reports.outstandingAmountLabel}</span><span className="font-semibold text-rose-700">{formatAmount(selectedPolicyDetail.outstandingAmount || 0)}</span></div>
              </div>

              {selectedPolicyDetail.paymentFrequency === 'Quarterly' && (
                <div className="grid grid-cols-4 gap-2">
                  {([1, 2, 3, 4] as const).map((q) => {
                    const p = detailPayments.find((pp) => pp.quarter === q);
                    const status = p?.status || t.pending;
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
                <div className="flex items-center gap-2"><Users className="w-4 h-4 text-slate-600" /><span className="text-xs font-extrabold text-slate-800">{t.reports.coveredPopulation}</span></div>
                <span className="text-xs font-bold text-slate-600">{detailCoveredMembers.principals} {t.reports.principalSuffix} &bull; {detailCoveredMembers.dependents} {t.reports.dependentsSuffix} &bull; {detailCoveredMembers.principals + detailCoveredMembers.dependents} {t.reports.totalSuffix}</span>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2.5 shrink-0">
              {canExport && (
                <ExportDropdown
                  lang={lang}
                  label={t.reports.exportLabel}
                  onExportExcel={() => {
                    exportPoliciesToExcel([selectedPolicyDetail]);
                    logExportEvent('Excel', `Policy Detail (${selectedPolicyDetail.organizationId})`);
                  }}
                  onExportPDF={() => {
                    exportPolicyDetailToPDF(selectedPolicyDetail, detailPayments, detailCoveredMembers.principals, detailCoveredMembers.dependents);
                    logExportEvent('PDF', `Policy Detail (${selectedPolicyDetail.organizationId})`);
                  }}
                />
              )}
              {/* === AMÉLIORATION AJOUTÉE : harmonisation des couleurs de boutons — ce bouton
                  "Close" était figé en gris (bg-slate-800), désormais aligné sur
                  roleTheme.palette.primaryColor comme les autres boutons de cette vue. === */}
              <button onClick={() => setSelectedPolicyDetail(null)} className={`px-5 py-2 rounded-xl ${roleTheme.palette.primaryColor} text-white text-xs font-bold cursor-pointer`}>{t.close}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
