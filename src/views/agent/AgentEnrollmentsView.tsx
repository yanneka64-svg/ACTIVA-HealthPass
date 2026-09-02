import React, { useState, useMemo } from 'react';
import {
  UserCheck,
  Shield,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Building,
  User,
  Fingerprint,
  Camera,
  Calendar,
  CreditCard,
  Mail,
  Phone,
  Clock,
  Sparkles,
  Search,
  Eye,
  XCircle,
  X,
  FileCheck,
  ListOrdered,
  PlusCircle,
  Users
} from 'lucide-react';
import { Organization, Enrollment, UserProfile, Language, RelationshipType } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { WebcamCaptureModal } from '../../components/WebcamCaptureModal';
import { uploadPhotoOrFallback } from '../../utils/storageUtils';
import { BiometricFingerprintModal } from '../../components/BiometricFingerprintModal';
import { AttachmentBiometricViewerModal } from '../../components/AttachmentBiometricViewerModal';

interface AgentEnrollmentsViewProps {
  organizations: Organization[];
  enrollments?: Enrollment[];
  currentUser?: any;
  userRole?: UserProfile;
  lang?: Language;
  onAddEnrollment?: (enrollment: Partial<Enrollment>) => void;
  onCreateEnrollment?: (enrollment: Partial<Enrollment>) => void;
}

