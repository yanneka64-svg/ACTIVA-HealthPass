import React, { useState, useRef } from 'react';
import { UploadCloud, FileSpreadsheet, AlertTriangle, CheckCircle2, X, RefreshCw, Download } from 'lucide-react';
import { Language } from '../types';
import { useTranslation } from '../i18n/translations';
import { ImportResult } from '../utils/excelUtils';
import * as XLSX from 'xlsx';
import { downloadBlob } from '../utils/excelUtils';

interface ExcelImportModalProps<T> {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  title: string;
  // === ADDED IMPROVEMENT: 'members-multi-org' for the new multi-organization import
  // (workbook "<Organization> - Staff" / "<Organization> - Deps"), in addition to the 3 existing imports.
  targetType: 'members' | 'organizations' | 'providers' | 'members-multi-org';
  onImport: (file: File) => Promise<ImportResult<T>>;
  onSuccess: (items: T[]) => void;
  // When provided, replaces the internally generated Excel template with downloadSampleTemplate()
  // (used by 'members-multi-org' to offer the real downloadable Staff/Deps template).
  onDownloadTemplate?: () => void;
}

export function ExcelImportModal<T>({
  isOpen,
  onClose,
  lang,
  title,
  targetType,
  onImport,
  onSuccess,
  onDownloadTemplate,
}: ExcelImportModalProps<T>) {
  const t = useTranslation(lang);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult<T> | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    if (!file) return;
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('Please select an Excel file (.xlsx or .xls)');
      return;
    }

    setSelectedFileName(file.name);
    setLoading(true);
    setResult(null);

    try {
      // Small simulated delay for processing animation
      await new Promise(r => setTimeout(r, 600));
      const res = await onImport(file);
      setResult(res);
      if (res.success && res.parsedItems.length > 0) {
        onSuccess(res.parsedItems);
      }
    } catch (err: any) {
      setResult({
        success: false,
        created: 0,
        updated: 0,
        ignored: 0,
        missingHeaders: [],
        errors: [err.message || 'Erreur inattendue'],
        parsedItems: [],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const downloadSampleTemplate = () => {
    // === ADDED IMPROVEMENT: a custom template (e.g. generateMultiOrgTemplateExcel)
    // takes precedence over the generic generation below when provided.
    if (onDownloadTemplate) {
      onDownloadTemplate();
      return;
    }
    const wb = XLSX.utils.book_new();
    let templateData: any[] = [];
    let sheetName = 'Template';

    if (targetType === 'members') {
      sheetName = 'Members';
      templateData = [
        {
          'Card No.': 'ACT-2026-9050',
          'Primary Insured': 'Samuel DOE',
          'Spouse': 'Mary DOE',
          'Children': 'Lucas DOE, Emma DOE',
          'Organization': 'Orange Liberia Telecom',
          'Relationship': 'Primary',
          'Date of Birth': '1988-03-15',
          'Status': 'Active',
        },
        {
          'Card No.': 'ACT-2026-9051',
          'Primary Insured': 'Grace KOLLIE',
          'Spouse': '',
          'Children': 'Nathan KOLLIE',
          'Organization': 'Ecobank Liberia Head Office',
          'Relationship': 'Primary',
          'Date of Birth': '1992-11-20',
          'Status': 'Active',
        },
      ];
    } else if (targetType === 'organizations') {
      sheetName = 'Organizations';
      templateData = [
        {
          'Organization': 'TotalEnergies Liberia Ltd',
          'Policy Number': 'POL-2026-TOT-08',
          'Declared Headcount': 350,
          'Coverage Rate (%)': 80,
          'Effective Date': '2026-01-01',
          'Expiration Date': '2026-12-31',
          'Status': 'Active',
        },
      ];
    } else {
      sheetName = 'Providers';
      templateData = [
        {
          'Facility Name': 'St. Joseph Catholic Hospital',
          'Facility Type': 'Hospital',
          'Location': 'Monrovia — Sinkor',
          'Convention No.': 'CONV-2026-C44',
          'KYP Compliance': 'Validated',
          'Contact Phone': '+231 77 000 3344',
        },
      ];
    }

    const ws = XLSX.utils.json_to_sheet(templateData);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    downloadBlob(
      new Blob([buf]),
      `Template_Import_${targetType}.xlsx`
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#0a2e6b] px-6 py-4.5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-emerald-300">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">{title}</h3>
              <p className="text-xs text-blue-100 mt-0.5">{t.excel.columnToleranceNote}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/15 transition-colors text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Dropzone */}
          {!loading && !result && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                dragOver
                  ? 'border-[#00A859] bg-emerald-50/50'
                  : 'border-slate-300 hover:border-[#0a2e6b] hover:bg-blue-50/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFile(e.target.files[0]);
                  }
                }}
              />
              <div className="w-14 h-14 rounded-2xl bg-blue-100/70 text-[#0a2e6b] flex items-center justify-center shadow-xs">
                <UploadCloud className="w-8 h-8 text-[#0a2e6b]" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">{t.excel.importHint}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {'Accepted formats: .xlsx, .xls'}
                </p>
              </div>
              <button
                type="button"
                className="mt-2 px-4 py-2 bg-[#0a2e6b] hover:bg-[#092d66] text-white rounded-lg text-xs font-semibold shadow-xs transition"
              >
                {'Browse Files'}
              </button>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-4 text-center">
              <RefreshCw className="w-10 h-10 text-[#00A859] animate-spin" />
              <div>
                <p className="font-bold text-slate-800">{t.excel.processing}</p>
                <p className="text-xs text-slate-500 mt-1">{selectedFileName}</p>
              </div>
            </div>
          )}

          {/* Error: Missing columns */}
          {result && !result.success && result.missingHeaders.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
              <div className="flex items-start gap-3 text-amber-800">
                <AlertTriangle className="w-6 h-6 flex-shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm text-amber-900">{t.excel.missingColumnsTitle}</h4>
                  <p className="text-xs text-amber-700 mt-1">{t.excel.missingColumnsDesc}</p>
                  <ul className="mt-2 space-y-1 text-xs font-semibold text-amber-900">
                    {result.missingHeaders.map((hdr, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                        {hdr}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* General Errors */}
          {result && !result.success && result.errors.length > 0 && result.missingHeaders.length === 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 space-y-2">
              <div className="flex items-start gap-3 text-rose-800">
                <AlertTriangle className="w-6 h-6 flex-shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm text-rose-900">
                    {'Import Error'}
                  </h4>
                  <p className="text-xs text-rose-700 mt-1">{result.errors.join(', ')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Success summary */}
          {result && result.success && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-emerald-950">{t.excel.summaryTitle}</h4>
                  <p className="text-xs text-emerald-700 mt-0.5">{selectedFileName}</p>
                </div>
              </div>

              {/* Counters grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-lg p-3 text-center border border-emerald-100 shadow-xs">
                  <span className="block text-2xl font-black text-emerald-600">{result.created}</span>
                  <span className="text-[11px] font-medium text-slate-600">{t.excel.createdCount}</span>
                </div>
                <div className="bg-white rounded-lg p-3 text-center border border-blue-100 shadow-xs">
                  <span className="block text-2xl font-black text-[#0a2e6b]">{result.updated}</span>
                  <span className="text-[11px] font-medium text-slate-600">{t.excel.updatedCount}</span>
                </div>
                <div className="bg-white rounded-lg p-3 text-center border border-slate-100 shadow-xs">
                  <span className="block text-2xl font-black text-slate-500">{result.ignored}</span>
                  <span className="text-[11px] font-medium text-slate-600">{t.excel.ignoredCount}</span>
                </div>
              </div>

              {/* === ADDED IMPROVEMENT: details specific to the multi-organization import
                  (organizations detected, new organizations, orphan dependents) === */}
              {targetType === 'members-multi-org' && (() => {
                const multiOrgResult = result as unknown as {
                  organizationsFound?: string[];
                  newOrganizationsDetected?: string[];
                  orphanDependents?: number;
                };
                return (
                  <div className="space-y-2 pt-1">
                    {!!multiOrgResult.organizationsFound?.length && (
                      <p className="text-xs text-emerald-800">
                        <span className="font-bold">{multiOrgResult.organizationsFound.length}</span> organization(s) processed: {multiOrgResult.organizationsFound.join(', ')}
                      </p>
                    )}
                    {!!multiOrgResult.newOrganizationsDetected?.length && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                        <span className="font-bold">New organizations detected</span> (create/verify them under Organizations &amp; Ceilings for correct ceiling calculation): {multiOrgResult.newOrganizationsDetected.join(', ')}
                      </div>
                    )}
                    {!!multiOrgResult.orphanDependents && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                        <span className="font-bold">{multiOrgResult.orphanDependents}</span> dependent(s) from the "Deps" sheet could not be matched to a name (no matching "Child N Name"/"Spouse Name" column found on the "Staff" sheet) — skipped to avoid importing a nameless dependent.
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Download sample button */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={downloadSampleTemplate}
              className="inline-flex items-center gap-1.5 text-xs text-[#0a2e6b] hover:underline font-semibold"
            >
              <Download className="w-4 h-4" />
              {t.excel.downloadTemplate}
            </button>

            {result && (
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setSelectedFileName('');
                }}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                {'Upload another file'}
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold shadow-xs transition"
          >
            {result ? t.excel.closeModal : t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
