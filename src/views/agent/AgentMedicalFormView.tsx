import React, { useState, useMemo } from 'react';
import {
  FileCheck,
  Download,
  Printer,
  Share2,
  User,
  Building,
  QrCode,
  Shield,
  Stethoscope,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Search,
  ExternalLink,
  Plus,
  RefreshCw,
  Copy,
  Eye,
  Check,
  Sparkles,
  Activity,
  BedDouble,
  UserCheck,
  PenTool
} from 'lucide-react';
import { Member, Provider, Organization, MedicalForm, UserProfile, Language } from '../../types';
import { generateMedicalFormPDF } from '../../utils/pdfMedicalForm';
import { LogoIcon } from '../../components/Logo';

interface AgentMedicalFormViewProps {
  providers: Provider[];
  members: Member[];
  organizations: Organization[];
  medicalForms?: MedicalForm[];
  userRole?: UserProfile;
  lang?: Language;
  onCreateMedicalForm?: (form: Partial<MedicalForm>) => void;
  onUpdateMedicalForm?: (form: MedicalForm) => void;
}

const COMMON_SPECIALTIES = [
  'Cardiology',
  'Pediatrics',
  'Ophthalmology',
  'Gynecology & Obstetrics',
  'Dermatology',
  'Gastroenterology',
  'General Surgery',
  'Internal Medicine',
  'Radiology & Imaging',
  'ENT (Otorhinolaryngology)',
  'Dentistry & Oral Care',
  'Neurology',
  'Other Specialty'
];