export const AgentEnrollmentsView: React.FC<AgentEnrollmentsViewProps> = ({
  organizations,
  enrollments = [],
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
    cardNo: '',
    fullName: '',
    birthDate: '1990-01-01',
    gender: 'M',
    relationship: 'Principal' as RelationshipType,
    mainInsuredName: '',
    mainInsuredCardNo: '',
    organization: organizations[0]?.name || '',
    phone: '',
    email: '',
  });

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cardNo || !form.fullName || !form.organization) {
      alert('Please fill out all mandatory fields.');
      return;
    }

    // === AMÉLIORATION AJOUTÉE : upload vers Firebase Storage avec repli automatique vers le
    // stockage base64 existant en cas d'échec (voir storageUtils.ts / MembersView.tsx).
    const resolvedPhotoUrl = photoData
      ? await uploadPhotoOrFallback(photoData, 'enrollment-photos', form.cardNo)
      : undefined;

    const newEnrollment: Partial<Enrollment> = {
      reference: `ENR-2026-${Math.floor(100 + Math.random() * 900)}`,
      cardNo: form.cardNo,
      fullName: form.fullName,
      birthDate: form.birthDate || '1990-01-01',
      gender: form.gender as 'M' | 'F',
      relationship: form.relationship,
      mainInsuredName: form.relationship === 'Principal' ? form.fullName : form.mainInsuredName,
      mainInsuredCardNo: form.relationship === 'Principal' ? form.cardNo : form.mainInsuredCardNo,
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
        fullName: '',
        birthDate: '1990-01-01',
        gender: 'M',
        relationship: 'Principal',
        mainInsuredName: '',
        mainInsuredCardNo: '',
        organization: organizations[0]?.name || '',
        phone: '',
        email: '',
      });
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
      {/* Navigation Tabs Header */}
      <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-xs flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
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

        {activeTab === 'list' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-bold border border-amber-200">
              Pending: {pendingCount}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
              Approved: {approvedCount}
            </span>
            {rejectedCount > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-bold border border-rose-200">
                Rejected: {rejectedCount}
              </span>
            )}
          </div>
        )}
      </div>

      {activeTab === 'create' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-8 py-6 bg-[#0a2e6b] text-white flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Insured Biometric Enrollment</h2>
              <p className="text-sm text-blue-100 mt-1">
                Identity capture and biometric enrollment for health card issuance
              </p>
            </div>
            <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
              <UserCheck className="w-6 h-6 text-white" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-8">
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

            {/* Section 1: Card & Identity Info */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Shield className="w-4 h-4 text-[#0a2e6b]" />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                  Beneficiary Identity
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Health Card No <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.cardNo}
                    onChange={(e) => setForm({ ...form, cardNo: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-[#0a2e6b] font-mono focus:ring-2 focus:ring-[#0a2e6b]"
                    required
                    placeholder="e.g. ACT-2026-10293"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Full Legal Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                    required
                    placeholder="e.g. John Doe"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Date of Birth <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.birthDate}
                    onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Gender <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Organization / Employer <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={form.organization}
                    onChange={(e) => setForm({ ...form, organization: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                    required
                  >
                    {organizations.map((org) => (
                      <option key={org.id} value={org.name}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Section 2: Policy Status and Relationship */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <User className="w-4 h-4 text-[#0a2e6b]" />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                  Policy Status & Beneficiary Tier
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Relationship <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={form.relationship}
                    onChange={(e) => setForm({ ...form, relationship: e.target.value as RelationshipType })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                  >
                    <option value="Principal">Principal Insured</option>
                    <option value="Conjoint">Spouse</option>
                    <option value="Enfant">Child / Dependent</option>
                    <option value="Ascendant">Parent / Ascendant</option>
                  </select>
                </div>

                {form.relationship !== 'Principal' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Principal Insured Full Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.mainInsuredName}
                        onChange={(e) => setForm({ ...form, mainInsuredName: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                        placeholder="e.g. Samuel Doe"
                        required={form.relationship !== 'Principal'}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Principal Health Card No <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.mainInsuredCardNo}
                        onChange={(e) => setForm({ ...form, mainInsuredCardNo: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-[#0a2e6b] font-mono focus:ring-2 focus:ring-[#0a2e6b]"
                        placeholder="e.g. ACT-2026-00100"
                        required={form.relationship !== 'Principal'}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Section 3: Contact */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Phone className="w-4 h-4 text-[#0a2e6b]" />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                  Contact Details
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                    placeholder="+231 77 123 4567"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                    placeholder="insured@organization.com"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Biometrics & Photo Capture */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Fingerprint className="w-4 h-4 text-[#0a2e6b]" />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                  Biometric Capture & Facial Identification
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Photo Box */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center justify-center space-y-4">
                  <div className="w-28 h-28 rounded-full border-2 border-dashed border-[#0a2e6b] overflow-hidden flex items-center justify-center bg-white shadow-xs">
                    {photoData ? (
                      <img src={photoData} alt="Captured Profile" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-8 h-8 text-slate-300" />
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsWebcamModalOpen(true)}
                      className="px-3.5 py-2 bg-[#0a2e6b] hover:bg-[#07214f] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Camera className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Capture Webcam</span>
                    </button>

                    <label className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Image</span>
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                    </label>
                  </div>
                  {hasPhoto && (
                    <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Photo Captured & Attached
                    </span>
                  )}
                </div>

                {/* Fingerprint Box */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center justify-center space-y-4">
                  <div
                    className={`w-28 h-28 rounded-2xl border-2 border-dashed ${
                      hasBiometrics ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white'
                    } flex items-center justify-center shadow-xs transition-colors`}
                  >
                    <Fingerprint
                      className={`w-12 h-12 ${hasBiometrics ? 'text-emerald-600' : 'text-slate-300'}`}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsFingerprintModalOpen(true)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs ${
                      hasBiometrics
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-200'
                        : 'bg-[#00A859] hover:bg-[#008f4c] text-white'
                    }`}
                  >
                    <Fingerprint className="w-3.5 h-3.5" />
                    <span>{hasBiometrics ? 'Rescan Fingerprint ✓' : 'Scan Fingerprint'}</span>
                  </button>

                  {hasBiometrics && (
                    <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Fingerprint Encrypted & Verified (
                      {biometricData?.score || 96}%)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="submit"
                className="px-8 py-3.5 bg-[#0a2e6b] hover:bg-[#07214f] text-white rounded-xl font-bold text-sm shadow-md transition flex items-center gap-2 cursor-pointer"
              >
                <UserCheck className="w-4 h-4" />
                <span>Submit Enrollment for Validation</span>
              </button>
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
            <div className="overflow-x-auto">
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
