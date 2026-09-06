import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  PlusCircle, // === AMÉLIORATION AJOUTÉE : "+" entouré d'un cercle, harmonisé sur toute l'interface ===
  X,
  AlertCircle,
  FileSpreadsheet,
  Check,
  Building,
  User,
  Scan,
  FileText,
  Fingerprint,
  Camera,
  Eye,
  ArrowRightLeft,
  UserCheck,
  Trash2,
  ShieldAlert,
} from 'lucide-react';
import { Claim, Language, Organization, Provider, Member, NavSection } from '../types';
import { useTranslation } from '../i18n/translations';
import { exportClaimsToCSV, exportClaimsToExcel } from '../utils/excelUtils';
import { FirestoreService } from '../services/firestore';
import { useCurrency } from '../services/currency';
import { AttachmentBiometricViewerModal } from '../components/AttachmentBiometricViewerModal';
import { ExportDropdown } from '../components/ExportDropdown';
import {
  canApproveRecord,
  hasPermission,
  canDeleteRecord,
  canExportData,
  canAssignRecord,
  canReturnRecord,
} from '../services/permissions';
import { getRoleTheme } from '../theme/roleTheme';

interface ClaimsViewProps {
  currentSection?: string;
  userRole?: string;
  currentUser?: any;
  lang: Language;
  claims: Claim[];
  organizations: Organization[];
  providers: Provider[];
  members: Member[];
  onApprove: (id: string) => void;
  onReject: (claim: Claim, reason: string, comments: string) => void;
  onReturn?: (claim: Claim, reason: string) => void;
  onAssign?: (claim: Claim, agentName: string) => void;
  onDelete?: (id: string) => void;
  onCreateClaim: (claim: Partial<Claim>) => void;
}

