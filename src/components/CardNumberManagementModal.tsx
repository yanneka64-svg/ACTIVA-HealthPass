// === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System ===
// Panneau Admin "Card Number Management" (section 20/21 de la demande) — volontairement une
// modale séparée ouverte depuis un bouton dédié sur la ligne de l'organisation (même
// convention que le bouton "Policy"), jamais une colonne ajoutée au tableau principal des
// organisations, pour garder ce tableau propre.
import React, { useState } from 'react';
import { CreditCard, X, RefreshCw, History, CheckCircle2, AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Member, Organization, CardNumberAssignment, CardNumberCounters } from '../types';
import { getCurrentCounters, migrateCardNumberCounters, isValidCardNumberFormat, formatCardNumber, CardFormatMigrationSummary } from '../services/cardNumberService';

interface CardNumberManagementModalProps {
  organization: Organization;
  members: Member[];
  currentUser?: any;
  onClose: () => void;
  // === AMÉLIORATION AJOUTÉE (v2 — nouvelle structure AMID-YYMMDD-NNNNN) : migration
  // ponctuelle de toutes les cartes déjà existantes. Optionnel — orchestré depuis App.tsx qui
  // seul a accès à toutes les collections concernées (sinistres, factures, fiches médicales,
  // inscriptions) en plus des assurés.
  onMigrateAllCards?: () => Promise<CardFormatMigrationSummary>;
}

