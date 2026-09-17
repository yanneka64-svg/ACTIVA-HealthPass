// === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System ===
// Panneau Admin "Card Number Management" (section 20/21 de la demande) — volontairement une
// modale séparée ouverte depuis un bouton dédié sur la ligne de l'organisation (même
// convention que le bouton "Policy"), jamais une colonne ajoutée au tableau principal des
// organisations, pour garder ce tableau propre.
//
// === AMÉLIORATION AJOUTÉE (v3 — saisie/import manuel, 2026-09-09) : sur demande explicite,
// tous les outils liés à la génération automatique (aperçu du "prochain numéro", compteur de
// séquence, "Validate Card Number Sequence", "Migrate All Cards to New Format", "Continuity &
// Sequence Gap Audit") sont retirés — ils n'ont plus de sens sans génération séquentielle.
// Ce qui reste : les statistiques par organisation, l'audit de doublon/format (désormais basé
// sur le format libre à 11 caractères alphanumériques), la délégation vers l'import Excel, et
// l'historique des attributions (toujours utile pour l'audit, saisie manuelle comme import).
import React, { useState } from 'react';
import { CreditCard, X, History, AlertTriangle, ArrowRight } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Member, Organization, CardNumberAssignment } from '../types';
import { isValidCardNumberFormat } from '../services/cardNumberService';
import { ADMIN_THEME } from '../theme/roleTheme';

interface CardNumberManagementModalProps {
  organization: Organization;
  members: Member[];
  currentUser?: any;
  onClose: () => void;
}

export const CardNumberManagementModal: React.FC<CardNumberManagementModalProps> = ({
  organization,
  members,
  onClose,
}) => {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<CardNumberAssignment[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const orgMembers = members.filter((m) => (m.organization || '').trim().toLowerCase() === organization.name.trim().toLowerCase());
  const isActive = (s: string) => s === 'Active' || s === 'Actif';
  const isSuspended = (s: string) => s === 'Suspended' || s === 'Suspendu';
  const isInactive = (s: string) => s === 'Inactive' || s === 'Inactif';

  const totalIssued = orgMembers.length;
  const totalActive = orgMembers.filter((m) => isActive(m.status)).length;
  const totalSuspended = orgMembers.filter((m) => isSuspended(m.status)).length;
  const totalInactive = orgMembers.filter((m) => isInactive(m.status)).length;

  // Anomalies : format invalide (numéro qui ne respecte pas les 11 caractères alphanumériques
  // — par ex. une carte encore sur l'ancien format, à corriger manuellement), ou numéro
  // partagé avec un autre assuré (n'importe où, pas seulement dans cette organisation — un
  // doublon reste un doublon).
  const cardNoCounts = new Map<string, number>();
  members.forEach((m) => cardNoCounts.set(m.cardNo, (cardNoCounts.get(m.cardNo) || 0) + 1));
  const anomalyCount = orgMembers.filter(
    (m) => !isValidCardNumberFormat(m.cardNo) || (cardNoCounts.get(m.cardNo) || 0) > 1
  ).length;

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
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Format: 11 alphanumeric characters (A-Z, 0-9) — entered manually at enrollment, or already
            present in the file used for Excel import. Numbers are never generated automatically.
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
              <div className="bg-white rounded-lg p-2.5 text-center border border-rose-100">
                <span className="block text-lg font-black text-rose-600">{anomalyCount}</span>
                <span className="text-[10px] font-medium text-slate-500">Duplicate / Anomaly</span>
              </div>
            </div>
          </div>

          {/* Import existing numbers — sur demande explicite (section 20), sans dupliquer un
              second pipeline d'import : réutilise l'import Excel des Assurés existant (Admin
              > Insured Members > Import Excel). */}
          <div className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-600 flex items-center gap-2">
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span>
              <strong className="text-slate-800">Import Existing Card Numbers:</strong> use the Excel import on the{' '}
              <strong className="text-slate-800">Insured Members</strong> screen — every row must already carry its
              own Card No. from the template.
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
            className={`px-5 py-2 rounded-xl ${ADMIN_THEME.palette.primaryColor} text-white text-xs font-semibold shadow-xs transition cursor-pointer`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