export const ClaimsView: React.FC<ClaimsViewProps> = ({
  currentSection = 'claims',
  userRole = 'Admin',
  currentUser,
  lang,
  claims,
  organizations,
  providers,
  members,
  onApprove,
  onReject,
  onReturn,
  onAssign,
  onDelete,
  onCreateClaim,
}) => {
  const t = useTranslation(lang);
  const { formatAmount, mode: currencyMode } = useCurrency();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrgFilter, setSelectedOrgFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');

  // Attachment & Biometric modal state
  const [biometricModalOpen, setBiometricModalOpen] = useState(false);
  const [selectedClaimForBiometrics, setSelectedClaimForBiometrics] = useState<Claim | null>(null);

  // Reject Modal State
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedClaimToReject, setSelectedClaimToReject] = useState<Claim | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectComments, setRejectComments] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Return Modal State
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [selectedClaimToReturn, setSelectedClaimToReturn] = useState<Claim | null>(null);
  const [returnReason, setReturnReason] = useState('');

  // Assign Modal State
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedClaimToAssign, setSelectedClaimToAssign] = useState<Claim | null>(null);
  const [assignAgentName, setAssignAgentName] = useState('');

  // Delete Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedClaimToDelete, setSelectedClaimToDelete] = useState<Claim | null>(null);

  // SoD Alert State
  const [sodAlertMessage, setSodAlertMessage] = useState<string | null>(null);

  // New Claim Modal State
  const [newClaimModalOpen, setNewClaimModalOpen] = useState(false);
  const [newClaimForm, setNewClaimForm] = useState({
    memberCardNo: '',
    memberName: '',
    organization: '',
    provider: '',
    amount: '',
    careType: 'Consultation & Specialist Care',
    serviceDate: new Date().toISOString().split('T')[0],
  });

  // Filtered lists
  const filteredClaims = useMemo(() => {
    return claims.filter((c) => {
      const matchSearch =
        c.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.memberCardNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.provider.toLowerCase().includes(searchTerm.toLowerCase());

      const matchOrg = selectedOrgFilter === 'ALL' || c.organization === selectedOrgFilter;
      const matchStatus = selectedStatusFilter === 'ALL' || c.status === selectedStatusFilter;

      return matchSearch && matchOrg && matchStatus;
    });
  }, [claims, searchTerm, selectedOrgFilter, selectedStatusFilter]);

  const pendingClaims = filteredClaims.filter((c) => c.status === 'pending');
  const historyClaims = filteredClaims.filter((c) => c.status !== 'pending');

  const openRejectModal = (claim: Claim) => {
    setSelectedClaimToReject(claim);
    setRejectReason('');
    setRejectComments('');
    setRejectError(null);
    setRejectModalOpen(true);
  };

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectReason) {
      setRejectError('Please select a rejection reason.');
      return;
    }
    if (selectedClaimToReject) {
      onReject(selectedClaimToReject, rejectReason, rejectComments);
      setRejectModalOpen(false);
    }
  };

  const openReturnModal = (claim: Claim) => {
    setSelectedClaimToReturn(claim);
    setReturnReason('');
    setReturnModalOpen(true);
  };

  const handleConfirmReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnReason.trim()) return;
    if (selectedClaimToReturn && onReturn) {
      onReturn(selectedClaimToReturn, returnReason);
      setReturnModalOpen(false);
    }
  };

  const openAssignModal = (claim: Claim) => {
    setSelectedClaimToAssign(claim);
    setAssignAgentName(claim.assignedAgentName || '');
    setAssignModalOpen(true);
  };

  const handleConfirmAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignAgentName.trim()) return;
    if (selectedClaimToAssign && onAssign) {
      onAssign(selectedClaimToAssign, assignAgentName);
      setAssignModalOpen(false);
    }
  };

  const openDeleteModal = (claim: Claim) => {
    setSelectedClaimToDelete(claim);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedClaimToDelete && onDelete) {
      onDelete(selectedClaimToDelete.id);
      setDeleteModalOpen(false);
    }
  };

  const handleApproveAttempt = (claim: Claim) => {
    const approvalCheck = canApproveRecord(userRole, currentUser, claim);
    if (!approvalCheck.allowed) {
      setSodAlertMessage(approvalCheck.reason);
      return;
    }
    onApprove(claim.id);
  };

  const isSupervisor = userRole.toLowerCase() === 'supervisor' || userRole.toLowerCase() === 'superviseur';

  // === AMÉLIORATION AJOUTÉE : protection des données (revue 2026-09-05, section 2.6) — voir
  // ReportsView.tsx pour le même mécanisme. Journalise chaque export de claims (montants +
  // nature des actes, potentiellement révélateurs de données de santé) sans jamais bloquer
  // l'export en cas d'échec de la journalisation.
  const logExportEvent = (format: 'Excel' | 'CSV', recordCount: number) => {
    FirestoreService.addLog({
      userId: currentUser?.uid || 'unknown',
      userName: currentUser?.displayName || currentUser?.fullName || currentUser?.email || 'Unknown',
      userRole: userRole || 'Unknown',
      action: 'DATA_EXPORTED',
      category: 'Claims',
      entityType: 'claims',
      details: `Exported ${recordCount} claim(s) as ${format}.`,
    }).catch(() => {});
  };
  // === AMÉLIORATION AJOUTÉE : couleurs alignées sur le rôle connecté (gris Admin / teal
  // Supervisor) au lieu du bleu marine Agent affiché en dur auparavant peu importe qui
  // consultait cet écran (ClaimsView est partagé Admin + Supervisor).
  const roleTheme = getRoleTheme(userRole);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateClaim({
      reference: `CLM-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      memberCardNo: newClaimForm.memberCardNo,
      memberName: newClaimForm.memberName,
      organization: newClaimForm.organization,
      provider: newClaimForm.provider,
      amount: parseFloat(newClaimForm.amount) || 0,
      careType: newClaimForm.careType,
      serviceDate: newClaimForm.serviceDate,
      status: 'pending',
      submissionDate: new Date().toISOString().split('T')[0],
      createdBy: currentUser?.uid || 'current_user',
      creatorEmail: currentUser?.email || 'agent@activa.lr',
      creatorName: currentUser?.displayName || currentUser?.fullName || 'Intake Agent',
    });
    setNewClaimModalOpen(false);
    setNewClaimForm({
      memberCardNo: '',
      memberName: '',
      organization: '',
      provider: '',
      amount: '',
      careType: 'Consultation & Specialist Care',
      serviceDate: new Date().toISOString().split('T')[0],
    });
  };

  return (
    <div className="space-y-6">
      {/* SoD Alert Notification */}
      {sodAlertMessage && (
        <div className="p-4 bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <span className="font-extrabold block">Segregation of Duties (SoD) Restriction:</span>
              <span>{sodAlertMessage}</span>
            </div>
          </div>
          <button
            onClick={() => setSodAlertMessage(null)}
            className="p-1 hover:bg-amber-200/50 rounded-lg text-amber-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Action Bar & Dynamic Filters */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t.search}
            className={`w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${roleTheme.palette.accentRing} focus:bg-white transition`}
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters and Export buttons */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
          {/* Organization Filter */}
          <select
            value={selectedOrgFilter}
            onChange={(e) => setSelectedOrgFilter(e.target.value)}
            className={`px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 ${roleTheme.palette.accentRing}`}
          >
            <option value="ALL">All Organizations</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.name}>
                {org.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className={`px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 ${roleTheme.palette.accentRing}`}
          >
            <option value="ALL">All Statuses</option>
            <option value="pending">{t.pending}</option>
            <option value="approved">{t.validated}</option>
            <option value="returned">Returned</option>
            <option value="rejected">{t.rejectedStatus}</option>
          </select>

          {/* Export Options - Only for Supervisor & Admin */}
          {canExportData(userRole) && currentSection !== 'claims_validation' && (
            <ExportDropdown
              lang={lang}
              onExportExcel={() => {
                exportClaimsToExcel(filteredClaims, lang);
                logExportEvent('Excel', filteredClaims.length);
              }}
              onExportPDF={() => {
                exportClaimsToCSV(filteredClaims, lang);
                logExportEvent('CSV', filteredClaims.length);
              }}
            />
          )}

          {/* New Claim Button */}
          {!isSupervisor && (
            <button
              onClick={() => setNewClaimModalOpen(true)}
              className={`px-3.5 py-2 rounded-xl ${roleTheme.palette.primaryColor} text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>{t.claims.newClaim}</span>
            </button>
          )}
        </div>
      </div>

      {/* SECTION 1: Pending Validation */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse"></div>
            <h3 className="font-extrabold text-sm text-slate-900">
              {t.claims.pendingValidation}
            </h3>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-black">
              {pendingClaims.length}
            </span>
          </div>
          <span className="text-xs text-slate-500 font-medium hidden sm:inline">
            Medical validation and coverage verification
          </span>
        </div>

        {pendingClaims.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-50" />
            <p className="font-semibold text-slate-600">{t.dashboard.noPendingClaims}</p>
            <p className="text-[11px] text-slate-400 mt-1">{t.emptyListHint}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">{t.claims.reference}</th>
                  <th className="py-3 px-4">{t.claims.insured}</th>
                  <th className="py-3 px-4">{t.claims.organization}</th>
                  <th className="py-3 px-4">{t.claims.provider}</th>
                  <th className="py-3 px-4">{t.claims.careType}</th>
                  <th className="py-3 px-4 text-right">{t.claims.amount}</th>
                  <th className="py-3 px-4 text-center">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingClaims.map((claim) => {
                  const approvalCheck = canApproveRecord(userRole, currentUser, claim);
                  return (
                    <tr key={claim.id} className="hover:bg-slate-50 transition-colors">
                      <td className={`py-3.5 px-4 font-bold ${roleTheme.palette.primaryText} whitespace-nowrap`}>
                        {claim.reference}
                        <span className="block text-[10px] text-slate-400 font-normal">
                          {claim.serviceDate}
                        </span>
                        {claim.assignedAgentName && (
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[9px] font-bold">
                            Assigned: {claim.assignedAgentName}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        {claim.memberName}
                        <span className="block text-[10px] text-slate-400 font-mono">
                          {claim.memberCardNo}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-medium truncate max-w-[160px]">
                        {claim.organization}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-medium truncate max-w-[160px]">
                        {claim.provider}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 text-[11px]">
                        {claim.careType}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-slate-900 whitespace-nowrap">
                        {formatAmount(claim.amount)}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {/* Biometric & Dossier Verification Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedClaimForBiometrics(claim);
                              setBiometricModalOpen(true);
                            }}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                            title="Verify medical and biometric record"
                          >
                            <Scan className="w-3.5 h-3.5 text-slate-600" />
                            <span>Verify</span>
                          </button>

                          {/* Supervisor Validation Actions (Approve and Reject are strictly reserved for Supervisors, NOT Admin) */}
                          {isSupervisor && (
                            <>
                              {/* Approve Button with SoD check */}
                              {/* === AMÉLIORATION AJOUTÉE : vert aligné à la couleur de la barre de menu Superviseur
                                  (roleTheme.palette.primaryColor = #0F766E) au lieu d'un vert générique === */}
                              <button
                                type="button"
                                onClick={() => handleApproveAttempt(claim)}
                                disabled={!approvalCheck.allowed}
                                className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                                  approvalCheck.allowed
                                    ? `${roleTheme.palette.primaryColor} text-white shadow-xs cursor-pointer`
                                    : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                                }`}
                                title={approvalCheck.allowed ? t.approve : approvalCheck.reason}
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{t.approve}</span>
                              </button>

                              {/* Reject Button */}
                              {/* === AMÉLIORATION AJOUTÉE : rouge éclairci (rose-500/400 au lieu de rose-700/600) === */}
                              <button
                                type="button"
                                onClick={() => openRejectModal(claim)}
                                className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-500 border border-rose-200 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                title={t.reject}
                              >
                                <X className="w-3.5 h-3.5 text-rose-400" />
                                <span>{t.reject}</span>
                              </button>
                            </>
                          )}

                          {/* Supervisor & Admin Actions (Return and Assign) - Disabled in Supervisor Claims to Validate */}
                          {!isSupervisor && currentSection !== 'claims_validation' && userRole.toLowerCase() !== 'agent' && (
                            <>
                              {/* Return for Correction Button */}
                              {canReturnRecord(userRole) && onReturn && (
                                <button
                                  type="button"
                                  onClick={() => openReturnModal(claim)}
                                  className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                  title="Return claim for correction"
                                >
                                  <ArrowRightLeft className="w-3.5 h-3.5 text-amber-700" />
                                  <span>Return</span>
                                </button>
                              )}

                              {/* Assign Button */}
                              {canAssignRecord(userRole) && onAssign && (
                                <button
                                  type="button"
                                  onClick={() => openAssignModal(claim)}
                                  className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                  title="Assign to agent"
                                >
                                  <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>Assign</span>
                                </button>
                              )}
                            </>
                          )}

                          {/* Admin Only Delete */}
                          {canDeleteRecord(userRole) && onDelete && (
                            <button
                              type="button"
                              onClick={() => openDeleteModal(claim)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                              title="Delete claim (Admin)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
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

      {/* SECTION 2: Decision History (Only shown in General Claims Processing, hidden in Claims to Validate) */}
      {currentSection !== 'claims_validation' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="font-extrabold text-sm text-slate-900">{t.claims.history}</h3>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs font-black">
                {historyClaims.length}
              </span>
            </div>
          </div>

        {historyClaims.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium">
            {t.noData}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">{t.claims.reference}</th>
                  <th className="py-3 px-4">{t.claims.insured}</th>
                  <th className="py-3 px-4">{t.claims.organization}</th>
                  <th className="py-3 px-4">{t.claims.provider}</th>
                  <th className="py-3 px-4 text-right">{t.claims.amount}</th>
                  <th className="py-3 px-4 text-center">{t.status}</th>
                  <th className="py-3 px-4">Details / Reason</th>
                  {canDeleteRecord(userRole) && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyClaims.map((claim) => (
                  <tr key={claim.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-700 whitespace-nowrap">
                      {claim.reference}
                      <span className="block text-[10px] text-slate-400 font-normal">
                        {claim.decisionDate || claim.serviceDate}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      {claim.memberName}
                      <span className="block text-[10px] text-slate-400 font-mono">
                        {claim.memberCardNo}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 truncate max-w-[150px]">
                      {claim.organization}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 truncate max-w-[150px]">
                      {claim.provider}
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-slate-900 whitespace-nowrap">
                      {formatAmount(claim.amount)}
                    </td>
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {claim.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-[#00A859] border border-emerald-200 text-[11px] font-extrabold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t.validated}</span>
                        </span>
                      ) : claim.status === 'returned' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-extrabold">
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>Returned</span>
                        </span>
                      ) : (
                        // === AMÉLIORATION AJOUTÉE : rouge éclairci pour le badge "Rejected" côté Superviseur ===
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold ${isSupervisor ? 'bg-rose-50 text-rose-500 border border-rose-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                          <XCircle className={`w-3.5 h-3.5 ${isSupervisor ? 'text-rose-400' : 'text-rose-600'}`} />
                          <span>{t.rejectedStatus}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        {claim.rejectionReason || claim.returnReason ? (
                          <div>
                            <p className={`font-semibold ${claim.status === 'returned' ? 'text-amber-800' : (isSupervisor ? 'text-rose-500' : 'text-rose-700')}`}>
                              {claim.rejectionReason || claim.returnReason}
                            </p>
                            {claim.comments && (
                              <p className="text-slate-400 italic text-[10px] truncate max-w-xs">
                                {claim.comments}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className={`font-medium ${isSupervisor ? roleTheme.palette.primaryText : 'text-emerald-700'}`}>
                            Coverage approved
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClaimForBiometrics(claim);
                            setBiometricModalOpen(true);
                          }}
                          className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 text-[10px] font-bold transition flex items-center gap-1 flex-shrink-0 cursor-pointer"
                          title="View and verify archived record"
                        >
                          <Scan className="w-3 h-3 text-slate-600" />
                          <span>Verify</span>
                        </button>
                      </div>
                    </td>
                    {canDeleteRecord(userRole) && (
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => openDeleteModal(claim)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          title="Delete claim (Admin)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* RETURN FOR CORRECTION MODAL */}
      {returnModalOpen && selectedClaimToReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-amber-600 p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white">
                  <ArrowRightLeft className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base">
                    Return Claim for Correction
                  </h3>
                  <p className="text-xs text-amber-100">
                    {selectedClaimToReturn.reference} • {selectedClaimToReturn.memberName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReturnModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/15 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReturn} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Correction instructions & details <span className="text-rose-600">*</span>
                </label>
                <textarea
                  rows={4}
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Specify missing documents or adjustments for the intake agent..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setReturnModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/20 cursor-pointer"
                >
                  Confirm Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ASSIGN CLAIM MODAL */}
      {assignModalOpen && selectedClaimToAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-white border-b border-slate-200 p-6 text-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                  <UserCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    Assign Claim to Agent
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedClaimToAssign.reference} • {selectedClaimToAssign.memberName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAssignModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmAssign} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Assignee Agent Name or ID <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={assignAgentName}
                  onChange={(e) => setAssignAgentName(e.target.value)}
                  placeholder="e.g. Agent Martin / ag.intake"
                  className={`w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 ${roleTheme.palette.accentRing}`}
                  required
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2.5 rounded-xl ${roleTheme.palette.primaryColor} text-white text-xs font-bold cursor-pointer`}
                >
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteModalOpen && selectedClaimToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Delete Claim?
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedClaimToDelete.reference} ({selectedClaimToDelete.memberName})
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600">
              This action is irreversible and strictly restricted to authorized Administrators.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/20 cursor-pointer"
              >
                Delete Claim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT CLAIM MODAL (Mandatory reason) */}
      {rejectModalOpen && selectedClaimToReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* === AMÉLIORATION AJOUTÉE : rouge éclairci (rose-500 au lieu de rose-700) — action réservée au Superviseur === */}
            <div className="bg-rose-500 p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base">{t.claims.rejectModalTitle}</h3>
                  <p className="text-xs text-rose-100">
                    Ref. {selectedClaimToReject.reference} • {selectedClaimToReject.memberName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRejectModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/15 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReject} className="p-6 space-y-4">
              {rejectError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl font-bold">
                  {rejectError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  {t.claims.rejectReasonLabel} <span className="text-rose-600">*</span>
                </label>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 font-semibold"
                  required
                >
                  <option value="">{t.claims.selectReason}</option>
                  <option value={t.claims.reasonPrescription}>{t.claims.reasonPrescription}</option>
                  <option value={t.claims.reasonCeiling}>{t.claims.reasonCeiling}</option>
                  <option value={t.claims.reasonUnapprovedProvider}>
                    {t.claims.reasonUnapprovedProvider}
                  </option>
                  <option value={t.claims.reasonExclusion}>{t.claims.reasonExclusion}</option>
                  <option value={t.claims.reasonPriorApproval}>
                    {t.claims.reasonPriorApproval}
                  </option>
                  <option value={t.claims.reasonOther}>{t.claims.reasonOther}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  {t.claims.commentsLabel}
                </label>
                <textarea
                  rows={3}
                  value={rejectComments}
                  onChange={(e) => setRejectComments(e.target.value)}
                  placeholder={t.claims.commentsPlaceholder}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold shadow-md shadow-rose-500/20 cursor-pointer"
                >
                  {t.claims.confirmReject}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW CLAIM MODAL */}
      {newClaimModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="bg-white border-b border-slate-200 p-6 text-slate-900 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900">{t.claims.newClaim}</h3>
                <p className="text-xs text-slate-500">
                  Direct entry of a new health claim
                </p>
              </div>
              <button
                onClick={() => setNewClaimModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.claims.insured} / Card No.
                </label>
                <select
                  value={newClaimForm.memberCardNo}
                  onChange={(e) => {
                    const card = e.target.value;
                    const m = members.find((mb) => mb.cardNo === card);
                    setNewClaimForm({
                      ...newClaimForm,
                      memberCardNo: card,
                      memberName: m ? m.principalName : '',
                      organization: m ? m.organization : newClaimForm.organization,
                    });
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  required
                >
                  <option value="">
                    Select an insured member...
                  </option>
                  {members.map((m) => (
                    <option key={m.id} value={m.cardNo}>
                      {m.cardNo} — {m.principalName} ({m.organization})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.claims.provider}
                  </label>
                  <select
                    value={newClaimForm.provider}
                    onChange={(e) =>
                      setNewClaimForm({ ...newClaimForm, provider: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                    required
                  >
                    <option value="">
                      Select a provider...
                    </option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.claims.amount} ({currencyMode === 'LRD' ? 'LRD (L$)' : 'USD ($)'})
                  </label>
                  <input
                    type="number"
                    value={newClaimForm.amount}
                    onChange={(e) =>
                      setNewClaimForm({ ...newClaimForm, amount: e.target.value })
                    }
                    placeholder={currencyMode === 'LRD' ? 'e.g. 175000' : 'e.g. 850'}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.claims.careType}
                </label>
                <input
                  type="text"
                  value={newClaimForm.careType}
                  onChange={(e) =>
                    setNewClaimForm({ ...newClaimForm, careType: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  required
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setNewClaimModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2.5 rounded-xl ${roleTheme.palette.primaryColor} text-white text-xs font-bold shadow-md cursor-pointer`}
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ATTACHMENT & BIOMETRIC CONSULTATION MODAL */}
      <AttachmentBiometricViewerModal
        isOpen={biometricModalOpen}
        onClose={() => {
          setBiometricModalOpen(false);
          setSelectedClaimForBiometrics(null);
        }}
        lang={lang}
        type="claim"
        data={selectedClaimForBiometrics}
        onApprove={
          isSupervisor && selectedClaimForBiometrics?.status === 'pending'
            ? (id) => {
                handleApproveAttempt(selectedClaimForBiometrics);
                setBiometricModalOpen(false);
              }
            : undefined
        }
        onReject={
          isSupervisor && selectedClaimForBiometrics?.status === 'pending'
            ? (claim) => {
                setBiometricModalOpen(false);
                openRejectModal(claim);
              }
            : undefined
        }
      />
    </div>
  );
};
