// === AMÉLIORATION AJOUTÉE : ACTIVA Health Claims — Phase 2 (assistant de création de dossier)
// === Nouveau composant, comportement additif — voir ACTIVA_HEALTH_CLAIMS_DISCOVERY.md et
// src/modules/README.md (convention "un dossier par module, prévisualisé avant d'être branché
// pour de vrai"). N'est encore référencé par aucun écran de l'application (App.tsx inchangé) ;
// derrière le flag `ahc_claim_wizard` (src/config/featureFlags.ts, désactivé par défaut) une
// fois câblé. Réutilise `eligibilityService.ts`/`policyEngine.ts` déjà existants plutôt que de
// réinventer une seconde logique métier divergente.
import React, { useMemo, useState } from 'react';
import {
  Search,
  ShieldAlert,
  ShieldCheck,
  FileText,
  Upload,
  X,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  Loader2,
  Trash2,
} from 'lucide-react';
import { Member, Organization, Provider, Ceiling, HealthPolicy } from '../../types';
import { checkCareEligibility } from '../../services/eligibilityService';
import { getPolicyCoverageStatus } from '../../services/policyEngine';
import { uploadDocumentToStorage } from '../../utils/storageUtils';
import {
  ClaimCase,
  ClaimDocumentRef,
  ClaimDocumentType,
  ServiceNature,
} from '../../types/healthClaims';

const SERVICE_NATURE_OPTIONS: { value: ServiceNature; label: string; inpatient?: boolean }[] = [
  { value: 'consultation', label: 'Consultation' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'laboratory', label: 'Laboratory' },
  { value: 'imaging', label: 'Imaging' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'hospitalization', label: 'Hospitalization', inpatient: true },
  { value: 'surgery', label: 'Surgery', inpatient: true },
  { value: 'maternity', label: 'Maternity', inpatient: true },
  { value: 'other', label: 'Other' },
];

const DOCUMENT_TYPE_OPTIONS: { value: ClaimDocumentType; label: string }[] = [
  { value: 'invoice', label: 'Invoice' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'lab_result', label: 'Lab Result' },
  { value: 'medical_report', label: 'Medical Report' },
  { value: 'hospitalization_form', label: 'Hospitalization Form' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'other', label: 'Other' },
];

const ACCEPTED_DOCUMENT_TYPES = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

