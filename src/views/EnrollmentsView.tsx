import React, { useState, useMemo } from 'react';
import {
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  PlusCircle, // === AMÉLIORATION AJOUTÉE : "+" entouré d'un cercle, harmonisé sur toute l'interface ===
  Image as ImageIcon,
  Fingerprint,
  Camera,
  Check,
  X,
  AlertTriangle,
  UserCheck,
  Scan,
  Eye,
  ArrowRightLeft,
  Trash2,
  ShieldAlert,
} from 'lucide-react';
import { Enrollment, Language, Organization, RelationshipType, UserProfile } from '../types';
import { useTranslation } from '../i18n/translations';
import { AttachmentBiometricViewerModal } from '../components/AttachmentBiometricViewerModal';
import { BiometricCameraModal } from '../components/BiometricCameraModal';
import { uploadPhotoOrFallback } from '../utils/storageUtils';
import { BiometricFingerprintModal } from '../components/BiometricFingerprintModal';
import {
  canApproveRecord,
  canReturnRecord,
  canAssignRecord,
  canDeleteRecord,
} from '../services/permissions';
import { getRoleTheme } from '../theme/roleTheme';
import { generateNextCardNumber } from '../services/cardNumberService';

interface EnrollmentsViewProps {
  lang: Language;
  enrollments: Enrollment[];
  organizations: Organization[];
  currentUser?: any;
  userRole?: UserProfile | string;
  onApprove: (id: string) => void;
  onReject: (enr: Enrollment, reason: string) => void;
  onReturn?: (enr: Enrollment, reason: string) => void;
  onAssign?: (enr: Enrollment, agentName: string) => void;
  onDelete?: (id: string) => void;
  onCreateEnrollment: (enr: Partial<Enrollment>) => void;
}

