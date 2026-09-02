import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  Search,
  CheckCircle2,
  XCircle,
  Globe,
  Monitor,
  Calendar,
  Clock,
  History,
  Download,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import { LoginLog, Language } from '../../types';
import { useTranslation } from '../../i18n/translations';

interface LogsViewProps {
  lang: Language;
  logs: LoginLog[];
}

export const LogsView: React.FC<LogsViewProps> = ({ lang, logs }) => {
  const t = useTranslation(lang);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchSearch =
        log.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.ipAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.userAgent.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.location && log.location.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchStatus = statusFilter === 'ALL' || log.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [logs, searchTerm, statusFilter]);

  const handleDownloadCSV = () => {
    const headers = ['ID', 'Timestamp', 'User_Email', 'Profile', 'IP_Address', 'Browser_Device', 'Status', 'Location'];
    const rows = filteredLogs.map((l) => [
      l.id,
      `"${l.timestamp}"`,
      `"${l.userEmail}"`,
      `"${l.profile}"`,
      `"${l.ipAddress}"`,
      `"${l.userAgent.replace(/"/g, '""')}"`,
      `"${l.status}"`,
      `"${l.location || 'Monrovia, LR'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ACTIVA_Access_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `ACTIVA_Access_Logs_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top filter bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search logs by email, IP address, user agent, location..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand-900)] focus:bg-white"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-900)]"
          >
            <option value="ALL">All Statuses</option>
            <option value="success">{t.logs.success}</option>
            <option value="failed">{t.logs.failed}</option>
          </select>

          <button
            type="button"
            onClick={handleDownloadCSV}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
            title="Download logs in CSV format"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadJSON}
            className="px-3 py-2 rounded-xl bg-[var(--brand-50)] hover:bg-[var(--brand-100)] text-[var(--brand-900)] border border-[var(--brand-200)] text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
            title="Download logs in JSON format"
          >
            <FileText className="w-3.5 h-3.5 text-[var(--brand-900)]" />
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <History className="w-4 h-4 text-[var(--brand-900)]" />
            <h3 className="font-extrabold text-sm text-slate-900">{t.logs.title}</h3>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs font-black">
              {filteredLogs.length}
            </span>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium">
            {t.noData}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">{t.logs.timestamp}</th>
                  <th className="py-3 px-4">{t.logs.user}</th>
                  <th className="py-3 px-4">{t.logs.ipAddress}</th>
                  <th className="py-3 px-4">{t.logs.userAgent}</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4 text-center">{t.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {log.timestamp}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">{log.userEmail}</td>
                    <td className="py-3.5 px-4 font-mono text-[var(--brand-900)] font-semibold whitespace-nowrap">
                      {log.ipAddress}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 truncate max-w-[220px]">
                      {log.userAgent}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-slate-400" />
                      <span>{log.location || 'Monrovia, LR'}</span>
                    </td>
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {log.status === 'success' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-[#00A859] border border-emerald-200 text-[11px] font-extrabold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t.logs.success}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-extrabold">
                          <XCircle className="w-3.5 h-3.5 text-rose-600" />
                          <span>{t.logs.failed}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
