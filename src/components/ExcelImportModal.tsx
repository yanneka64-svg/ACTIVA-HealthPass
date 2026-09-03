import React, { useState, useRef } from 'react';
import { UploadCloud, FileSpreadsheet, AlertTriangle, CheckCircle2, X, RefreshCw, Download, FileText, Users, UserCheck, ArrowRight } from 'lucide-react';
import { Language } from '../types';
import { useTranslation } from '../i18n/translations';
import { ImportResult, generateMemberTemplateExcel, downloadBlob } from '../utils/excelUtils';
import { commitCardNumberPreview, getCurrentCounters, previewNextCardNumber } from '../services/cardNumberService';
import * as XLSX from 'xlsx';

interface ExcelImportModalProps<T> {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  title: string;
  userRole?: string;
  targetType: 'members' | 'organizations' | 'providers';
  onImport: (file: File) => Promise<ImportResult<T>>;
  // === AMÉLIORATION AJOUTÉE : onSuccess peut désormais être asynchrone (et peut échouer),
  // afin que les erreurs de persistance réelles (ex: écriture Firestore) remontent jusqu'à
  // ce modal au lieu d'être silencieusement ignorées derrière un résumé "succès" trompeur.
  onSuccess: (items: T[]) => void | Promise<void>;
  // === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — nécessaire pour
  // renseigner "Assigned By" lors de la réservation définitive des numéros de carte à la
  // confirmation d'un import de membres.
  currentUser?: any;
}

