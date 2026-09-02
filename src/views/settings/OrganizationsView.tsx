import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  UploadCloud,
  Download,
  Building,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  X,
  Users,
  Shield,
  Calendar,
  Percent,
} from 'lucide-react';
import { Organization, Language, OrgStatus } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { ExcelImportModal } from '../../components/ExcelImportModal';
import { ExportDropdown } from '../../components/ExportDropdown';
import {
  exportOrganizationsToCSV,
  exportOrganizationsToExcel,
  parseOrganizationExcel,
} from '../../utils/excelUtils';

interface OrganizationsViewProps {
  lang: Language;
  organizations: Organization[];
  members?: any[];
  onAddOrganization: (org: Partial<Organization>) => void;
  onUpdateOrganization: (org: Organization) => void;
  onDeleteOrganization: (id: string) => void;
  onImportOrganizations: (imported: Partial<Organization>[]) => void;
  onSuspendOrganization?: (org: Organization) => void;
  onReactivateOrganization?: (org: Organization) => void;
  onSelectMember?: (member: any) => void;
}

export const OrganizationsView: React.FC<OrganizationsViewProps> = ({
  lang,
  organizations,
  members = [],
  onAddOrganization,
  onUpdateOrganization,
  onDeleteOrganization,
  onImportOrganizations,
  onSuspendOrganization,
  onReactivateOrganization,
}) => {
  const t = useTranslation(lang);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);

  // View Members Modal on double click
  const [viewMembersOrg, setViewMembersOrg] = useState<Organization | null>(null);

  // Suspend/Reactivate confirmation modal
  const [confirmOrgAction, setConfirmOrgAction] = useState<{ org: Organization; action: 'suspend' | 'reactivate' } | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formPolicy, setFormPolicy] = useState('');
  const [formEffective, setFormEffective] = useState('2026-01-01');
  const [formExpiration, setFormExpiration] = useState('2026-12-31');
  const [formMembers, setFormMembers] = useState('120');
  const [formRate, setFormRate] = useState('80');
  const [formStatus, setFormStatus] = useState<OrgStatus>('Actif');
  const [formContactPhone, setFormContactPhone] = useState('+237 600 000 000');
  const [formContactEmail, setFormContactEmail] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleQuickCoverageChange = (org: Organization, newRate: number) => {
    const updated: Organization = {
      ...org,
      coverageRate: newRate,
    };
    onUpdateOrganization(updated);
    showToast(`Coverage rate updated for ${org.name}: ${newRate}%`);
  };

  const handleToggleSuspend = (org: Organization) => {
    const isCurrentlySuspended = org.status === 'Suspended' || org.status === 'Suspendu';
    setConfirmOrgAction({
      org,
      action: isCurrentlySuspended ? 'reactivate' : 'suspend',
    });
  };

  const executeConfirmAction = () => {
    if (!confirmOrgAction) return;
    const { org, action } = confirmOrgAction;
    if (action === 'suspend') {
      if (onSuspendOrganization) {
        onSuspendOrganization(org);
      } else {
        onUpdateOrganization({ ...org, status: 'Suspendu' });
      }
      showToast(`Organization "${org.name}" has been SUSPENDED. All linked members and dependents are blocked.`);
    } else {
      if (onReactivateOrganization) {
        onReactivateOrganization(org);
      } else {
        onUpdateOrganization({ ...org, status: 'Actif' });
      }
      showToast(`Organization "${org.name}" has been REACTIVATED.`);
    }
    setConfirmOrgAction(null);
  };

  const orgMembersList = useMemo(() => {
    if (!viewMembersOrg) return [];
    return members.filter(
      (m) => m.organization?.toLowerCase().trim() === viewMembersOrg.name.toLowerCase().trim()
    );
  }, [viewMembersOrg, members]);

  const filteredOrgs = useMemo(() => {
    return organizations.filter((org) => {
      const matchSearch =
        org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        org.policyNumber.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || org.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [organizations, searchTerm, statusFilter]);

  const openCreateModal = () => {
    setEditingOrg(null);
    setFormName('');
    setFormPolicy(`POL-2026-${Math.floor(1000 + Math.random() * 9000)}`);
    setFormEffective('2026-01-01');
    setFormExpiration('2026-12-31');
    setFormMembers('120');
    setFormRate('80');
    setFormStatus('Actif');
    setFormContactPhone('+231 770 11 22 33');
    setFormContactEmail('contact@organization.com');
    setModalOpen(true);
  };

  const openEditModal = (org: Organization) => {
    setEditingOrg(org);
    setFormName(org.name);
    setFormPolicy(org.policyNumber);
    setFormEffective(org.effectiveDate);
    setFormExpiration(org.expirationDate);
    setFormMembers(org.declaredMembers.toString());
    setFormRate(org.coverageRate.toString());
    setFormStatus(org.status);
    setFormContactPhone(org.contactPhone || '+231 770 11 22 33');
    setFormContactEmail(org.contactEmail || '');
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    if (editingOrg) {
      onUpdateOrganization({
        ...editingOrg,
        name: formName,
        policyNumber: formPolicy,
        effectiveDate: formEffective,
        expirationDate: formExpiration,
        declaredMembers: parseInt(formMembers, 10) || 50,
        coverageRate: parseInt(formRate, 10) || 80,
        status: formStatus,
        contactPhone: formContactPhone,
        contactEmail: formContactEmail,
      });
      showToast(`Organization ${formName} updated with ${formRate}% coverage rate.`);
    } else {
      onAddOrganization({
        name: formName,
        policyNumber: formPolicy,
        effectiveDate: formEffective,
        expirationDate: formExpiration,
        declaredMembers: parseInt(formMembers, 10) || 50,
        coverageRate: parseInt(formRate, 10) || 80,
        status: formStatus,
        contactPhone: formContactPhone,
        contactEmail: formContactEmail,
      });
      showToast(`Organization ${formName} registered successfully with ${formRate}% coverage.`);
    }
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl flex items-center gap-2.5 text-xs font-bold animate-in fade-in shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Action Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="flex flex-wrap sm:flex-nowrap gap-2.5 items-center flex-1">
          <div className="relative flex-1 min-w-[220px]">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search organization by name, policy..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          >
            <option value="ALL">All Statuses</option>
            <option value="Actif">Active</option>
            <option value="Suspendu">Suspended</option>
            <option value="Expiré">Expired</option>
          </select>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <ExportDropdown
            lang={lang}
            onExportExcel={() => exportOrganizationsToExcel(filteredOrgs, lang)}
            onExportPDF={() => exportOrganizationsToCSV(filteredOrgs, lang)}
          />

          <button
            onClick={() => setImportModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#047857] border border-emerald-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <UploadCloud className="w-4 h-4 text-[#10B981]" />
            <span>Import Excel</span>
          </button>

          <button
            onClick={openCreateModal}
            className="px-4 py-2 rounded-xl bg-[#0a2e6b] hover:bg-[#0a2e6b] text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ New Organization</span>
          </button>
        </div>
      </div>

      {/* Organizations Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Building className="w-5 h-5 text-[#2563EB]" />
            <h3 className="font-bold text-base text-[#0a2e6b]">Partner & Client Organizations</h3>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-[#2563EB] text-xs font-bold border border-blue-100">
              {filteredOrgs.length}
            </span>
          </div>
        </div>

        {filteredOrgs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium">
            No organizations match your search criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Organization Name</th>
                  <th className="py-3.5 px-4">Policy Number</th>
                  <th className="py-3.5 px-4">Declared Members</th>
                  <th className="py-3.5 px-4">Coverage Rate (%)</th>
                  <th className="py-3.5 px-4">Effective Period</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrgs.map((org) => {
                  const isSuspended = org.status === 'Suspendu' || org.status === 'Suspended';
                  return (
                    <tr
                      key={org.id}
                      onDoubleClick={() => setViewMembersOrg(org)}
                      className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                      title="Double-click to view enrolled members for this organization"
                    >
                      <td className="py-3.5 px-4 font-bold text-[#0a2e6b]">
                        <div className="flex items-center gap-2">
                          <Building className="w-4 h-4 text-blue-600/70 group-hover:text-blue-600 flex-shrink-0" />
                          <span>{org.name}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-[#2563EB] whitespace-nowrap">
                        {org.policyNumber}
                      </td>
                      <td className="py-3.5 px-4 text-[#0a2e6b] font-semibold">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                          <Users className="w-3 h-3 text-slate-500" />
                          {org.declaredMembers} members
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold">
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={org.coverageRate}
                            onChange={(e) => handleQuickCoverageChange(org, parseInt(e.target.value, 10))}
                            className="bg-emerald-50 text-[#047857] font-bold text-xs px-2.5 py-1 rounded-lg border border-emerald-200 cursor-pointer hover:bg-emerald-100 transition focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                            title="Quick modify coverage rate"
                          >
                            <option value="50">50%</option>
                            <option value="60">60%</option>
                            <option value="70">70%</option>
                            <option value="75">75%</option>
                            <option value="80">80%</option>
                            <option value="85">85%</option>
                            <option value="90">90%</option>
                            <option value="95">95%</option>
                            <option value="100">100%</option>
                          </select>
                          <span className="text-[11px] text-[#64748B] font-medium">
                            (Co-pay: {100 - org.coverageRate}%)
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-[#64748B] text-xs font-medium whitespace-nowrap">
                        {org.effectiveDate} → {org.expirationDate}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {!isSuspended && org.status !== 'Expiré' && org.status !== 'Expired' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ECFDF5] text-[#047857] border border-emerald-200 text-xs font-semibold">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></div>
                            <span>Active</span>
                          </span>
                        )}
                        {isSuspended && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                            <span>Suspended</span>
                          </span>
                        )}
                        {(org.status === 'Expiré' || org.status === 'Expired' || org.status === 'Inactive') && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold">
                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
                            <span>Expired</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleToggleSuspend(org)}
                            className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                              isSuspended
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                            }`}
                            title={isSuspended ? 'Reactivate organization' : 'Suspend organization policy'}
                          >
                            {isSuspended ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Reactivate</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3.5 h-3.5 text-amber-600" />
                                <span>Suspend</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => openEditModal(org)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#2563EB] hover:bg-blue-50 transition cursor-pointer"
                            title="Edit organization & coverage"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteOrganization(org.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Delete organization"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
                  {editingOrg ? 'Edit Organization Policy' : 'Register New Organization'}
                </h3>
                <p className="text-xs text-blue-100">Collective Group Insurance Policy & Coverage</p>
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
                  Organization / Company Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Liberia Petroleum Refining Company"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Policy Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formPolicy}
                    onChange={(e) => setFormPolicy(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-[#2563EB]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Policy Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as OrgStatus)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold"
                  >
                    <option value="Actif">Active</option>
                    <option value="Suspendu">Suspended</option>
                    <option value="Expiré">Expired</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Declared Insured Members Count
                </label>
                <input
                  type="number"
                  value={formMembers}
                  onChange={(e) => setFormMembers(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold"
                />
              </div>

              {/* COVERAGE RATE INTERACTIVE PICKER */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-slate-800">
                    Coverage Rate: <span className="text-[#047857] text-sm font-black">{formRate}%</span>
                  </label>
                  <span className="text-[11px] font-bold text-slate-500">
                    Patient Co-pay: <span className="text-amber-700">{100 - (parseInt(formRate, 10) || 0)}%</span>
                  </span>
                </div>

                {/* Preset Pills */}
                <div className="flex flex-wrap gap-1.5">
                  {[70, 75, 80, 85, 90, 100].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setFormRate(rate.toString())}
                      className={`px-2.5 py-1 rounded-lg text-xs font-black transition cursor-pointer ${
                        parseInt(formRate, 10) === rate
                          ? 'bg-[#0a2e6b] text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {rate}%
                    </button>
                  ))}
                </div>

                {/* Slider and direct input */}
                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={parseInt(formRate, 10) || 80}
                    onChange={(e) => setFormRate(e.target.value)}
                    className="flex-1 accent-[#0a2e6b] cursor-pointer"
                  />
                  <div className="flex items-center gap-1 w-20">
                    <input
                      type="number"
                      min="10"
                      max="100"
                      value={formRate}
                      onChange={(e) => setFormRate(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center text-slate-800"
                    />
                    <span className="text-xs font-bold text-slate-500">%</span>
                  </div>
                </div>

                {/* Visual Ratio Indicator */}
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden flex">
                  <div
                    style={{ width: `${Math.min(100, Math.max(0, parseInt(formRate, 10) || 80))}%` }}
                    className="bg-[#10B981] h-full"
                    title={`Activa Coverage: ${formRate}%`}
                  />
                  <div
                    style={{ width: `${100 - Math.min(100, Math.max(0, parseInt(formRate, 10) || 80))}%` }}
                    className="bg-amber-400 h-full"
                    title={`Patient Out-of-Pocket: ${100 - (parseInt(formRate, 10) || 80)}%`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Effective Start Date
                  </label>
                  <input
                    type="date"
                    value={formEffective}
                    onChange={(e) => setFormEffective(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Expiration End Date
                  </label>
                  <input
                    type="date"
                    value={formExpiration}
                    onChange={(e) => setFormExpiration(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#0a2e6b] hover:bg-[#0a2e6b] text-white text-xs font-bold shadow-sm cursor-pointer"
                >
                  {editingOrg ? 'Update Organization' : 'Save Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXCEL IMPORT MODAL */}
      <ExcelImportModal<Organization>
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        lang={lang}
        title={t.organizations.importExcel}
        targetType="organizations"
        onImport={(file) => parseOrganizationExcel(file, organizations)}
        onSuccess={(importedList) => {
          onImportOrganizations(importedList);
          setImportModalOpen(false);
        }}
      />

      {/* DOUBLE-CLICK ORGANIZATION MEMBERS MODAL */}
      {viewMembersOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            <div className="bg-[#0a2e6b] p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                  <Building className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base">{viewMembersOrg.name}</h3>
                  <p className="text-xs text-blue-100 font-mono">
                    Policy: {viewMembersOrg.policyNumber} • {viewMembersOrg.coverageRate}% Coverage Rate
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewMembersOrg(null)}
                className="p-2 rounded-xl hover:bg-white/15 text-white cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span className="font-extrabold text-sm text-slate-800">
                    Enrolled Beneficiaries ({orgMembersList.length})
                  </span>
                </div>
                <span className="text-xs text-slate-500 font-semibold">
                  Declared Headcount: {viewMembersOrg.declaredMembers}
                </span>
              </div>

              {orgMembersList.length === 0 ? (
                <div className="p-12 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="text-xs font-semibold">No insured members registered yet under this organization.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[10.5px] border-b border-slate-200">
                        <th className="py-3 px-4">Card #</th>
                        <th className="py-3 px-4">Principal Insured</th>
                        <th className="py-3 px-4">Birth Date</th>
                        <th className="py-3 px-4">Dependents</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {orgMembersList.map((m) => {
                        const totalDeps = (m.dependents?.length || 0) + (m.children?.length || 0) + (m.spouseName ? 1 : 0);
                        return (
                          <tr key={m.id || m.cardNo} className="hover:bg-slate-50 transition">
                            <td className="py-3 px-4 font-mono font-bold text-blue-700">{m.cardNo}</td>
                            <td className="py-3 px-4 font-bold text-slate-800">{m.principalName}</td>
                            <td className="py-3 px-4 text-slate-600">{m.birthDate || '—'}</td>
                            <td className="py-3 px-4 text-slate-600">
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                                {totalDeps} dep.
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {m.status === 'Actif' || m.status === 'Active' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-200">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold text-[11px] border border-amber-200">
                                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                  Suspended
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setViewMembersOrg(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUSPEND / REACTIVATE CONFIRMATION MODAL */}
      {confirmOrgAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  confirmOrgAction.action === 'suspend' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                {confirmOrgAction.action === 'suspend' ? (
                  <XCircle className="w-6 h-6" />
                ) : (
                  <CheckCircle2 className="w-6 h-6" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-base font-extrabold text-slate-900">
                  {confirmOrgAction.action === 'suspend'
                    ? 'Suspend Organization Policy?'
                    : 'Reactivate Organization Policy?'}
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {confirmOrgAction.action === 'suspend' ? (
                    <>
                      Suspending <strong>{confirmOrgAction.org.name}</strong> will immediately block healthcare claims
                      and benefit access for all associated principal members and their dependents across all provider clinics.
                    </>
                  ) : (
                    <>
                      Reactivating <strong>{confirmOrgAction.org.name}</strong> will restore benefit access for all
                      currently enrolled active members under policy <strong>{confirmOrgAction.org.policyNumber}</strong>.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmOrgAction(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmAction}
                className={`px-5 py-2 rounded-xl text-white text-xs font-bold shadow-md cursor-pointer transition ${
                  confirmOrgAction.action === 'suspend'
                    ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                }`}
              >
                {confirmOrgAction.action === 'suspend' ? 'Confirm Suspension' : 'Confirm Reactivation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