export const EnrollmentsView: React.FC<EnrollmentsViewProps> = ({
  lang,
  enrollments,
  organizations,
  currentUser,
  userRole = 'Admin',
  onApprove,
  onReject,
  onReturn,
  onAssign,
  onDelete,
  onCreateEnrollment,
}) => {
  const t = useTranslation(lang);
  // === AMÉLIORATION AJOUTÉE : couleurs alignées sur le rôle connecté (gris Admin / teal
  // Supervisor) au lieu du bleu marine Agent affiché en dur auparavant peu importe qui
  // consultait cet écran (EnrollmentsView est partagé Admin + Supervisor).
  const roleTheme = getRoleTheme(userRole);
  // === AMÉLIORATION AJOUTÉE : détection du rôle Superviseur pour aligner le vert (validation) et
  // éclaircir le rouge (rejet) sur l'interface Superviseur uniquement (Admin conserve ses couleurs actuelles) ===
  const isSupervisor = userRole === 'Superviseur' || userRole === 'Supervisor';
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrgFilter, setSelectedOrgFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');

  // Biometric modal state
  const [biometricModalOpen, setBiometricModalOpen] = useState(false);
  const [selectedEnrForBiometrics, setSelectedEnrForBiometrics] = useState<Enrollment | null>(null);

  // SoD notification state
  const [sodAlertMessage, setSodAlertMessage] = useState<string | null>(null);

  // Rejection modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedEnrToReject, setSelectedEnrToReject] = useState<Enrollment | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Return modal
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [selectedEnrToReturn, setSelectedEnrToReturn] = useState<Enrollment | null>(null);
  const [returnReason, setReturnReason] = useState('');

  // Assign modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedEnrToAssign, setSelectedEnrToAssign] = useState<Enrollment | null>(null);
  const [assignAgentName, setAssignAgentName] = useState('');

  // Delete modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedEnrToDelete, setSelectedEnrToDelete] = useState<Enrollment | null>(null);

  // New enrollment modal
  const [newEnrModalOpen, setNewEnrModalOpen] = useState(false);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [fingerprintModalOpen, setFingerprintModalOpen] = useState(false);

  const [newEnrForm, setNewEnrForm] = useState({
    fullName: '',
    cardNo: '',
    birthDate: '1990-01-01',
    organization: '',
    relationship: 'Principal' as RelationshipType,
    hasPhoto: true,
    hasBiometrics: true,
    photoUrl: undefined as string | undefined,
    idDocumentUrl: undefined as string | undefined,
    fingerprintScore: 98,
  });

  const filteredEnrollments = useMemo(() => {
    return enrollments.filter((e) => {
      const matchSearch =
        e.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.cardNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.reference.toLowerCase().includes(searchTerm.toLowerCase());

      const matchOrg = selectedOrgFilter === 'ALL' || e.organization === selectedOrgFilter;
      const matchStatus = selectedStatusFilter === 'ALL' || e.status === selectedStatusFilter;

      return matchSearch && matchOrg && matchStatus;
    });
  }, [enrollments, searchTerm, selectedOrgFilter, selectedStatusFilter]);

  const pendingEnrollments = filteredEnrollments.filter((e) => e.status === 'pending');
  const historyEnrollments = filteredEnrollments.filter((e) => e.status !== 'pending');

  const handleApproveAttempt = (enr: Enrollment) => {
    const approvalCheck = canApproveRecord(userRole, currentUser, enr);
    if (!approvalCheck.allowed) {
      setSodAlertMessage(approvalCheck.reason);
      return;
    }
    onApprove(enr.id);
  };

  const openRejectModal = (enr: Enrollment) => {
    setSelectedEnrToReject(enr);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectReason) return;
    if (selectedEnrToReject) {
      onReject(selectedEnrToReject, rejectReason);
      setRejectModalOpen(false);
    }
  };

  const openReturnModal = (enr: Enrollment) => {
    setSelectedEnrToReturn(enr);
    setReturnReason('');
    setReturnModalOpen(true);
  };

  const handleConfirmReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnReason.trim()) return;
    if (selectedEnrToReturn && onReturn) {
      onReturn(selectedEnrToReturn, returnReason);
      setReturnModalOpen(false);
    }
  };

  const openAssignModal = (enr: Enrollment) => {
    setSelectedEnrToAssign(enr);
    setAssignAgentName(enr.assignedAgentName || '');
    setAssignModalOpen(true);
  };

  const handleConfirmAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignAgentName.trim()) return;
    if (selectedEnrToAssign && onAssign) {
      onAssign(selectedEnrToAssign, assignAgentName);
      setAssignModalOpen(false);
    }
  };

  const openDeleteModal = (enr: Enrollment) => {
    setSelectedEnrToDelete(enr);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedEnrToDelete && onDelete) {
      onDelete(selectedEnrToDelete.id);
      setDeleteModalOpen(false);
    }
  };

  // === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — sur demande
  // explicite. Ce formulaire (Admin/Superviseur, distinct du formulaire Agent déjà corrigé)
  // ne proposait même pas de champ de saisie pour "Card No." : `newEnrForm.cardNo` était donc
  // TOUJOURS vide et retombait systématiquement sur un numéro aléatoire au format obsolète
  // "ACT-2026-XXXX", contournant entièrement le système de numérotation centralisé. Corrigé
  // pour générer un numéro AMID-YYMMDD-NNNNN unique et transactionnel, comme dans le
  // formulaire d'enrôlement Agent.
  const [isGeneratingEnrCard, setIsGeneratingEnrCard] = useState(false);
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullName = newEnrForm.fullName || 'New Beneficiary';
    const organization = newEnrForm.organization || (organizations[0]?.name || 'Standard');

    setIsGeneratingEnrCard(true);
    let cardNo: string;
    try {
      cardNo = await generateNextCardNumber({
        organization,
        insuredName: fullName,
        assignedBy: currentUser?.uid,
        assignedByName: currentUser?.displayName || currentUser?.fullName || currentUser?.email,
        method: 'ENROLLMENT',
      });
    } catch (err: any) {
      alert(err?.message || 'Could not generate a card number. Please try again.');
      setIsGeneratingEnrCard(false);
      return;
    }
    setIsGeneratingEnrCard(false);

    // === ADDED IMPROVEMENT: upload to Firebase Storage with an automatic fallback to the
    // existing base64 storage on failure (see storageUtils.ts / MembersView.tsx).
    const resolvedPhotoUrl = newEnrForm.photoUrl
      ? await uploadPhotoOrFallback(newEnrForm.photoUrl, 'enrollment-photos', cardNo)
      : newEnrForm.photoUrl;

    onCreateEnrollment({
      reference: `ENR-2026-${Math.floor(100 + Math.random() * 900)}`,
      fullName,
      cardNo,
      birthDate: newEnrForm.birthDate,
      organization,
      relationship: newEnrForm.relationship,
      submissionDate: new Date().toISOString().split('T')[0],
      hasPhoto: newEnrForm.hasPhoto,
      hasBiometrics: newEnrForm.hasBiometrics,
      photoUrl: resolvedPhotoUrl,
      idDocumentUrl: newEnrForm.idDocumentUrl,
      fingerprintScore: newEnrForm.fingerprintScore,
      status: 'pending',
      createdBy: currentUser?.uid || 'current_user',
      creatorEmail: currentUser?.email || 'agent@activa.lr',
      creatorName: currentUser?.displayName || currentUser?.fullName || 'Enrollment Agent',
    });
    setNewEnrModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* SoD Alert Message */}
      {sodAlertMessage && (
        <div className="p-4 bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <span className="font-extrabold block">Segregation of Duties (SoD):</span>
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

      {/* Top Action & Filter bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t.search}
            className={`w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 ${roleTheme.palette.accentRing} focus:bg-white`}
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
          <select
            value={selectedOrgFilter}
            onChange={(e) => setSelectedOrgFilter(e.target.value)}
            className={`px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 ${roleTheme.palette.accentRing}`}
          >
            <option value="ALL">{t.all}</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.name}>
                {org.name}
              </option>
            ))}
          </select>

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

          {userRole !== 'Superviseur' && userRole !== 'Supervisor' && (
            <button
              onClick={() => setNewEnrModalOpen(true)}
              className={`px-3.5 py-2 rounded-xl ${roleTheme.palette.primaryColor} text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>{t.enrollments.newEnrollment}</span>
            </button>
          )}
        </div>
      </div>

      {/* SECTION 1: En attente de validation */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-[#00A859] animate-pulse"></div>
            <h3 className="font-extrabold text-sm text-slate-900">
              {t.enrollments.pendingSection}
            </h3>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black">
              {pendingEnrollments.length}
            </span>
          </div>
          <span className="text-xs text-slate-500 font-medium hidden sm:inline">
            Biometric identity verification & validation
          </span>
        </div>

        {pendingEnrollments.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium">
            <UserCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p>{t.dashboard.noPendingEnrollments}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">{t.claims.reference}</th>
                  <th className="py-3 px-4">{t.enrollments.fullName}</th>
                  <th className="py-3 px-4">{t.enrollments.relationship}</th>
                  <th className="py-3 px-4">{t.members.organization}</th>
                  <th className="py-3 px-4 text-center">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingEnrollments.map((enr) => {
                  const approvalCheck = canApproveRecord(userRole, currentUser, enr);
                  return (
                    <tr key={enr.id} className="hover:bg-slate-50 transition-colors">
                      <td className={`py-3.5 px-4 font-bold ${roleTheme.palette.primaryText} whitespace-nowrap`}>
                        {enr.reference}
                        <span className="block text-[10px] text-slate-400 font-normal">
                          {enr.submissionDate}
                        </span>
                        {enr.assignedAgentName && (
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[9px] font-bold">
                            Assigned: {enr.assignedAgentName}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        {enr.fullName}
                        <span className="block text-[10px] text-slate-400 font-mono">
                          {enr.cardNo}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                          {enr.relationship}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-medium truncate max-w-[160px]">
                        {enr.organization}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedEnrForBiometrics(enr);
                              setBiometricModalOpen(true);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold transition flex items-center gap-1 shadow-2xs"
                            title={'Review biometric file before approval'}
                          >
                            <Scan className="w-3.5 h-3.5 text-slate-600" />
                            <span>{'Verify'}</span>
                          </button>

                          {userRole !== 'Agent' && (
                            <>
                              {/* === AMÉLIORATION AJOUTÉE : vert aligné à la barre de menu Superviseur, rouge éclairci === */}
                              <button
                                type="button"
                                onClick={() => handleApproveAttempt(enr)}
                                disabled={!approvalCheck.allowed}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                                  approvalCheck.allowed
                                    ? (isSupervisor ? `${roleTheme.palette.primaryColor} text-white shadow-xs cursor-pointer` : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer')
                                    : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                                }`}
                                title={approvalCheck.allowed ? t.approve : approvalCheck.reason}
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{t.approve}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => openRejectModal(enr)}
                                className={`px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-xs font-bold transition flex items-center gap-1 ${isSupervisor ? 'text-rose-500' : 'text-rose-700'}`}
                                title={t.reject}
                              >
                                <X className={`w-3.5 h-3.5 ${isSupervisor ? 'text-rose-400' : 'text-rose-600'}`} />
                                <span>{t.reject}</span>
                              </button>

                              {canReturnRecord(userRole) && onReturn && (
                                <button
                                  type="button"
                                  onClick={() => openReturnModal(enr)}
                                  className="px-2 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition flex items-center gap-1"
                                  title="Return for correction"
                                >
                                  <ArrowRightLeft className="w-3.5 h-3.5 text-amber-700" />
                                  <span>Return</span>
                                </button>
                              )}

                              {canAssignRecord(userRole) && onAssign && (
                                <button
                                  type="button"
                                  onClick={() => openAssignModal(enr)}
                                  className="px-2 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition flex items-center gap-1"
                                  title="Assign to agent"
                                >
                                  <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>Assign</span>
                                </button>
                              )}
                            </>
                          )}

                          {canDeleteRecord(userRole) && onDelete && (
                            <button
                              type="button"
                              onClick={() => openDeleteModal(enr)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                              title="Delete (Admin)"
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

      {/* SECTION 2: Enrollment History */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-extrabold text-sm text-slate-900">
              {t.enrollments.historySection}
            </h3>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs font-black">
              {historyEnrollments.length}
            </span>
          </div>
        </div>

        {historyEnrollments.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium">
            {t.noData}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">{t.claims.reference}</th>
                  <th className="py-3 px-4">{t.enrollments.fullName}</th>
                  <th className="py-3 px-4">{t.members.organization}</th>
                  <th className="py-3 px-4 text-center">{t.status}</th>
                  <th className="py-3 px-4">
                    Reason / Decision
                  </th>
                  {canDeleteRecord(userRole) && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyEnrollments.map((enr) => (
                  <tr key={enr.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-700 whitespace-nowrap">
                      {enr.reference}
                      <span className="block text-[10px] text-slate-400 font-normal">
                        {enr.decisionDate || enr.submissionDate}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      {enr.fullName}
                      <span className="block text-[10px] text-slate-400 font-mono">
                        {enr.cardNo}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 truncate max-w-[160px]">
                      {enr.organization}
                    </td>
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {enr.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-[#00A859] border border-emerald-200 text-[11px] font-extrabold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t.validated}</span>
                        </span>
                      ) : enr.status === 'returned' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-extrabold">
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>Returned</span>
                        </span>
                      ) : (
                        // === AMÉLIORATION AJOUTÉE : rouge éclairci pour le badge "Rejected" côté Superviseur ===
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-rose-50 border border-rose-200 ${isSupervisor ? 'text-rose-500' : 'text-rose-700'}`}>
                          <XCircle className={`w-3.5 h-3.5 ${isSupervisor ? 'text-rose-400' : 'text-rose-600'}`} />
                          <span>{t.rejectedStatus}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                      {enr.rejectionReason || enr.returnReason ? (
                        <span className={`font-semibold ${enr.status === 'returned' ? 'text-amber-800' : (isSupervisor ? 'text-rose-500' : 'text-rose-700')}`}>
                          {enr.rejectionReason || enr.returnReason}
                        </span>
                      ) : (
                        <span className={`font-medium ${isSupervisor ? roleTheme.palette.primaryText : 'text-emerald-700'}`}>
                          Health card issued & activated
                        </span>
                      )}
                    </td>
                    {canDeleteRecord(userRole) && (
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => openDeleteModal(enr)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          title="Delete (Admin)"
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

      {/* RETURN FOR CORRECTION MODAL */}
      {returnModalOpen && selectedEnrToReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-amber-600 p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white">
                  <ArrowRightLeft className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base">
                    Return for correction
                  </h3>
                  <p className="text-xs text-amber-100">
                    {selectedEnrToReturn.reference} • {selectedEnrToReturn.fullName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReturnModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/15 text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReturn} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Correction instructions <span className="text-rose-600">*</span>
                </label>
                <textarea
                  rows={4}
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Specify missing documents or adjustments required..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setReturnModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/20"
                >
                  Confirm Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ASSIGN ENROLLMENT MODAL */}
      {assignModalOpen && selectedEnrToAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-white border-b border-slate-200 p-6 text-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                  <UserCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    Assign to Agent
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedEnrToAssign.reference} • {selectedEnrToAssign.fullName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAssignModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmAssign} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Agent name or reference <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={assignAgentName}
                  onChange={(e) => setAssignAgentName(e.target.value)}
                  placeholder="Ex: Agent Martin / ag.martin"
                  className={`w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 ${roleTheme.palette.accentRing}`}
                  required
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2.5 rounded-xl ${roleTheme.palette.primaryColor} text-white text-xs font-bold`}
                >
                  Assign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE ENROLLMENT CONFIRMATION MODAL */}
      {deleteModalOpen && selectedEnrToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Delete Enrollment?
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedEnrToDelete.reference} ({selectedEnrToDelete.fullName})
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600">
              This action is irreversible and restricted to authorized Admins.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/20"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectModalOpen && selectedEnrToReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            {/* === AMÉLIORATION AJOUTÉE : rouge éclairci côté Superviseur === */}
            <div className={`${isSupervisor ? 'bg-rose-500' : 'bg-rose-700'} p-6 text-white flex items-center justify-between`}>
              <div>
                <h3 className="font-bold text-base">{t.enrollments.rejectModalTitle}</h3>
                <p className="text-xs text-rose-100">{selectedEnrToReject.fullName}</p>
              </div>
              <button
                onClick={() => setRejectModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/15 text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReject} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  {'Rejection Reason'}{' '}
                  <span className="text-rose-600">*</span>
                </label>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 font-semibold"
                  required
                >
                  <option value="">
                    {'Select a reason...'}
                  </option>
                  <option value={'Invalid ID photo'}>
                    {'Invalid or blurry ID photo'}
                  </option>
                  <option
                    value={
                      'Unusable biometric fingerprint'
                    }
                  >
                    {'Unusable biometric fingerprint'}
                  </option>
                  <option
                    value={
                      'Missing relationship proof'
                    }
                  >
                    {'Missing relationship proof (birth/marriage certificate)'}
                  </option>
                  <option
                    value={
                      'Duplicate affiliation detected'
                    }
                  >
                    {'Duplicate affiliation detected on policy'}
                  </option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-md ${isSupervisor ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'}`}
                >
                  {t.claims.confirmReject}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW ENROLLMENT MODAL */}
      {newEnrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="bg-white border-b border-slate-200 p-6 text-slate-900 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900">{t.enrollments.newEnrollment}</h3>
                <p className="text-xs text-slate-500">
                  {'New beneficiary enrollment request'}
                </p>
              </div>
              <button
                onClick={() => setNewEnrModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.enrollments.fullName}
                </label>
                <input
                  type="text"
                  value={newEnrForm.fullName}
                  onChange={(e) => setNewEnrForm({ ...newEnrForm, fullName: e.target.value })}
                  placeholder="e.g. LAST NAME First name"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.enrollments.relationship}
                  </label>
                  <select
                    value={newEnrForm.relationship}
                    onChange={(e) =>
                      setNewEnrForm({
                        ...newEnrForm,
                        relationship: e.target.value as RelationshipType,
                      })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  >
                    <option value="Principal">
                      {'Primary'}
                    </option>
                    <option value="Conjoint">
                      {'Spouse'}
                    </option>
                    <option value="Enfant">
                      {'Child'}
                    </option>
                    <option value="Ascendant">
                      {'Ascendant'}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.members.organization}
                  </label>
                  <select
                    value={newEnrForm.organization}
                    onChange={(e) =>
                      setNewEnrForm({ ...newEnrForm, organization: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                    required
                  >
                    <option value="">
                      {'Select organization...'}
                    </option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.name}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <p className="text-xs font-bold text-slate-700 mb-1">
                  Biometric Acquisitions:
                </p>
                
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
                      {newEnrForm.photoUrl ? (
                        <img src={newEnrForm.photoUrl} alt="Photo" className="w-full h-full object-cover" />
                      ) : (
                        <Camera className="w-5 h-5 text-slate-600" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        Facial ID Photo
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {newEnrForm.photoUrl ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Photo captured
                          </span>
                        ) : (
                          'Required for card issuance'
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCameraModalOpen(true)}
                    className={`px-3 py-1.5 rounded-lg ${roleTheme.palette.primaryColor} text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{newEnrForm.photoUrl ? 'Retake' : 'Open Camera'}</span>
                  </button>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                      <Fingerprint className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        Biometric Fingerprint (FAP-20)
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {newEnrForm.fingerprintScore ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {`NFIQ 2.0 Score: ${newEnrForm.fingerprintScore}%`}
                          </span>
                        ) : (
                          'USB optical scanner'
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFingerprintModalOpen(true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Fingerprint className="w-3.5 h-3.5" />
                    <span>Trigger Scanner</span>
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setNewEnrModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingEnrCard}
                  className={`px-5 py-2.5 rounded-xl ${roleTheme.palette.primaryColor} text-white text-xs font-bold shadow-md disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {isGeneratingEnrCard ? 'Assigning card number…' : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Biometric Camera Capture Modal */}
      <BiometricCameraModal
        isOpen={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onPhotoCaptured={(photo) => setNewEnrForm({ ...newEnrForm, photoUrl: photo, hasPhoto: true })}
        lang={lang}
        title="Facial ID Photo Capture"
      />

      {/* Biometric Fingerprint Acquisition Modal */}
      <BiometricFingerprintModal
        isOpen={fingerprintModalOpen}
        onClose={() => setFingerprintModalOpen(false)}
        onFingerprintCaptured={(data) =>
          setNewEnrForm({
            ...newEnrForm,
            hasBiometrics: true,
            fingerprintScore: data.score,
          })
        }
        lang={lang}
        title="Biometric Fingerprint Scanner (FAP-20)"
      />

      {/* BIOMETRIC & ATTACHMENT CONSULTATION MODAL */}
      <AttachmentBiometricViewerModal
        isOpen={biometricModalOpen}
        onClose={() => {
          setBiometricModalOpen(false);
          setSelectedEnrForBiometrics(null);
        }}
        lang={lang}
        type="enrollment"
        data={selectedEnrForBiometrics}
        onApprove={
          selectedEnrForBiometrics?.status === 'pending'
            ? (id) => {
                onApprove(id);
                setBiometricModalOpen(false);
              }
            : undefined
        }
        onReject={
          selectedEnrForBiometrics?.status === 'pending'
            ? (enr) => {
                setBiometricModalOpen(false);
                openRejectModal(enr);
              }
            : undefined
        }
      />
    </div>
  );
};

