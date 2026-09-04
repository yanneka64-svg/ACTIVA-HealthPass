import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  UserCheck,
  ShieldCheck,
  Upload,
  CheckCircle2,
  User,
  Fingerprint,
  Camera,
  CreditCard,
  Clock,
  Search,
  Eye,
  XCircle,
  X,
  ListOrdered,
  PlusCircle,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { Organization, Enrollment, Member, UserProfile, Language, RelationshipType } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { WebcamCaptureModal } from '../../components/WebcamCaptureModal';
import { BiometricFingerprintModal } from '../../components/BiometricFingerprintModal';
import { AttachmentBiometricViewerModal } from '../../components/AttachmentBiometricViewerModal';
import { dedupeMembersByCardNo } from '../../utils/memberUtils';
import { generateNextCardNumber } from '../../services/cardNumberService';
import { uploadPhotoOrFallback } from '../../utils/storageUtils';

interface AgentEnrollmentsViewProps {
  organizations: Organization[];
  enrollments?: Enrollment[];
  // === AMÉLIORATION AJOUTÉE : liste des assurés existants, pour permettre de rattacher un
  // dépendant à son assuré principal en le choisissant dans un annuaire plutôt qu'en ressaisissant
  // manuellement son nom et son numéro de carte.
  members?: Member[];
  currentUser?: any;
  userRole?: UserProfile;
  lang?: Language;
  onAddEnrollment?: (enrollment: Partial<Enrollment>) => void;
  onCreateEnrollment?: (enrollment: Partial<Enrollment>) => void;
}

