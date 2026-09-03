import React, { useState, useMemo } from 'react';
import {
  Search,
  PlusCircle, // === AMÉLIORATION AJOUTÉE : "+" entouré d'un cercle, harmonisé sur toute l'interface ===
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
  ChevronDown,
  ShieldAlert,
  CreditCard,
} from 'lucide-react';
import { Organization, Language, OrgStatus, HealthPolicy, PolicyPayment, SuspensionReason } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { ExcelImportModal } from '../../components/ExcelImportModal';
import { ExportDropdown } from '../../components/ExportDropdown';
import { HealthPolicyConfigModal } from '../../components/HealthPolicyConfigModal';
import { CardNumberManagementModal } from '../../components/CardNumberManagementModal';
import { CardFormatMigrationSummary } from '../../services/cardNumberService';
import { getPolicyCoverageStatus } from '../../services/policyEngine';
import {
  exportOrganizationsToCSV,
  exportOrganizationsToExcel,
  parseOrganizationExcel,
} from '../../utils/excelUtils';
import { dedupeMembersByCardNo } from '../../utils/memberUtils';

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
  // === AMÉLIORATION AJOUTÉE : Health Insurance Policy Management & Premium Monitoring —
  // props optionnelles pour ne rien casser dans les usages existants du composant qui ne les
  // fourniraient pas encore.
  healthPolicies?: HealthPolicy[];
  policyPayments?: PolicyPayment[];
  onSaveHealthPolicy?: (organizationName: string, data: Partial<HealthPolicy>) => void;
  onAddPolicyPayment?: (data: Partial<PolicyPayment>) => void;
  onDeletePolicyPayment?: (id: string) => void;
  // === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System ===
  currentUser?: any;
  onMigrateAllCards?: () => Promise<CardFormatMigrationSummary>;
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
  healthPolicies = [],
  policyPayments = [],
  onSaveHealthPolicy,
  onAddPolicyPayment,
  onDeletePolicyPayment,
  currentUser,
  onMigrateAllCards,
}) => {
  const t = useTranslation(lang);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);

  // View Members Modal — opened on a single click on an organization row
  const [viewMembersOrg, setViewMembersOrg] = useState<Organization | null>(null);

  // === AMÉLIORATION AJOUTÉE : drill-down Organisation → Assuré Principal → Dépendants ===
  // Cliquer sur un assuré principal dans la liste ci-dessus ouvre cette modale listant tous
  // ses ayants droit (dépendants).
  const [viewMemberDependents, setViewMemberDependents] = useState<any | null>(null);

  // Suspend/Reactivate confirmation modal
  const [confirmOrgAction, setConfirmOrgAction] = useState<{ org: Organization; action: 'suspend' | 'reactivate' } | null>(null);

  // === AMÉLIORATION AJOUTÉE : confirmation renforcée avant suppression — sur demande
  // explicite. La suppression supprime désormais TOUTES les données liées (membres,
  // sinistres, inscriptions, factures, formulaires médicaux, plafonds, police santé et
  // historique de paiements) et non plus seulement la fiche organisation — une action
  // irréversible bien plus large qu'avant. Elle exige donc de retaper le nom exact de
  // l'organisation avant que le bouton de suppression définitive ne s'active.
  const [deleteOrgTarget, setDeleteOrgTarget] = useState<Organization | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');

  // === AMÉLIORATION AJOUTÉE : Health Insurance Policy Management & Premium Monitoring ===
  const [policyConfigOrg, setPolicyConfigOrg] = useState<Organization | null>(null);
  // === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — section séparée
  // (modale), volontairement jamais un bloc permanent dans ce tableau (section 21). ===
  const [cardNumberOrg, setCardNumberOrg] = useState<Organization | null>(null);
  const getPolicyForOrg = (org: Organization) => healthPolicies.find((p) => p.organizationId === org.name) || null;
  const getPaymentsForOrg = (org: Organization) => policyPayments.filter((p) => p.policyId === org.name);

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

  // === AMÉLIORATION AJOUTÉE : Health Insurance Policy Management & Premium Monitoring —
  // section repliable directement dans CE formulaire (création ET modification d'organisation),
  // sur demande explicite, plutôt que de forcer un aller-retour par le bouton "Policy" séparé
  // (qui reste disponible pour la gestion détaillée des paiements — voir plus bas). Optionnelle :
  // repliée par défaut à la création, ouverte automatiquement en édition si une police existe déjà.
  const [policySectionOpen, setPolicySectionOpen] = useState(false);
  const [policyExistedBeforeEdit, setPolicyExistedBeforeEdit] = useState(false);
  const [formPolicyType, setFormPolicyType] = useState('Group Health Policy');
  const [formAnnualPremium, setFormAnnualPremium] = useState('');
  const [formPolicyCurrency, setFormPolicyCurrency] = useState('USD');
  const [formPaymentFrequency, setFormPaymentFrequency] = useState<HealthPolicy['paymentFrequency']>('Quarterly');
  const [formInstallmentAmount, setFormInstallmentAmount] = useState('');
  const [formNextPaymentDueDate, setFormNextPaymentDueDate] = useState('');
  const [formLastPaymentDate, setFormLastPaymentDate] = useState('');
  const [formLastPaymentAmount, setFormLastPaymentAmount] = useState('');
  const [formOutstandingAmount, setFormOutstandingAmount] = useState('0');
  const [formGracePeriodDays, setFormGracePeriodDays] = useState('15');
  const [formExpiringSoonWarningDays, setFormExpiringSoonWarningDays] = useState('30');
  const [formManuallySuspended, setFormManuallySuspended] = useState(false);
  const [formSuspensionReason, setFormSuspensionReason] = useState<SuspensionReason>('Non-payment');

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

  // === AMÉLIORATION AJOUTÉE : voir la déclaration de deleteOrgTarget ci-dessus. ===
  const executeDeleteOrg = () => {
    if (!deleteOrgTarget) return;
    onDeleteOrganization(deleteOrgTarget.id);
    showToast(`Organization "${deleteOrgTarget.name}" and all linked data have been permanently deleted.`);
    setDeleteOrgTarget(null);
    setDeleteConfirmInput('');
  };

  const orgMembersList = useMemo(() => {
    if (!viewMembersOrg) return [];
    const matching = members.filter(
      (m) => m.organization?.toLowerCase().trim() === viewMembersOrg.name.toLowerCase().trim()
    );
    // === AMÉLIORATION AJOUTÉE : ne pas lister le même assuré (même numéro de carte) en
    // double — voir dedupeMembersByCardNo pour le contexte.
    return dedupeMembersByCardNo(matching);
  }, [viewMembersOrg, members]);

  // === AMÉLIORATION AJOUTÉE : liste des dépendants d'un assuré principal, avec repli sur
  // les anciens champs spouseName/children pour les membres importés avant l'introduction de
  // la structure `dependents[]` détaillée (même logique de repli que exportMembersToExcel).
  // Closing the org-members modal also closes any nested dependents modal stacked on top of
  // it, so reopening a different organization never shows a stale dependents view.
  const closeViewMembersOrg = () => {
    setViewMembersOrg(null);
    setViewMemberDependents(null);
  };

  const memberDependentsList = useMemo(() => {
    if (!viewMemberDependents) return [];
    const m = viewMemberDependents;
    if (m.dependents && m.dependents.length > 0) {
      return m.dependents;
    }
    const fallback: any[] = [];
    if (m.spouseName) {
      fallback.push({
        fullName: m.spouseName,
        relationship: 'spouse',
        birthDate: undefined,
        gender: undefined,
        hasBiometrics: undefined,
      });
    }
    (m.children || []).forEach((childName: string) => {
      fallback.push({
        fullName: childName,
        relationship: 'child',
        birthDate: undefined,
        gender: undefined,
        hasBiometrics: undefined,
      });
    });
    return fallback;
  }, [viewMemberDependents]);

  const filteredOrgs = useMemo(() => {
    return organizations.filter((org) => {
      const matchSearch =
        org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        org.policyNumber.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || org.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [organizations, searchTerm, statusFilter]);

  // === AMÉLIORATION AJOUTÉE : réinitialisation/pré-remplissage des champs de la section
  // "Health Insurance Policy Configuration" repliable, à l'ouverture du formulaire.
  const resetPolicyFormFields = () => {
    setFormPolicyType('Group Health Policy');
    setFormAnnualPremium('');
    setFormPolicyCurrency('USD');
    setFormPaymentFrequency('Quarterly');
    setFormInstallmentAmount('');
    setFormNextPaymentDueDate('');
    setFormLastPaymentDate('');
    setFormLastPaymentAmount('');
    setFormOutstandingAmount('0');
    setFormGracePeriodDays('15');
    setFormExpiringSoonWarningDays('30');
    setFormManuallySuspended(false);
    setFormSuspensionReason('Non-payment');
  };

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
    resetPolicyFormFields();
    setPolicySectionOpen(false);
    setPolicyExistedBeforeEdit(false);
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

    // === AMÉLIORATION AJOUTÉE : pré-remplissage de la police existante (si configurée) —
    // section ouverte automatiquement pour qu'elle soit visible immédiatement en édition.
    const existingPolicy = getPolicyForOrg(org);
    if (existingPolicy) {
      setFormPolicyType(existingPolicy.policyType || 'Group Health Policy');
      setFormAnnualPremium(String(existingPolicy.annualPremium ?? ''));
      setFormPolicyCurrency(existingPolicy.currency || 'USD');
      setFormPaymentFrequency(existingPolicy.paymentFrequency || 'Quarterly');
      setFormInstallmentAmount(String(existingPolicy.installmentAmount ?? ''));
      setFormNextPaymentDueDate(existingPolicy.nextPaymentDueDate || '');
      setFormLastPaymentDate(existingPolicy.lastPaymentDate || '');
      setFormLastPaymentAmount(existingPolicy.lastPaymentAmount != null ? String(existingPolicy.lastPaymentAmount) : '');
      setFormOutstandingAmount(String(existingPolicy.outstandingAmount ?? 0));
      setFormGracePeriodDays(String(existingPolicy.gracePeriodDays ?? 15));
      setFormExpiringSoonWarningDays(String(existingPolicy.expiringSoonWarningDays ?? 30));
      setFormManuallySuspended(!!existingPolicy.manuallySuspended);
      setFormSuspensionReason(existingPolicy.suspensionReason || 'Non-payment');
      setPolicySectionOpen(true);
      setPolicyExistedBeforeEdit(true);
    } else {
      resetPolicyFormFields();
      setPolicySectionOpen(false);
      setPolicyExistedBeforeEdit(false);
    }
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

    // === AMÉLIORATION AJOUTÉE : Health Insurance Policy Management & Premium Monitoring —
    // la police est enregistrée avec l'organisation UNIQUEMENT si l'admin a ouvert/rempli la
    // section (ou si une police existait déjà pour cette organisation, afin de rester
    // synchronisée avec le n°/dates de police modifiés dans ce même formulaire) — jamais créée
    // silencieusement à $0 pour une organisation où personne n'a touché à cette section.
    if (onSaveHealthPolicy && (policySectionOpen || policyExistedBeforeEdit)) {
      const policyDraft: HealthPolicy = {
        id: formName,
        organizationId: formName,
        policyNumber: formPolicy,
        policyType: formPolicyType,
        effectiveDate: formEffective,
        expirationDate: formExpiration,
        status: 'Active',
        suspensionReason: formManuallySuspended ? formSuspensionReason : undefined,
        manuallySuspended: formManuallySuspended,
        annualPremium: parseFloat(formAnnualPremium) || 0,
        currency: formPolicyCurrency,
        paymentFrequency: formPaymentFrequency,
        installmentAmount: parseFloat(formInstallmentAmount) || 0,
        nextPaymentDueDate: formNextPaymentDueDate || undefined,
        lastPaymentDate: formLastPaymentDate || undefined,
        lastPaymentAmount: formLastPaymentAmount ? parseFloat(formLastPaymentAmount) : undefined,
        gracePeriodDays: parseInt(formGracePeriodDays, 10) || 15,
        expiringSoonWarningDays: parseInt(formExpiringSoonWarningDays, 10) || 30,
        outstandingAmount: parseFloat(formOutstandingAmount) || 0,
        coverageBlocked: false,
        updatedAt: new Date().toISOString(),
      };
      // Recalcule le statut/blocage réels via le même moteur centralisé (jamais une valeur
      // devinée) avant d'écrire — cohérent avec HealthPolicyConfigModal.handleSave.
      const computed = getPolicyCoverageStatus(policyDraft);
      onSaveHealthPolicy(formName, {
        ...policyDraft,
        status: computed.status,
        coverageBlocked: computed.coverageBlocked,
        suspensionReason: computed.suspensionReason || policyDraft.suspensionReason,
      });
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
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:bg-white transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500"
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
            className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Organization</span>
          </button>
        </div>
      </div>

      {/* Organizations Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Building className="w-5 h-5 text-slate-700" />
            <h3 className="font-bold text-base text-slate-800">Partner & Client Organizations</h3>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
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
                      onClick={() => setViewMembersOrg(org)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors group"
                      title="Click to view enrolled principal members for this organization"
                    >
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        <div className="flex items-center gap-2">
                          <Building className="w-4 h-4 text-slate-500 group-hover:text-slate-700 flex-shrink-0" />
                          <span>{org.name}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-700 whitespace-nowrap">
                        {org.policyNumber}
                      </td>
                      <td className="py-3.5 px-4 text-slate-800 font-semibold">
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
                          {/* === AMÉLIORATION AJOUTÉE : accès à la configuration détaillée de
                              la police d'assurance santé (prime, échéancier, paiements) —
                              volontairement une section séparée (modale), jamais une colonne
                              ajoutée à ce tableau. === */}
                          <button
                            onClick={() => setPolicyConfigOrg(org)}
                            className="px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer bg-blue-50 text-[#0A347B] hover:bg-blue-100 border border-blue-200"
                            title="Configure health insurance policy & premium"
                          >
                            <Shield className="w-3.5 h-3.5" />
                            <span>Policy</span>
                          </button>
                          {/* === AMÉLIORATION AJOUTÉE : Centralized Card Number Management
                              System — sur demande explicite. Même convention que le bouton
                              "Policy" ci-dessus : une section séparée, jamais une colonne
                              ajoutée au tableau principal (section 21). === */}
                          <button
                            onClick={() => setCardNumberOrg(org)}
                            className="px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
                            title="Card Number Management"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Cards</span>
                          </button>
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
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                            title="Edit organization & coverage"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setDeleteOrgTarget(org); setDeleteConfirmInput(''); }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Delete organization & all linked data"
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
            {/* === AMÉLIORATION AJOUTÉE : en-tête de fenêtre passé au blanc/gris neutre pour
                cohérence visuelle (auparavant fond noir #111827) === */}
            <div className="bg-white border-b border-slate-200 p-6 text-slate-900 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  {editingOrg ? 'Edit Organization Policy' : 'Register New Organization'}
                </h3>
                <p className="text-xs text-slate-500">Collective Group Insurance Policy & Coverage</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
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
                  placeholder="Ex: Liberia Petroleum Refining Company"
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
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800"
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
                          ? 'bg-slate-700 text-white shadow-xs'
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
                    className="flex-1 accent-slate-700 cursor-pointer"
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

              {/* === AMÉLIORATION AJOUTÉE : Health Insurance Policy Management & Premium
                  Monitoring — section repliable directement dans ce formulaire de création /
                  modification d'organisation, comme demandé, plutôt que uniquement via le
                  bouton "Policy" séparé du tableau (conservé pour la gestion détaillée des
                  paiements). Optionnelle : rien n'est enregistré si elle reste fermée. === */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPolicySectionOpen((prev) => !prev)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between transition cursor-pointer"
                >
                  <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-[#0A347B]" />
                    <span>Health Insurance Policy Configuration (Optional)</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${policySectionOpen ? 'rotate-180' : ''}`} />
                </button>

                {policySectionOpen && (
                  <div className="p-3.5 space-y-3 bg-white">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Policy Type</label>
                        <input value={formPolicyType} onChange={(e) => setFormPolicyType(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Payment Frequency</label>
                        <select value={formPaymentFrequency} onChange={(e) => setFormPaymentFrequency(e.target.value as HealthPolicy['paymentFrequency'])} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
                          <option value="Annual">Annual</option>
                          <option value="Semi-Annual">Semi-Annual</option>
                          <option value="Quarterly">Quarterly</option>
                          <option value="Monthly">Monthly</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Annual Premium</label>
                        <input type="number" value={formAnnualPremium} onChange={(e) => setFormAnnualPremium(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Currency</label>
                        <select value={formPolicyCurrency} onChange={(e) => setFormPolicyCurrency(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
                          <option value="USD">USD ($)</option>
                          <option value="LRD">LRD (L$)</option>
                          <option value="XAF">XAF</option>
                          <option value="XOF">XOF</option>
                          <option value="GHS">GHS</option>
                          <option value="GNF">GNF</option>
                          <option value="SLE">SLE</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Installment Amount</label>
                        <input type="number" value={formInstallmentAmount} onChange={(e) => setFormInstallmentAmount(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Next Payment Due Date</label>
                        <input type="date" value={formNextPaymentDueDate} onChange={(e) => setFormNextPaymentDueDate(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Last Payment Date</label>
                        <input type="date" value={formLastPaymentDate} onChange={(e) => setFormLastPaymentDate(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Last Payment Amount</label>
                        <input type="number" value={formLastPaymentAmount} onChange={(e) => setFormLastPaymentAmount(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Outstanding Amount</label>
                        <input type="number" value={formOutstandingAmount} onChange={(e) => setFormOutstandingAmount(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-rose-700" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Grace Period (days)</label>
                        <input type="number" value={formGracePeriodDays} onChange={(e) => setFormGracePeriodDays(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Expiring Soon Warning (days)</label>
                        <input type="number" value={formExpiringSoonWarningDays} onChange={(e) => setFormExpiringSoonWarningDays(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
                      </div>
                    </div>

                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={formManuallySuspended} onChange={(e) => setFormManuallySuspended(e.target.checked)} className="w-4 h-4 accent-amber-600" />
                        <span className="text-xs font-extrabold text-amber-900">Manually suspend this policy (Administrative / Other)</span>
                      </label>
                      {formManuallySuspended && (
                        <select value={formSuspensionReason} onChange={(e) => setFormSuspensionReason(e.target.value as SuspensionReason)} className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-bold">
                          <option value="Non-payment">Non-payment</option>
                          <option value="Administrative">Administrative</option>
                          <option value="Other">Other</option>
                        </select>
                      )}
                    </div>

                    <p className="text-[10.5px] text-slate-400 leading-relaxed">
                      For payment history and the Q1–Q4 schedule, use the "Policy" button on this organization's row after saving.
                    </p>
                  </div>
                )}
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
                  className="px-5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold shadow-sm cursor-pointer"
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
            <div className="bg-white border-b border-slate-200 p-6 text-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <Building className="w-5 h-5 text-slate-700" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">{viewMembersOrg.name}</h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Policy: {viewMembersOrg.policyNumber} • {viewMembersOrg.coverageRate}% Coverage Rate
                  </p>
                </div>
              </div>
              <button
                onClick={closeViewMembersOrg}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-600" />
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
                          <tr
                            key={m.id || m.cardNo}
                            onClick={() => setViewMemberDependents(m)}
                            className="hover:bg-slate-50 transition cursor-pointer"
                            title="Click to view this member's dependents"
                          >
                            <td className="py-3 px-4 font-mono font-bold text-slate-700">{m.cardNo}</td>
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
                onClick={closeViewMembersOrg}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === AMÉLIORATION AJOUTÉE : MODALE DÉPENDANTS D'UN ASSURÉ PRINCIPAL === */}
      {/* Empilée au-dessus de la modale "Enrolled Beneficiaries" (z-index supérieur) puisque
          celle-ci reste ouverte en arrière-plan — cohérent avec le parcours de drill-down
          Organisation → Assuré Principal → Dépendants demandé. */}
      {viewMemberDependents && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            <div className="bg-white border-b border-slate-200 p-6 text-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-slate-700" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">{viewMemberDependents.principalName}</h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Card #: {viewMemberDependents.cardNo} • {viewMemberDependents.organization}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewMemberDependents(null)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-600" />
                <span className="font-extrabold text-sm text-slate-800">
                  Dependents ({memberDependentsList.length})
                </span>
              </div>

              {memberDependentsList.length === 0 ? (
                <div className="p-12 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="text-xs font-semibold">No dependents registered for this principal member.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[10.5px] border-b border-slate-200">
                        <th className="py-3 px-4">Full Name</th>
                        <th className="py-3 px-4">Relationship</th>
                        <th className="py-3 px-4">Birth Date</th>
                        <th className="py-3 px-4">Gender</th>
                        <th className="py-3 px-4 text-center">Biometrics</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {memberDependentsList.map((dep: any, idx: number) => (
                        <tr key={dep.id || `${dep.fullName}-${idx}`} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-4 font-bold text-slate-800">{dep.fullName}</td>
                          <td className="py-3 px-4 text-slate-600 capitalize">{dep.relationship || '—'}</td>
                          <td className="py-3 px-4 text-slate-600">{dep.birthDate || '—'}</td>
                          <td className="py-3 px-4 text-slate-600">{dep.gender || '—'}</td>
                          <td className="py-3 px-4 text-center">
                            {dep.hasBiometrics ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-200">
                                Captured
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold text-[11px] border border-slate-200">
                                —
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

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setViewMemberDependents(null)}
                className="px-5 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === AMÉLIORATION AJOUTÉE : HEALTH INSURANCE POLICY CONFIGURATION MODAL === */}
      {policyConfigOrg && (
        <HealthPolicyConfigModal
          organization={policyConfigOrg}
          policy={getPolicyForOrg(policyConfigOrg)}
          payments={getPaymentsForOrg(policyConfigOrg)}
          coveredPrincipals={dedupeMembersByCardNo(members.filter((m) => m.organization?.toLowerCase().trim() === policyConfigOrg.name.toLowerCase().trim())).length}
          coveredDependents={dedupeMembersByCardNo(members.filter((m) => m.organization?.toLowerCase().trim() === policyConfigOrg.name.toLowerCase().trim())).reduce(
            (sum, m) => sum + ((m.dependents?.length || 0) + (m.children?.length || 0) + (m.spouseName ? 1 : 0)),
            0
          )}
          onClose={() => setPolicyConfigOrg(null)}
          onSave={(data) => {
            if (onSaveHealthPolicy) onSaveHealthPolicy(policyConfigOrg.name, data);
            showToast(`Health policy configuration saved for ${policyConfigOrg.name}.`);
            setPolicyConfigOrg(null);
          }}
          onAddPayment={(data) => onAddPolicyPayment && onAddPolicyPayment(data)}
          onDeletePayment={(id) => onDeletePolicyPayment && onDeletePolicyPayment(id)}
        />
      )}

      {/* === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System === */}
      {cardNumberOrg && (
        <CardNumberManagementModal
          organization={cardNumberOrg}
          members={members}
          currentUser={currentUser}
          onClose={() => setCardNumberOrg(null)}
          onMigrateAllCards={onMigrateAllCards}
        />
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

      {/* === AMÉLIORATION AJOUTÉE : DELETE CONFIRMATION MODAL (avec ré-saisie du nom) — voir
          la déclaration de deleteOrgTarget plus haut pour le contexte. === */}
      {deleteOrgTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 bg-rose-100 text-rose-600">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-extrabold text-slate-900">Permanently Delete Organization?</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  This will permanently delete <strong>{deleteOrgTarget.name}</strong> and{' '}
                  <strong>ALL</strong> of its linked data: insured members & dependents, claims,
                  enrollments, invoices, medical forms, coverage ceilings, and its health policy
                  & payment history. This action cannot be undone.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wide">
                Type <span className="text-rose-600">{deleteOrgTarget.name}</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                placeholder={deleteOrgTarget.name}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition"
                autoFocus
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => { setDeleteOrgTarget(null); setDeleteConfirmInput(''); }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmInput.trim() !== deleteOrgTarget.name.trim()}
                onClick={executeDeleteOrg}
                className="px-5 py-2 rounded-xl text-white text-xs font-bold shadow-md cursor-pointer transition bg-rose-600 hover:bg-rose-700 shadow-rose-600/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-rose-600"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