export function ExcelImportModal<T>({
  isOpen,
  onClose,
  lang,
  title,
  userRole = 'Admin',
  targetType,
  onImport,
  onSuccess,
  currentUser,
}: ExcelImportModalProps<T>) {
  const t = useTranslation(lang);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult<T> | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');

  // === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — sur demande
  // explicite. Pour un import de membres, `result.cardNumberPreview` (voir parseMemberExcel)
  // déclenche une étape de prévisualisation OBLIGATOIRE (section 10) avant toute écriture :
  // rien n'est encore persisté ni réservé tant que l'admin n'a pas cliqué "Confirm Import"
  // (section 23). Annuler à ce stade ne consomme donc aucun numéro.
  const [confirming, setConfirming] = useState(false);
  const [finalSummary, setFinalSummary] = useState<{
    total: number; retained: number; generated: number; duplicates: number; invalid: number;
    lastAssigned: string | null; nextAvailable: string;
  } | null>(null);
  const awaitingCardNumberConfirmation = !!(result?.success && result.cardNumberPreview && result.cardNumberPreview.length > 0 && !finalSummary);

  if (!isOpen) return null;

  // === AMÉLIORATION AJOUTÉE : cohérence visuelle — ce modal n'est utilisé que depuis les
  // écrans Admin (Organizations/Members/Providers, tous réservés à l'Admin dans Sidebar),
  // il variait pourtant sa couleur par rôle (noir #111827 / teal / bleu marine selon le cas).
  // Fenêtre passée au blanc et boutons au gris de la barre latérale Admin, pour être
  // cohérent avec le reste de l'interface.
  const headerBgClass = 'bg-white border-b border-slate-200';
  const primaryBtnClass = 'bg-slate-700 hover:bg-slate-800';
  const primaryTextClass = 'text-slate-700';

  const handleFile = async (file: File) => {
    if (!file) return;
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('Please select an Excel file (.xlsx or .xls)');
      return;
    }

    setSelectedFileName(file.name);
    setLoading(true);
    setResult(null);
    setFinalSummary(null);

    try {
      await new Promise(r => setTimeout(r, 500));
      const res = await onImport(file);

      // === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — sur demande
      // explicite. Un import de membres porte toujours un `cardNumberPreview` (voir
      // parseMemberExcel) : on s'arrête ICI, sans rien persister ni réserver, pour afficher
      // le tableau de prévisualisation obligatoire (section 10) — c'est le clic sur
      // "Confirm Import" (handleConfirmImport ci-dessous) qui déclenche réellement la
      // réservation des numéros puis la persistance. Les autres types d'import
      // (organisations, prestataires) n'ont pas ce champ et gardent leur comportement
      // exactement inchangé (persistance immédiate).
      if (res.success && res.cardNumberPreview && res.cardNumberPreview.length > 0) {
        setResult(res);
        setLoading(false);
        return;
      }

      if (res.success && res.parsedItems.length > 0) {
        // === AMÉLIORATION AJOUTÉE : on attend désormais réellement la persistance
        // (onSuccess peut être async et peut lever une erreur si l'écriture échoue en base).
        // Le résumé "succès" n'est affiché que si la persistance a effectivement réussi,
        // ce qui évite le cas observé en production où l'import annonçait un succès
        // (ex: "1 created, 148 updated") alors que la plupart des enregistrements
        // n'avaient en réalité jamais été sauvegardés.
        try {
          await onSuccess(res.parsedItems);
          setResult(res);
        } catch (persistErr: any) {
          setResult({
            ...res,
            success: false,
            errors: [
              persistErr?.message ||
                'The data was read successfully but failed to save. Please try again.',
            ],
          });
        }
      } else {
        setResult(res);
      }
    } catch (err: any) {
      setResult({
        success: false,
        created: 0,
        updated: 0,
        ignored: 0,
        missingHeaders: [],
        errors: [err.message || 'Unexpected error'],
        parsedItems: [],
      });
    } finally {
      setLoading(false);
    }
  };

  // === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — clic sur "Confirm
  // Import" depuis le tableau de prévisualisation : réserve réellement chaque numéro de
  // carte planifié (transactionnel, un par un — voir commitCardNumberPreview), PUIS persiste
  // les données (onSuccess), et affiche enfin le résumé final (section 22). Si le clic sur
  // "Cancel" ci-dessous est utilisé à la place, rien de tout cela ne se produit : aucun
  // numéro n'est consommé (section 23).
  const handleConfirmImport = async () => {
    if (!result || !result.cardNumberPreview) return;
    setConfirming(true);
    try {
      const { failures } = await commitCardNumberPreview(
        result.cardNumberPreview,
        {
          uid: currentUser?.uid,
          name: currentUser?.fullName || currentUser?.displayName || currentUser?.email,
        },
        'EXCEL_IMPORT'
      );

      let itemsToPersist = result.parsedItems as any[];
      if (failures.length > 0) {
        const failedCardNumbers = new Set(
          failures
            .map((f) => result.cardNumberPreview![f.rowIndex]?.cardNoFinal)
            .filter((v): v is string => !!v && v !== '—')
        );
        itemsToPersist = itemsToPersist.filter((item) => !failedCardNumbers.has(item.cardNo));
      }

      await onSuccess(itemsToPersist as T[]);

      const retained = result.cardNumberPreview.filter((r) => r.action === 'Kept').length;
      const generated = result.cardNumberPreview.filter((r) => r.action === 'Generated').length;
      const duplicates = result.cardNumberPreview.filter((r) => r.status === 'Duplicate').length;
      const invalid = result.cardNumberPreview.filter((r) => r.status === 'Invalid').length;
      const committedNumbers = result.cardNumberPreview
        .filter((r) => r.action !== 'None' && !failures.some((f) => f.rowIndex === r.rowIndex))
        .map((r) => r.cardNoFinal);
      const lastAssigned = committedNumbers.length > 0 ? committedNumbers[committedNumbers.length - 1] : null;
      const nextAvailable = await previewNextCardNumber();

      setFinalSummary({
        total: result.cardNumberPreview.length,
        retained,
        generated,
        duplicates,
        invalid,
        lastAssigned,
        nextAvailable,
      });
      setResult({ ...result, parsedItems: itemsToPersist as T[], created: generated, updated: 0, ignored: duplicates + invalid + failures.length });
    } catch (err: any) {
      setResult({
        ...result,
        success: false,
        errors: [err?.message || 'Failed to confirm the import. Please try again.'],
      });
    } finally {
      setConfirming(false);
    }
  };

  const handleCancelPreview = () => {
    // Rien n'a été réservé ni persisté pendant la prévisualisation — annuler ici revient
    // simplement à effacer l'aperçu (section 23).
    setResult(null);
    setFinalSummary(null);
    setSelectedFileName('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const downloadSampleTemplate = () => {
    if (targetType === 'members') {
      generateMemberTemplateExcel();
      return;
    }

    const wb = XLSX.utils.book_new();
    let templateData: any[] = [];
    let sheetName = 'Template';

    if (targetType === 'organizations') {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className={`bg-white rounded-2xl shadow-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] transition-[max-width] ${awaitingCardNumberConfirmation ? 'max-w-3xl' : 'max-w-xl'}`}>
        {/* Header */}
        <div className={`${headerBgClass} px-6 py-4.5 text-slate-900 flex items-center justify-between transition-colors`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-emerald-600">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{t.excel.columnToleranceNote}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 cursor-pointer"
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
                  : 'border-slate-300 hover:border-slate-500 hover:bg-slate-50/60'
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
              <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-800 flex items-center justify-center shadow-xs">
                <UploadCloud className="w-8 h-8 text-slate-700" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">{t.excel.importHint}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {'Accepted formats: .xlsx, .xls'}
                </p>
              </div>
              <button
                type="button"
                className={`mt-2 px-4 py-2 ${primaryBtnClass} text-white rounded-lg text-xs font-semibold shadow-xs transition`}
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

          {/* === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — sur
              demande explicite. Prévisualisation obligatoire avant import définitif (section
              10) : chaque ligne du fichier avec le n° de carte final calculé, l'action
              (Kept/Generated/None) et le statut (Valid/Duplicate/Invalid). Rien n'a encore été
              écrit en base à ce stade. === */}
          {awaitingCardNumberConfirmation && result?.cardNumberPreview && (
            <div className="space-y-3">
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-3.5 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-sky-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-sky-800 leading-relaxed">
                  Review the card numbers below before confirming — nothing is saved yet.
                  Existing numbers are kept exactly as provided; blank rows get a new unique
                  number automatically.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-64 overflow-y-auto overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-left text-slate-500 font-bold uppercase tracking-wide text-[10px]">
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Insured</th>
                        <th className="px-3 py-2">Card No. Excel</th>
                        <th className="px-3 py-2">Card No. Final</th>
                        <th className="px-3 py-2">Action</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.cardNumberPreview.map((row) => (
                        <tr key={row.rowIndex} className={row.status !== 'Valid' ? 'bg-rose-50/60' : ''}>
                          <td className="px-3 py-2 text-slate-400 font-mono">{row.rowIndex + 2}</td>
                          <td className="px-3 py-2 font-semibold text-slate-800">{row.insuredName}</td>
                          <td className="px-3 py-2 font-mono text-slate-500">{row.cardNoExcel}</td>
                          <td className="px-3 py-2 font-mono font-bold text-slate-800">{row.cardNoFinal}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                row.action === 'Kept'
                                  ? 'bg-slate-100 text-slate-700'
                                  : row.action === 'Generated'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-100 text-slate-400'
                              }`}
                            >
                              {row.action}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                row.status === 'Valid'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : row.status === 'Duplicate'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-rose-100 text-rose-700'
                              }`}
                              title={row.reason}
                            >
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div className="bg-white rounded-lg p-2.5 text-center border border-slate-200">
                  <span className="block text-lg font-black text-slate-700">
                    {result.cardNumberPreview.filter((r) => r.action === 'Kept').length}
                  </span>
                  <span className="text-[10px] font-medium text-slate-500">Retained</span>
                </div>
                <div className="bg-white rounded-lg p-2.5 text-center border border-emerald-100">
                  <span className="block text-lg font-black text-emerald-600">
                    {result.cardNumberPreview.filter((r) => r.action === 'Generated').length}
                  </span>
                  <span className="text-[10px] font-medium text-slate-500">Generated</span>
                </div>
                <div className="bg-white rounded-lg p-2.5 text-center border border-amber-100">
                  <span className="block text-lg font-black text-amber-600">
                    {result.cardNumberPreview.filter((r) => r.status === 'Duplicate').length}
                  </span>
                  <span className="text-[10px] font-medium text-slate-500">Duplicates</span>
                </div>
                <div className="bg-white rounded-lg p-2.5 text-center border border-rose-100">
                  <span className="block text-lg font-black text-rose-600">
                    {result.cardNumberPreview.filter((r) => r.status === 'Invalid').length}
                  </span>
                  <span className="text-[10px] font-medium text-slate-500">Invalid</span>
                </div>
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
          {result && result.success && !awaitingCardNumberConfirmation && (
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
                <div className="bg-white rounded-lg p-3 text-center border border-slate-200 shadow-xs">
                  <span className={`block text-2xl font-black ${primaryTextClass}`}>{result.updated}</span>
                  <span className="text-[11px] font-medium text-slate-600">{t.excel.updatedCount}</span>
                </div>
                <div className="bg-white rounded-lg p-3 text-center border border-slate-100 shadow-xs">
                  <span className="block text-2xl font-black text-slate-500">{result.ignored}</span>
                  <span className="text-[11px] font-medium text-slate-600">{t.excel.ignoredCount}</span>
                </div>
              </div>

              {/* === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — résumé
                  final après confirmation d'un import de membres (section 22). === */}
              {finalSummary && (
                <div className="pt-3 border-t border-emerald-100 space-y-2">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-white rounded-lg p-2.5 border border-emerald-100">
                      <span className="block text-slate-400 text-[10px] font-bold uppercase">Total Records</span>
                      <span className="font-black text-slate-800">{finalSummary.total}</span>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border border-emerald-100">
                      <span className="block text-slate-400 text-[10px] font-bold uppercase">Existing Retained</span>
                      <span className="font-black text-slate-800">{finalSummary.retained}</span>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border border-emerald-100">
                      <span className="block text-slate-400 text-[10px] font-bold uppercase">New Generated</span>
                      <span className="font-black text-emerald-600">{finalSummary.generated}</span>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border border-emerald-100">
                      <span className="block text-slate-400 text-[10px] font-bold uppercase">Duplicates / Invalid</span>
                      <span className="font-black text-rose-600">{finalSummary.duplicates + finalSummary.invalid}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs bg-white rounded-lg p-2.5 border border-emerald-100 font-mono">
                    <span className="text-slate-500">Last assigned: <strong className="text-slate-800">{finalSummary.lastAssigned || '—'}</strong></span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                    <span className="text-slate-500">Next available: <strong className="text-emerald-700">{finalSummary.nextAvailable}</strong></span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Template Download Section */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {t.excel.downloadTemplate}
            </p>

            {targetType === 'members' ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={generateMemberTemplateExcel}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Primary Insured Template</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={downloadSampleTemplate}
                className={`inline-flex items-center gap-1.5 text-xs ${primaryTextClass} hover:underline font-semibold cursor-pointer`}
              >
                <Download className="w-4 h-4" />
                {t.excel.downloadTemplate}
              </button>
            )}

            {result && !awaitingCardNumberConfirmation && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setFinalSummary(null);
                    setSelectedFileName('');
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                >
                  {'Upload another file'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          {/* === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — tant que
              l'aperçu n'est pas confirmé, "Cancel" n'a rien à défaire (section 23) ; "Confirm
              Import" réserve réellement les numéros puis persiste. === */}
          {awaitingCardNumberConfirmation ? (
            <>
              <button
                type="button"
                onClick={handleCancelPreview}
                disabled={confirming}
                className="px-5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={confirming}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {confirming && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{confirming ? 'Assigning card numbers…' : 'Confirm Import'}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className={`px-5 py-2 rounded-xl ${primaryBtnClass} text-white text-xs font-semibold shadow-xs transition cursor-pointer`}
            >
              {result ? t.excel.closeModal : t.cancel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
