// === AMÉLIORATION AJOUTÉE : HealthPass 2.0, Phase 1 — Tariff Engine ===
// Panneau Admin de gestion des tarifs médicaux d'un prestataire, ouvert depuis un bouton dédié
// sur la ligne du prestataire dans ProvidersView (même convention que le bouton "Card Number
// Management" sur la ligne d'une organisation, voir CardNumberManagementModal.tsx) — jamais une
// colonne ajoutée au tableau principal des prestataires, pour le garder inchangé. Entièrement
// gardé par le flag `hp2_tariff_engine` côté appelant : ce composant n'est ni importé ni monté
// tant que le flag reste désactivé (défaut).
import React, { useMemo, useState } from 'react';
import { Receipt, X, PlusCircle, Trash2, Sparkles } from 'lucide-react';
import { MedicalTariff, Provider } from '../../types';
import { FirestoreService } from '../../services/firestore';
import { useCurrency } from '../../services/currency';
import { ADMIN_THEME } from '../../theme/roleTheme';
import { TARIFF_STARTER_CATALOG } from './starterCatalog';

interface ProviderTariffsModalProps {
  provider: Provider;
  tariffs: MedicalTariff[];
  onClose: () => void;
}

export const ProviderTariffsModal: React.FC<ProviderTariffsModalProps> = ({ provider, tariffs, onClose }) => {
  const { formatMoney } = useCurrency();
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [savingRow, setSavingRow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newTariff, setNewTariff] = useState('');
  const [newCoverage, setNewCoverage] = useState('');

  const providerTariffs = useMemo(
    () => tariffs.filter((t) => t.providerId === provider.id),
    [tariffs, provider.id]
  );

  const groupedByCategory = useMemo(() => {
    const groups = new Map<string, MedicalTariff[]>();
    providerTariffs.forEach((t) => {
      const key = t.category || 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    });
    return Array.from(groups.entries());
  }, [providerTariffs]);

  const handleLoadStarterCatalog = async () => {
    setError(null);
    setLoadingCatalog(true);
    try {
      for (const entry of TARIFF_STARTER_CATALOG) {
        // eslint-disable-next-line no-await-in-loop -- séquentiel volontaire, petit volume (14 lignes)
        await FirestoreService.addMedicalTariff({
          providerId: provider.id,
          providerName: provider.name,
          category: entry.category,
          serviceName: entry.serviceName,
          code: entry.code,
          tariffUsd: entry.tariffUsd,
          coverageRate: entry.coverageRate,
          createdAt: new Date().toISOString(),
        });
      }
    } catch {
      setError('Could not load the starter catalog. Please try again.');
    } finally {
      setLoadingCatalog(false);
    }
  };

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const tariffUsd = parseFloat(newTariff);
    const coverageRate = parseFloat(newCoverage);
    if (!newName.trim()) {
      setError('Service name is required.');
      return;
    }
    if (Number.isNaN(tariffUsd) || tariffUsd < 0) {
      setError('Tariff must be a positive number (USD).');
      return;
    }
    if (Number.isNaN(coverageRate) || coverageRate < 0 || coverageRate > 100) {
      setError('Coverage rate must be between 0 and 100.');
      return;
    }
    setSavingRow(true);
    try {
      await FirestoreService.addMedicalTariff({
        providerId: provider.id,
        providerName: provider.name,
        category: 'Custom',
        serviceName: newName.trim(),
        code: newCode.trim() || '—',
        tariffUsd,
        coverageRate,
        createdAt: new Date().toISOString(),
      });
      setNewName('');
      setNewCode('');
      setNewTariff('');
      setNewCoverage('');
    } catch {
      setError('Could not add this service. Please try again.');
    } finally {
      setSavingRow(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await FirestoreService.deleteMedicalTariff(id);
    } catch {
      setError('Could not remove this service. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-[#0A347B]">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight text-slate-900">Medical Tariffs</h3>
              <p className="text-xs text-slate-500 mt-0.5">{provider.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <p className="text-[10.5px] text-slate-400 leading-relaxed">
            Tariffs are entered once, in USD — the L$ amount shown everywhere is calculated
            automatically from the exchange rate already used across the app.
          </p>

          {error && (
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
              {error}
            </div>
          )}

          {providerTariffs.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-slate-300 text-center space-y-3">
              <p className="text-xs text-slate-500">No tariffs have been set for this provider yet.</p>
              <button
                type="button"
                onClick={handleLoadStarterCatalog}
                disabled={loadingCatalog}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#00A859] border border-emerald-200 text-xs font-bold transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {loadingCatalog ? 'Loading…' : 'Load Starter Catalog (14 services)'}
              </button>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr className="text-left text-slate-500 font-bold uppercase tracking-wide text-[10px]">
                      <th className="px-3 py-2">Service</th>
                      <th className="px-3 py-2">Code</th>
                      <th className="px-3 py-2">Tariff</th>
                      <th className="px-3 py-2">Coverage</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {groupedByCategory.map(([category, rows]) => (
                      <React.Fragment key={category}>
                        <tr className="bg-emerald-50/60">
                          <td colSpan={5} className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-emerald-800">
                            {category}
                          </td>
                        </tr>
                        {rows.map((t) => (
                          <tr key={t.id}>
                            <td className="px-3 py-2 font-bold text-slate-800">{t.serviceName}</td>
                            <td className="px-3 py-2 font-mono text-slate-500">{t.code}</td>
                            <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{formatMoney(t.tariffUsd, 'DUAL')}</td>
                            <td className="px-3 py-2 font-semibold text-slate-700">{t.coverageRate}%</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleDelete(t.id)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                title="Remove"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Add a service not in the catalog */}
          <form onSubmit={handleAddService} className="space-y-2.5">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Add Another Service</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Service name"
                className="col-span-2 sm:col-span-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium"
              />
              <input
                type="text"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Code"
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={newTariff}
                onChange={(e) => setNewTariff(e.target.value)}
                placeholder="Tariff (USD)"
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium"
              />
              <input
                type="number"
                min="0"
                max="100"
                value={newCoverage}
                onChange={(e) => setNewCoverage(e.target.value)}
                placeholder="Coverage %"
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium"
              />
            </div>
            <button
              type="submit"
              disabled={savingRow}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#00A859] border border-emerald-200 text-xs font-bold transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              {savingRow ? 'Adding…' : 'Add Service'}
            </button>
          </form>
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
