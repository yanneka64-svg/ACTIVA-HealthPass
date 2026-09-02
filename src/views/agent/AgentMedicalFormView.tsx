import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  PenTool,
  X,
  MapPin,
  ChevronDown,
  Phone
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
  preselectedMember?: Member | null;
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
  preselectedMember,
  onCreateMedicalForm,
  onUpdateMedicalForm,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  
  // Smart Autocomplete State for Member
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [isMemberDropdownOpen, setIsMemberDropdownOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const memberSearchRef = useRef<HTMLDivElement>(null);

  // Smart Autocomplete State for Provider
  const [providerSearchQuery, setProviderSearchQuery] = useState('');
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const providerSearchRef = useRef<HTMLDivElement>(null);

  // Preselection from Agent Identification View
  useEffect(() => {
    if (preselectedMember) {
      setSelectedMember(preselectedMember);
      setMemberSearchQuery(`${preselectedMember.principalName} (${preselectedMember.cardNo})`);
      setActiveTab('create');
    }
  }, [preselectedMember]);

  // Click outside listeners to close smart suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (memberSearchRef.current && !memberSearchRef.current.contains(event.target as Node)) {
        setIsMemberDropdownOpen(false);
      }
      if (providerSearchRef.current && !providerSearchRef.current.contains(event.target as Node)) {
        setIsProviderDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered members for smart input
  const suggestedMembers = useMemo(() => {
    if (!memberSearchQuery.trim()) return members.slice(0, 8);
    const q = memberSearchQuery.toLowerCase().trim();
    return members
      .filter((m) => {
        const name = m.principalName.toLowerCase();
        const card = m.cardNo.toLowerCase();
        const org = (m.organization || '').toLowerCase();
        const spouse = (m.spouseName || '').toLowerCase();
        const child = (m.children || []).some(c => c.toLowerCase().includes(q));
        return name.includes(q) || card.includes(q) || org.includes(q) || spouse.includes(q) || child;
      })
      .slice(0, 10);
  }, [members, memberSearchQuery]);

  // Filtered providers for smart input
  const suggestedProviders = useMemo(() => {
    if (!providerSearchQuery.trim()) return providers.slice(0, 8);
    const q = providerSearchQuery.toLowerCase().trim();
    return providers
      .filter((p) => {
        const name = p.name.toLowerCase();
        const type = (p.type || '').toLowerCase();
        const loc = (p.location || '').toLowerCase();
        return name.includes(q) || type.includes(q) || loc.includes(q);
      })
      .slice(0, 10);
  }, [providers, providerSearchQuery]);

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
      alert('Veuillez sélectionner l’assuré et le prestataire de soins via la saisie intelligente.');
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
        setShareFeedback('Fiche médicale partagée avec succès !');
        setTimeout(() => setShareFeedback(null), 3000);
        return;
      } catch (err) {
        console.log('Share canceled or failed', err);
      }
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedLink(true);
      setShareFeedback('Détails de la fiche copiés dans le presse-papiers !');
      setTimeout(() => {
        setCopiedLink(false);
        setShareFeedback(null);
      }, 3000);
    } catch (e) {
      alert('Veuillez utiliser le téléchargement PDF direct.');
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
                ? 'bg-[#0A347B] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nouvelle Fiche Médicale</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-[#0A347B] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Historique ({medicalForms.length})</span>
          </button>
        </div>
      </div>

      {shareFeedback && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="font-bold text-xs">{shareFeedback}</p>
        </div>
      )}

      {/* TAB 1: CREATION AND CONFIGURATION WITH SMART AUTOCOMPLETE */}
      {activeTab === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Form Column: Configuration */}
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-6 py-4 bg-[#0A347B] text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">Génération de Fiche Médicale (Prise en Charge)</h3>
                    <p className="text-[11px] text-blue-100">Saisie intelligente de l'assuré, praticien et plafonds</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleGenerateForm} className="p-6 space-y-5">
                {/* 1. SMART AUTOCOMPLETE FOR INSURED BENEFICIARY */}
                <div className="space-y-1.5" ref={memberSearchRef}>
                  <label className="block text-xs font-bold text-slate-700">
                    1. Saisie Intelligente de l'Assuré Bénéficiaire <span className="text-rose-500">*</span>
                  </label>
                  
                  {selectedMember ? (
                    <div className="p-3.5 bg-blue-50/80 border-2 border-[#0A347B]/40 rounded-xl space-y-2 animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-[#0A347B] text-white flex items-center justify-center font-bold text-xs">
                            {selectedMember.principalName.charAt(0)}
                          </div>
                          <div>
                            <div className="font-extrabold text-xs text-slate-900">{selectedMember.principalName}</div>
                            <div className="text-[10.5px] font-mono font-bold text-[#0A347B]">
                              N° {selectedMember.cardNo} • {selectedMember.organization}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMember(null);
                            setMemberSearchQuery('');
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-600 text-[11px] font-bold transition cursor-pointer"
                        >
                          Changer
                        </button>
                      </div>

                      <div className="pt-2 border-t border-blue-200/60 flex items-center justify-between text-xs">
                        <span className="text-slate-500 text-[11px]">Solde Ambulatoire Disponible:</span>
                        <span className="font-bold text-[#00A859] font-mono">
                          ${selectedMember.outpatientBalanceUSD ?? 600} USD
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={memberSearchQuery}
                          onFocus={() => setIsMemberDropdownOpen(true)}
                          onChange={(e) => {
                            setMemberSearchQuery(e.target.value);
                            setIsMemberDropdownOpen(true);
                          }}
                          placeholder="Tapez le nom, n° carte ou entreprise pour rechercher..."
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#0A347B] focus:outline-none transition"
                        />
                      </div>

                      {/* Smart Autocomplete Floating List */}
                      {isMemberDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-60 overflow-y-auto divide-y divide-slate-100">
                          {suggestedMembers.length === 0 ? (
                            <div className="p-4 text-center text-xs text-slate-400 italic">
                              Aucun assuré trouvé avec « {memberSearchQuery} ».
                            </div>
                          ) : (
                            suggestedMembers.map((m) => (
                              <div
                                key={m.id}
                                onClick={() => {
                                  setSelectedMember(m);
                                  setIsMemberDropdownOpen(false);
                                  setMemberSearchQuery('');
                                }}
                                className="p-3 hover:bg-blue-50/70 transition cursor-pointer flex items-center justify-between text-xs"
                              >
                                <div>
                                  <div className="font-bold text-slate-800">{m.principalName}</div>
                                  <div className="text-[10.5px] font-mono text-[#0A347B]">
                                    {m.cardNo} • {m.organization}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    ${m.outpatientBalanceUSD ?? 600} USD
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. SMART AUTOCOMPLETE FOR HEALTHCARE PROVIDER */}
                <div className="space-y-1.5" ref={providerSearchRef}>
                  <label className="block text-xs font-bold text-slate-700">
                    2. Saisie Intelligente du Prestataire de Soins <span className="text-rose-500">*</span>
                  </label>

                  {selectedProvider ? (
                    <div className="p-3.5 bg-emerald-50/80 border-2 border-[#00A859]/40 rounded-xl space-y-1.5 animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-[#00A859] text-white flex items-center justify-center font-bold text-xs">
                            <Building className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-extrabold text-xs text-slate-900">{selectedProvider.name}</div>
                            <div className="text-[10.5px] text-slate-500">
                              {selectedProvider.type} • {selectedProvider.location}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProvider(null);
                            setProviderSearchQuery('');
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-600 text-[11px] font-bold transition cursor-pointer"
                        >
                          Changer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="relative">
                        <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={providerSearchQuery}
                          onFocus={() => setIsProviderDropdownOpen(true)}
                          onChange={(e) => {
                            setProviderSearchQuery(e.target.value);
                            setIsProviderDropdownOpen(true);
                          }}
                          placeholder="Tapez le nom de l'hôpital, clinique ou centre médical..."
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#0A347B] focus:outline-none transition"
                        />
                      </div>

                      {/* Smart Autocomplete Floating List */}
                      {isProviderDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-60 overflow-y-auto divide-y divide-slate-100">
                          {suggestedProviders.length === 0 ? (
                            <div className="p-4 text-center text-xs text-slate-400 italic">
                              Aucun prestataire trouvé avec « {providerSearchQuery} ».
                            </div>
                          ) : (
                            suggestedProviders.map((p) => (
                              <div
                                key={p.id}
                                onClick={() => {
                                  setSelectedProvider(p);
                                  setIsProviderDropdownOpen(false);
                                  setProviderSearchQuery('');
                                }}
                                className="p-3 hover:bg-emerald-50/70 transition cursor-pointer flex items-center justify-between text-xs"
                              >
                                <div>
                                  <div className="font-bold text-slate-800">{p.name}</div>
                                  <div className="text-[10.5px] text-slate-500">
                                    {p.type} • {p.location}
                                  </div>
                                </div>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-[#00A859] border border-emerald-200">
                                  Agréé ACTIVA
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. CONSULTATION TYPE: GENERALIST OR SPECIALIST */}
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Stethoscope className="w-4 h-4 text-[#0A347B]" />
                      <span>3. Type de Consultation Médicale</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-[#0A347B]">
                      Convention ACTIVA
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPractitionerType('Generalist')}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                        practitionerType === 'Generalist'
                          ? 'bg-blue-50/90 border-[#0A347B] ring-2 ring-[#0A347B]/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-[#0A347B]">🩺 Généraliste</span>
                        {practitionerType === 'Generalist' && (
                          <CheckCircle2 className="w-4 h-4 text-[#0A347B]" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Médecine générale, examen standard & orientation
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPractitionerType('Specialist')}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                        practitionerType === 'Specialist'
                          ? 'bg-blue-50/90 border-[#0A347B] ring-2 ring-[#0A347B]/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-[#0A347B]">👨‍⚕️ Spécialiste</span>
                        {practitionerType === 'Specialist' && (
                          <CheckCircle2 className="w-4 h-4 text-[#0A347B]" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Médecin spécialiste (Cardiologie, Pédiatrie, Gynécologie...)
                      </p>
                    </button>
                  </div>

                  {/* Specialty dropdown if Specialist is selected */}
                  {practitionerType === 'Specialist' && (
                    <div className="pt-2 border-t border-slate-200/80 space-y-2 animate-in fade-in">
                      <label className="block text-[11px] font-bold text-[#0A347B]">
                        Spécialité Médicale :
                      </label>
                      <select
                        value={doctorSpecialty}
                        onChange={(e) => setDoctorSpecialty(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-[#0A347B]"
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
                          placeholder="Saisissez la spécialité exacte..."
                          className="w-full px-3 py-1.5 bg-white border border-blue-300 rounded-lg text-xs"
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
                      <span>4. Régime de Soins & Prise en Charge</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Vérification Solde
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCoverageType('Outpatient')}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                        coverageType === 'Outpatient'
                          ? 'bg-blue-50/90 border-[#0A347B] ring-2 ring-[#0A347B]/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-[#0A347B]">🏥 Ambulatoire</span>
                        {coverageType === 'Outpatient' && (
                          <CheckCircle2 className="w-4 h-4 text-[#0A347B]" />
                        )}
                      </div>
                      <div className="mt-2 text-xs">
                        <span className="text-[10px] text-slate-400 block">Solde Disponible:</span>
                        <span className="text-sm font-black text-[#0A347B]">
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
                        <span className="text-xs font-black text-[#00A859]">🛏️ Hospitalisation</span>
                        {coverageType === 'Inpatient' && (
                          <CheckCircle2 className="w-4 h-4 text-[#00A859]" />
                        )}
                      </div>
                      <div className="mt-2 text-xs">
                        <span className="text-[10px] text-slate-400 block">Solde Disponible:</span>
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
                      <FileText className="w-4 h-4 text-[#0A347B]" />
                      <span className="text-xs font-bold text-[#0A347B]">5. Cadre Prescriptions & Diagnostic Médecin</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Nom du Médecin Traitant</label>
                    <input
                      type="text"
                      value={doctorName}
                      onChange={(e) => setDoctorName(e.target.value)}
                      placeholder={practitionerType === 'Generalist' ? 'ex. Dr. Arthur Miller, Médecine Générale' : `ex. Dr. Arthur Miller, ${effectiveSpecialty}`}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                      Diagnostic Présumé / Motif de Consultation
                    </label>
                    <input
                      type="text"
                      value={presumedDiagnosis}
                      onChange={(e) => setPresumedDiagnosis(e.target.value)}
                      placeholder="ex. Bilan de santé, syndrome fébrile, consultation cardiologique..."
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Examens & Analyses Prescrits</label>
                    <input
                      type="text"
                      value={requestedExams}
                      onChange={(e) => setRequestedExams(e.target.value)}
                      placeholder="ex. NFS, Bilan lipidique, Radiographie thoracique, Échographie..."
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Ordonnance & Prescriptions Médicamenteuses</label>
                    <textarea
                      rows={2}
                      value={treatmentOrder}
                      onChange={(e) => setTreatmentOrder(e.target.value)}
                      placeholder="ex. 1. Posologie, posologies journalières et durée du traitement..."
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
                  <span>Générer le Bon de Prise en Charge</span>
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
                    <span>Fiche Médicale Prête</span>
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePrint(generatedForm)}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Imprimer</span>
                    </button>
                    <button
                      onClick={() => handleShare(generatedForm)}
                      className="px-3 py-1.5 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-[#0A347B] rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Partager</span>
                    </button>
                    <button
                      onClick={() => handleDownloadPDF(generatedForm)}
                      className="px-3.5 py-1.5 bg-[#0A347B] hover:bg-[#08285e] text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>
                  </div>
                </div>

                {/* Simulated Paper */}
                <div className="bg-white p-5 rounded-xl border-2 border-slate-200 shadow-lg font-sans text-xs space-y-3.5 relative">
                  {/* Header Bar */}
                  <div className="bg-[#0A347B] text-white p-3.5 rounded-lg flex items-center justify-between border-b-4 border-[#00A859]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center text-emerald-400">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-black text-sm tracking-wide">ACTIVA HealthPass</div>
                        <div className="text-[9.5px] text-blue-100 uppercase">Fiche Médicale de Prise en Charge</div>
                      </div>
                    </div>
                    <div className="text-right font-mono text-[9.5px]">
                      <div className="font-bold">{generatedForm.securityNumber}</div>
                      <div className="text-blue-200">{generatedForm.issueDate}</div>
                    </div>
                  </div>

                  {/* 1. Insured Details & Treatment Modality */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                    <div className="text-[10px] font-bold text-[#0A347B] uppercase tracking-wide">
                      1. Assuré Bénéficiaire & Régime de Soins
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 text-[10px] block">Assuré Principal</span>
                        <strong className="text-slate-800">{generatedForm.memberName}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">N° de Carte Santé</span>
                        <strong className="text-[#0A347B] font-mono">{generatedForm.memberCardNo}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Employeur / Sponsor</span>
                        <strong>{generatedForm.organization}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Régime de Soins</span>
                        <strong className={generatedForm.coverageType === 'Outpatient' ? 'text-[#0A347B]' : 'text-[#00A859]'}>
                          {generatedForm.coverageType === 'Outpatient' ? '🏥 Ambulatoire' : '🛏️ Hospitalisation'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* 2. Provider Details & Practitioner Type */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                    <div className="text-[10px] font-bold text-[#0A347B] uppercase tracking-wide">
                      2. Prestataire de Soins & Praticien
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 text-[10px] block">Établissement / Hôpital</span>
                        <strong className="text-slate-800">{generatedForm.providerName}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Type de Praticien</span>
                        <strong className={generatedForm.practitionerType === 'Specialist' ? 'text-purple-700' : 'text-[#0A347B]'}>
                          {generatedForm.practitionerType === 'Specialist'
                            ? `👨‍⚕️ Spécialiste (${generatedForm.doctorSpecialty || 'Médical'})`
                            : '🩺 Médecin Généraliste'}
                        </strong>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400 text-[10px] block">Médecin Traitant</span>
                        <strong>{generatedForm.doctorName || 'Dr. _______________________'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* 3. DIAGNOSTIC & PRESCRIPTIONS FRAMEWORK */}
                  <div className="bg-white p-3.5 rounded-lg border-2 border-[#0A347B]/20 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                      <div className="text-[10px] font-bold text-[#0A347B] uppercase tracking-wide flex items-center gap-1.5">
                        <PenTool className="w-3 h-3 text-[#0A347B]" />
                        <span>3. Cadre Réservé au Médecin Traitant</span>
                      </div>
                    </div>

                    <div className="text-[10px] space-y-2">
                      <div className="p-2 bg-slate-50 rounded border border-slate-200">
                        <span className="font-bold text-slate-700 block mb-0.5">Diagnostic / Motif :</span>
                        <div className="text-slate-800 font-medium">
                          {generatedForm.doctorPrescription?.presumedDiagnosis || (
                            <span className="text-slate-400 italic">____________________________________________________________________</span>
                          )}
                        </div>
                      </div>

                      <div className="p-2 bg-slate-50 rounded border border-slate-200">
                        <span className="font-bold text-slate-700 block mb-0.5">Examens de Laboratoire / Imagerie :</span>
                        <div className="text-slate-800 font-medium">
                          {generatedForm.doctorPrescription?.requestedExams || (
                            <span className="text-slate-400 italic">____________________________________________________________________</span>
                          )}
                        </div>
                      </div>

                      <div className="p-2 bg-slate-50 rounded border border-slate-200">
                        <span className="font-bold text-slate-700 block mb-0.5">Traitements & Prescriptions :</span>
                        <div className="text-slate-800 font-medium">
                          {generatedForm.doctorPrescription?.treatmentOrder || (
                            <span className="text-slate-400 italic">1. _________________________________________________________________</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4. SIGNATURES */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="p-3 bg-slate-50 border border-slate-300 rounded-lg text-center h-24 flex flex-col justify-between">
                      <span className="text-[9.5px] font-bold text-slate-700">Signature du Patient / Assuré</span>
                      <div className="text-[8px] text-slate-400 italic">Lu et approuvé</div>
                      <div className="text-[8px] text-slate-500 font-mono">Date: ____/____/2026</div>
                    </div>

                    <div className="p-3 bg-blue-50/50 border-2 border-dashed border-[#0A347B]/40 rounded-lg text-center h-24 flex flex-col justify-between">
                      <div className="flex items-center justify-center gap-1 text-[9.5px] font-bold text-[#0A347B]">
                        <PenTool className="w-3 h-3 text-[#0A347B]" />
                        <span>Cachet & Signature du Médecin</span>
                      </div>
                      <div className="text-[8px] text-slate-400 italic">Cachet de la structure requis</div>
                      <div className="text-[8px] text-slate-500 font-mono">Date: ____/____/2026</div>
                    </div>
                  </div>

                  {/* Barcode & Security */}
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <QrCode className="w-7 h-7 text-[#0A347B]" />
                      <div>
                        <div className="text-[9.5px] font-mono font-bold text-slate-800">{generatedForm.securityNumber}</div>
                        <div className="text-[8px] text-slate-400">Identifiant de Sécurité ACTIVA</div>
                      </div>
                    </div>
                    <div className="text-[8.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      VALIDE 48H
                    </div>
                  </div>

                  {/* Mandatory Instruction */}
                  <div className="p-2 bg-rose-50 border border-rose-300 rounded-lg text-center">
                    <p className="text-[9px] font-extrabold text-rose-700 leading-tight">
                      « Ce document doit être obligatoirement retourné à l'agent médical après visa du médecin traitant. »
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[350px] bg-slate-50/70 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-8 text-center">
                <div className="w-14 h-14 bg-white rounded-2xl border border-slate-200 shadow-xs flex items-center justify-center mb-3">
                  <FileText className="w-7 h-7 text-slate-400" />
                </div>
                <h4 className="font-bold text-sm text-slate-700 mb-1">Aperçu en Direct</h4>
                <p className="text-xs text-slate-400 max-w-xs">
                  Saisissez l'assuré et l'établissement de soins via la saisie intelligente pour générer instantanément le bon de prise en charge.
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
              <h3 className="font-bold text-sm text-slate-900">Bons de Prise en Charge Émis ({filteredForms.length})</h3>
              <p className="text-xs text-slate-500">Traçabilité complète par praticien et régime de soins</p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterCoverage}
                onChange={(e) => setFilterCoverage(e.target.value as any)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
              >
                <option value="all">Tous Régimes (Ambulatoire / Hospitalisation)</option>
                <option value="Outpatient">Ambulatoire</option>
                <option value="Inpatient">Hospitalisation</option>
              </select>

              <select
                value={filterPractitioner}
                onChange={(e) => setFilterPractitioner(e.target.value as any)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
              >
                <option value="all">Tous Praticiens</option>
                <option value="Generalist">Généraliste</option>
                <option value="Specialist">Spécialiste</option>
              </select>

              <div className="relative w-full sm:w-60">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Rechercher assuré, carte, réf..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-[#0A347B]"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">N° SÉCURITÉ</th>
                  <th className="py-3 px-4">DATE</th>
                  <th className="py-3 px-4">ASSURÉ & CARTE</th>
                  <th className="py-3 px-4">ÉTABLISSEMENT</th>
                  <th className="py-3 px-4">CONSULTATION</th>
                  <th className="py-3 px-4">RÉGIME</th>
                  <th className="py-3 px-4 text-center">STATUT</th>
                  <th className="py-3 px-4 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredForms.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 text-xs font-medium">
                      Aucune fiche médicale émise ne correspond à ces critères.
                    </td>
                  </tr>
                ) : (
                  filteredForms.map((form) => {
                    const isSpec = form.practitionerType === 'Specialist' || form.practitionerType === 'Spécialiste';
                    return (
                      <tr key={form.id} className="hover:bg-slate-50 transition">
                        <td className="py-3.5 px-4 font-mono font-bold text-[#0A347B] whitespace-nowrap">
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
                                : 'bg-blue-50 text-[#0A347B] border border-blue-200'
                            }`}
                          >
                            {isSpec ? `Spécialiste (${form.doctorSpecialty || 'Médical'})` : 'Généraliste'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              form.coverageType === 'Outpatient'
                                ? 'bg-blue-50 text-[#0A347B]'
                                : 'bg-emerald-50 text-[#00A859]'
                            }`}
                          >
                            {form.coverageType === 'Outpatient' ? 'Ambulatoire' : 'Hospitalisation'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              form.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : form.status === 'pending_return'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-blue-50 text-[#0A347B] border border-blue-200'
                            }`}
                          >
                            {form.status === 'completed'
                              ? 'Clôturé'
                              : form.status === 'pending_return'
                              ? 'Attente Retour Signé'
                              : 'Émis / Actif'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setPreviewModalForm(form)}
                              className="p-1.5 text-slate-500 hover:text-[#0A347B] hover:bg-blue-50 rounded-lg transition cursor-pointer"
                              title="Aperçu"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDownloadPDF(form)}
                              className="p-1.5 text-slate-500 hover:text-[#0A347B] hover:bg-blue-50 rounded-lg transition cursor-pointer"
                              title="Télécharger PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handlePrint(form)}
                              className="p-1.5 text-slate-500 hover:text-[#0A347B] hover:bg-blue-50 rounded-lg transition cursor-pointer"
                              title="Imprimer"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleShare(form)}
                              className="p-1.5 text-slate-500 hover:text-[#0A347B] hover:bg-blue-50 rounded-lg transition cursor-pointer"
                              title="Partager"
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

      {/* Detailed Modal Preview */}
      {previewModalForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden my-8 animate-in zoom-in-95">
            <div className="bg-[#0A347B] p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-emerald-400">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Fiche Médicale — {previewModalForm.securityNumber}</h3>
                  <p className="text-[10px] text-blue-100">Bénéficiaire : {previewModalForm.memberName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePrint(previewModalForm)}
                  className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimer</span>
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
                  <span className="text-slate-400 text-[10px] block font-semibold">Assuré Bénéficiaire</span>
                  <span className="font-bold text-slate-800 text-sm">{previewModalForm.memberName}</span>
                  <span className="font-mono text-xs text-[#0A347B] block">{previewModalForm.memberCardNo}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block font-semibold">Entreprise / Sponsor</span>
                  <span className="font-bold text-slate-800">{previewModalForm.organization}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block font-semibold">Prestataire / Établissement</span>
                  <span className="font-bold text-[#0A347B]">{previewModalForm.providerName}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block font-semibold">Type de Consultation</span>
                  <span className={`font-bold ${previewModalForm.practitionerType === 'Specialist' ? 'text-purple-700' : 'text-[#0A347B]'}`}>
                    {previewModalForm.practitionerType === 'Specialist'
                      ? `👨‍⚕️ Spécialiste (${previewModalForm.doctorSpecialty || 'Médical'})`
                      : '🩺 Médecin Généraliste'}
                  </span>
                </div>
                <div className="col-span-2 pt-2 border-t border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-slate-400 text-[10px] block font-semibold">Régime de Soins</span>
                    <span className="font-bold text-[#00A859]">
                      {previewModalForm.coverageType === 'Outpatient' ? '🏥 Ambulatoire' : '🛏️ Hospitalisation'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 text-[10px] block font-semibold">Solde Disponible</span>
                    <span className="font-bold text-[#0A347B]">
                      ${previewModalForm.coverageType === 'Outpatient' ? previewModalForm.outpatientBalanceUSD : previewModalForm.inpatientBalanceUSD} USD
                    </span>
                  </div>
                </div>
              </div>

              {/* Diagnostic & Prescriptions Section Preview */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-xs text-[#0A347B] flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5 text-[#0A347B]" />
                  <span>Cadre Prescriptions & Diagnostic Médecin</span>
                </div>
                <div className="text-slate-700 space-y-1.5">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Diagnostic Présumé :</span>
                    <span className="font-semibold">{previewModalForm.doctorPrescription?.presumedDiagnosis || 'À compléter par le médecin'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Examens & Analyses :</span>
                    <span className="font-semibold">{previewModalForm.doctorPrescription?.requestedExams || 'À compléter par le médecin'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Traitements & Médicaments :</span>
                    <span className="font-semibold">{previewModalForm.doctorPrescription?.treatmentOrder || 'À compléter par le médecin'}</span>
                  </div>
                </div>
              </div>

              {/* Status Update Control */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-[#0A347B] block">Statut du Document :</span>
                  <span className="text-[11px] text-slate-600">
                    {previewModalForm.status === 'completed'
                      ? 'Clôturé et visé par le médecin'
                      : previewModalForm.status === 'pending_return'
                      ? 'En attente de retour physique signé'
                      : 'Émis - En cours de consultation'}
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
                    Attente Retour
                  </button>
                  <button
                    onClick={() => {
                      handleToggleStatus(previewModalForm, 'completed');
                      setPreviewModalForm({ ...previewModalForm, status: 'completed' });
                    }}
                    className="px-2.5 py-1 bg-[#00A859] text-white rounded-lg text-xs font-bold hover:bg-[#008f4c] cursor-pointer"
                  >
                    Clôturer la Fiche
                  </button>
                </div>
              </div>

              {/* Obligatory Notice */}
              <div className="p-3 bg-rose-50 border-2 border-rose-400 rounded-xl text-center">
                <p className="text-xs font-extrabold text-rose-700">
                  « Ce document doit être obligatoirement retourné à l'agent médical après visa du médecin traitant. »
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
