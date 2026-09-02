import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  FileSpreadsheet,
  FileText,
  Building,
  Stethoscope,
  TrendingUp,
  Clock,
  CheckCircle2,
  DollarSign,
  Loader2,
  Calendar,
} from 'lucide-react';
import { Language, Claim, Organization, Provider, InvoiceItem } from '../types';
import { useTranslation } from '../i18n/translations';
import { exportReportsToExcel, exportReportsToPDF } from '../utils/excelUtils';
import { useCurrency } from '../services/currency';
import { getRoleTheme } from '../theme/roleTheme';

interface ReportsViewProps {
  lang: Language;
  claims: Claim[];
  invoices: InvoiceItem[];
  organizations: Organization[];
  providers: Provider[];
  // === AMÉLIORATION AJOUTÉE : rôle actif, utilisé pour aligner les couleurs des graphiques
  // (Recharts) sur la teinte de marque du rôle au lieu du bleu Activa codé en dur.
  userRole?: string;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  lang,
  claims,
  invoices,
  organizations,
  providers,
  userRole,
}) => {
  const t = useTranslation(lang);
  const { formatAmount } = useCurrency();
  const roleTheme = getRoleTheme(userRole);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

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

  const avgProcessingTime = '1.8 day(s)';
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
            <Calendar className="w-3.5 h-3.5 text-[var(--brand-900)]" />
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

          {/* PDF Export Button */}
          <button
            id="export-pdf-button"
            type="button"
            onClick={handleExportPDF}
            disabled={isExportingPdf}
            className="px-3.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm shadow-rose-600/20 hover:shadow transition flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            {isExportingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            <span>{t.reports.exportPdf}</span>
          </button>

          {/* Excel Export Button */}
          <button
            id="export-excel-report-button"
            type="button"
            onClick={handleExportExcel}
            disabled={isExportingExcel}
            className="px-3.5 py-2.5 rounded-xl bg-[#00A859] hover:bg-[#008f4c] text-white text-xs font-bold shadow-sm shadow-emerald-600/20 hover:shadow transition flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            {isExportingExcel ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            <span>{t.reports.exportExcel}</span>
          </button>
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
            <div className="w-10 h-10 rounded-xl bg-[var(--brand-50)] text-[var(--brand-900)] flex items-center justify-center">
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
              <div className="w-8 h-8 rounded-lg bg-[var(--brand-50)] text-[var(--brand-900)] flex items-center justify-center">
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
                        backgroundColor: idx % 2 === 0 ? roleTheme.palette.hexRamp['900'] : '#00A859',
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
                        backgroundColor: idx % 2 === 0 ? '#00A859' : roleTheme.palette.hexRamp['900'],
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
    </div>
  );
};
