import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  UploadCloud,
  Download,
  Stethoscope,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  X,
  Phone,
  MapPin,
  FileCheck,
} from 'lucide-react';
import { Provider, Language, ProviderType, KYPStatus } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { ExcelImportModal } from '../../components/ExcelImportModal';
import { ExportDropdown } from '../../components/ExportDropdown';
import {
  exportProvidersToCSV,
  exportProvidersToExcel,
  parseProviderExcel,
} from '../../utils/excelUtils';

interface ProvidersViewProps {
  lang: Language;
  providers: Provider[];
  onAddProvider: (provider: Partial<Provider>) => void;
  onUpdateProvider: (provider: Provider) => void;
  onDeleteProvider: (id: string) => void;
  onImportProviders: (imported: Partial<Provider>[]) => void;
}

export const ProvidersView: React.FC<ProvidersViewProps> = ({
  lang,
  providers,
  onAddProvider,
  onUpdateProvider,
  onDeleteProvider,
  onImportProviders,
}) => {
  const t = useTranslation(lang);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [kypFilter, setKypFilter] = useState('ALL');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<ProviderType>('Clinique');
  const [formLocation, setFormLocation] = useState('Monrovia — Sinkor');
  const [formConvention, setFormConvention] = useState('');
  const [formKyp, setFormKyp] = useState<KYPStatus>('validated');
  const [formPhone, setFormPhone] = useState('+231 770 00 00 00');

  const filteredProviders = useMemo(() => {
    return providers.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.conventionNumber.toLowerCase().includes(searchTerm.toLowerCase());

      const matchType = typeFilter === 'ALL' || p.type === typeFilter;
      const matchKyp = kypFilter === 'ALL' || p.kypStatus === kypFilter;

      return matchSearch && matchType && matchKyp;
    });
  }, [providers, searchTerm, typeFilter, kypFilter]);

  const openCreateModal = () => {
    setEditingProvider(null);
    setFormName('');
    setFormType('Clinique');
    setFormLocation('Monrovia — Central');
    setFormConvention(`CONV-2026-${Math.floor(1000 + Math.random() * 9000)}`);
    setFormKyp('validated');
    setFormPhone('+231 770 30 11 22');
    setModalOpen(true);
  };

  const openEditModal = (p: Provider) => {
    setEditingProvider(p);
    setFormName(p.name);
    setFormType(p.type);
    setFormLocation(p.location);
    setFormConvention(p.conventionNumber);
    setFormKyp(p.kypStatus);
    setFormPhone(p.contactPhone || '+231 770 30 11 22');
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    if (editingProvider) {
      onUpdateProvider({
        ...editingProvider,
        name: formName,
        type: formType,
        location: formLocation,
        conventionNumber: formConvention,
        kypStatus: formKyp,
        contactPhone: formPhone,
      });
    } else {
      onAddProvider({
        name: formName,
        type: formType,
        location: formLocation,
        conventionNumber: formConvention,
        kypStatus: formKyp,
        contactPhone: formPhone,
      });
    }
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Filter and Action Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center flex-1">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search provider by name, location, convention..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0a2e6b] focus:bg-white"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0a2e6b]"
          >
            <option value="ALL">All Provider Types</option>
            <option value="Hôpital">{t.providers.types.hospital}</option>
            <option value="Clinique">{t.providers.types.clinic}</option>
            <option value="Pharmacie">{t.providers.types.pharmacy}</option>
            <option value="Centre de diagnostic">{t.providers.types.diagnostic}</option>
            <option value="Cabinet dentaire">{t.providers.types.dental}</option>
            <option value="Optique">{t.providers.types.optical}</option>
          </select>

          <select
            value={kypFilter}
            onChange={(e) => setKypFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0a2e6b]"
          >
            <option value="ALL">All KYP Statuses</option>
            <option value="validated">{t.providers.kypValidated}</option>
            <option value="pending">{t.providers.kypPending}</option>
            <option value="rejected">{t.providers.kypRejected}</option>
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <ExportDropdown
            onExportExcel={() => exportProvidersToExcel(filteredProviders, lang)}
            onExportCSV={() => exportProvidersToCSV(filteredProviders, lang)}
            lang={lang}
            label="Export"
          />

          <button
            onClick={() => setImportModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#00A859] border border-emerald-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{t.providers.importExcel}</span>
          </button>

          <button
            onClick={openCreateModal}
            className="px-3.5 py-2 rounded-xl bg-[#0a2e6b] hover:bg-[#07214f] text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Provider</span>
          </button>
        </div>
      </div>

      {/* Providers Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Stethoscope className="w-4 h-4 text-[#0a2e6b]" />
            <h3 className="font-extrabold text-sm text-slate-900">{t.providers.title}</h3>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs font-black">
              {filteredProviders.length}
            </span>
          </div>
        </div>

        {filteredProviders.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium">
            {t.noData}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">{t.providers.name}</th>
                  <th className="py-3 px-4">{t.providers.type}</th>
                  <th className="py-3 px-4">{t.providers.location}</th>
                  <th className="py-3 px-4">{t.providers.conventionNumber}</th>
                  <th className="py-3 px-4">{t.providers.phone}</th>
                  <th className="py-3 px-4 text-center">{t.providers.kypStatus}</th>
                  <th className="py-3 px-4 text-right">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProviders.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">{p.name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-1 rounded-md bg-blue-50 text-[#0a2e6b] font-semibold text-[11px]">
                        {p.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{p.location}</span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-700 whitespace-nowrap">
                      {p.conventionNumber}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-600 whitespace-nowrap">
                      {p.contactPhone}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {p.kypStatus === 'validated' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-[#00A859] border border-emerald-200 text-[11px] font-extrabold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t.providers.kypValidated}</span>
                        </span>
                      )}
                      {p.kypStatus === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-extrabold">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{t.providers.kypPending}</span>
                        </span>
                      )}
                      {p.kypStatus === 'rejected' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-extrabold">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{t.providers.kypRejected}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditModal(p)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-[#0a2e6b] hover:bg-blue-50 transition cursor-pointer"
                          title={t.edit}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteProvider(p.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          title={t.delete}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#0a2e6b] p-6 text-white flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base">
                  {editingProvider ? 'Edit Healthcare Provider' : t.providers.createBtn}
                </h3>
                <p className="text-xs text-blue-100">
                  Healthcare facility accreditation & contract
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/15 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.providers.name}
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: JFK Medical Center"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.providers.type}
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as ProviderType)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold"
                  >
                    <option value="Hôpital">{t.providers.types.hospital}</option>
                    <option value="Clinique">{t.providers.types.clinic}</option>
                    <option value="Pharmacie">{t.providers.types.pharmacy}</option>
                    <option value="Centre de diagnostic">{t.providers.types.diagnostic}</option>
                    <option value="Cabinet dentaire">{t.providers.types.dental}</option>
                    <option value="Optique">{t.providers.types.optical}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.providers.kypStatus}
                  </label>
                  <select
                    value={formKyp}
                    onChange={(e) => setFormKyp(e.target.value as KYPStatus)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold"
                  >
                    <option value="validated">{t.providers.kypValidated}</option>
                    <option value="pending">{t.providers.kypPending}</option>
                    <option value="rejected">{t.providers.kypRejected}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.providers.location}
                </label>
                <input
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="Ex: Monrovia — Sinkor"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.providers.conventionNumber}
                  </label>
                  <input
                    type="text"
                    value={formConvention}
                    onChange={(e) => setFormConvention(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.providers.phone}
                  </label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#0a2e6b] hover:bg-[#07214f] text-white text-xs font-bold shadow-md shadow-[#0a2e6b]/20 cursor-pointer"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXCEL IMPORT MODAL */}
      <ExcelImportModal<Provider>
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        lang={lang}
        title={t.providers.importExcel}
        targetType="providers"
        onImport={(file) => parseProviderExcel(file, providers)}
        onSuccess={(importedList) => {
          onImportProviders(importedList);
          setImportModalOpen(false);
        }}
      />
    </div>
  );
};
