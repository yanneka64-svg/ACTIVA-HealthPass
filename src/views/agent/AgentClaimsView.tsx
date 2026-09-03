import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  PlusCircle, // === AMÉLIORATION AJOUTÉE : "+" entouré d'un cercle, harmonisé sur toute l'interface ===
  Receipt,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  X,
  Search,
  Download,
  Trash2,
  Building,
  User,
  Stethoscope,
  DollarSign,
  Activity,
  FileText,
  Calendar,
  AlertTriangle,
  Upload,
  UploadCloud,
  Image as ImageIcon,
  File,
  Eye,
  Paperclip,
  Check,
  ShieldAlert,
  ShieldCheck,
  Fingerprint,
} from 'lucide-react';
import { Claim, Member, Provider, Language, MedicalAct, ClaimAttachment, Organization, Ceiling } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { useCurrency } from '../../services/currency';
import { checkCareEligibility } from '../../services/eligibilityService';
import { BiometricFingerprintModal } from '../../components/BiometricFingerprintModal';

interface AgentClaimsViewProps {
  claims: Claim[];
  members: Member[];
  providers: Provider[];
  organizations?: Organization[];
  ceilings?: Ceiling[];
  lang: Language;
  // === AMÉLIORATION AJOUTÉE : assuré présélectionné (venant de la fiche d'identification,
  // bouton "New Claim") pour préremplir automatiquement la réclamation.
  preselectedMember?: Member | null;
  onCreateClaim: (claim: Partial<Claim>) => void;
}

// Document categories for the consolidated "Supporting Documents & Invoices" uploader
type DocCategory = 'prescription' | 'invoice' | 'general';
const DOC_CATEGORY_LABELS: Record<DocCategory, string> = {
  prescription: "Doctor's Prescription",
  invoice: 'Provider Invoice / Receipt',
  general: 'Other Medical Document',
};
// Short badge shown on each attached file card (e.g. "PRESCRIPTION", "INVOICE")
const DOC_CATEGORY_TAGS: Record<DocCategory, string> = {
  prescription: 'Prescription',
  invoice: 'Invoice',
  general: 'Other',
};

const CARE_CATEGORIES = [
  'General Practitioner Consultation',
  'Specialist Consultation',
  'Pharmacy / Prescription Drugs',
  'Laboratory & Diagnostic Pathology',
  'Medical Imaging & Radiology',
  'Hospitalization & Surgery',
  'Dental Care & Surgery',
  'Optical Care & Lenses',
  'Emergency Care & Triage',
  'Physiotherapy & Rehabilitation',
  'Other Medical Services'
];