export const CardNumberManagementModal: React.FC<CardNumberManagementModalProps> = ({
  organization,
  members,
  onClose,
  onMigrateAllCards,
}) => {
  const [counters, setCounters] = useState<CardNumberCounters | null>(null);
  const [loadingCounters, setLoadingCounters] = useState(true);
  const [validating, setValidating] = useState(false);
  const [validateMessage, setValidateMessage] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<CardNumberAssignment[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // === AMÉLIORATION AJOUTÉE (v2) : migration ponctuelle de format — action à part,
  // volontairement séparée et bien plus mise en garde que "Validate" (irréversible, touche
  // tous les assurés et leurs ayants droit, toutes organisations confondues).
  const [migrateConfirmOpen, setMigrateConfirmOpen] = useState(false);
  const [migrateConfirmInput, setMigrateConfirmInput] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [migrationSummary, setMigrationSummary] = useState<CardFormatMigrationSummary | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  React.useEffect(() => {
    getCurrentCounters()
      .then(setCounters)
      .finally(() => setLoadingCounters(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orgMembers = members.filter((m) => (m.organization || '').trim().toLowerCase() === organization.name.trim().toLowerCase());
  const isActive = (s: string) => s === 'Active' || s === 'Actif';
  const isSuspended = (s: string) => s === 'Suspended' || s === 'Suspendu';
  const isInactive = (s: string) => s === 'Inactive' || s === 'Inactif';

  const totalIssued = orgMembers.length;
  const totalActive = orgMembers.filter((m) => isActive(m.status)).length;
  const totalSuspended = orgMembers.filter((m) => isSuspended(m.status)).length;
  const totalInactive = orgMembers.filter((m) => isInactive(m.status)).length;

  // Anomalies : format invalide (ancienne structure non encore migrée, ou saisie erronée), ou
  // numéro partagé avec un autre assuré (n'importe où, pas seulement dans cette organisation —
  // un doublon reste un doublon).
  const cardNoCounts = new Map<string, number>();
  members.forEach((m) => cardNoCounts.set(m.cardNo, (cardNoCounts.get(m.cardNo) || 0) + 1));
  const anomalyCount = orgMembers.filter(
    (m) => !isValidCardNumberFormat(m.cardNo) || (cardNoCounts.get(m.cardNo) || 0) > 1
  ).length;
  const legacyFormatCount = members.filter((m) => m.cardNo && !isValidCardNumberFormat(m.cardNo)).length;

  const nextAssured = counters ? (counters.lastAssuredNumber || 0) + 1 : null;
  const pad = (n: number, w: number) => String(n).padStart(w, '0');
  const alreadyMigratedToV2 = counters?.formatVersion === 'v2';

  const handleValidateSequence = async () => {
    setValidating(true);
    setValidateMessage(null);
    try {
      const updated = await migrateCardNumberCounters(members);
      setCounters(updated);
      setValidateMessage(`Sequence validated. Last Assured Number: ${pad(updated.lastAssuredNumber, 5)}.`);
    } catch (err: any) {
      setValidateMessage(err?.message || 'Could not validate the card number sequence.');
    } finally {
      setValidating(false);
    }
  };

  const handleViewHistory = async () => {
    setHistoryOpen((prev) => !prev);
    if (historyRows !== null) return; // already loaded
    setHistoryLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'cardNumberRegistry'), where('organization', '==', organization.name)));
      const rows = snap.docs.map((d) => d.data() as CardNumberAssignment);
      rows.sort((a, b) => (b.assignedAt || '').localeCompare(a.assignedAt || ''));
      setHistoryRows(rows);
    } catch {
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleConfirmMigration = async () => {
    if (!onMigrateAllCards) return;
    setMigrating(true);
    setMigrationError(null);
    try {
      const summary = await onMigrateAllCards();
      setMigrationSummary(summary);
      setMigrateConfirmOpen(false);
      setMigrateConfirmInput('');
      const updated = await getCurrentCounters();
      setCounters(updated);
    } catch (err: any) {
      setMigrationError(err?.message || 'The migration failed. No further changes were made — check the console for details before retrying.');
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-[#0A347B]">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight text-slate-900">Card Number Management</h3>
              <p className="text-xs text-slate-500 mt-0.5">{organization.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Sequence state */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Last Assured Number</span>
              <span className="block text-xl font-black text-slate-800 font-mono mt-0.5">
                {loadingCounters ? '…' : counters ? pad(counters.lastAssuredNumber, 5) : '00000'}
              </span>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3.5 border border-emerald-200">
              <span className="block text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Next Card Number</span>
              <span className="block text-xl font-black text-emerald-700 font-mono mt-0.5">
                {nextAssured !== null ? formatCardNumber(new Date(), nextAssured) : '…'}
              </span>
            </div>
          </div>
          <p className="text-[10.5px] text-slate-400 leading-relaxed -mt-2">
            Structure: AMID-YYMMDD-NNNNN — YYMMDD is the issue date, NNNNN is one shared sequence across every organization's principals and dependents.
          </p>

          {/* Org-scoped stats */}
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">{organization.name} — Card Statistics</p>
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-white rounded-lg p-2.5 text-center border border-slate-200">
                <span className="block text-lg font-black text-slate-800">{totalIssued}</span>
                <span className="text-[10px] font-medium text-slate-500">Total Issued</span>
              </div>
              <div className="bg-white rounded-lg p-2.5 text-center border border-emerald-100">
                <span className="block text-lg font-black text-emerald-600">{totalActive}</span>
                <span className="text-[10px] font-medium text-slate-500">Active</span>
              </div>
              <div className="bg-white rounded-lg p-2.5 text-center border border-amber-100">
                <span className="block text-lg font-black text-amber-600">{totalSuspended}</span>
                <span className="text-[10px] font-medium text-slate-500">Suspended</span>
              </div>
              <div className="bg-white rounded-lg p-2.5 text-center border border-slate-100">
                <span className="block text-lg font-black text-slate-500">{totalInactive}</span>
                <span className="text-[10px] font-medium text-slate-500">Inactive</span>
              </div>
              <div className="bg-white rounded-lg p-2.5 text-center border border-slate-100">
                <span className="block text-lg font-black text-slate-700">
                  {loadingCounters ? '…' : counters ? counters.lastAssuredNumber : 0}
                </span>
                <span className="text-[10px] font-medium text-slate-500">Consumed (all orgs)</span>
              </div>
              <div className="bg-white rounded-lg p-2.5 text-center border border-rose-100">
                <span className="block text-lg font-black text-rose-600">{anomalyCount}</span>
                <span className="text-[10px] font-medium text-slate-500">Duplicate / Anomaly</span>
              </div>
            </div>
          </div>

          {/* Validate sequence */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-700">Validate Card Number Sequence</p>
                <p className="text-[10.5px] text-slate-500 mt-0.5">
                  Re-scans every insured member, raises the counter to the true historical maximum, and backfills the uniqueness registry. Safe to run anytime.
                </p>
              </div>
              <button
                type="button"
                onClick={handleValidateSequence}
                disabled={validating}
                className="shrink-0 px-3.5 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {validating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>{validating ? 'Validating…' : 'Validate'}</span>
              </button>
            </div>
            {validateMessage && (
              <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                {validateMessage}
              </p>
            )}
          </div>

          {/* === AMÉLIORATION AJOUTÉE (v2) : migration ponctuelle vers AMID-YYMMDD-NNNNN — sur
              demande explicite, avec les choix confirmés (renumérotation complète, date de
              création de chaque assuré, répercussion sur sinistres/factures/fiches/inscriptions).
              Action clairement séparée et mise en garde plus fortement que "Validate"
              ci-dessus : irréversible, porte sur TOUS les assurés de TOUTES les organisations. === */}
          {onMigrateAllCards && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 space-y-3">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-rose-900">
                    Migrate ALL Cards to the New Format (AMID-YYMMDD-NNNNN)
                  </p>
                  <p className="text-[10.5px] text-rose-700 mt-0.5 leading-relaxed">
                    Renumbers every insured member and dependent still on the old format, across{' '}
                    <strong>every organization</strong> — not just {organization.name}. Every claim, invoice, medical
                    form, and enrollment referencing an old number is updated to match. This cannot be undone.
                    {legacyFormatCount > 0 ? ` ${legacyFormatCount} card(s) are still on the old format.` : ' No cards are on the old format anymore.'}
                  </p>
                </div>
              </div>

              {alreadyMigratedToV2 && legacyFormatCount === 0 ? (
                <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  All cards already use the new format.
                </p>
              ) : !migrateConfirmOpen ? (
                <button
                  type="button"
                  onClick={() => setMigrateConfirmOpen(true)}
                  className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer"
                >
                  Migrate All Cards…
                </button>
              ) : (
                <div className="space-y-2.5 bg-white border border-rose-200 rounded-lg p-3">
                  <label className="block text-[11px] font-bold text-slate-600">
                    Type <span className="text-rose-600">MIGRATE</span> to confirm this irreversible, application-wide change
                  </label>
                  <input
                    type="text"
                    value={migrateConfirmInput}
                    onChange={(e) => setMigrateConfirmInput(e.target.value)}
                    placeholder="MIGRATE"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMigrateConfirmOpen(false);
                        setMigrateConfirmInput('');
                      }}
                      disabled={migrating}
                      className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmMigration}
                      disabled={migrating || migrateConfirmInput.trim() !== 'MIGRATE'}
                      className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {migrating && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      <span>{migrating ? 'Migrating…' : 'Confirm Migration'}</span>
                    </button>
                  </div>
                </div>
              )}

              {migrationError && (
                <p className="text-[11px] font-semibold text-rose-700 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {migrationError}
                </p>
              )}

              {migrationSummary && (
                <div className="bg-white border border-emerald-200 rounded-lg p-3 space-y-1.5">
                  <p className="text-[11px] font-bold text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                    Migration complete.
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 text-[10.5px] text-slate-600">
                    <span>Members renumbered: <strong className="text-slate-800">{migrationSummary.migratedMembers}</strong></span>
                    <span>Dependents renumbered: <strong className="text-slate-800">{migrationSummary.migratedDependents}</strong></span>
                    <span>Claims updated: <strong className="text-slate-800">{migrationSummary.claimsUpdated}</strong></span>
                    <span>Invoices updated: <strong className="text-slate-800">{migrationSummary.invoicesUpdated}</strong></span>
                    <span>Medical forms updated: <strong className="text-slate-800">{migrationSummary.medicalFormsUpdated}</strong></span>
                    <span>Enrollments updated: <strong className="text-slate-800">{migrationSummary.enrollmentsUpdated}</strong></span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Import existing numbers — sur demande explicite (section 20), sans dupliquer un
              second pipeline d'import : réutilise l'import Excel des Assurés existant (Admin
              > Insured Members > Import Excel), qui applique déjà exactement les mêmes
              règles de conservation/génération des numéros de carte (voir ExcelImportModal). */}
          <div className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-600 flex items-center gap-2">
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span>
              <strong className="text-slate-800">Import Existing Card Numbers:</strong> use the Excel import on the{' '}
              <strong className="text-slate-800">Insured Members</strong> screen — it already keeps every provided
              Card No. and only generates new ones for blank rows.
            </span>
          </div>

          {/* History */}
          <div>
            <button
              type="button"
              onClick={handleViewHistory}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-400" />
                View Card Number History
              </span>
              <span className="text-slate-400">{historyOpen ? '−' : '+'}</span>
            </button>
            {historyOpen && (
              <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden">
                {historyLoading ? (
                  <div className="p-4 text-center text-xs text-slate-400">Loading…</div>
                ) : historyRows && historyRows.length > 0 ? (
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr className="text-left text-slate-500 font-bold uppercase tracking-wide text-[10px]">
                          <th className="px-3 py-2">Card Number</th>
                          <th className="px-3 py-2">Insured</th>
                          <th className="px-3 py-2">Method</th>
                          <th className="px-3 py-2">Assigned</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {historyRows.map((row) => (
                          <tr key={row.cardNumber}>
                            <td className="px-3 py-2 font-mono font-bold text-slate-800">{row.cardNumber}</td>
                            <td className="px-3 py-2 text-slate-600">{row.insuredName || '—'}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">{row.method}</span>
                            </td>
                            <td className="px-3 py-2 text-slate-400 font-mono">{(row.assignedAt || '').slice(0, 10)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    No card number history found for this organization yet.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