export const AgentEnrollmentsView: React.FC<AgentEnrollmentsViewProps> = ({
  organizations,
  enrollments = [],
  members = [],
  currentUser,
  userRole = 'Agent',
  lang = 'en',
  onAddEnrollment,
  onCreateEnrollment,
}) => {
  const t = useTranslation('en');
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'pending' | 'approved' | 'rejected'>('ALL');
  const [selectedEnrDetails, setSelectedEnrDetails] = useState<Enrollment | null>(null);

  const [form, setForm] = useState({
    // === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — ce champ n'est
    // plus rempli par saisie manuelle, il est renseigné automatiquement dans handleSubmit
    // juste avant la création de l'enrôlement (voir cardNumberService.generateNextCardNumber).
    // === AMÉLIORATION AJOUTÉE (v2) : la nouvelle structure AMID-YYMMDD-NNNNN n'a plus de
    // "numéro physique" indépendant (le premier segment est désormais une date d'émission,
    // toujours celle du jour) — le champ de saisie optionnelle correspondant a été retiré.
    cardNo: '',
    // === AMÉLIORATION AJOUTÉE : nom scindé en Last Name / First Name côté saisie (le nom
    // complet reste stocké en un seul champ "fullName" sur l'Enrollment, comme avant).
    lastName: '',
    firstName: '',
    birthDate: '1990-01-01',
    gender: 'M',
    relationship: 'Principal' as RelationshipType,
    mainInsuredName: '',
    mainInsuredCardNo: '',
    organization: organizations[0]?.name || '',
    phone: '',
    email: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isGeneratingCard, setIsGeneratingCard] = useState(false);

  // === AMÉLIORATION AJOUTÉE : sélection de l'assuré principal existant depuis l'annuaire ===
  const [selectedPrincipalCardNo, setSelectedPrincipalCardNo] = useState('');

  const principalDirectory = useMemo(() => dedupeMembersByCardNo(members), [members]);

  // === AMÉLIORATION AJOUTÉE : remplace l'ancien menu déroulant "Select Principal Insured
  // from Directory" par une saisie intelligente (autocomplete) sur le champ du nom de
  // l'assuré principal — l'agent tape quelques lettres, une liste de suggestions filtrées
  // dans l'annuaire s'affiche, et le choix pré-remplit toujours le nom, le n° de carte et
  // l'organisation comme avant ===
  const [principalSearchOpen, setPrincipalSearchOpen] = useState(false);
  const principalSearchRef = useRef<HTMLDivElement>(null);

  const principalSuggestions = useMemo(() => {
    const q = form.mainInsuredName.trim().toLowerCase();
    if (!q) return principalDirectory.slice(0, 6);
    return principalDirectory
      .filter((m) => m.principalName.toLowerCase().includes(q) || m.cardNo.toLowerCase().includes(q))
      .slice(0, 8);
  }, [principalDirectory, form.mainInsuredName]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (principalSearchRef.current && !principalSearchRef.current.contains(event.target as Node)) {
        setPrincipalSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [hasPhoto, setHasPhoto] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [biometricData, setBiometricData] = useState<{ score: number; template: string; finger: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Modals
  const [isWebcamModalOpen, setIsWebcamModalOpen] = useState(false);
  const [isFingerprintModalOpen, setIsFingerprintModalOpen] = useState(false);
  const [biometricPreviewOpen, setBiometricPreviewOpen] = useState(false);
  const [previewEnrForBiometrics, setPreviewEnrForBiometrics] = useState<Enrollment | null>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        setPhotoData(uploadEvent.target?.result as string);
        setHasPhoto(true);
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handlePhotoCaptured = (capturedPhotoUrl: string) => {
    setPhotoData(capturedPhotoUrl);
    setHasPhoto(true);
  };

  const handleFingerprintCaptured = (data: { score: number; template: string; finger: string }) => {
    setBiometricData(data);
    setHasBiometrics(true);
  };

  // === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — handleSubmit est
  // désormais asynchrone : le numéro de carte est généré et réservé de façon transactionnelle
  // (unique, jamais réutilisé, jamais deux agents simultanés ne peuvent recevoir le même
  // numéro — voir cardNumberService.generateNextCardNumber) AVANT que l'enrôlement ne soit
  // créé. Le reste du workflow (Agent -> Superviseur -> Admin) est strictement inchangé.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const fullName = `${form.lastName} ${form.firstName}`.trim();
    if (!fullName || !form.organization) {
      setFormError('Please fill out all mandatory fields (Name and Organization).');
      return;
    }

    setIsGeneratingCard(true);
    let generatedCardNo: string;
    try {
      generatedCardNo = await generateNextCardNumber({
        organization: form.organization,
        insuredName: fullName,
        assignedBy: currentUser?.uid,
        assignedByName: currentUser?.fullName || currentUser?.displayName || currentUser?.email,
        method: 'ENROLLMENT',
      });
    } catch (err: any) {
      setFormError(err?.message || 'Could not generate a card number. Please try again.');
      setIsGeneratingCard(false);
      return;
    }
    setIsGeneratingCard(false);

    // === ADDED IMPROVEMENT: upload to Firebase Storage with an automatic fallback to the
    // existing base64 storage on failure (see storageUtils.ts / MembersView.tsx).
    const resolvedPhotoUrl = photoData
      ? await uploadPhotoOrFallback(photoData, 'enrollment-photos', generatedCardNo)
      : undefined;

    const newEnrollment: Partial<Enrollment> = {
      reference: `ENR-2026-${Math.floor(100 + Math.random() * 900)}`,
      cardNo: generatedCardNo,
      fullName,
      birthDate: form.birthDate || '1990-01-01',
      gender: form.gender as 'M' | 'F',
      relationship: form.relationship,
      mainInsuredName: form.relationship === 'Principal' ? fullName : form.mainInsuredName,
      mainInsuredCardNo: form.relationship === 'Principal' ? generatedCardNo : form.mainInsuredCardNo,
      organization: form.organization,
      phone: form.phone,
      email: form.email,
      hasPhoto: hasPhoto || Boolean(photoData),
      photoUrl: resolvedPhotoUrl,
      hasBiometrics: hasBiometrics,
      fingerprintScore: biometricData?.score || 96,
      status: 'pending',
      submissionDate: new Date().toISOString().split('T')[0],
      comments: 'Submitted by Medical Center Agent',
      createdBy: currentUser?.uid,
      creatorEmail: currentUser?.email,
      creatorName: currentUser?.fullName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Medical Center Agent',
    };

    const handler = onCreateEnrollment || onAddEnrollment;
    if (handler) {
      handler(newEnrollment);
    }

    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setForm({
        cardNo: '',
        lastName: '',
        firstName: '',
        birthDate: '1990-01-01',
        gender: 'M',
        relationship: 'Principal',
        mainInsuredName: '',
        mainInsuredCardNo: '',
        organization: organizations[0]?.name || '',
        phone: '',
        email: '',
      });
      setSelectedPrincipalCardNo('');
      setHasPhoto(false);
      setHasBiometrics(false);
      setPhotoData(null);
      setBiometricData(null);
      setActiveTab('list'); // Switch to list so agent sees the pending submission
    }, 1500);
  };

  // Filter agent enrollments
  const filteredEnrollments = useMemo(() => {
    return enrollments.filter((e) => {
      const q = searchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        e.fullName?.toLowerCase().includes(q) ||
        e.cardNo?.toLowerCase().includes(q) ||
        e.reference?.toLowerCase().includes(q) ||
        e.organization?.toLowerCase().includes(q);

      const matchStatus = statusFilter === 'ALL' || e.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [enrollments, searchTerm, statusFilter]);

  const pendingCount = enrollments.filter((e) => e.status === 'pending').length;
  const approvedCount = enrollments.filter((e) => e.status === 'approved').length;
  const rejectedCount = enrollments.filter((e) => e.status === 'rejected').length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* === AMÉLIORATION AJOUTÉE : bannière d'en-tête (icône + titre + sous-titre à gauche,
          sur demande explicite) — fusionnée avec la navigation par onglets (auparavant sur sa
          propre bande blanche séparée juste au-dessus, retirée), désormais affichée à droite
          de la bannière à la place du badge "Biometric Standard ICAO 9303 & NFIQ 2.0" (retiré).
          Titre/sous-titre repris tels quels depuis l'ancien en-tête de l'onglet "create", et
          la bannière reste visible sur les deux onglets (create/list) pour ne jamais perdre le
          moyen de basculer entre les deux. */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs px-6 py-5 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Biometric Member Enrollment</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Certified optical fingerprint capture, facial photograph acquisition, and policy affiliation
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'create'
                ? 'bg-[#0a2e6b] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Beneficiary Enrollment</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'list'
                ? 'bg-[#0a2e6b] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ListOrdered className="w-4 h-4" />
            <span>Submitted Requests</span>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black ml-1">
                {pendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'create' ? (
        <div className="space-y-6">
          {submitted && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold text-sm">Enrollment file successfully submitted!</p>
                <p className="text-xs text-emerald-700">
                  The file has been routed to the supervisor for review and health card generation.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
            {formError && (
              <div className="lg:col-span-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFormError(null)}
                  className="text-rose-500 hover:text-rose-800 text-xs font-bold px-1.5 py-0.5 rounded cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* LEFT COLUMN: Biometric acquisition */}
            <div className="lg:col-span-2 space-y-6">
              {/* Fingerprint sensor */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Fingerprint className="w-4 h-4 text-[#0a2e6b]" />
                    <span>1. Fingerprint Sensor Scanner</span>
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide shrink-0">Optical 500 DPI</span>
                </div>

                <div
                  className={`rounded-xl border-2 border-dashed ${
                    hasBiometrics ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                  } flex flex-col items-center justify-center gap-2 py-8 px-4 transition-colors`}
                >
                  <Fingerprint className={`w-10 h-10 ${hasBiometrics ? 'text-emerald-600' : 'text-slate-300'}`} />
                  <p className="text-[11px] text-slate-500 text-center">
                    {hasBiometrics
                      ? `Fingerprint captured & verified (${biometricData?.score || 96}%)`
                      : "Place the insured person's finger on the USB biometric sensor."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsFingerprintModalOpen(true)}
                  className="w-full py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#0a2e6b] border border-blue-200 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Fingerprint className="w-4 h-4" />
                  <span>{hasBiometrics ? 'Re-trigger Fingerprint Scanner Device' : 'Trigger Fingerprint Scanner Device'}</span>
                </button>
              </div>

              {/* Camera & photo */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-[#0a2e6b]" />
                    <span>2. Camera &amp; Photo Capture</span>
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide shrink-0">ICAO Portrait</span>
                </div>

                <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-3 py-6 px-4">
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-white border border-slate-200 flex items-center justify-center shadow-xs shrink-0">
                    {photoData ? (
                      <img src={photoData} alt="Insured portrait" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-9 h-9 text-slate-300" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 text-center">
                    Neutral facial framing complying with insurance standards.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIsWebcamModalOpen(true)}
                    className="flex-1 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#0a2e6b] border border-blue-200 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Activate Camera &amp; Take Photo</span>
                  </button>
                  <label className="px-3.5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload</span>
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  </label>
                </div>
                {hasPhoto && (
                  <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Photo attached
                  </span>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Personal & policy details */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <User className="w-4 h-4 text-[#0a2e6b]" />
                    <span>3. Insured Personal &amp; Policy Details</span>
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide shrink-0">All fields required</span>
                </div>

                {/* === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — sur
                    demande explicite. Le numéro de carte (AMID-YYMMDD-NNNNN, YYMMDD = date
                    d'émission du jour) n'est plus saisi manuellement : il est désormais généré
                    automatiquement, de façon unique et transactionnelle
                    (src/services/cardNumberService.ts), au moment de la soumission. === */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">Health Card Number</label>
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide shrink-0">ACTIVA Unique Identifier</span>
                  </div>
                  <div className="relative">
                    <CreditCard className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <div className="w-full pl-10 pr-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 font-mono">
                      Generated automatically on submission (AMID-YYMMDD-NNNNN)
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Last Name:</label>
                    <input
                      type="text"
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                      required
                      placeholder="e.g. Williams, Doe, Cooper..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">First Name:</label>
                    <input
                      type="text"
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                      required
                      placeholder="e.g. Samuel, Victoria, Jonathan..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Date of Birth:</label>
                    <input
                      type="date"
                      value={form.birthDate}
                      onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Gender:</label>
                    <select
                      value={form.gender}
                      onChange={(e) => setForm({ ...form, gender: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                    >
                      <option value="M">Male (M)</option>
                      <option value="F">Female (F)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Relationship:</label>
                  <select
                    value={form.relationship}
                    onChange={(e) => {
                      const relationship = e.target.value as RelationshipType;
                      setForm({ ...form, relationship });
                      if (relationship === 'Principal') {
                        setSelectedPrincipalCardNo('');
                      }
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                  >
                    <option value="Principal">Principal Insured (Self / Policyholder)</option>
                    <option value="Spouse">Spouse (Dependent)</option>
                    <option value="Child">Child (Dependent)</option>
                  </select>
                </div>

                {form.relationship !== 'Principal' && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[11px] font-extrabold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        <span>Mandatory Link to Principal Insured</span>
                      </h4>
                      <span className="px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-900 text-[10px] font-black uppercase tracking-wide shrink-0">
                        Dependent
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="relative" ref={principalSearchRef}>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Principal Insured Full Name <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-amber-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={form.mainInsuredName}
                            onChange={(e) => {
                              setForm({ ...form, mainInsuredName: e.target.value });
                              setSelectedPrincipalCardNo('');
                              setPrincipalSearchOpen(true);
                            }}
                            onFocus={() => setPrincipalSearchOpen(true)}
                            autoComplete="off"
                            className="w-full pl-8 pr-3.5 py-2 bg-white border border-amber-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500"
                            placeholder="Type to search the insured directory..."
                            required={form.relationship !== 'Principal'}
                          />
                        </div>
                        {/* Smart suggestions dropdown, filtered live from the existing member directory */}
                        {principalSearchOpen && principalSuggestions.length > 0 && (
                          <div className="absolute z-20 mt-1 w-full bg-white border border-amber-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                            {principalSuggestions.map((m) => (
                              <button
                                type="button"
                                key={m.id}
                                onClick={() => {
                                  setSelectedPrincipalCardNo(m.cardNo);
                                  setForm((prev) => ({
                                    ...prev,
                                    mainInsuredName: m.principalName,
                                    mainInsuredCardNo: m.cardNo,
                                    organization: m.organization || prev.organization,
                                  }));
                                  setPrincipalSearchOpen(false);
                                }}
                                className="w-full text-left px-3.5 py-2 hover:bg-amber-50 text-xs border-b border-amber-50 last:border-0 cursor-pointer"
                              >
                                <span className="font-bold text-slate-800">{m.principalName}</span>
                                <span className="text-slate-400 font-mono ml-1.5">{m.cardNo}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Principal Insured Card Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={form.mainInsuredCardNo}
                          onChange={(e) => setForm({ ...form, mainInsuredCardNo: e.target.value })}
                          className="w-full px-3.5 py-2 bg-white border border-amber-200 rounded-xl text-sm font-bold text-[#0a2e6b] font-mono focus:ring-2 focus:ring-amber-500"
                          placeholder="e.g. ACT-2025-0012"
                          required={form.relationship !== 'Principal'}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Affiliated Organization: <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide shrink-0">Corporate Group Policy</span>
                  </div>
                  <select
                    value={form.organization}
                    onChange={(e) => setForm({ ...form, organization: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                    required
                  >
                    {organizations.map((org) => (
                      <option key={org.id} value={org.name}>
                        {org.name}
                        {org.policyNumber ? ` — Policy: ${org.policyNumber}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Mobile Phone:</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                      placeholder="+231 77 000 0000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Email Address (Optional):</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                      placeholder="name@company.lr"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isGeneratingCard}
                    className="w-full py-3 bg-[#0a2e6b] hover:bg-[#07214f] text-white rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{isGeneratingCard ? 'Assigning card number…' : 'Submit Enrollment Application for Approval'}</span>
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      ) : (
        /* Tab 2: Submitted Requests History */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
            <div className="relative flex-1 w-full max-w-md">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search requests by card no, name, reference..."
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0a2e6b]"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-[#0a2e6b]"
              >
                <option value="ALL">All Status</option>
                <option value="pending">Pending Validation ({pendingCount})</option>
                <option value="approved">Approved ({approvedCount})</option>
                <option value="rejected">Rejected ({rejectedCount})</option>
              </select>
            </div>
          </div>

          {filteredEnrollments.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs font-medium">
              No enrollment requests found matching your filter.
            </div>
          ) : (
            <>
              {/* Desktop/tablet: table (unchanged) */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">CARD NO.</th>
                      <th className="py-3.5 px-4">BENEFICIARY</th>
                      <th className="py-3.5 px-4">ORGANIZATION</th>
                      <th className="py-3.5 px-4">SUBMITTED ON</th>
                      <th className="py-3.5 px-4 text-center">BIOMETRICS</th>
                      <th className="py-3.5 px-4 text-center">STATUS</th>
                      <th className="py-3.5 px-4 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEnrollments.map((enr) => (
                      <tr key={enr.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-3 px-4 font-mono font-bold text-[#0a2e6b]">{enr.cardNo}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800">{enr.fullName}</div>
                          <div className="text-[10px] text-slate-400">{enr.relationship}</div>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-600">{enr.organization}</td>
                        <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">{enr.submissionDate}</td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              enr.hasBiometrics
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            <Fingerprint className="w-3 h-3" />
                            <span>{enr.hasBiometrics ? `${enr.fingerprintScore || 96}%` : 'No'}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {enr.status === 'pending' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-bold text-[10px] border border-amber-200">
                              <Clock className="w-3 h-3" />
                              <span>Pending Review</span>
                            </span>
                          )}
                          {enr.status === 'approved' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Approved & Synced</span>
                            </span>
                          )}
                          {enr.status === 'rejected' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-bold text-[10px] border border-rose-200">
                              <XCircle className="w-3 h-3" />
                              <span>Rejected</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedEnrDetails(enr)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* === AMÉLIORATION AJOUTÉE : liste de cartes sur mobile, au lieu du tableau à 7
                  colonnes qui débordait/se comprimait mal sur petit écran. === */}
              <div className="sm:hidden divide-y divide-slate-100">
                {filteredEnrollments.map((enr) => (
                  <button
                    key={enr.id}
                    type="button"
                    onClick={() => setSelectedEnrDetails(enr)}
                    className="w-full text-left p-4 hover:bg-slate-50/80 transition space-y-2 cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-xs text-[#0a2e6b]">{enr.cardNo}</span>
                      {enr.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold text-[10px] border border-amber-200">
                          <Clock className="w-3 h-3" />
                          <span>Pending</span>
                        </span>
                      )}
                      {enr.status === 'approved' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Approved</span>
                        </span>
                      )}
                      {enr.status === 'rejected' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-[10px] border border-rose-200">
                          <XCircle className="w-3 h-3" />
                          <span>Rejected</span>
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900">{enr.fullName}</div>
                      <div className="text-[10.5px] text-slate-400">{enr.relationship} • {enr.organization}</div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{enr.submissionDate}</span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          enr.hasBiometrics
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <Fingerprint className="w-3 h-3" />
                        <span>{enr.hasBiometrics ? `${enr.fingerprintScore || 96}%` : 'No biometrics'}</span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Details View Modal */}
      {selectedEnrDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-[#0a2e6b]" />
                <h3 className="font-bold text-base text-slate-900">Enrollment File Details</h3>
              </div>
              <button
                onClick={() => setSelectedEnrDetails(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Health Card No:</span>
                <span className="font-mono font-bold text-[#0a2e6b]">{selectedEnrDetails.cardNo}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Full Name:</span>
                <span className="font-bold text-slate-900">{selectedEnrDetails.fullName}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Relationship Tier:</span>
                <span className="font-semibold text-slate-800">{selectedEnrDetails.relationship}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Organization:</span>
                <span className="font-semibold text-slate-800">{selectedEnrDetails.organization}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Status:</span>
                <span className="font-bold uppercase tracking-wide">{selectedEnrDetails.status}</span>
              </div>
              {selectedEnrDetails.decisionDate && (
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Decision Date:</span>
                  <span className="font-mono text-slate-700">{selectedEnrDetails.decisionDate}</span>
                </div>
              )}
              {selectedEnrDetails.rejectionReason && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
                  <p className="font-bold text-xs">Rejection Justification:</p>
                  <p className="text-xs mt-0.5">{selectedEnrDetails.rejectionReason}</p>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedEnrDetails(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Webcam Modal */}
      <WebcamCaptureModal
        isOpen={isWebcamModalOpen}
        onClose={() => setIsWebcamModalOpen(false)}
        onPhotoCaptured={handlePhotoCaptured}
        title="Live Webcam / Camera Capture"
      />

      {/* Biometric Fingerprint Acquisition Modal */}
      <BiometricFingerprintModal
        isOpen={isFingerprintModalOpen}
        onClose={() => setIsFingerprintModalOpen(false)}
        onFingerprintCaptured={handleFingerprintCaptured}
        title="Optical Biometric Fingerprint Acquisition"
        subtitle="FAP-20 / USB Biometric Hardware Scanner"
      />
    </div>
  );
};