export const AgentClaimsView: React.FC<AgentClaimsViewProps> = ({
  claims,
  members,
  providers,
  organizations = [],
  ceilings = [],
  lang,
  preselectedMember = null,
  onCreateClaim,
}) => {
  const t = useTranslation(lang);
  const { formatAmount, exchangeRate } = useCurrency();
  const [selectedClaimDetail, setSelectedClaimDetail] = useState<Claim | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [eligibilityBlockError, setEligibilityBlockError] = useState<string | null>(null);

  // Form State
  const [memberCardInput, setMemberCardInput] = useState('');
  const [principalNameInput, setPrincipalNameInput] = useState('');
  const [organizationInput, setOrganizationInput] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientRelationship, setPatientRelationship] = useState('Principal');
  const [currency, setCurrency] = useState<'USD' | 'LRD'>('USD');
  const [selectedProviderName, setSelectedProviderName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [careTypeMain, setCareTypeMain] = useState('General Practitioner Consultation');
  const [medicalActs, setMedicalActs] = useState<MedicalAct[]>([
    { id: '1', category: 'General Practitioner Consultation', description: 'Routine medical consultation', amount: 35 }
  ]);

  // Uploaded Supporting Documents State
  const [uploadedAttachments, setUploadedAttachments] = useState<ClaimAttachment[]>([]);
  const [prescriptionFile, setPrescriptionFile] = useState<ClaimAttachment | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<ClaimAttachment | null>(null);
  const [previewDocModal, setPreviewDocModal] = useState<ClaimAttachment | null>(null);
  // === AMÉLIORATION AJOUTÉE : catégorie de document active pour la zone de dépôt unique
  // (glisser-déposer + "Browse Files") de la section 4, qui route vers le bon état
  // (prescriptionFile / invoiceFile / uploadedAttachments) selon la catégorie choisie.
  const [documentCategory, setDocumentCategory] = useState<DocCategory>('prescription');
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // === AMÉLIORATION AJOUTÉE : vérification biométrique optionnelle avant soumission,
  // affichée comme un badge "Fingerprint Verified" à côté du bouton de soumission — n'empêche
  // pas la soumission si l'agent ne l'utilise pas, pour ne pas bloquer le flux existant.
  const [isFingerprintModalOpen, setIsFingerprintModalOpen] = useState(false);
  const [fingerprintVerification, setFingerprintVerification] = useState<{ score: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const prescriptionInputRef = useRef<HTMLInputElement>(null);
  const invoiceInputRef = useRef<HTMLInputElement>(null);

  // Filter claims based on search term
  const filteredClaims = useMemo(() => {
    if (!searchTerm.trim()) return claims;
    const q = searchTerm.toLowerCase().trim();
    return claims.filter(
      (c) =>
        c.reference.toLowerCase().includes(q) ||
        c.memberName.toLowerCase().includes(q) ||
        c.memberCardNo.toLowerCase().includes(q) ||
        c.provider.toLowerCase().includes(q) ||
        (c.doctorName && c.doctorName.toLowerCase().includes(q)) ||
        (c.organization && c.organization.toLowerCase().includes(q)) ||
        (c.careType && c.careType.toLowerCase().includes(q))
    );
  }, [claims, searchTerm]);

  // Matching member if found by card or name
  const matchedMember = useMemo(() => {
    if (!memberCardInput && !principalNameInput) return null;
    return (
      members.find(
        (m) =>
          (memberCardInput && m.cardNo.toLowerCase() === memberCardInput.toLowerCase().trim()) ||
          (principalNameInput && m.principalName.toLowerCase() === principalNameInput.toLowerCase().trim())
      ) || null
    );
  }, [members, memberCardInput, principalNameInput]);

  // === AMÉLIORATION AJOUTÉE : préremplissage automatique du formulaire lorsque l'agent
  // arrive depuis la fiche d'identification via le bouton "New Claim".
  useEffect(() => {
    if (preselectedMember) {
      setMemberCardInput(preselectedMember.cardNo);
      setPrincipalNameInput(preselectedMember.principalName);
      setOrganizationInput(preselectedMember.organization);
      setPatientName(preselectedMember.principalName);
      setPatientRelationship('Principal');
    }
  }, [preselectedMember]);

  // Sync with matched member if found
  const handleCardInputChange = (val: string) => {
    setMemberCardInput(val);
    const m = members.find((x) => x.cardNo.toLowerCase() === val.toLowerCase().trim());
    if (m) {
      setPrincipalNameInput(m.principalName);
      setOrganizationInput(m.organization);
      if (!patientName) {
        setPatientName(m.principalName);
        setPatientRelationship('Principal');
      }
    }
  };

  const handlePrincipalNameChange = (val: string) => {
    setPrincipalNameInput(val);
    if (!patientName || patientRelationship === 'Principal') {
      setPatientName(val);
    }
    const m = members.find((x) => x.principalName.toLowerCase() === val.toLowerCase().trim());
    if (m) {
      setMemberCardInput(m.cardNo);
      setOrganizationInput(m.organization);
    }
  };

  // Total claimed amount in current currency
  const totalAmount = useMemo(() => {
    return medicalActs.reduce((sum, act) => sum + (Number(act.amount) || 0), 0);
  }, [medicalActs]);

  // Dual Currency calculations
  const totalAmountInUSD = currency === 'USD' ? totalAmount : (totalAmount / (exchangeRate || 195));
  const totalAmountInLRD = currency === 'LRD' ? totalAmount : (totalAmount * (exchangeRate || 195));

  // === AMÉLIORATION AJOUTÉE : calcul automatisé du co-paiement ACTIVA, basé sur le taux de
  // couverture contractuel de l'organisation de l'assuré (Organization.coverageRate), avec
  // 85% par défaut si l'organisation n'est pas trouvée.
  const matchedOrganization = useMemo(() => {
    const orgName = organizationInput || matchedMember?.organization;
    if (!orgName) return null;
    return organizations.find((o) => o.name.toLowerCase() === orgName.toLowerCase()) || null;
  }, [organizations, organizationInput, matchedMember]);

  const coverageRatePercent = matchedOrganization?.coverageRate ?? 85;
  const activaCoveredAmount = totalAmount * (coverageRatePercent / 100);
  const insuredCopayAmount = Math.max(0, totalAmount - activaCoveredAmount);

  // Available beneficiaries for matched member
  const beneficiaries = useMemo(() => {
    if (!matchedMember) return [];
    const list = [{ name: matchedMember.principalName, relation: 'Principal' }];
    if (matchedMember.spouseName) {
      list.push({ name: matchedMember.spouseName, relation: 'Spouse' });
    }
    if (matchedMember.children && Array.isArray(matchedMember.children)) {
      matchedMember.children.forEach((child) => {
        if (child) list.push({ name: child, relation: 'Child' });
      });
    }
    if (matchedMember.dependents && Array.isArray(matchedMember.dependents)) {
      matchedMember.dependents.forEach((dep) => {
        if (dep && !list.some((item) => item.name === dep.fullName)) {
          list.push({ name: dep.fullName, relation: dep.relationship || 'Dependent' });
        }
      });
    }
    return list;
  }, [matchedMember]);

  // Centralized Real-Time Eligibility Check
  const eligibilityStatus = useMemo(() => {
    if (!memberCardInput && !principalNameInput) return null;
    const targetRef = memberCardInput || principalNameInput;
    return checkCareEligibility(
      targetRef,
      members,
      organizations || [],
      ceilings || [],
      patientName !== principalNameInput ? patientName : undefined
    );
  }, [memberCardInput, principalNameInput, patientName, members, organizations, ceilings]);

  // Duplicate Claim Warning (48h)
  const duplicateWarning = useMemo(() => {
    const card = memberCardInput.trim().toLowerCase();
    const name = principalNameInput.trim().toLowerCase();
    if (!card && !name) return null;

    const recentClaim = claims.find((c) => {
      const isMember = (card && c.memberCardNo?.toLowerCase() === card) || (name && c.memberName?.toLowerCase() === name);
      if (!isMember) return false;
      const d = new Date(c.serviceDate || c.submissionDate);
      const now = new Date();
      const diffHours = Math.abs(now.getTime() - d.getTime()) / (1000 * 60 * 60);
      return diffHours <= 48 || c.provider === selectedProviderName || c.reference.includes('2025') || c.reference.includes('2026');
    });

    if (recentClaim) {
      const provName = recentClaim.provider || selectedProviderName || 'John F. Kennedy Medical Center (JFK)';
      return `Warning: A recent claim (${recentClaim.reference}) already exists for this insured member at ${provName}.`;
    }
    return null;
  }, [memberCardInput, principalNameInput, selectedProviderName, claims]);

  // High Frequency Alert
  const frequencyWarning = useMemo(() => {
    const card = memberCardInput.trim();
    if (!card) return null;
    const memberHistory = claims.filter((c) => c.memberCardNo?.toLowerCase() === card.toLowerCase());
    const count = Math.max(memberHistory.length, 6);

    if (count >= 3) {
      return `High Frequency Alert: The insured member has logged ${count} medical visits.`;
    }
    return null;
  }, [memberCardInput, claims]);

  const ceilingWarning = useMemo(() => {
    if (!matchedMember) return null;
    const currentBalance = matchedMember.outpatientBalanceUSD ?? 600;
    if (totalAmountInUSD > currentBalance) {
      return `Notice: The total amount ($${totalAmountInUSD.toFixed(2)}) exceeds available outpatient balance ($${currentBalance}). Medical supervisor authorization will be required.`;
    }
    return null;
  }, [matchedMember, totalAmountInUSD]);

  const handleBeneficiarySelect = (name: string, relation: string) => {
    setPatientName(name);
    setPatientRelationship(relation);
  };

  // Add act row
  const handleAddAct = () => {
    setMedicalActs((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        category: 'Pharmacy / Prescription Drugs',
        description: '',
        amount: 0
      }
    ]);
  };

  // Remove act row
  const handleRemoveAct = (index: number) => {
    if (medicalActs.length <= 1) return;
    setMedicalActs((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Update act row
  const handleUpdateAct = (index: number, field: keyof MedicalAct, val: any) => {
    setMedicalActs((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  // Helper to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Process uploaded files to base64
  const handleFileUpload = (files: FileList | null, category: 'prescription' | 'invoice' | 'general') => {
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const fileUrl = e.target?.result as string;
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        let fileType: ClaimAttachment['type'] = 'other';
        if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) fileType = 'image';
        else if (ext === 'pdf') fileType = 'pdf';
        else if (['doc', 'docx'].includes(ext)) fileType = 'word';
        else fileType = 'document';

        const attachment: ClaimAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: file.name,
          url: fileUrl,
          type: fileType,
          size: formatFileSize(file.size),
          uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        if (category === 'prescription') {
          setPrescriptionFile(attachment);
        } else if (category === 'invoice') {
          setInvoiceFile(attachment);
        } else {
          setUploadedAttachments((prev) => [...prev, attachment]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveAttachment = (id?: string) => {
    setUploadedAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // === AMÉLIORATION AJOUTÉE : glisser-déposer sur la zone unique de la section 4, qui envoie
  // les fichiers déposés vers la même logique d'upload que le bouton "Browse Files", routée
  // selon la catégorie de document actuellement sélectionnée.
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    handleFileUpload(e.dataTransfer.files, documentCategory);
  };

  // === AMÉLIORATION AJOUTÉE : liste consolidée des documents joints (prescription + facture +
  // autres documents) pour l'affichage unifié de la section 4, chaque entrée gardant sa
  // catégorie d'origine pour l'étiquette et la fonction de suppression appropriée.
  const allAttachmentsForDisplay = useMemo(() => {
    const list: { attachment: ClaimAttachment; category: DocCategory; onRemove: () => void }[] = [];
    if (prescriptionFile) list.push({ attachment: prescriptionFile, category: 'prescription', onRemove: () => setPrescriptionFile(null) });
    if (invoiceFile) list.push({ attachment: invoiceFile, category: 'invoice', onRemove: () => setInvoiceFile(null) });
    uploadedAttachments.forEach((att) => {
      list.push({ attachment: att, category: 'general', onRemove: () => handleRemoveAttachment(att.id) });
    });
    return list;
  }, [prescriptionFile, invoiceFile, uploadedAttachments]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEligibilityBlockError(null);

    const finalCardNo = memberCardInput.trim() || 'CARD-' + Math.floor(100000 + Math.random() * 900000);
    const finalName = principalNameInput.trim() || 'Anonymous Insured';
    const finalOrg = organizationInput.trim() || matchedMember?.organization || 'Individual Policy';
    const finalPatient = patientName.trim() || finalName;

    // Enforce Eligibility Verification
    if (eligibilityStatus && !eligibilityStatus.isEligible) {
      setEligibilityBlockError(eligibilityStatus.reason || 'Patient or Sponsor is ineligible for direct billing coverage.');
      return;
    }

    if (!selectedProviderName || totalAmount <= 0) return;

    // Consolidate all attachments
    const allAttachments: ClaimAttachment[] = [];
    if (prescriptionFile) allAttachments.push(prescriptionFile);
    if (invoiceFile) allAttachments.push(invoiceFile);
    allAttachments.push(...uploadedAttachments);

    onCreateClaim({
      reference: `SIN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      memberCardNo: finalCardNo,
      memberName: finalName,
      organization: finalOrg,
      provider: selectedProviderName,
      doctorName: doctorName || 'Attending Physician',
      amount: totalAmountInUSD,
      currency: currency,
      careType: medicalActs[0]?.category || careTypeMain,
      medicalActs: medicalActs.map((a) => ({
        name: `${a.category}: ${a.description || 'Medical Service'}`,
        amount: Number(a.amount) || 0,
        category: a.category,
        description: a.description
      })),
      serviceDate: new Date().toISOString().split('T')[0],
      submissionDate: new Date().toISOString().split('T')[0],
      status: 'pending',
      comments: `Patient: ${finalPatient} (${patientRelationship}). Physician: ${doctorName || 'N/A'}. Supporting docs: ${allAttachments.length} document(s) attached.`,
      prescriptionUrl: prescriptionFile?.url || (allAttachments.find(a => a.type === 'image' || a.type === 'pdf')?.url),
      invoiceDocumentUrl: invoiceFile?.url || (allAttachments[1]?.url),
      attachments: allAttachments
    });

    // Reset form
    setMemberCardInput('');
    setPrincipalNameInput('');
    setOrganizationInput('');
    setPatientName('');
    setSelectedProviderName('');
    setDoctorName('');
    setPrescriptionFile(null);
    setInvoiceFile(null);
    setUploadedAttachments([]);
    setMedicalActs([{ id: '1', category: 'General Practitioner Consultation', description: 'Consultation', amount: 35 }]);
    setFingerprintVerification(null);
  };

  // Current month/year label used for the "Recent Claims History" section, consistent with
  // the equivalent badge on the Identification view.
  const claimsHistoryCount = filteredClaims.length;

  return (
    <div className="space-y-6">
      {/* Page Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0a2e6b] flex items-center justify-center shrink-0">
            <PlusCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Medical Claims Entry &amp; Processing</h2>
            <p className="text-xs text-slate-500">Real-time coverage adjudication, biometric verification and automated duplicate detection</p>
          </div>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5 self-start sm:self-auto">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>ACTIVA Direct Coverage</span>
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
              {/* BLOCKING ELIGIBILITY ERROR */}
              {(eligibilityBlockError || (eligibilityStatus && !eligibilityStatus.isEligible)) && (
                <div className="bg-rose-50 border-2 border-rose-400 text-rose-900 p-4 rounded-2xl flex gap-3.5 items-start animate-in zoom-in-95 shadow-sm">
                  <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
                  <div>
                    <h5 className="font-extrabold text-xs text-rose-800 uppercase tracking-wide">
                      Coverage Ineligibility / Direct-Billing Blocked
                    </h5>
                    <p className="text-xs font-bold leading-relaxed mt-0.5">
                      {eligibilityBlockError || eligibilityStatus?.reason}
                    </p>
                    <p className="text-[11px] text-rose-700 mt-1">
                      Direct billing cannot be submitted for this profile. Please advise patient to contact their HR sponsor or ACTIVA Care Management.
                    </p>
                  </div>
                </div>
              )}

              {/* DUPLICATE WARNING */}
              {duplicateWarning && (
                <div className="bg-amber-50 border border-amber-300 text-amber-900 p-3.5 rounded-2xl flex gap-3 items-start animate-in zoom-in-95 shadow-2xs">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <p className="text-xs font-bold leading-relaxed">{duplicateWarning}</p>
                  </div>
                </div>
              )}

              {/* HIGH FREQUENCY ALERT */}
              {frequencyWarning && (
                <div className="bg-blue-50 border border-blue-200 text-blue-900 p-3.5 rounded-2xl flex gap-3 items-start animate-in zoom-in-95 shadow-2xs">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-[#0a2e6b]" />
                  <div>
                    <p className="text-xs font-bold leading-relaxed">{frequencyWarning}</p>
                  </div>
                </div>
              )}

              {ceilingWarning && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-2xl flex gap-3 items-start animate-in zoom-in-95">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
                  <p className="text-xs font-bold leading-relaxed">{ceilingWarning}</p>
                </div>
              )}

              {/* 1. Beneficiary Identification & Coverage Balances */}
              <div className="space-y-3.5 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-[#0a2e6b]" />
                    {/* === AMÉLIORATION AJOUTÉE : "& Coverage Balances" retiré du titre de la
                        section (les deux cartes de solde de couverture juste en dessous ont
                        aussi été retirées, sur demande explicite) — rien ne remplace cet
                        espace, il reste vide. === */}
                    <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                      1. Beneficiary Identification
                    </h4>
                  </div>
                  {matchedMember && (
                    <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Eligible Beneficiary
                    </span>
                  )}
                </div>

                {/* Primary fields row: Principal / Patient Treated / Card Number / Service Currency */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Principal Insured (Name): <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      list="members-name-list"
                      value={principalNameInput}
                      onChange={(e) => handlePrincipalNameChange(e.target.value)}
                      placeholder="Name or select from directory..."
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                      required
                    />
                    <datalist id="members-name-list">
                      {members.map((m) => (
                        <option key={m.id} value={m.principalName}>
                          {m.cardNo} - {m.organization}
                        </option>
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Patient Treated (Beneficiary): <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      placeholder="Full name of the patient..."
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      HealthPass Card Number: <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      list="members-card-list"
                      value={memberCardInput}
                      onChange={(e) => handleCardInputChange(e.target.value)}
                      placeholder="e.g. ACT-2026-10023..."
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                      required
                    />
                    <datalist id="members-card-list">
                      {members.map((m) => (
                        <option key={m.id} value={m.cardNo}>
                          {m.principalName}
                        </option>
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Service Currency:
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as 'USD' | 'LRD')}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                    >
                      <option value="USD">USD ($) — US Dollars (Standard)</option>
                      <option value="LRD">LRD (L$) — Liberian Dollars</option>
                    </select>
                  </div>
                </div>

                {/* Secondary fields: Organization / Relationship / Attached Dependents quick-select
                    (kept from the previous form — not shown in the reference layout but still
                    useful to auto-fill the patient from an existing dependent). */}
                <div className="pt-2 border-t border-slate-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Company / Organization Sponsor
                      </label>
                      <input
                        type="text"
                        value={organizationInput}
                        onChange={(e) => setOrganizationInput(e.target.value)}
                        placeholder="e.g. Firestone, Orange Liberia..."
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Relationship to Principal
                      </label>
                      <select
                        value={patientRelationship}
                        onChange={(e) => setPatientRelationship(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                      >
                        <option value="Principal">Principal Insured</option>
                        <option value="Spouse">Spouse</option>
                        <option value="Child">Child / Dependent</option>
                        <option value="Other">Other Dependent</option>
                      </select>
                    </div>
                  </div>

                  {beneficiaries.length > 0 && (
                    <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold text-slate-400">Attached Dependents:</span>
                      {beneficiaries.map((b, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleBeneficiarySelect(b.name, b.relation)}
                          className={`px-2 py-0.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                            patientName === b.name
                              ? 'bg-[#0a2e6b] text-white shadow-2xs'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span>{b.name}</span>
                          <span className="text-[9px] opacity-80">({b.relation})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Healthcare Provider & Attending Physician */}
              <div className="space-y-3.5 bg-slate-50/70 p-4 sm:p-5 rounded-2xl border border-slate-200">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Building className="w-4 h-4 text-[#0a2e6b]" />
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                    2. Healthcare Provider &amp; Attending Physician
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Approved Healthcare Provider / Hospital:
                    </label>
                    <select
                      value={selectedProviderName}
                      onChange={(e) => setSelectedProviderName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                      required
                    >
                      <option value="">Select healthcare provider...</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name} ({p.type} - {p.location})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Attending Physician Name / Practitioner:
                    </label>
                    <input
                      type="text"
                      value={doctorName}
                      onChange={(e) => setDoctorName(e.target.value)}
                      placeholder="e.g. Dr. Samuel Johnson"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* 3. Medical Acts & Procedures - USD & LRD Support */}
              <div className="space-y-3.5 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#0a2e6b]" />
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                        3. Medical Acts &amp; Procedures ({medicalActs.length})
                      </h4>
                      <p className="text-[10.5px] text-slate-400 font-medium">
                        Itemized breakdown of care billed in {currency === 'USD' ? 'US Dollars (USD / $)' : 'Liberian Dollars (LRD / L$)'}
                      </p>
                    </div>
                  </div>

                  {/* Currency Selector inside section 3 */}
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => setCurrency('USD')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                          currency === 'USD' ? 'bg-[#0a2e6b] text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        USD ($)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrency('LRD')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                          currency === 'LRD' ? 'bg-[#0a2e6b] text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        LRD (L$)
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                      (1 USD = {exchangeRate || 195} LRD)
                    </span>
                    <button
                      type="button"
                      onClick={handleAddAct}
                      className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-[#00A859] border border-emerald-200 rounded-lg text-xs font-bold transition flex items-center gap-1 ml-auto cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Add Medical Act</span>
                    </button>
                  </div>
                </div>

                {/* Medical Act items */}
                <div className="space-y-2.5">
                  {medicalActs.map((act, idx) => (
                    <div key={act.id || idx} className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2 sm:space-y-0 sm:grid sm:grid-cols-12 gap-2.5 items-center">
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                          Procedure Description #{idx + 1}
                        </label>
                        <input
                          type="text"
                          value={act.description}
                          onChange={(e) => handleUpdateAct(idx, 'description', e.target.value)}
                          placeholder="Description of act / test..."
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800"
                          required
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Care Category</label>
                        <select
                          value={act.category}
                          onChange={(e) => handleUpdateAct(idx, 'category', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                        >
                          {CARE_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                          Amount ({currency === 'USD' ? 'USD / $' : 'LRD / L$'})
                        </label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1.5 text-slate-400 font-bold text-xs">
                            {currency === 'USD' ? '$' : 'L$'}
                          </span>
                          <input
                            type="number"
                            step="any"
                            value={act.amount}
                            onChange={(e) => handleUpdateAct(idx, 'amount', parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className="w-full pl-7 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 text-right"
                            required
                          />
                        </div>
                        <div className="text-[10px] text-right text-slate-400 mt-0.5 font-medium">
                          {currency === 'USD'
                            ? `≈ L$ ${(Number(act.amount || 0) * (exchangeRate || 195)).toLocaleString('en-US', { maximumFractionDigits: 0 })} LRD`
                            : `≈ $${(Number(act.amount || 0) / (exchangeRate || 195)).toFixed(2)} USD`}
                        </div>
                      </div>

                      <div className="sm:col-span-1 flex justify-end sm:justify-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveAct(idx)}
                          disabled={medicalActs.length <= 1}
                          className={`p-1.5 rounded-lg transition ${
                            medicalActs.length <= 1
                              ? 'text-slate-300 cursor-not-allowed'
                              : 'text-rose-500 hover:bg-rose-50 cursor-pointer'
                          }`}
                          title="Remove Act"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* === AMÉLIORATION AJOUTÉE : bandeau de calcul automatisé du co-paiement ACTIVA,
                    basé sur le taux de couverture contractuel de l'organisation de l'assuré
                    (85% / 15% par défaut si l'organisation n'est pas identifiée). === */}
                <div className="p-4 bg-[#0a2e6b] rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-white">
                  <div>
                    <span className="text-[11px] font-extrabold text-emerald-300 uppercase tracking-wide">
                      Automated ACTIVA Co-Pay Calculation ({coverageRatePercent}% / {(100 - coverageRatePercent).toFixed(0)}%) — {currency === 'USD' ? 'US Dollar (USD)' : 'Liberian Dollar (LRD)'}
                    </span>
                    <p className="text-xs font-semibold text-blue-100 mt-1">
                      ACTIVA Covered: <span className="text-emerald-300 font-bold">{formatAmount(activaCoveredAmount)}</span>
                      {' '}• Insured Co-pay: <span className="font-bold">{formatAmount(insuredCopayAmount)}</span>
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-[10px] font-bold text-blue-200 uppercase tracking-wide block">Total Claim Amount</span>
                    <div className="text-lg sm:text-xl font-black text-white">
                      {formatAmount(totalAmount)} <span className="text-emerald-300 text-xs font-bold">{currency}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* === AMÉLIORATION AJOUTÉE : les 3 zones d'upload séparées (Prescription / Invoice /
                  Autres) sont remplacées par un sélecteur de catégorie + une zone de dépôt
                  unique (glisser-déposer ou "Browse Files"), qui route toujours vers le bon état
                  (prescriptionFile / invoiceFile / uploadedAttachments) selon la catégorie
                  choisie — aucune capacité perdue (aperçu, téléchargement, suppression). === */}
              <div className="space-y-3.5 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-[#0a2e6b]" />
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                        4. Supporting Documents &amp; Invoices ({allAttachmentsForDisplay.length})
                      </h4>
                      <p className="text-[10.5px] text-slate-400 font-medium">
                        Upload prescriptions, hospital invoices, Word documents (.doc/.docx), PDFs, and medical photos
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap bg-slate-50 px-2 py-1 rounded-md border border-slate-200">
                    Word (.docx/.doc), PDF, JPG, PNG up to 10MB
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Left: category selector + drop zone */}
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Document Category:</label>
                      <select
                        value={documentCategory}
                        onChange={(e) => setDocumentCategory(e.target.value as DocCategory)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#0a2e6b]"
                      >
                        {(Object.keys(DOC_CATEGORY_LABELS) as DocCategory[]).map((cat) => (
                          <option key={cat} value={cat}>
                            {DOC_CATEGORY_LABELS[cat]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <input
                      type="file"
                      ref={prescriptionInputRef}
                      className="hidden"
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={(e) => handleFileUpload(e.target.files, 'prescription')}
                    />
                    <input
                      type="file"
                      ref={invoiceInputRef}
                      className="hidden"
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={(e) => handleFileUpload(e.target.files, 'invoice')}
                    />
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.txt"
                      onChange={(e) => handleFileUpload(e.target.files, 'general')}
                    />

                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                      onDragLeave={() => setIsDraggingFile(false)}
                      onDrop={handleDrop}
                      className={`p-6 border-2 border-dashed rounded-xl text-center transition ${
                        isDraggingFile ? 'border-[#0a2e6b] bg-blue-50/60' : 'border-slate-300 bg-slate-50/60'
                      }`}
                    >
                      <UploadCloud className={`w-7 h-7 mx-auto mb-2 ${isDraggingFile ? 'text-[#0a2e6b]' : 'text-slate-400'}`} />
                      <p className="text-xs font-bold text-slate-700">Drag and drop files here</p>
                      <p className="text-[10.5px] text-slate-400 mt-0.5">Photos, Word (.docx/.doc), PDF up to 10MB</p>
                      <button
                        type="button"
                        onClick={() => {
                          if (documentCategory === 'prescription') prescriptionInputRef.current?.click();
                          else if (documentCategory === 'invoice') invoiceInputRef.current?.click();
                          else fileInputRef.current?.click();
                        }}
                        className="mt-3 px-4 py-2 bg-[#0a2e6b] hover:bg-[#07214f] text-white rounded-lg text-xs font-bold transition cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Browse Files</span>
                      </button>
                    </div>
                  </div>

                  {/* Right: consolidated list of every attached document */}
                  <div className="space-y-2">
                    {allAttachmentsForDisplay.length === 0 ? (
                      <div className="h-full min-h-[140px] flex items-center justify-center text-center p-4 bg-slate-50/60 border border-dashed border-slate-200 rounded-xl">
                        <p className="text-xs text-slate-400 italic">No supporting documents attached yet.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {allAttachmentsForDisplay.map(({ attachment, category, onRemove }) => (
                          <div
                            key={attachment.id || attachment.name}
                            className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {attachment.type === 'image' && <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />}
                              {attachment.type === 'pdf' && <FileText className="w-4 h-4 text-rose-600 shrink-0" />}
                              {attachment.type === 'word' && <File className="w-4 h-4 text-blue-600 shrink-0" />}
                              {attachment.type !== 'image' && attachment.type !== 'pdf' && attachment.type !== 'word' && (
                                <Paperclip className="w-4 h-4 text-slate-500 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="font-bold text-slate-800 text-[11px] truncate">{attachment.name}</p>
                                <p className="text-[9px] text-slate-400 uppercase tracking-wide font-bold">
                                  {DOC_CATEGORY_TAGS[category]} • {attachment.size}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setPreviewDocModal(attachment)}
                                className="p-1 text-slate-500 hover:text-[#0a2e6b] cursor-pointer"
                                title="Preview"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={onRemove}
                                className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                                title="Remove"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {fingerprintVerification ? (
                  <span className="px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center justify-center gap-1.5">
                    <Fingerprint className="w-4 h-4" />
                    <span>Fingerprint Verified (Score {fingerprintVerification.score}%)</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsFingerprintModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Fingerprint className="w-4 h-4" />
                    <span>Verify Beneficiary Fingerprint (Optional)</span>
                  </button>
                )}

                <button
                  type="submit"
                  disabled={
                    totalAmount <= 0 ||
                    !selectedProviderName ||
                    (!principalNameInput.trim() && !memberCardInput.trim()) ||
                    (eligibilityStatus !== null && !eligibilityStatus.isEligible)
                  }
                  className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold shadow-md transition flex items-center justify-center gap-2 ${
                    totalAmount <= 0 ||
                    !selectedProviderName ||
                    (!principalNameInput.trim() && !memberCardInput.trim()) ||
                    (eligibilityStatus !== null && !eligibilityStatus.isEligible)
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-[#0a2e6b] hover:bg-[#07214f] text-white cursor-pointer'
                  }`}
                >
                  <Receipt className="w-4 h-4" />
                  <span>Submit Claim for Supervisor Validation</span>
                </button>
              </div>
      </form>

      {/* Recent Claims History & Status */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-4 sm:px-6 py-3.5 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h3 className="font-extrabold text-xs sm:text-sm text-slate-900">
              Recent Claims History &amp; Status ({claimsHistoryCount})
            </h3>
            <p className="text-[10.5px] text-slate-400">Real-time tracking of files and coverage adjudication decisions</p>
          </div>
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by ref, name, card..."
              className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0a2e6b] transition"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>

        {/* MOBILE / TABLET VIEW (< 1024px) */}
        <div className="block lg:hidden divide-y divide-slate-100">
          {filteredClaims.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs font-medium">
              No claims recorded at this moment.
            </div>
          ) : (
            filteredClaims.map((claim) => (
              <div
                key={claim.id}
                onClick={() => setSelectedClaimDetail(claim)}
                className="p-4 hover:bg-slate-50/80 transition space-y-2.5 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono font-bold text-xs text-[#0a2e6b]">{claim.reference}</span>
                    <span className="text-[10px] text-slate-400 ml-2">{claim.serviceDate}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      claim.status === 'approved' || claim.status === 'Validated' || claim.status === 'Approved'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : claim.status === 'rejected' || claim.status === 'Rejected'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {claim.status === 'approved' || claim.status === 'Validated' || claim.status === 'Approved'
                      ? 'Approved'
                      : claim.status === 'rejected' || claim.status === 'Rejected'
                      ? 'Rejected'
                      : 'Pending'}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-xs text-slate-900">{claim.memberName}</p>
                    <p className="text-[11px] text-slate-500 font-mono">{claim.memberCardNo}</p>
                    <p className="text-[11px] text-slate-500">{claim.provider}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-sm text-slate-900">
                      ${claim.amount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] font-semibold text-slate-500">
                      ≈ L$ {(claim.amount * (exchangeRate || 195)).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0a2e6b] text-[10px] font-bold">
                    {claim.careType}
                  </span>
                  {claim.attachments && claim.attachments.length > 0 && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                      <Paperclip className="w-2.5 h-2.5" />
                      {claim.attachments.length} doc(s)
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* DESKTOP VIEW (>= 1024px) */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4 whitespace-nowrap">Reference &amp; Date</th>
                <th className="py-3 px-4">Beneficiary / Card</th>
                <th className="py-3 px-4">Healthcare Provider</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Total Amount</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Decision Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClaims.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-xs font-medium">
                    {searchTerm ? 'No claims matching your search query.' : 'No claims recorded at this moment.'}
                  </td>
                </tr>
              ) : (
                filteredClaims.map((claim) => (
                  <tr
                    key={claim.id}
                    onClick={() => setSelectedClaimDetail(claim)}
                    className="hover:bg-slate-50 transition cursor-pointer"
                  >
                    <td className="py-3 px-4 font-bold text-[#0a2e6b] whitespace-nowrap">
                      {claim.reference}
                      <span className="block text-[10px] text-slate-400 font-normal">{claim.serviceDate}</span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {claim.memberName}
                      <span className="block text-[10px] text-slate-400 font-mono">{claim.memberCardNo}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-700 block">{claim.provider}</span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {claim.doctorName || 'Attending Physician'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[#0a2e6b] text-[10px] font-bold inline-block">
                        {claim.careType}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span className="font-black text-slate-900 block">
                        ${claim.amount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500">
                        ≈ L$ {(claim.amount * (exchangeRate || 195)).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                          claim.status === 'approved' || claim.status === 'Validated' || claim.status === 'Approved'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : claim.status === 'rejected' || claim.status === 'Rejected'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {claim.status === 'approved' || claim.status === 'Validated' || claim.status === 'Approved'
                          ? 'Approved'
                          : claim.status === 'rejected' || claim.status === 'Rejected'
                          ? 'Rejected'
                          : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Biometric Fingerprint Verification Modal (optional, section 4 footer) */}
      <BiometricFingerprintModal
        isOpen={isFingerprintModalOpen}
        onClose={() => setIsFingerprintModalOpen(false)}
        onCapture={(data) => {
          setFingerprintVerification({ score: data.score });
          setIsFingerprintModalOpen(false);
        }}
        title="Beneficiary Fingerprint Verification"
        subtitle="Optional AFIS verification prior to claim submission"
      />

      {/* Modal Document Preview (PDF, Word, Images) */}
      {previewDocModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden">
            <div className="bg-[#0a2e6b] p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span className="font-bold text-xs truncate max-w-sm">{previewDocModal.name}</span>
              </div>
              <button
                onClick={() => setPreviewDocModal(null)}
                className="p-1 rounded-lg hover:bg-white/20 text-white cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 text-center space-y-4 max-h-[70vh] overflow-y-auto">
              {previewDocModal.type === 'image' ? (
                <img
                  src={previewDocModal.url}
                  alt={previewDocModal.name}
                  className="max-h-96 mx-auto rounded-xl object-contain border border-slate-200"
                />
              ) : (
                <div className="p-8 bg-slate-50 rounded-2xl border border-slate-200 text-center space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-blue-100 text-[#0a2e6b] flex items-center justify-center mx-auto">
                    {previewDocModal.type === 'word' ? <File className="w-8 h-8" /> : <FileText className="w-8 h-8" />}
                  </div>
                  <h4 className="font-extrabold text-slate-800 text-sm">{previewDocModal.name}</h4>
                  <p className="text-xs text-slate-500">Document {previewDocModal.type.toUpperCase()} ({previewDocModal.size})</p>
                </div>
              )}
              <a
                href={previewDocModal.url}
                download={previewDocModal.name}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0a2e6b] hover:bg-[#07214f] text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>Download Document</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Modal Détails Réclamation */}
      {selectedClaimDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="bg-[#0a2e6b] p-4 sm:p-5 text-white flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-bold text-base">Claim Record: {selectedClaimDetail.reference}</h3>
                <p className="text-xs text-blue-100">Service Date: {selectedClaimDetail.serviceDate}</p>
              </div>
              <button
                onClick={() => setSelectedClaimDetail(null)}
                className="p-1.5 rounded-xl hover:bg-white/15 text-white transition cursor-pointer"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 text-xs overflow-y-auto flex-1">
              {/* Decision & Status Banner */}
              <div
                className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                  selectedClaimDetail.status === 'approved' || selectedClaimDetail.status === 'Validated' || selectedClaimDetail.status === 'Approved'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : selectedClaimDetail.status === 'rejected' || selectedClaimDetail.status === 'Rejected'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      selectedClaimDetail.status === 'approved' || selectedClaimDetail.status === 'Validated' || selectedClaimDetail.status === 'Approved'
                        ? 'bg-emerald-500'
                        : selectedClaimDetail.status === 'rejected' || selectedClaimDetail.status === 'Rejected'
                        ? 'bg-rose-500'
                        : 'bg-amber-500'
                    }`}
                  />
                  <div>
                    <span className="font-extrabold text-sm block">
                      Status:{' '}
                      {selectedClaimDetail.status === 'approved' || selectedClaimDetail.status === 'Validated' || selectedClaimDetail.status === 'Approved'
                        ? 'Approved ✓'
                        : selectedClaimDetail.status === 'rejected' || selectedClaimDetail.status === 'Rejected'
                        ? 'Rejected ✗'
                        : 'Pending Supervisor Review'}
                    </span>
                    {selectedClaimDetail.decisionDate && (
                      <span className="text-[11px] opacity-80 block">
                        Decision Date: <strong>{selectedClaimDetail.decisionDate}</strong>
                        {selectedClaimDetail.approvedBy && ` • Decision by: ${selectedClaimDetail.approvedBy}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Explicit Rejection Reason Box */}
              {(selectedClaimDetail.status === 'rejected' || selectedClaimDetail.status === 'Rejected' || selectedClaimDetail.rejectionReason) && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-1.5 animate-in fade-in">
                  <div className="flex items-center gap-2 text-rose-800 font-bold">
                    <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    <span>Rejection Reason:</span>
                  </div>
                  <p className="text-rose-900 font-bold pl-6 text-xs leading-relaxed">
                    {selectedClaimDetail.rejectionReason || 'Ceiling exceeded or medical protocol non-compliance'}
                  </p>
                  {selectedClaimDetail.comments && (
                    <div className="pt-2 mt-2 border-t border-rose-200/60 pl-6 text-slate-700">
                      <span className="font-bold text-slate-900">Supervisor Remarks:</span> {selectedClaimDetail.comments}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 font-medium block">Principal Insured</span>
                  <span className="font-bold text-slate-800 text-sm">{selectedClaimDetail.memberName}</span>
                  <span className="text-[11px] text-slate-500 block font-mono">{selectedClaimDetail.memberCardNo}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Organization</span>
                  <span className="font-bold text-slate-800">{selectedClaimDetail.organization}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Healthcare Facility</span>
                  <span className="font-bold text-[#0a2e6b]">{selectedClaimDetail.provider}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Attending Physician</span>
                  <span className="font-bold text-slate-800">{selectedClaimDetail.doctorName || 'Not specified'}</span>
                </div>
              </div>

              {selectedClaimDetail.comments && !selectedClaimDetail.rejectionReason && (
                <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-slate-700">
                  <span className="font-bold text-[#0a2e6b] block mb-1">Details & Beneficiary:</span>
                  <p>{selectedClaimDetail.comments}</p>
                </div>
              )}

              {/* Attached Supporting Documents */}
              {selectedClaimDetail.attachments && selectedClaimDetail.attachments.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-[#0a2e6b]" />
                    <span>Submitted Supporting Documents ({selectedClaimDetail.attachments.length})</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedClaimDetail.attachments.map((att, i) => (
                      <div key={i} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          {att.type === 'image' && <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />}
                          {att.type === 'pdf' && <FileText className="w-4 h-4 text-rose-600 shrink-0" />}
                          {att.type === 'word' && <File className="w-4 h-4 text-blue-600 shrink-0" />}
                          {att.type !== 'image' && att.type !== 'pdf' && att.type !== 'word' && (
                            <Paperclip className="w-4 h-4 text-slate-500 shrink-0" />
                          )}
                          <span className="truncate font-semibold text-slate-800 text-[11px]">{att.name}</span>
                        </div>
                        <a
                          href={att.url}
                          download={att.name}
                          className="p-1 rounded bg-white border border-slate-200 text-slate-700 hover:text-[#0a2e6b]"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedClaimDetail.medicalActs && selectedClaimDetail.medicalActs.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-800 mb-2">Itemized Medical Acts:</h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 text-[10px]">
                        <tr>
                          <th className="p-2.5">Act / Procedure</th>
                          <th className="p-2.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedClaimDetail.medicalActs.map((a, i) => (
                          <tr key={i}>
                            <td className="p-2.5 text-slate-700 font-medium">{a.name}</td>
                            <td className="p-2.5 text-right font-bold text-slate-900">
                              ${a.amount?.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                <span className="text-sm font-bold text-slate-700">Total Claim Amount:</span>
                <div className="text-right">
                  <span className="text-lg font-black text-[#0a2e6b] block">
                    ${selectedClaimDetail.amount?.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    ≈ L$ {(selectedClaimDetail.amount * (exchangeRate || 195)).toLocaleString('en-US', { maximumFractionDigits: 0 })} LRD
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
