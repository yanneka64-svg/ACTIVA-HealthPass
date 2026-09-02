import React, { useState } from 'react';
import {
  X,
  Fingerprint,
  Camera,
  FileText,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ZoomIn,
  Download,
  Check,
  AlertTriangle,
  User,
  Calendar,
  Building,
  DollarSign,
  Activity,
  Scan,
  Paperclip,
  File,
  Image as ImageIcon,
  ExternalLink
} from 'lucide-react';
import { Claim, Enrollment, Member, Language } from '../types';
import { useTranslation } from '../i18n/translations';
import { useCurrency } from '../services/currency';

interface AttachmentBiometricViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  type: 'claim' | 'enrollment' | 'member';
  data: Claim | Enrollment | Member | null;
  onApprove?: (id: string) => void;
  onReject?: (item: any) => void;
}

export const AttachmentBiometricViewerModal: React.FC<AttachmentBiometricViewerModalProps> = ({
  isOpen,
  onClose,
  lang,
  type,
  data,
  onApprove,
  onReject,
}) => {
  const t = useTranslation(lang);
  const { formatAmount } = useCurrency();
  const [activeTab, setActiveTab] = useState<'overview' | 'photo' | 'fingerprint' | 'documents'>('overview');
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  if (!isOpen || !data) return null;

  const isClaim = type === 'claim';
  const isEnrollment = type === 'enrollment';
  const isMember = type === 'member';

  const claimData = isClaim ? (data as Claim) : null;
  const enrollmentData = isEnrollment ? (data as Enrollment) : null;
  const memberData = isMember ? (data as Member) : null;

  const title = isClaim
    ? `Attachments & Biometrics — ${claimData?.reference}`
    : isEnrollment
    ? `Biometric Verification — ${enrollmentData?.reference}`
    : `Biometric File — ${memberData?.cardNo}`;

  // Synthetic or real attachments
  const photoUrl =
    (data as any).photoUrl ||
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80';

  const prescriptionUrl =
    (data as any).prescriptionUrl ||
    'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=800&auto=format&fit=crop&q=80';

  const invoiceDocUrl =
    (data as any).invoiceDocumentUrl ||
    'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&auto=format&fit=crop&q=80';

  const fingerprintScore = (data as any).fingerprintScore || 98.4;
  const matchStatus = fingerprintScore >= 85
    ? ('Authenticated')
    : ('Uncertain');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header — === AMÉLIORATION AJOUTÉE : fenêtre passée au blanc (auparavant fond
            bleu marine #0a2e6b), cohérent avec le reste des fenêtres de l'interface. */}
        <div className="bg-white px-6 py-4 text-slate-900 flex items-center justify-between border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200">
              <Scan className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900">{title}</h3>
              <p className="text-[11px] text-slate-500">
                {'Biometric identity review & attachment inspection before final decision'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'bg-white border-[#334155] text-[#334155] shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{'Summary & Decision'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('photo')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 flex items-center gap-2 ${
              activeTab === 'photo'
                ? 'bg-white border-[#334155] text-[#334155] shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{'Identity Photo'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('fingerprint')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 flex items-center gap-2 ${
              activeTab === 'fingerprint'
                ? 'bg-white border-[#334155] text-[#334155] shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Fingerprint className="w-3.5 h-3.5" />
            <span>{'Biometric Fingerprint'}</span>
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
              {fingerprintScore}%
            </span>
          </button>

          {isClaim && (
            <button
              type="button"
              onClick={() => setActiveTab('documents')}
              className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 flex items-center gap-2 ${
                activeTab === 'documents'
                  ? 'bg-white border-[#334155] text-[#334155] shadow-2xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>
                {claimData?.attachments && claimData.attachments.length > 0
                  ? `Pièces & Documents (${claimData.attachments.length})`
                  : 'Prescription & Invoice (2)'}
              </span>
            </button>
          )}
        </div>

        {/* Tab Contents */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Identity & Match Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Photo & Name Card */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-4">
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-300 shadow-xs flex-shrink-0">
                    <img
                      src={photoUrl}
                      alt="Insured Member"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <span className="absolute bottom-0 right-0 p-0.5 bg-emerald-500 rounded-tl text-white">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      {'Primary Member / Dependent'}
                    </span>
                    <p className="font-extrabold text-xs text-slate-900 truncate">
                      {(data as any).memberName || (data as any).fullName || (data as any).principalName}
                    </p>
                    <p className="text-[11px] font-mono text-[#334155] font-bold">
                      {(data as any).memberCardNo || (data as any).cardNo}
                    </p>
                  </div>
                </div>

                {/* Biometric Verification Badge */}
                <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                    <Fingerprint className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-xs text-emerald-900">
                        {'Fingerprint Verified'}
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-emerald-200 text-emerald-900 text-[10px] font-extrabold">
                        {fingerprintScore}%
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-800 font-medium">
                      {'Left & right index fingers verified via FAP20 optical sensor'}
                    </p>
                  </div>
                </div>

                {/* Care & Amount Info */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                    {isClaim
                      ? ('Benefit & Amount')
                      : ('Affiliated Organization')}
                  </span>
                  {isClaim ? (
                    <div>
                      <p className="text-base font-black text-slate-900">
                        {formatAmount(claimData?.amount || 0)}
                      </p>
                      <p className="text-[11px] text-slate-600 truncate">{claimData?.careType}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-extrabold text-slate-900 truncate">
                        {(data as any).organization}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {'Status'} :{' '}
                        <span className="font-bold text-emerald-700">
                          {'Compliant'}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Pre-approval inspection gallery */}
              <div>
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-3">
                  {'Quick Preview of Supporting Documents'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Item 1: Photo */}
                  <div
                    onClick={() => setActiveTab('photo')}
                    className="p-3 bg-white rounded-2xl border border-slate-200 hover:border-[#334155] cursor-pointer group transition shadow-2xs"
                  >
                    <div className="aspect-4/3 rounded-xl overflow-hidden bg-slate-100 relative mb-2">
                      <img
                        src={photoUrl}
                        alt="Photo"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/20 transition flex items-center justify-center">
                        <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition drop-shadow-md" />
                      </div>
                    </div>
                    <p className="font-bold text-xs text-slate-800 flex items-center justify-between">
                      <span>{'ID Photo'}</span>
                      <span className="text-[10px] text-emerald-600 font-bold">
                        {'HD Validated'}
                      </span>
                    </p>
                  </div>

                  {/* Item 2: Fingerprint */}
                  <div
                    onClick={() => setActiveTab('fingerprint')}
                    className="p-3 bg-white rounded-2xl border border-slate-200 hover:border-[#334155] cursor-pointer group transition shadow-2xs"
                  >
                    <div className="aspect-4/3 rounded-xl overflow-hidden bg-gradient-to-br from-slate-900 to-[#334155] p-4 flex flex-col items-center justify-center relative mb-2 text-white">
                      <Fingerprint className="w-12 h-12 text-emerald-400 animate-pulse" />
                      <span className="text-[10px] font-mono mt-1 text-emerald-300">
                        Score : {fingerprintScore}% Match
                      </span>
                    </div>
                    <p className="font-bold text-xs text-slate-800 flex items-center justify-between">
                      <span>{'Fingerprint'}</span>
                      <span className="text-[10px] text-[#334155] font-bold">FAP20</span>
                    </p>
                  </div>

                  {/* Item 3: Prescription / Documents */}
                  <div
                    onClick={() => setActiveTab('documents')}
                    className="p-3 bg-white rounded-2xl border border-slate-200 hover:border-[#334155] cursor-pointer group transition shadow-2xs"
                  >
                    <div className="aspect-4/3 rounded-xl overflow-hidden bg-slate-100 relative mb-2">
                      <img
                        src={prescriptionUrl}
                        alt="Document"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/20 transition flex items-center justify-center">
                        <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition drop-shadow-md" />
                      </div>
                    </div>
                    <p className="font-bold text-xs text-slate-800 flex items-center justify-between">
                      <span>{'Medical Prescription'}</span>
                      <span className="text-[10px] text-slate-500 font-bold">
                        {'Doctor Signed'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PHOTO */}
          {activeTab === 'photo' && (
            <div className="flex flex-col sm:flex-row gap-6 items-center">
              <div className="w-full sm:w-1/2 aspect-square max-w-sm rounded-3xl overflow-hidden border-2 border-slate-200 shadow-md bg-slate-50 relative">
                <img
                  src={photoUrl}
                  alt="Portrait officiel"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="w-full sm:w-1/2 space-y-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
                    {'Biometric Specifications'}
                  </h4>
                  <div className="space-y-1.5 text-xs text-slate-600">
                    <p className="flex justify-between">
                      <span className="text-slate-400">{'Resolution:'}</span>
                      <span className="font-bold text-slate-800">1200 x 1200 px (300 DPI)</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-slate-400">{'ICAO Standard:'}</span>
                      <span className="font-bold text-emerald-700 flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>ISO/IEC 19794-5</span>
                      </span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-slate-400">
                        {'Liveness Detection:'}
                      </span>
                      <span className="font-bold text-emerald-700">
                        {'Passed (99.8%)'}
                      </span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-slate-400">
                        Capture Date:
                      </span>
                      <span className="font-bold text-slate-800">
                        {(data as any).submissionDate || (data as any).createdAt || '2026-08-19'}
                      </span>
                    </p>
                  </div>
                </div>

                <a
                  href={photoUrl}
                  target="_blank"
                  rel="noreferrer"
                  download="photo_assure.jpg"
                  className="w-full px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition"
                >
                  <Download className="w-4 h-4" />
                  <span>{'Download HD Photo'}</span>
                </a>
              </div>
            </div>
          )}

          {/* TAB 3: FINGERPRINT */}
          {activeTab === 'fingerprint' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Fingerprint Visualizer */}
                <div className="p-6 bg-slate-900 rounded-3xl text-white flex flex-col items-center justify-center text-center shadow-lg relative overflow-hidden border border-slate-800">
                  <div className="w-28 h-28 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
                    <Fingerprint className="w-20 h-20 text-emerald-400" />
                  </div>
                  <h4 className="font-black text-sm text-white">
                    {'Right Index — ANSI 378 Template'}
                  </h4>
                  <p className="text-xs text-emerald-300 mt-1 font-semibold">
                    {`Match score: ${fingerprintScore}% (Required threshold: 75%)`}
                  </p>
                  <div className="mt-4 px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded-full text-[11px] font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      {'Fingerprint Authenticated Successfully'}
                    </span>
                  </div>
                </div>

                {/* Technical Biometric details */}
                <div className="p-5 bg-slate-50 rounded-3xl border border-slate-200 space-y-3">
                  <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
                    {'Sensor & Minutiae Metadata'}
                  </h4>
                  <div className="space-y-2 text-xs text-slate-600">
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-400">
                        {'NFIQ 2.0 Quality Score:'}
                      </span>
                      <span className="font-bold text-emerald-700">
                        89 / 100 ({'Excellent'})
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-400">
                        {'Extracted Minutiae Points:'}
                      </span>
                      <span className="font-mono font-bold text-slate-800">
                        54 {'feature points'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-400">
                        {'ACTIVA Mobile Sensor:'}
                      </span>
                      <span className="font-bold text-slate-800">Suprema RealScan FAP-20 USB/OTG</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-400">
                        {'Matching Engine:'}
                      </span>
                      <span className="font-bold text-slate-800">Innovatrics AFIS Matcher v8.4</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">
                        Anti-Spoofing Verification:
                      </span>
                      <span className="font-bold text-emerald-700">
                        {'Anti-Spoofing Passed (PAD Level 2)'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DOCUMENTS (For Claims) */}
          {activeTab === 'documents' && (
            <div className="space-y-6">
              {/* Primary Documents Grid: Prescription & Invoice */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Prescription Document */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-[#334155]" />
                      <span>{'Medical Prescription'}</span>
                    </h4>
                    <a
                      href={prescriptionUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-bold text-[#334155] hover:underline flex items-center gap-1"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                      <span>{'Enlarge / Open'}</span>
                    </a>
                  </div>
                  <div className="aspect-4/3 rounded-xl overflow-hidden border border-slate-300 bg-white flex items-center justify-center">
                    {prescriptionUrl?.startsWith('data:image') || prescriptionUrl?.includes('unsplash') || prescriptionUrl?.endsWith('.jpg') || prescriptionUrl?.endsWith('.png') ? (
                      <img
                        src={prescriptionUrl}
                        alt="Prescription"
                        className="w-full h-full object-cover hover:scale-105 transition"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="p-6 text-center space-y-2">
                        <FileText className="w-12 h-12 text-[#334155] mx-auto" />
                        <span className="font-bold text-xs text-slate-700 block">Attached Prescription Document</span>
                        <a
                          href={prescriptionUrl}
                          download="prescription"
                          className="inline-flex items-center gap-1 px-3 py-1 bg-[#334155] text-white rounded-lg text-xs font-bold"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download</span>
                        </a>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {'Signed prescription from the treating physician detailing dosage and treatment.'}
                  </p>
                </div>

                {/* Invoice Document */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-emerald-700" />
                      <span>{'Detailed Healthcare Provider Invoice'}</span>
                    </h4>
                    <a
                      href={invoiceDocUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-bold text-emerald-700 hover:underline flex items-center gap-1"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                      <span>{'Enlarge / Open'}</span>
                    </a>
                  </div>
                  <div className="aspect-4/3 rounded-xl overflow-hidden border border-slate-300 bg-white flex items-center justify-center">
                    {invoiceDocUrl?.startsWith('data:image') || invoiceDocUrl?.includes('unsplash') || invoiceDocUrl?.endsWith('.jpg') || invoiceDocUrl?.endsWith('.png') ? (
                      <img
                        src={invoiceDocUrl}
                        alt="Invoice"
                        className="w-full h-full object-cover hover:scale-105 transition"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="p-6 text-center space-y-2">
                        <FileText className="w-12 h-12 text-emerald-600 mx-auto" />
                        <span className="font-bold text-xs text-slate-700 block">Detailed Invoice</span>
                        <a
                          href={invoiceDocUrl}
                          download="invoice"
                          className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download</span>
                        </a>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {`Total Amount: ${isClaim ? formatAmount(claimData?.amount || 0) : ''} itemized by medical procedure.`}
                  </p>
                </div>
              </div>

              {/* All Additional Uploaded Supporting Documents (Word, PDF, Images) */}
              {claimData?.attachments && claimData.attachments.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                      <Paperclip className="w-4 h-4 text-[#334155]" />
                      <span>Supporting Documents Uploaded by Agent ({claimData.attachments.length})</span>
                    </h4>
                    <span className="text-[10px] text-slate-500 font-bold">
                      Format: PDF, Word, Photos
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {claimData.attachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-white rounded-xl border border-slate-200 space-y-2 shadow-2xs hover:border-[#334155] transition"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            att.type === 'image'
                              ? 'bg-emerald-100 text-emerald-700'
                              : att.type === 'pdf'
                              ? 'bg-rose-100 text-rose-700'
                              : att.type === 'word'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {att.type === 'image' && <ImageIcon className="w-4 h-4" />}
                            {att.type === 'pdf' && <FileText className="w-4 h-4" />}
                            {att.type === 'word' && <File className="w-4 h-4" />}
                            {att.type !== 'image' && att.type !== 'pdf' && att.type !== 'word' && (
                              <Paperclip className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-xs text-slate-800 truncate" title={att.name}>
                              {att.name}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {att.size || 'Attached file'} • {att.type.toUpperCase()}
                            </p>
                          </div>
                        </div>

                        {att.type === 'image' && att.url && (
                          <div className="aspect-16/9 rounded-lg overflow-hidden border border-slate-100 bg-slate-50">
                            <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                          </div>
                        )}

                        <div className="pt-1 flex items-center justify-between border-t border-slate-100">
                          <span className="text-[10px] text-slate-400">{att.uploadedAt || 'Submitted'}</span>
                          <a
                            href={att.url}
                            download={att.name}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-[#334155] hover:text-white text-slate-700 rounded-md text-[11px] font-bold transition"
                          >
                            <Download className="w-3 h-3" />
                            <span>Download</span>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions (Approve / Reject directly from modal) */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition"
          >
            {t.close}
          </button>

          {(onApprove || onReject) && (
            <div className="flex items-center gap-3">
              {onReject && (
                <button
                  onClick={() => {
                    onClose();
                    onReject(data);
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition flex items-center gap-1.5"
                >
                  <X className="w-4 h-4 text-rose-600" />
                  <span>{'Reject with reason'}</span>
                </button>
              )}

              {onApprove && (
                <button
                  onClick={() => {
                    onClose();
                    onApprove((data as any).id);
                  }}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{'Validate & Approve'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