function formatMoney(amount: number, currency: 'USD' | 'LRD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(
      Number.isFinite(amount) ? amount : 0
    );
  } catch {
    return `${currency} ${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
  }
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function generateClaimReference(): string {
  const y = new Date().getFullYear();
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `AHC-${y}-${rand}`;
}

interface PendingDocument {
  localId: string;
  file: File;
  dataUrl: string;
  type: ClaimDocumentType;
  status: 'ready' | 'uploading' | 'uploaded' | 'error';
  error?: string;
  uploadedRef?: ClaimDocumentRef;
}

export interface ClaimCaseWizardProps {
  members: Member[];
  organizations: Organization[];
  providers: Provider[];
  ceilings: Ceiling[];
  healthPolicies: HealthPolicy[];
  currentUser: { uid?: string; fullName?: string; displayName?: string; email?: string } | null;
  onSubmit: (claimCase: Partial<ClaimCase>) => Promise<void> | void;
  onCancel?: () => void;
}

export const ClaimCaseWizard: React.FC<ClaimCaseWizardProps> = ({
  members,
  organizations,
  providers,
  ceilings,
  healthPolicies,
  currentUser,
  onSubmit,
  onCancel,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // --- Step 1: Identification ---------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [policyWarningAcknowledged, setPolicyWarningAcknowledged] = useState(false);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return members.slice(0, 8);
    return members
      .filter(
        (m) =>
          m.cardNo?.toLowerCase().includes(q) ||
          m.principalName?.toLowerCase().includes(q) ||
          m.spouseName?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [members, searchQuery]);

  const selectedOrganization = useMemo(
    () =>
      selectedMember
        ? organizations.find((o) => o.name.toLowerCase() === selectedMember.organization?.toLowerCase()) || null
        : null,
    [organizations, selectedMember]
  );

  const selectedPolicy = useMemo(
    () =>
      selectedMember
        ? healthPolicies.find((p) => p.organizationId?.toLowerCase() === selectedMember.organization?.toLowerCase()) || null
        : null,
    [healthPolicies, selectedMember]
  );

  const policyCoverage = useMemo(
    () => (selectedPolicy ? getPolicyCoverageStatus(selectedPolicy) : null),
    [selectedPolicy]
  );

  const eligibility = useMemo(
    () =>
      selectedMember
        ? checkCareEligibility(selectedMember.cardNo, members, organizations, ceilings)
        : null,
    [selectedMember, members, organizations, ceilings]
  );

  const contractIsExpiredOrSuspended = policyCoverage?.coverageBlocked === true;

  const canProceedFromStep1 =
    !!selectedMember && (!contractIsExpiredOrSuspended || policyWarningAcknowledged);

  // --- Step 2: Claim info ------------------------------------------------------------------
  const [claimDate] = useState(todayIso());
  const [declarationDate] = useState(todayIso());
  const [reference] = useState(generateClaimReference());
  const [serviceNature, setServiceNature] = useState<ServiceNature>('consultation');
  const [providerId, setProviderId] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [claimedAmount, setClaimedAmount] = useState<string>('');
  const [currency, setCurrency] = useState<'USD' | 'LRD'>('USD');
  const [comments, setComments] = useState('');

  const claimedAmountNumber = Number(claimedAmount) || 0;
  const isInpatientService = SERVICE_NATURE_OPTIONS.find((o) => o.value === serviceNature)?.inpatient === true;

  const remainingCeiling = useMemo(() => {
    if (!selectedMember) return undefined;
    return isInpatientService ? selectedMember.inpatientBalanceUSD : selectedMember.outpatientBalanceUSD;
  }, [selectedMember, isInpatientService]);

  const coverageRatePercent = selectedOrganization?.coverageRate ?? 85;

  const guarantee = useMemo(() => {
    const claimed = claimedAmountNumber;
    const hasCeilingData = typeof remainingCeiling === 'number';
    const eligible = hasCeilingData ? Math.min(claimed, Math.max(0, remainingCeiling as number)) : claimed;
    const franchise = 0; // Deductible not yet modeled on Organization/Ceiling — see comment below.
    const insuredAmount = Math.max(0, eligible - franchise) * (coverageRatePercent / 100);
    const exceedsCeiling = hasCeilingData && claimed > (remainingCeiling as number);
    return { claimed, eligible, franchise, insuredAmount, exceedsCeiling, hasCeilingData };
  }, [claimedAmountNumber, remainingCeiling, coverageRatePercent]);

  const canProceedFromStep2 =
    claimedAmountNumber > 0 && !!serviceNature && (eligibility ? eligibility.isEligible : true);

  // --- Step 3: Documents --------------------------------------------------------------------
  const [pendingDocuments, setPendingDocuments] = useState<PendingDocument[]>([]);
  const [nextDocumentType, setNextDocumentType] = useState<ClaimDocumentType>('invoice');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    Array.from(fileList).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setPendingDocuments((prev) => [
          ...prev,
          {
            localId: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            file,
            dataUrl,
            type: nextDocumentType,
            status: 'ready',
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeDocument = (localId: string) => {
    setPendingDocuments((prev) => prev.filter((d) => d.localId !== localId));
  };

  const currentUserName = currentUser?.fullName || currentUser?.displayName || currentUser?.email || 'Unknown';

  const handleSubmit = async () => {
    if (!selectedMember) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Documents are uploaded to Firebase Storage on submit — never stored inline as base64
      // in the claim document itself (see uploadDocumentToStorage, storageUtils.ts).
      const uploadedDocuments: ClaimDocumentRef[] = [];
      for (const doc of pendingDocuments) {
        const safeOrg = (selectedMember.organization || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
        const path = `health-claims-documents/${safeOrg}/${reference}-${doc.localId}-${doc.file.name}`;
        const url = await uploadDocumentToStorage(doc.dataUrl, path);
        uploadedDocuments.push({
          id: doc.localId,
          name: doc.file.name,
          type: doc.type,
          url,
          addedAt: new Date().toISOString(),
          addedBy: currentUserName,
          verificationStatus: 'pending',
        });
      }

      const claimCase: Partial<ClaimCase> = {
        reference,
        claimDate,
        declarationDate,
        memberId: selectedMember.id,
        memberCardNo: selectedMember.cardNo,
        memberName: selectedMember.principalName,
        organization: selectedMember.organization,
        providerId: providerId || undefined,
        providerName: providers.find((p) => p.id === providerId)?.name,
        doctorName: doctorName || undefined,
        serviceNature,
        diagnosis: diagnosis || undefined,
        currency,
        claimedAmount: claimedAmountNumber,
        eligibleAmount: guarantee.eligible,
        approvedAmount: undefined,
        documents: uploadedDocuments,
        status: 'SUBMITTED',
        comments: comments || undefined,
        createdAt: new Date().toISOString(),
        createdBy: currentUserName,
        createdByUid: currentUser?.uid,
        creatorName: currentUserName,
      };

      await onSubmit(claimCase);
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to submit the claim. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const stepLabels = ['Identification', 'Claim Information', 'Supporting Documents'];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Stepper header */}
      <div className="flex items-center gap-2 mb-6">
        {stepLabels.map((label, idx) => {
          const stepNum = (idx + 1) as 1 | 2 | 3;
          const isActive = stepNum === step;
          const isDone = stepNum < step;
          return (
            <React.Fragment key={label}>
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isActive
                      ? 'bg-[#0A347B] text-white'
                      : isDone
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {stepNum}
                </div>
                <span className={`text-xs font-semibold hidden sm:inline ${isActive ? 'text-[#0A347B]' : 'text-slate-400'}`}>
                  {label}
                </span>
              </div>
              {idx < stepLabels.length - 1 && <div className="flex-1 h-px bg-slate-200" />}
            </React.Fragment>
          );
        })}
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="relative mb-4">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by card number or insured name..."
              className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A347B]/30"
            />
          </div>

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {filteredMembers.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">No matching insured members found.</p>
            )}
            {filteredMembers.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setSelectedMember(m);
                  setPolicyWarningAcknowledged(false);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  selectedMember?.id === m.id
                    ? 'border-[#0A347B] bg-[#0A347B]/5'
                    : 'border-slate-100 hover:border-slate-300'
                }`}
              >
                <div className="text-sm font-semibold text-slate-800">{m.principalName}</div>
                <div className="text-xs text-slate-500">
                  {m.cardNo} &middot; {m.organization} &middot; {m.status}
                </div>
              </button>
            ))}
          </div>

          {selectedMember && (
            <div className="mt-5 border-t border-slate-100 pt-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-slate-400 font-semibold uppercase tracking-wide">Card No.</div>
                  <div className="text-slate-800 font-medium">{selectedMember.cardNo}</div>
                </div>
                <div>
                  <div className="text-slate-400 font-semibold uppercase tracking-wide">Relationship</div>
                  <div className="text-slate-800 font-medium">{selectedMember.relationship}</div>
                </div>
                <div>
                  <div className="text-slate-400 font-semibold uppercase tracking-wide">Organization</div>
                  <div className="text-slate-800 font-medium">{selectedMember.organization}</div>
                </div>
                {selectedOrganization && (
                  <>
                    <div>
                      <div className="text-slate-400 font-semibold uppercase tracking-wide">Policy Number</div>
                      <div className="text-slate-800 font-medium">{selectedOrganization.policyNumber}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 font-semibold uppercase tracking-wide">Coverage Period</div>
                      <div className="text-slate-800 font-medium">
                        {selectedOrganization.effectiveDate} &rarr; {selectedOrganization.expirationDate}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 font-semibold uppercase tracking-wide">Coverage Rate</div>
                      <div className="text-slate-800 font-medium">{selectedOrganization.coverageRate}%</div>
                    </div>
                  </>
                )}
              </div>

              {eligibility && !eligibility.isEligible && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 font-medium">{eligibility.reason || 'This insured member is not currently eligible for a new claim.'}</p>
                </div>
              )}

              {policyCoverage && (
                <div
                  className={`flex items-start gap-2 rounded-lg p-3 border ${
                    contractIsExpiredOrSuspended
                      ? 'bg-red-50 border-red-200'
                      : policyCoverage.status === 'Expiring Soon'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-emerald-50 border-emerald-200'
                  }`}
                >
                  {contractIsExpiredOrSuspended ? (
                    <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p
                      className={`text-xs font-semibold ${
                        contractIsExpiredOrSuspended
                          ? 'text-red-700'
                          : policyCoverage.status === 'Expiring Soon'
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      Policy status: {policyCoverage.status}
                    </p>
                    {contractIsExpiredOrSuspended && (
                      <>
                        <p className="text-xs text-red-600 mt-1">
                          This organization's contract is {policyCoverage.status.toLowerCase()}. You may still
                          register this claim for record-keeping, but it will very likely be rejected or held for
                          review until coverage is restored.
                        </p>
                        <label className="flex items-center gap-2 mt-2 text-xs text-red-700 font-medium">
                          <input
                            type="checkbox"
                            checked={policyWarningAcknowledged}
                            onChange={(e) => setPolicyWarningAcknowledged(e.target.checked)}
                          />
                          I acknowledge this contract is {policyCoverage.status.toLowerCase()} and want to proceed.
                        </label>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end mt-5">
            <button
              type="button"
              disabled={!canProceedFromStep1}
              onClick={() => setStep(2)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-[#0A347B] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#072659]"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && selectedMember && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500">Claim Reference</label>
              <input value={reference} disabled className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Claim Date</label>
              <input value={claimDate} disabled className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Service Nature</label>
              <select
                value={serviceNature}
                onChange={(e) => setServiceNature(e.target.value as ServiceNature)}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              >
                {SERVICE_NATURE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Provider</label>
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              >
                <option value="">Select a provider...</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Doctor Name</label>
              <input
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Diagnosis</label>
              <input
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Claimed Amount</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  min={0}
                  value={claimedAmount}
                  onChange={(e) => setClaimedAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'USD' | 'LRD')}
                  className="px-2 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="USD">USD</option>
                  <option value="LRD">LRD</option>
                </select>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-500">Comments</label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={2}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          </div>

          {/* Guarantee verification panel (spec §6) */}
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Guarantee Verification</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-slate-400">Claimed Amount</div>
                <div className="font-bold text-slate-800">{formatMoney(guarantee.claimed, currency)}</div>
              </div>
              <div>
                <div className="text-slate-400">Eligible Amount</div>
                <div className="font-bold text-slate-800">{formatMoney(guarantee.eligible, currency)}</div>
              </div>
              <div>
                <div className="text-slate-400">Coverage Rate</div>
                <div className="font-bold text-slate-800">{coverageRatePercent}%</div>
              </div>
              <div>
                <div className="text-slate-400">Deductible</div>
                <div className="font-bold text-slate-800">
                  {guarantee.franchise > 0 ? formatMoney(guarantee.franchise, currency) : 'Not configured'}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Insured Amount (ACTIVA pays)</div>
                <div className="font-bold text-emerald-600">{formatMoney(guarantee.insuredAmount, currency)}</div>
              </div>
              <div>
                <div className="text-slate-400">Remaining Ceiling ({isInpatientService ? 'Inpatient' : 'Outpatient'})</div>
                <div className="font-bold text-slate-800">
                  {guarantee.hasCeilingData ? formatMoney(remainingCeiling as number, 'USD') : 'Not available'}
                </div>
              </div>
            </div>
            {guarantee.exceedsCeiling && (
              <div className="flex items-center gap-2 mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                The claimed amount exceeds the insured's remaining {isInpatientService ? 'inpatient' : 'outpatient'} ceiling.
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              type="button"
              disabled={!canProceedFromStep2}
              onClick={() => setStep(3)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-[#0A347B] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#072659]"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <select
              value={nextDocumentType}
              onChange={(e) => setNextDocumentType(e.target.value as ClaimDocumentType)}
              className="px-2 py-2 border border-slate-200 rounded-lg text-xs"
            >
              {DOCUMENT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <label className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-lg py-4 text-xs font-semibold text-slate-500 cursor-pointer hover:border-[#0A347B]/40">
              <Upload className="w-4 h-4" />
              Browse files (PDF, JPG, PNG)
              <input
                type="file"
                accept={ACCEPTED_DOCUMENT_TYPES}
                multiple
                className="hidden"
                onChange={(e) => handleFilesSelected(e.target.files)}
              />
            </label>
          </div>

          <div className="space-y-1.5">
            {pendingDocuments.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">No documents added yet.</p>
            )}
            {pendingDocuments.map((doc) => (
              <div
                key={doc.localId}
                className="flex items-center gap-3 px-3 py-2 border border-slate-100 rounded-lg"
              >
                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-700 truncate">{doc.file.name}</div>
                  <div className="text-[11px] text-slate-400">
                    {DOCUMENT_TYPE_OPTIONS.find((o) => o.value === doc.type)?.label}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeDocument(doc.localId)}
                  className="text-slate-400 hover:text-red-500"
                  aria-label="Remove document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {submitError && (
            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {submitError}
            </div>
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex items-center gap-2">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                >
                  <X className="w-4 h-4" /> Cancel
                </button>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white disabled:opacity-40 hover:bg-emerald-700"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Submit Claim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
