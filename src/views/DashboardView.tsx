import React from 'react';
import {
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  ArrowUpRight,
  ShieldAlert,
  Image as ImageIcon,
  Fingerprint,
  Building,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  DollarSign,
  Coins,
  ArrowRightLeft,
  Sparkles,
} from 'lucide-react';
import { Language, Claim, Enrollment, Member, Organization, Provider, NavSection } from '../types';
import { useTranslation } from '../i18n/translations';
import { useCurrency, CurrencyMode } from '../services/currency';
import { canApproveRecord } from '../services/permissions';
import { dedupeMembersByCardNo } from '../utils/memberUtils';

interface DashboardViewProps {
  lang?: Language;
  userRole?: string;
  currentUser?: any;
  claims: Claim[];
  enrollments: Enrollment[];
  members: Member[];
  organizations: Organization[];
  providers: Provider[];
  onNavigate: (section: NavSection) => void;
  onApproveClaim: (claimId: string) => void;
  onRejectClaim: (claim: Claim) => void;
  onApproveEnrollment: (enrId: string) => void;
  onRejectEnrollment: (enr: Enrollment) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  userRole = 'Admin',
  currentUser,
  claims,
  enrollments,
  members,
  organizations,
  providers,
  onNavigate,
  onApproveClaim,
  onRejectClaim,
  onApproveEnrollment,
  onRejectEnrollment,
}) => {
  const t = useTranslation('en');
  const { mode: currencyMode, setMode: setCurrencyMode, formatAmount, exchangeRate } = useCurrency();

  const normalizedRole = (userRole || 'Admin').toLowerCase();
  const isAgent = normalizedRole.includes('agent');
  const isSupervisor = normalizedRole.includes('supervis');
  const isAdmin = !isAgent && !isSupervisor;

  // Agent Specific Metrics
  const myClaims = claims.filter((c) => {
    if (!currentUser) return true;
    return (
      c.createdBy === currentUser.uid ||
      (c.creatorEmail && c.creatorEmail.toLowerCase() === currentUser.email?.toLowerCase()) ||
      (c.creatorName && c.creatorName.toLowerCase() === currentUser.displayName?.toLowerCase())
    );
  });
  const myEnrollments = enrollments.filter((e) => {
    if (!currentUser) return true;
    return (
      e.createdBy === currentUser.uid ||
      (e.creatorEmail && e.creatorEmail.toLowerCase() === currentUser.email?.toLowerCase()) ||
      (e.creatorName && e.creatorName.toLowerCase() === currentUser.displayName?.toLowerCase())
    );
  });

  const myTotalCount = myClaims.length + myEnrollments.length;
  const myPendingClaims = myClaims.filter((c) => c.status === 'pending');
  const myPendingEnrollments = myEnrollments.filter((e) => e.status === 'pending');
  const myPendingCount = myPendingClaims.length + myPendingEnrollments.length;
  const myApprovedCount =
    myClaims.filter((c) => c.status === 'approved').length +
    myEnrollments.filter((e) => e.status === 'approved').length;
  const myIssuesCount =
    myClaims.filter((c) => c.status === 'rejected' || c.status === 'returned').length +
    myEnrollments.filter((e) => e.status === 'rejected' || e.status === 'returned').length;

  // === AMÉLIORATION AJOUTÉE : dédoublonnage par numéro de carte avant tout comptage ===
  // Plusieurs tentatives d'import (avant les correctifs sur l'import silencieux) ont pu
  // laisser des doublons dans Firestore (même assuré, plusieurs documents). On ne modifie
  // rien en base : les totaux affichés ici comptent chaque numéro de carte une seule fois.
  const uniqueMembers = React.useMemo(() => dedupeMembersByCardNo(members), [members]);

  // Global / Team Stats calculations
  const activeMembersCount = uniqueMembers.filter((m) => m.status === 'Actif' || m.status === 'Active').length;

  // === AMÉLIORATION AJOUTÉE : remplace le badge de croissance fictif "+4.2%" (constante en
  // dur, jamais recalculée) par un vrai décompte des membres réellement créés ce mois-ci.
  const now = new Date();
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const newMembersThisMonth = uniqueMembers.filter((m) => m.createdAt && m.createdAt.startsWith(currentMonthPrefix)).length;
  const processedClaims = claims.filter((c) => c.status !== 'pending');
  const processedClaimsCount = processedClaims.length;
  const pendingClaims = claims.filter((c) => c.status === 'pending');
  const pendingClaimsCount = pendingClaims.length;

  const approvedClaimsCount = claims.filter((c) => c.status === 'approved').length;
  // === AMÉLIORATION AJOUTÉE : ne plus afficher un taux d'approbation fictif (94%) quand il
  // n'y a encore aucune décision réelle — 0% reflète honnêtement l'absence de données.
  const approvalRate =
    processedClaimsCount > 0 ? Math.round((approvedClaimsCount / processedClaimsCount) * 100) : 0;

  const pendingEnrollments = enrollments.filter((e) => e.status === 'pending');

  // === AMÉLIORATION AJOUTÉE : distribution par Organisation basée uniquement sur les
  // sinistres réels. Auparavant, une organisation sans sinistre affichait un montant/nombre
  // ALÉATOIRE (Math.random()) au lieu de 0 — trompeur pour un tableau de bord de production.
  const orgClaimTotals = organizations.map((org) => {
    const orgClaims = claims.filter((c) => c.organization.toLowerCase() === org.name.toLowerCase());
    const totalAmount = orgClaims.reduce((sum, c) => sum + c.amount, 0);
    return {
      name: org.name,
      amount: totalAmount,
      count: orgClaims.length,
    };
  });

  const grandTotalOrgClaims = orgClaimTotals.reduce((sum, item) => sum + item.amount, 0) || 1;

  const chartColors = [
    '#0a2e6b', // Brand Navy
    '#00A859', // Medical Emerald
    '#3b82f6', // Bright Blue
    '#f59e0b', // Amber
    '#8b5cf6', // Purple
  ];

  // === AMÉLIORATION AJOUTÉE : Top 5 Prestataires basé uniquement sur les sinistres réels
  // (même correctif que ci-dessus : plus de montant/nombre aléatoire pour un prestataire
  // sans sinistre).
  const providerStats = providers.map((prv) => {
    const pClaims = claims.filter((c) => c.provider.toLowerCase() === prv.name.toLowerCase());
    const total = pClaims.reduce((sum, c) => sum + c.amount, 0);
    return {
      name: prv.name,
      type: prv.type,
      amount: total,
      count: pClaims.length,
    };
  });

  providerStats.sort((a, b) => b.amount - a.amount);
  const topProviders = providerStats.slice(0, 5);
  const maxProviderAmount = Math.max(...topProviders.map((p) => p.amount), 1);

  // Donut SVG calculation
  let cumulativePercent = 0;
  const donutSlices = orgClaimTotals.slice(0, 5).map((item, idx) => {
    const percentage = (item.amount / grandTotalOrgClaims) * 100;
    const startAngle = (cumulativePercent / 100) * 360;
    cumulativePercent += percentage;
    const endAngle = (cumulativePercent / 100) * 360;
    return {
      ...item,
      percentage: Math.round(percentage),
      color: chartColors[idx % chartColors.length],
      startAngle,
      endAngle,
    };
  });

  // RENDER AGENT DASHBOARD
  if (isAgent) {
    return (
      <div className="space-y-6">
        {/* Agent Operational Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-4 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                Operational Agent
              </span>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Activity Dashboard
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Real-time monitoring of your claim entries, enrollments, and submissions for validation
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                id="currency-select-agent"
                value={currencyMode}
                onChange={(e) => setCurrencyMode(e.target.value as CurrencyMode)}
                className="appearance-none pl-8 pr-9 py-2 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0a2e6b] cursor-pointer shadow-2xs transition"
              >
                <option value="USD">USD ($) - US Dollar</option>
                <option value="LRD">LRD (L$) - Liberian Dollar</option>
                <option value="DUAL">DUAL ($ / L$)</option>
              </select>
              <DollarSign className="w-3.5 h-3.5 text-emerald-600 absolute left-2.5 top-2.5 pointer-events-none" />
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Informational Scope & Separation of Duties Card */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50/50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0a2e6b] text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
              <Sparkles className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-[#0a2e6b]">
                Separation of Duties (SoD) Principle
              </h4>
              <p className="text-[11px] text-slate-600">
                You enter and submit files. Validations and final approvals are exclusively performed by Supervisors.
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex px-3 py-1 bg-white text-[#0a2e6b] text-xs font-bold rounded-xl border border-blue-200 shadow-2xs">
            Permissions: VIEW + CREATE + EDIT + SUBMIT
          </span>
        </div>

        {/* 4 Stats Cards for Agent */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
              My Entered Records
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div className="text-2xl font-bold text-slate-800">{myTotalCount}</div>
              <span className="text-xs font-bold text-blue-600">Activity</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 font-medium">
              {myClaims.length} claims • {myEnrollments.length} enrollments
            </p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200 border-l-4 border-l-amber-500 shadow-xs flex flex-col justify-between">
            <div className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
              Awaiting Supervisor
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div className="text-2xl font-bold text-amber-600">{myPendingCount}</div>
              <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-bold">
                IN REVIEW
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 font-medium">
              Forwarded to supervisor for audit
            </p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200 border-l-4 border-l-emerald-500 shadow-xs flex flex-col justify-between">
            <div className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
              Approved Records
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div className="text-2xl font-bold text-emerald-600">{myApprovedCount}</div>
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <p className="text-[10px] text-slate-400 mt-2 font-medium">
              Validated and finalized successfully
            </p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
              Rejected / To Revise
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div className="text-2xl font-bold text-slate-800">{myIssuesCount}</div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${myIssuesCount > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                {myIssuesCount > 0 ? 'Action required' : 'No rejections'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 font-medium">
              Records to adjust and resubmit
            </p>
          </div>
        </div>

        {/* Quick Operational Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => onNavigate('medical_form')}
            className="p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl shadow-xs text-left transition group flex items-start gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0a2e6b] group-hover:bg-[#0a2e6b] group-hover:text-white flex items-center justify-center shrink-0 transition">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800 group-hover:text-[#0a2e6b] transition">
                Direct Care Voucher
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Issue a secure voucher with real-time benefit ceiling check
              </p>
            </div>
          </button>

          <button
            onClick={() => onNavigate('claims')}
            className="p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl shadow-xs text-left transition group flex items-start gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#00A859] group-hover:bg-[#00A859] group-hover:text-white flex items-center justify-center shrink-0 transition">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800 group-hover:text-[#00A859] transition">
                Submit a Claim
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Record healthcare services and submit to supervisor
              </p>
            </div>
          </button>

          <button
            onClick={() => onNavigate('enrollments')}
            className="p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl shadow-xs text-left transition group flex items-start gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 group-hover:bg-purple-700 group-hover:text-white flex items-center justify-center shrink-0 transition">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800 group-hover:text-purple-700 transition">
                New Enrollment
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Register an insured member with photo and biometrics
              </p>
            </div>
          </button>
        </div>

        {/* Table of Agent's Recent Records */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#0a2e6b]" />
              <h3 className="font-bold text-sm text-slate-800">
                Your Recent Records & Tracking
              </h3>
            </div>
            <button
              onClick={() => onNavigate('claims')}
              className="text-[11px] font-bold text-[#0a2e6b] hover:underline inline-flex items-center gap-0.5"
            >
              <span>View all my claims</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Insured / Beneficiary</th>
                  <th className="py-3 px-4">Provider / Organization</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Supervisor Feedback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {claims.slice(0, 5).map((claim) => (
                  <tr key={claim.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-800 whitespace-nowrap">
                      {claim.reference}
                      <span className="block text-[10px] text-slate-400 font-normal">
                        {claim.serviceDate}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800">
                      {claim.memberName}
                      <span className="block text-[10px] text-slate-400 font-mono">
                        {claim.memberCardNo}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      <span className="block font-medium">{claim.provider}</span>
                      <span className="text-[10px] text-slate-400">{claim.organization}</span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-slate-900 whitespace-nowrap">
                      {formatAmount(claim.amount)}
                    </td>
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {claim.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-[#00A859] border border-emerald-200 text-[11px] font-extrabold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approved</span>
                        </span>
                      ) : claim.status === 'rejected' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-extrabold">
                          <X className="w-3.5 h-3.5" />
                          <span>Rejected</span>
                        </span>
                      ) : claim.status === 'returned' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-extrabold">
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>To Revise</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-extrabold">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Pending</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-[11px] italic">
                      {claim.rejectionReason || claim.returnReason || claim.comments || 'Under supervisor review'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // RENDER SUPERVISOR & ADMIN DASHBOARD
  return (
    <div className="space-y-6">
      {/* Top Controls: Compact Currency Dropdown & Role Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isSupervisor ? 'bg-indigo-100 text-indigo-800' : 'bg-blue-100 text-blue-800'}`}>
              {isSupervisor ? 'Supervision Workspace' : 'General Administration'}
            </span>
            <h2 className="text-sm font-bold text-slate-800 tracking-tight">
              {isSupervisor ? 'Team Supervision & Control' : 'Overview & Performance'}
            </h2>
          </div>
          <p className="text-[11px] text-slate-500 font-medium">
            {isSupervisor
              ? 'Audit files submitted by field agents, medical approvals and team statistics'
              : 'Healthcare portfolio KPIs and operational performance metrics'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="currency-select-dropdown" className="text-xs font-bold text-slate-600">
            Currency:
          </label>
          <div className="relative">
            <select
              id="currency-select-dropdown"
              value={currencyMode}
              onChange={(e) => setCurrencyMode(e.target.value as CurrencyMode)}
              className="appearance-none pl-8 pr-9 py-2 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0a2e6b] cursor-pointer shadow-2xs transition"
            >
              <option value="USD">USD ($) - US Dollar</option>
              <option value="LRD">LRD (L$) - Liberian Dollar</option>
              <option value="DUAL">DUAL ($ / L$) - Dual Currency</option>
            </select>
            <DollarSign className="w-3.5 h-3.5 text-emerald-600 absolute left-2.5 top-2.5 pointer-events-none" />
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* 4 Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Members */}
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-xs flex flex-col justify-between hover:border-slate-200 transition">
          <div className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
            {t.dashboard.activeMembers}
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div className="text-2xl font-bold text-slate-800">
              {activeMembersCount.toLocaleString()}
            </div>
            <div className={`text-xs font-bold flex items-center gap-0.5 ${newMembersThisMonth > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
              <span>+{newMembersThisMonth} this month</span>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-medium">
            {activeMembersCount} active beneficiaries out of {uniqueMembers.length} enrolled
          </p>
        </div>

        {/* Card 2: Processed Claims */}
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-xs flex flex-col justify-between hover:border-slate-200 transition">
          <div className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
            {t.dashboard.processedClaims}
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div className="text-2xl font-bold text-slate-800">
              {processedClaimsCount.toLocaleString()}
            </div>
            <div className="text-xs text-slate-400 font-medium">
              All-time total
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-medium">
            Settled and finalized claims
          </p>
        </div>

        {/* Card 3: Pending Claims */}
        <div className="bg-white rounded-xl p-4 border border-slate-100 border-l-4 border-l-blue-500 shadow-xs flex flex-col justify-between hover:border-slate-200 transition">
          <div className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
            {t.dashboard.pendingClaims}
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div className="text-2xl font-bold text-slate-800">{pendingClaimsCount}</div>
            <div className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">
              ACTION REQUIRED
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-medium">
            Pending medical & administrative review
          </p>
        </div>

        {/* Card 4: Approval Rate */}
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-xs flex flex-col justify-between hover:border-slate-200 transition">
          <div className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
            {t.dashboard.approvalRate}
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div className="text-2xl font-bold text-slate-800">{approvalRate}%</div>
            <div className="text-xs text-slate-400 font-medium">
              Stability
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-medium">
            Network compliance
          </p>
        </div>
      </div>

      {/* Row 2: Pending Claims Widget + Donut Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Widget: Pending Claims (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-100 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-slate-800">
                {t.dashboard.pendingClaimsWidget}
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
                {pendingClaimsCount}
              </span>
            </div>
            <button
              onClick={() => onNavigate('claims')}
              className="text-[11px] font-bold text-[#0a2e6b] hover:underline inline-flex items-center gap-0.5"
            >
              <span>{t.dashboard.viewAll}</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 flex-1">
            {pendingClaims.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 font-medium">
                {t.dashboard.noPendingClaims}
              </div>
            ) : (
              pendingClaims.slice(0, 4).map((claim) => (
                <div
                  key={claim.id}
                  className="p-3.5 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-[#0a2e6b]">
                        {claim.reference}
                      </span>
                      <span className="text-[11px] text-slate-300">•</span>
                      <span className="text-xs font-semibold text-slate-800 truncate">
                        {claim.memberName}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate flex items-center gap-2">
                      <span>{claim.provider}</span>
                      <span className="text-slate-300">—</span>
                      <span className="text-slate-500">{claim.careType}</span>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold text-slate-800">
                      {formatAmount(claim.amount)}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5 justify-end">
                      {(() => {
                        const approvalCheck = canApproveRecord(userRole, currentUser, claim);
                        return (
                          <button
                            onClick={() => {
                              if (!approvalCheck.allowed) {
                                alert(approvalCheck.reason);
                                return;
                              }
                              onApproveClaim(claim.id);
                            }}
                            disabled={!approvalCheck.allowed}
                            className={`px-2.5 py-1 rounded font-bold text-[10px] transition ${
                              approvalCheck.allowed
                                ? 'bg-[#0a2e6b] hover:bg-[#07214f] text-white cursor-pointer'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                            title={approvalCheck.allowed ? t.approve : approvalCheck.reason}
                          >
                            {t.approve}
                          </button>
                        );
                      })()}
                      <button
                        onClick={() => onRejectClaim(claim)}
                        className="bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 px-2.5 py-1 rounded font-semibold text-[10px] transition"
                        title={t.reject}
                      >
                        {t.reject}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Donut Chart: Claims distribution by Organization (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-100 shadow-xs p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm text-slate-800">{t.dashboard.claimsByOrg}</h3>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total volume</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-5 my-auto">
            {/* Visual SVG Donut */}
            <div className="relative w-32 h-32 flex-shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90">
                <circle
                  cx="21"
                  cy="21"
                  r="15.91549430918954"
                  fill="transparent"
                  stroke="#e2e8f0"
                  strokeWidth="6"
                />
                {donutSlices.map((slice, i) => {
                  const dashArray = `${slice.percentage} ${100 - slice.percentage}`;
                  const dashOffset = 100 - (donutSlices.slice(0, i).reduce((sum, s) => sum + s.percentage, 0) || 0);
                  return (
                    <circle
                      key={i}
                      cx="21"
                      cy="21"
                      r="15.91549430918954"
                      fill="transparent"
                      stroke={slice.color}
                      strokeWidth="6"
                      strokeDasharray={dashArray}
                      strokeDashoffset={dashOffset}
                      className="transition-all duration-500 hover:opacity-85"
                    />
                  );
                })}
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-xs font-bold text-slate-800">100%</span>
                <span className="text-[9px] text-slate-400">Total</span>
              </div>
            </div>

            {/* Colored Legend */}
            <div className="flex-1 space-y-1.5 w-full">
              {donutSlices.map((slice, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: slice.color }}
                    ></span>
                    <span className="text-slate-700 font-medium truncate max-w-[130px]">
                      {slice.name}
                    </span>
                  </div>
                  <span className="font-bold text-slate-800 ml-2">
                    {slice.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 mt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>
              {organizations.length} client organizations
            </span>
            <button
              onClick={() => onNavigate('organizations')}
              className="text-[#0a2e6b] font-bold hover:underline"
            >
              Manage
            </button>
          </div>
        </div>
      </div>

      {/* Row 3: Pending Enrollments Widget + Bar Chart Top 5 Providers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Widget: Pending Enrollments (6 cols) */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-slate-100 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-slate-800">
                {t.dashboard.pendingEnrollmentsWidget}
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                {pendingEnrollments.length}
              </span>
            </div>
            <button
              onClick={() => onNavigate('enrollments')}
              className="text-[11px] font-bold text-[#0a2e6b] hover:underline inline-flex items-center gap-0.5"
            >
              <span>{t.dashboard.viewAll}</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 flex-1">
            {pendingEnrollments.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 font-medium">
                {t.dashboard.noPendingEnrollments}
              </div>
            ) : (
              pendingEnrollments.slice(0, 3).map((enr) => (
                <div
                  key={enr.id}
                  className="p-3.5 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">{enr.fullName}</span>
                      <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {enr.relationship}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">{enr.organization}</p>
                    {/* Badges Photo & Biometrics */}
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          enr.hasPhoto
                            ? 'bg-blue-50 text-[#0a2e6b]'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        <ImageIcon className="w-3 h-3" />
                        <span>{enr.hasPhoto ? t.enrollments.badgePhoto : t.enrollments.missingPhoto}</span>
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          enr.hasBiometrics
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        <Fingerprint className="w-3 h-3" />
                        <span>
                          {enr.hasBiometrics
                            ? t.enrollments.badgeBiometrics
                            : t.enrollments.missingBiometrics}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {(() => {
                      const approvalCheck = canApproveRecord(userRole, currentUser, enr);
                      return (
                        <button
                          onClick={() => {
                            if (!approvalCheck.allowed) {
                              alert(approvalCheck.reason);
                              return;
                            }
                            onApproveEnrollment(enr.id);
                          }}
                          disabled={!approvalCheck.allowed}
                          className={`p-1.5 rounded transition ${
                            approvalCheck.allowed
                              ? 'bg-emerald-50 hover:bg-[#00A859] text-[#00A859] hover:text-white cursor-pointer'
                              : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                          }`}
                          title={approvalCheck.allowed ? t.approve : approvalCheck.reason}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      );
                    })()}
                    <button
                      onClick={() => onRejectEnrollment(enr)}
                      className="p-1.5 rounded bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white transition"
                      title={t.reject}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bar Chart: Top 5 Healthcare Providers (6 cols) */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-slate-100 shadow-xs p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-[#0a2e6b]" />
              <h3 className="font-bold text-sm text-slate-800">{t.dashboard.topProviders}</h3>
            </div>
            <button
              onClick={() => onNavigate('providers')}
              className="text-[11px] font-bold text-[#0a2e6b] hover:underline"
            >
              {t.dashboard.viewAll}
            </button>
          </div>

          <div className="space-y-3 my-auto">
            {topProviders.map((prv, idx) => {
              const barPercent = Math.round((prv.amount / maxProviderAmount) * 100);
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-4 h-4 rounded bg-slate-100 font-bold text-[9px] text-slate-700 flex items-center justify-center flex-shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-slate-800 truncate max-w-[200px]">
                        {prv.name}
                      </span>
                      <span className="text-[10px] text-slate-400">({prv.type})</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="font-bold text-slate-800">
                        {formatAmount(prv.amount)}
                      </span>
                    </div>
                  </div>

                  {/* Horizontal Bar */}
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${barPercent}%`,
                        backgroundColor: idx === 0 ? '#0a2e6b' : idx === 1 ? '#10b981' : '#3b82f6',
                      }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3 mt-4 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Accredited Provider Network</span>
            <span className="font-medium text-slate-500">
              Billing Volume
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
