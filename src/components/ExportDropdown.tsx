import React, { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react';
import { Language } from '../types';

interface ExportDropdownProps {
  onExportExcel?: () => void;
  onExportCSV?: () => void;
  onExportPDF?: () => void;
  lang?: Language;
  label?: string;
  className?: string;
  // === AMÉLIORATION AJOUTÉE : permet un bouton déclencheur "plein" coloré (ex: gris Admin
  // ou vert Superviseur, alignés sur la bande de menu via roleTheme.palette.primaryColor)
  // à la place du style blanc/discret par défaut — utilisé par ReportsView pour fusionner
  // "Export to PDF" et "Export to Excel" en un seul bouton Export coloré par rôle.
  accentButtonClass?: string;
}

export const ExportDropdown: React.FC<ExportDropdownProps> = ({
  onExportExcel,
  onExportCSV,
  onExportPDF,
  lang = 'en',
  label,
  className = '',
  accentButtonClass,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const defaultLabel = label || 'Export';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = (type: 'excel' | 'csv' | 'pdf') => {
    setIsOpen(false);
    if (type === 'excel' && onExportExcel) {
      onExportExcel();
    } else if (type === 'csv' && onExportCSV) {
      onExportCSV();
    } else if (type === 'pdf' && onExportPDF) {
      onExportPDF();
    }
  };

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={
          accentButtonClass
            ? `px-3.5 py-2.5 rounded-xl ${accentButtonClass} text-white text-xs font-bold shadow-sm transition flex items-center gap-2 cursor-pointer whitespace-nowrap`
            : 'px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer hover:border-slate-300'
        }
      >
        <Download className={`w-4 h-4 ${accentButtonClass ? 'text-white' : 'text-slate-500'}`} />
        <span>{defaultLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${accentButtonClass ? 'text-white/80' : 'text-slate-400'}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Export Options
          </div>

          {onExportExcel && (
            <button
              type="button"
              onClick={() => handleExport('excel')}
              className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 flex items-center gap-2.5 transition cursor-pointer"
            >
              <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                <FileSpreadsheet className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="block font-bold">Export to Excel</span>
                <span className="text-[10px] text-slate-400 block">Spreadsheet (.xlsx)</span>
              </div>
            </button>
          )}

          {onExportCSV && (
            <button
              type="button"
              onClick={() => handleExport('csv')}
              className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-800 flex items-center gap-2.5 transition cursor-pointer"
            >
              <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="block font-bold">Export to CSV</span>
                <span className="text-[10px] text-slate-400 block">Comma separated (.csv)</span>
              </div>
            </button>
          )}

          {onExportPDF && (
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-800 flex items-center gap-2.5 transition cursor-pointer"
            >
              <div className="w-6 h-6 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center flex-shrink-0">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="block font-bold">Export to PDF</span>
                <span className="text-[10px] text-slate-400 block">Printable report (.pdf)</span>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