export const AgentMedicalFormView: React.FC<AgentMedicalFormViewProps> = ({
  providers,
  members,
  organizations,
  medicalForms = [],
  userRole = 'Agent',
  lang = 'en',
  onCreateMedicalForm,
  onUpdateMedicalForm,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  
  // Selection States
  const [selectedMemberCard, setSelectedMemberCard] = useState<string>('');
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  
  // Practitioner (Generalist vs Specialist) and Treatment (Outpatient vs Inpatient)
  const [practitionerType, setPractitionerType] = useState<'Generalist' | 'Specialist'>('Generalist');
  const [doctorSpecialty, setDoctorSpecialty] = useState<string>('Cardiology');
  const [customSpecialty, setCustomSpecialty] = useState<string>('');
  const [coverageType, setCoverageType] = useState<'Outpatient' | 'Inpatient'>('Outpatient');
  
  // Prescription & Diagnostic inputs
  const [doctorName, setDoctorName] = useState('');
  const [presumedDiagnosis, setPresumedDiagnosis] = useState('');
  const [requestedExams, setRequestedExams] = useState('');
  const [treatmentOrder, setTreatmentOrder] = useState('');
  
  // Active Generated Form state
  const [generatedForm, setGeneratedForm] = useState<MedicalForm | null>(null);
  const [previewModalForm, setPreviewModalForm] = useState<MedicalForm | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [filterCoverage, setFilterCoverage] = useState<'all' | 'Outpatient' | 'Inpatient'>('all');
  const [filterPractitioner, setFilterPractitioner] = useState<'all' | 'Generalist' | 'Specialist'>('all');

  // Selected Member Object
  const selectedMember = useMemo(() => {
    return members.find((m) => m.cardNo === selectedMemberCard) || null;
  }, [members, selectedMemberCard]);

  // Selected Provider Object
  const selectedProvider = useMemo(() => {
    return providers.find((p) => p.id === selectedProviderId || p.name === selectedProviderId) || null;
  }, [providers, selectedProviderId]);

  // Effective specialty string
  const effectiveSpecialty = useMemo(() => {
    if (practitionerType === 'Generalist') return 'General Practice';
    if (doctorSpecialty === 'Other Specialty') return customSpecialty || 'Medical Specialist';
    return doctorSpecialty;
  }, [practitionerType, doctorSpecialty, customSpecialty]);

  // Handle Form Generation
  const handleGenerateForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || !selectedProvider) {
      alert('Please select both the insured member and the healthcare provider.');
      return;
    }

    const randomSec = Math.floor(100000 + Math.random() * 900000);
    const secNum = `ACT-MED-2026-${randomSec}`;

    const newForm: MedicalForm = {
      id: `mf_${Date.now()}`,
      securityNumber: secNum,
      barcode: secNum,
      memberId: selectedMember.id,
      memberName: selectedMember.principalName,
      memberCardNo: selectedMember.cardNo,
      organization: selectedMember.organization,
      providerId: selectedProvider.id,
      providerName: selectedProvider.name,
      coverageType: coverageType,
      practitionerType: practitionerType,
      doctorSpecialty: practitionerType === 'Specialist' ? effectiveSpecialty : undefined,
      outpatientBalanceUSD: selectedMember.outpatientBalanceUSD ?? 600,
      inpatientBalanceUSD: selectedMember.inpatientBalanceUSD ?? 8500,
      issueDate: new Date().toISOString().split('T')[0],
      status: 'issued',
      doctorName: doctorName || (practitionerType === 'Generalist' ? 'Dr. General Practitioner' : `Dr. Specialist (${effectiveSpecialty})`),
      doctorPrescription: {
        presumedDiagnosis: presumedDiagnosis || undefined,
        requestedExams: requestedExams || undefined,
        treatmentOrder: treatmentOrder || undefined,
      },
      createdAt: new Date().toISOString(),
    };

    setGeneratedForm(newForm);

    if (onCreateMedicalForm) {
      onCreateMedicalForm(newForm);
    }
  };

  // PDF Download Handler
  const handleDownloadPDF = (form: MedicalForm) => {
    const doc = generateMedicalFormPDF(form);
    doc.save(`Medical_Form_ACTIVA_${form.securityNumber}.pdf`);
  };

  // Print Handler
  const handlePrint = (form: MedicalForm) => {
    const doc = generateMedicalFormPDF(form);
    doc.autoPrint();
    const pdfBlob = doc.output('bloburl');
    window.open(pdfBlob, '_blank');
  };

  // Share Handler
  const handleShare = async (form: MedicalForm) => {
    const pType = form.practitionerType === 'Specialist' 
      ? `Specialist Physician (${form.doctorSpecialty || 'Specialized'})` 
      : 'General Practitioner';
    const cType = form.coverageType === 'Outpatient' ? 'Outpatient Care' : 'Inpatient Admission';

    const shareText = `ACTIVA INSURANCE Healthcare Authorization Voucher\nSecurity No: ${form.securityNumber}\nInsured: ${form.memberName} (${form.memberCardNo})\nFacility: ${form.providerName}\nConsultation: ${pType}\nTreatment Modality: ${cType}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `ACTIVA Medical Voucher - ${form.securityNumber}`,
          text: shareText,
          url: window.location.href,
        });
        setShareFeedback('Medical voucher shared successfully!');
        setTimeout(() => setShareFeedback(null), 3000);
        return;
      } catch (err) {
        console.log('Share canceled or failed', err);
      }
    }

    // Fallback: Copy to clipboard
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedLink(true);
      setShareFeedback('Voucher details copied to clipboard!');
      setTimeout(() => {
        setCopiedLink(false);
        setShareFeedback(null);
      }, 3000);
    } catch (e) {
      alert('Unable to copy automatically. Please use the PDF download option.');
    }
  };

  // Toggle status in history
  const handleToggleStatus = (form: MedicalForm, newStatus: 'issued' | 'used' | 'pending_return' | 'completed') => {
    if (onUpdateMedicalForm) {
      onUpdateMedicalForm({ ...form, status: newStatus });
    }
  };

  // Filtered forms for history
  const filteredForms = useMemo(() => {
    return medicalForms.filter((f) => {
      if (filterCoverage !== 'all' && f.coverageType !== filterCoverage) return false;
      if (filterPractitioner !== 'all') {
        const isSpec = f.practitionerType === 'Specialist' || f.practitionerType === 'Spécialiste';
        if (filterPractitioner === 'Specialist' && !isSpec) return false;
        if (filterPractitioner === 'Generalist' && isSpec) return false;
      }
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const matches =
          f.memberName.toLowerCase().includes(q) ||
          f.memberCardNo.toLowerCase().includes(q) ||
          f.securityNumber.toLowerCase().includes(q) ||
          f.providerName.toLowerCase().includes(q) ||
          (f.doctorSpecialty && f.doctorSpecialty.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [medicalForms, searchFilter, filterCoverage, filterPractitioner]);

  return (
    <div className="space-y-6">
      {/* Top Tab Navigation */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'create'
                ? 'bg-[#0a2e6b] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Medical Voucher</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-[#0a2e6b] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>History ({medicalForms.length})</span>
          </button>
        </div>
      </div>

      {shareFeedback && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="font-bold text-xs">{shareFeedback}</p>
        </div>
      )}

      {/* TAB 1: CREATION AND CONFIGURATION */}
      {activeTab === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Form Column: Configuration */}
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-6 py-4 bg-[#0a2e6b] text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">Medical Voucher Configuration</h3>
                    <p className="text-[11px] text-blue-100">Physician, coverage scope, diagnostic framework & signature</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleGenerateForm} className="p-6 space-y-5">
                {/* 1. Member Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    1. Select Insured Beneficiary <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedMemberCard}
                    onChange={(e) => setSelectedMemberCard(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                    required
                  >
                    <option value="">Select a member from directory...</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.cardNo}>
                        {m.principalName} — {m.cardNo} ({m.organization})
                      </option>
                    ))}
                  </select>

                  {/* Auto-filled details */}
                  {selectedMember && (
                    <div className="mt-2 p-3 bg-blue-50/70 border border-blue-200 rounded-xl grid grid-cols-2 gap-2 text-xs animate-in fade-in">
                      <div>
                        <span className="text-slate-400 text-[10px] block font-semibold">Member Name</span>
                        <span className="font-bold text-slate-800">{selectedMember.principalName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block font-semibold">Health Card No</span>
                        <span className="font-bold text-[#0a2e6b] font-mono">{selectedMember.cardNo}</span>
                      </div>
                      <div className="col-span-2 pt-1 border-t border-blue-100 flex items-center justify-between">
                        <div>
                          <span className="text-slate-400 text-[10px] block font-semibold">Organization / Employer</span>
                          <span className="font-bold text-slate-800">{selectedMember.organization}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 text-[10px] block font-semibold">Outpatient Balance</span>
                          <span className="font-bold text-[#00A859]">${selectedMember.outpatientBalanceUSD ?? 600} USD</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Provider Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    2. Accredited Healthcare Facility / Provider <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedProviderId}
                    onChange={(e) => setSelectedProviderId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                    required
                  >
                    <option value="">Select hospital, clinic or medical center...</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.type} - {p.location})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. CONSULTATION TYPE: GENERALIST OR SPECIALIST */}
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Stethoscope className="w-4 h-4 text-[#0a2e6b]" />
                      <span>3. Medical Consultation Type</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-[#0a2e6b]">
                      ACTIVA Policy
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPractitionerType('Generalist')}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                        practitionerType === 'Generalist'
                          ? 'bg-blue-50/90 border-[#0a2e6b] ring-2 ring-[#0a2e6b]/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-[#0a2e6b]">🩺 Generalist</span>
                        {practitionerType === 'Generalist' && (
                          <CheckCircle2 className="w-4 h-4 text-[#0a2e6b]" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        General practice, standard examination, and primary routing
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPractitionerType('Specialist')}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                        practitionerType === 'Specialist'
                          ? 'bg-purple-50/90 border-purple-600 ring-2 ring-purple-600/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-purple-800">👨‍⚕️ Specialist</span>
                        {practitionerType === 'Specialist' && (
                          <CheckCircle2 className="w-4 h-4 text-purple-600" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Specialized doctor (Cardiology, Pediatrics, Ophthalmology, etc.)
                      </p>
                    </button>
                  </div>

                  {/* Specialty dropdown if Specialist is selected */}
                  {practitionerType === 'Specialist' && (
                    <div className="pt-2 border-t border-slate-200/80 space-y-2 animate-in fade-in">
                      <label className="block text-[11px] font-bold text-purple-900">
                        Specify Medical Specialty:
                      </label>
                      <select
                        value={doctorSpecialty}
                        onChange={(e) => setDoctorSpecialty(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-purple-200 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-purple-600"
                      >
                        {COMMON_SPECIALTIES.map((spec) => (
                          <option key={spec} value={spec}>
                            {spec}
                          </option>
                        ))}
                      </select>

                      {doctorSpecialty === 'Other Specialty' && (
                        <input
                          type="text"
                          value={customSpecialty}
                          onChange={(e) => setCustomSpecialty(e.target.value)}
                          placeholder="Enter exact medical specialty..."
                          className="w-full px-3 py-1.5 bg-white border border-purple-300 rounded-lg text-xs"
                          required
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* 4. TREATMENT MODALITY: OUTPATIENT OR INPATIENT */}
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-[#00A859]" />
                      <span>4. Treatment Scope / Modality</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Balance Limit
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCoverageType('Outpatient')}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                        coverageType === 'Outpatient'
                          ? 'bg-blue-50/90 border-[#0a2e6b] ring-2 ring-[#0a2e6b]/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-[#0a2e6b]">🏥 Outpatient Care</span>
                        {coverageType === 'Outpatient' && (
                          <CheckCircle2 className="w-4 h-4 text-[#0a2e6b]" />
                        )}
                      </div>
                      <div className="mt-2 text-xs">
                        <span className="text-[10px] text-slate-400 block">Available Balance:</span>
                        <span className="text-sm font-black text-[#0a2e6b]">
                          ${selectedMember?.outpatientBalanceUSD ?? 600} USD
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCoverageType('Inpatient')}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                        coverageType === 'Inpatient'
                          ? 'bg-emerald-50/90 border-[#00A859] ring-2 ring-[#00A859]/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-[#00A859]">🛏️ Inpatient Admission</span>
                        {coverageType === 'Inpatient' && (
                          <CheckCircle2 className="w-4 h-4 text-[#00A859]" />
                        )}
                      </div>
                      <div className="mt-2 text-xs">
                        <span className="text-[10px] text-slate-400 block">Available Balance:</span>
                        <span className="text-sm font-black text-[#00A859]">
                          ${selectedMember?.inpatientBalanceUSD ?? 8500} USD
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* 5. DIAGNOSTIC & PRESCRIPTIONS FRAMEWORK */}
                <div className="p-4 bg-blue-50/40 rounded-xl border border-blue-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#0a2e6b]" />
                      <span className="text-xs font-bold text-[#0a2e6b]">5. Physician Diagnosis & Prescriptions Framework</span>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                      Pre-filled or handwritten by physician
                    </span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Attending Physician Name</label>
                    <input
                      type="text"
                      value={doctorName}
                      onChange={(e) => setDoctorName(e.target.value)}
                      placeholder={practitionerType === 'Generalist' ? 'e.g. Dr. Arthur Miller, General Practice' : `e.g. Dr. Arthur Miller, ${effectiveSpecialty}`}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                      Medical Diagnosis / Chief Complaint
                    </label>
                    <input
                      type="text"
                      value={presumedDiagnosis}
                      onChange={(e) => setPresumedDiagnosis(e.target.value)}
                      placeholder="e.g. Health checkup, acute infectious syndrome, cardiology follow-up..."
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Prescribed Lab & Imaging Exams</label>
                    <input
                      type="text"
                      value={requestedExams}
                      onChange={(e) => setRequestedExams(e.target.value)}
                      placeholder="e.g. CBC, Lipid Profile, Chest X-Ray, Abdominal Ultrasound..."
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Prescription & Medical Orders</label>
                    <textarea
                      rows={2}
                      value={treatmentOrder}
                      onChange={(e) => setTreatmentOrder(e.target.value)}
                      placeholder="e.g. 1. Dosage, frequency and treatment duration..."
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 resize-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!selectedMember || !selectedProvider}
                  className={`w-full py-3.5 rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center gap-2 ${
                    !selectedMember || !selectedProvider
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-[#00A859] hover:bg-[#008f4c] text-white active:scale-98 cursor-pointer'
                  }`}
                >
                  <FileCheck className="w-4 h-4" />
                  <span>Generate Medical Voucher</span>
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Live Document Preview */}
          <div className="lg:col-span-6 space-y-4">
            {generatedForm ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 animate-in zoom-in-95">
                {/* Actions Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Medical Voucher Ready</span>
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePrint(generatedForm)}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print</span>
                    </button>
                    <button
                      onClick={() => handleShare(generatedForm)}
                      className="px-3 py-1.5 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-[#0a2e6b] rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Share</span>
                    </button>
                    <button
                      onClick={() => handleDownloadPDF(generatedForm)}
                      className="px-3.5 py-1.5 bg-[#0a2e6b] hover:bg-[#07214f] text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </button>
                  </div>
                </div>

                {/* Simulated Paper */}
                <div className="bg-white p-5 rounded-xl border-2 border-slate-200 shadow-lg font-sans text-xs space-y-3.5 relative">
                  {/* Header Bar */}
                  <div className="bg-[#0a2e6b] text-white p-3.5 rounded-lg flex items-center justify-between border-b-4 border-[#00A859]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center text-emerald-400">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-black text-sm tracking-wide">ACTIVA HealthPass</div>
                        <div className="text-[9.5px] text-blue-100">HEALTHCARE AUTHORIZATION & PRESCRIPTION</div>
                      </div>
                    </div>
                    <div className="text-right font-mono text-[9.5px]">
                      <div className="font-bold">{generatedForm.securityNumber}</div>
                      <div className="text-blue-200">{generatedForm.issueDate}</div>
                    </div>
                  </div>

                  {/* 1. Insured Details & Treatment Modality */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                    <div className="text-[10px] font-bold text-[#0a2e6b] uppercase tracking-wide">
                      1. Beneficiary & Treatment Modality
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 text-[10px] block">Insured Member</span>
                        <strong className="text-slate-800">{generatedForm.memberName}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Health Card No</span>
                        <strong className="text-[#0a2e6b] font-mono">{generatedForm.memberCardNo}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Employer / Sponsor</span>
                        <strong>{generatedForm.organization}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Treatment Scope</span>
                        <strong className={generatedForm.coverageType === 'Outpatient' ? 'text-[#0a2e6b]' : 'text-[#00A859]'}>
                          {generatedForm.coverageType === 'Outpatient' ? '🏥 Outpatient Care' : '🛏️ Inpatient Admission'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* 2. Provider Details & Practitioner Type */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                    <div className="text-[10px] font-bold text-[#0a2e6b] uppercase tracking-wide">
                      2. Healthcare Provider & Consultation Scope
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 text-[10px] block">Facility / Hospital</span>
                        <strong className="text-slate-800">{generatedForm.providerName}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Consultation Type</span>
                        <strong className={generatedForm.practitionerType === 'Specialist' ? 'text-purple-700' : 'text-[#0a2e6b]'}>
                          {generatedForm.practitionerType === 'Specialist'
                            ? `👨‍⚕️ Specialist (${generatedForm.doctorSpecialty || 'Specialized Medicine'})`
                            : '🩺 General Practitioner'}
                        </strong>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400 text-[10px] block">Attending Physician</span>
                        <strong>{generatedForm.doctorName || 'Dr. _______________________'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* 3. DIAGNOSTIC & PRESCRIPTIONS FRAMEWORK */}
                  <div className="bg-white p-3.5 rounded-lg border-2 border-[#0a2e6b]/20 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                      <div className="text-[10px] font-bold text-[#0a2e6b] uppercase tracking-wide flex items-center gap-1.5">
                        <PenTool className="w-3 h-3 text-[#0a2e6b]" />
                        <span>3. Physician Framework — Diagnosis & Medical Orders</span>
                      </div>
                    </div>

                    <div className="text-[10px] space-y-2">
                      <div className="p-2 bg-slate-50 rounded border border-slate-200">
                        <span className="font-bold text-slate-700 block mb-0.5">Medical Diagnosis / Chief Complaint:</span>
                        <div className="text-slate-800 font-medium">
                          {generatedForm.doctorPrescription?.presumedDiagnosis || (
                            <span className="text-slate-400 italic">____________________________________________________________________</span>
                          )}
                        </div>
                      </div>

                      <div className="p-2 bg-slate-50 rounded border border-slate-200">
                        <span className="font-bold text-slate-700 block mb-0.5">Diagnostic & Lab Examinations:</span>
                        <div className="text-slate-800 font-medium">
                          {generatedForm.doctorPrescription?.requestedExams || (
                            <span className="text-slate-400 italic">____________________________________________________________________</span>
                          )}
                        </div>
                      </div>

                      <div className="p-2 bg-slate-50 rounded border border-slate-200">
                        <span className="font-bold text-slate-700 block mb-0.5">Prescribed Treatment & Medications:</span>
                        <div className="text-slate-800 font-medium">
                          {generatedForm.doctorPrescription?.treatmentOrder || (
                            <span className="text-slate-400 italic">1. _________________________________________________________________</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4. SIGNATURES (INSURED & DOCTOR WITH STAMP) */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="p-3 bg-slate-50 border border-slate-300 rounded-lg text-center h-24 flex flex-col justify-between">
                      <span className="text-[9.5px] font-bold text-slate-700">Patient / Insured Signature</span>
                      <div className="text-[8px] text-slate-400 italic">Confirmed & Approved</div>
                      <div className="text-[8px] text-slate-500 font-mono">Date: ____/____/2026</div>
                    </div>

                    <div className="p-3 bg-blue-50/50 border-2 border-dashed border-[#0a2e6b]/40 rounded-lg text-center h-24 flex flex-col justify-between">
                      <div className="flex items-center justify-center gap-1 text-[9.5px] font-bold text-[#0a2e6b]">
                        <PenTool className="w-3 h-3 text-[#0a2e6b]" />
                        <span>Physician Signature & Official Stamp</span>
                      </div>
                      <div className="text-[8px] text-slate-400 italic">Provider stamp required</div>
                      <div className="text-[8px] text-slate-500 font-mono">Date: ____/____/2026</div>
                    </div>
                  </div>

                  {/* Barcode & Security */}
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <QrCode className="w-7 h-7 text-[#0a2e6b]" />
                      <div>
                        <div className="text-[9.5px] font-mono font-bold text-slate-800">{generatedForm.securityNumber}</div>
                        <div className="text-[8px] text-slate-400">ACTIVA Unique Security Identifier</div>
                      </div>
                    </div>
                    <div className="text-[8.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      VALID 48H
                    </div>
                  </div>

                  {/* Mandatory Instruction */}
                  <div className="p-2 bg-rose-50 border border-rose-300 rounded-lg text-center">
                    <p className="text-[9px] font-extrabold text-rose-700 leading-tight">
                      « This document must be returned to the medical agent following practitioner sign-off. »
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[350px] bg-slate-50/70 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-8 text-center">
                <div className="w-14 h-14 bg-white rounded-2xl border border-slate-200 shadow-xs flex items-center justify-center mb-3">
                  <FileText className="w-7 h-7 text-slate-400" />
                </div>
                <h4 className="font-bold text-sm text-slate-700 mb-1">Document Live Preview</h4>
                <p className="text-xs text-slate-400 max-w-xs">
                  Select an insured member, accredited provider, consultation type (Generalist / Specialist), and treatment modality (Outpatient / Inpatient).
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ISSUED MEDICAL VOUCHERS HISTORY */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Issued Medical Vouchers ({filteredForms.length})</h3>
              <p className="text-xs text-slate-500">Complete audit trail by practitioner type (Generalist / Specialist) and treatment modality</p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Coverage filter */}
              <select
                value={filterCoverage}
                onChange={(e) => setFilterCoverage(e.target.value as any)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
              >
                <option value="all">All Care Types (Outpatient/Inpatient)</option>
                <option value="Outpatient">Outpatient</option>
                <option value="Inpatient">Inpatient</option>
              </select>

              {/* Practitioner filter */}
              <select
                value={filterPractitioner}
                onChange={(e) => setFilterPractitioner(e.target.value as any)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
              >
                <option value="all">All Practitioners</option>
                <option value="Generalist">Generalist</option>
                <option value="Specialist">Specialist</option>
              </select>

              {/* Search input */}
              <div className="relative w-full sm:w-60">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Search member, card, security #..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-[#0a2e6b]"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Security No</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Insured & Card</th>
                  <th className="py-3 px-4">Facility</th>
                  <th className="py-3 px-4">Consultation</th>
                  <th className="py-3 px-4">Treatment</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredForms.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 text-xs font-medium">
                      No medical vouchers matching the specified criteria.
                    </td>
                  </tr>
                ) : (
                  filteredForms.map((form) => {
                    const isSpec = form.practitionerType === 'Specialist' || form.practitionerType === 'Spécialiste';
                    return (
                      <tr key={form.id} className="hover:bg-slate-50 transition">
                        <td className="py-3.5 px-4 font-mono font-bold text-[#0a2e6b] whitespace-nowrap">
                          {form.securityNumber}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                          {form.issueDate}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-800 block">{form.memberName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{form.memberCardNo}</span>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-700">
                          {form.providerName}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              isSpec
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : 'bg-blue-50 text-[#0a2e6b] border border-blue-200'
                            }`}
                          >
                            {isSpec ? `Specialist (${form.doctorSpecialty || 'Medical'})` : 'Generalist'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              form.coverageType === 'Outpatient'
                                ? 'bg-blue-50 text-[#0a2e6b]'
                                : 'bg-emerald-50 text-[#00A859]'
                            }`}
                          >
                            {form.coverageType === 'Outpatient' ? 'Outpatient' : 'Inpatient'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              form.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : form.status === 'pending_return'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-blue-50 text-[#0a2e6b] border border-blue-200'
                            }`}
                          >
                            {form.status === 'completed'
                              ? 'Completed / Closed'
                              : form.status === 'pending_return'
                              ? 'Awaiting Physician Return'
                              : 'Issued / Active'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setPreviewModalForm(form)}
                              className="p-1.5 text-slate-500 hover:text-[#0a2e6b] hover:bg-blue-50 rounded-lg transition cursor-pointer"
                              title="Preview"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDownloadPDF(form)}
                              className="p-1.5 text-slate-500 hover:text-[#0a2e6b] hover:bg-blue-50 rounded-lg transition cursor-pointer"
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handlePrint(form)}
                              className="p-1.5 text-slate-500 hover:text-[#0a2e6b] hover:bg-blue-50 rounded-lg transition cursor-pointer"
                              title="Print"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleShare(form)}
                              className="p-1.5 text-slate-500 hover:text-[#0a2e6b] hover:bg-blue-50 rounded-lg transition cursor-pointer"
                              title="Share"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detailed Modal Preview with Diagnostic & Signature Areas */}
      {previewModalForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden my-8 animate-in zoom-in-95">
            <div className="bg-[#0a2e6b] p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-emerald-400">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Medical Voucher — {previewModalForm.securityNumber}</h3>
                  <p className="text-[10px] text-blue-100">Beneficiary: {previewModalForm.memberName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePrint(previewModalForm)}
                  className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  onClick={() => handleDownloadPDF(previewModalForm)}
                  className="px-2.5 py-1 bg-[#00A859] hover:bg-[#008f4c] text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
                <button
                  onClick={() => setPreviewModalForm(null)}
                  className="p-1 text-white/80 hover:text-white rounded-lg cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400 text-[10px] block font-semibold">Insured Member</span>
                  <span className="font-bold text-slate-800 text-sm">{previewModalForm.memberName}</span>
                  <span className="font-mono text-xs text-[#0a2e6b] block">{previewModalForm.memberCardNo}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block font-semibold">Company / Employer</span>
                  <span className="font-bold text-slate-800">{previewModalForm.organization}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block font-semibold">Provider / Hospital</span>
                  <span className="font-bold text-[#0a2e6b]">{previewModalForm.providerName}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block font-semibold">Consultation Scope</span>
                  <span className={`font-bold ${previewModalForm.practitionerType === 'Specialist' ? 'text-purple-700' : 'text-[#0a2e6b]'}`}>
                    {previewModalForm.practitionerType === 'Specialist'
                      ? `👨‍⚕️ Specialist (${previewModalForm.doctorSpecialty || 'Medical'})`
                      : '🩺 General Practitioner'}
                  </span>
                </div>
                <div className="col-span-2 pt-2 border-t border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-slate-400 text-[10px] block font-semibold">Treatment Modality</span>
                    <span className="font-bold text-[#00A859]">
                      {previewModalForm.coverageType === 'Outpatient' ? '🏥 Outpatient Care' : '🛏️ Inpatient Admission'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 text-[10px] block font-semibold">Available Limit</span>
                    <span className="font-bold text-[#0a2e6b]">
                      ${previewModalForm.coverageType === 'Outpatient' ? previewModalForm.outpatientBalanceUSD : previewModalForm.inpatientBalanceUSD} USD
                    </span>
                  </div>
                </div>
              </div>

              {/* Diagnostic & Prescriptions Section Preview */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-xs text-[#0a2e6b] flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5 text-[#0a2e6b]" />
                  <span>Physician Diagnostic & Prescription Framework</span>
                </div>
                <div className="text-slate-700 space-y-1.5">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Medical Diagnosis / Chief Complaint:</span>
                    <span className="font-semibold">{previewModalForm.doctorPrescription?.presumedDiagnosis || 'To be completed by physician'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Prescribed Examinations:</span>
                    <span className="font-semibold">{previewModalForm.doctorPrescription?.requestedExams || 'To be completed by physician'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Prescription Orders & Medications:</span>
                    <span className="font-semibold">{previewModalForm.doctorPrescription?.treatmentOrder || 'To be completed by physician'}</span>
                  </div>
                </div>
              </div>

              {/* Status Update Control */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-[#0a2e6b] block">Document Status:</span>
                  <span className="text-[11px] text-slate-600">
                    {previewModalForm.status === 'completed'
                      ? 'Completed & signed by physician'
                      : previewModalForm.status === 'pending_return'
                      ? 'Awaiting physical return of signed voucher'
                      : 'Issued - Under consultation'}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      handleToggleStatus(previewModalForm, 'pending_return');
                      setPreviewModalForm({ ...previewModalForm, status: 'pending_return' });
                    }}
                    className="px-2.5 py-1 bg-white border border-amber-200 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-50 cursor-pointer"
                  >
                    Awaiting Return
                  </button>
                  <button
                    onClick={() => {
                      handleToggleStatus(previewModalForm, 'completed');
                      setPreviewModalForm({ ...previewModalForm, status: 'completed' });
                    }}
                    className="px-2.5 py-1 bg-[#00A859] text-white rounded-lg text-xs font-bold hover:bg-[#008f4c] cursor-pointer"
                  >
                    Close Voucher
                  </button>
                </div>
              </div>

              {/* Obligatory Notice */}
              <div className="p-3 bg-rose-50 border-2 border-rose-400 rounded-xl text-center">
                <p className="text-xs font-extrabold text-rose-700">
                  « This document must be returned to the medical agent following practitioner sign-off. »
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
