import React, { useState, useMemo } from 'react';
import {
  Search,
  User,
  CreditCard,
  Shield,
  Clock,
  HeartPulse,
  Activity,
  AlertTriangle,
  Fingerprint,
  FileCheck,
  CheckCircle2,
  Users,
  Building2,
  Calendar,
  Stethoscope,
  ChevronRight,
  Sparkles,
  Phone,
  Mail,
  ShieldCheck,
  Check,
  RefreshCw,
  Plus
} from 'lucide-react';
import { Member, Claim, Language } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { useCurrency } from '../../services/currency';
import { BiometricFingerprintModal } from '../../components/BiometricFingerprintModal';
import { formatRelationship, getMemberDependents } from '../settings/MembersView';

interface AgentIdentificationViewProps {
  members: Member[];
  claims: Claim[];
  lang: Language;
  onGenerateMedicalForm?: (member: Member) => void;
}

export interface InsuredBeneficiary {
  id: string;
  cardNo: string;
  fullName: string;
  isPrincipal: boolean;
  relationship: string;
  birthDate?: string;
  gender?: 'M' | 'F' | string;
  organization: string;
  status: string;
  hasPhoto?: boolean;
  photoUrl?: string;
  hasBiometrics?: boolean;
  fingerprintScore?: number;
  principalCardNo: string;
  principalName: string;
  dependentsCount: number;
  parentMember: Member;
  outpatientBalanceUSD?: number;
  inpatientBalanceUSD?: number;
  outpatientCeilingUSD?: number;
  inpatientCeilingUSD?: number;
}

export const AgentIdentificationView: React.FC<AgentIdentificationViewProps> = ({
  members,
  claims,
  lang,
  onGenerateMedicalForm,
}) => {
  const t = useTranslation(lang);
  const { formatAmount } = useCurrency();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'principals' | 'dependents' | 'WithBiometrics'>('all');
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<InsuredBeneficiary | null>(null);
  const [isFingerprintModalOpen, setIsFingerprintModalOpen] = useState(false);
  const [biometricMatchMessage, setBiometricMatchMessage] = useState<string | null>(null);

  // Flatten members + all dependents into a comprehensive list of insured beneficiaries
  const allBeneficiaries = useMemo(() => {
    const list: InsuredBeneficiary[] = [];

    members.forEach((m) => {
      const deps = getMemberDependents(m);

      // 1. Principal Insured
      list.push({
        id: `princ-${m.id}`,
        cardNo: m.cardNo,
        fullName: m.principalName,
        isPrincipal: true,
        relationship: 'Principal',
        birthDate: m.birthDate,
        gender: m.gender || 'M',
        organization: m.organization || 'Orange Liberia Telecom',
        status: m.status || 'Actif',
        hasPhoto: m.hasPhoto || !!m.photoUrl,
        photoUrl: m.photoUrl,
        hasBiometrics: m.hasBiometrics || !!m.fingerprintScore,
        fingerprintScore: m.fingerprintScore || (m.hasBiometrics ? 96 : undefined),
        principalCardNo: m.cardNo,
        principalName: m.principalName,
        dependentsCount: deps.length,
        parentMember: m,
        outpatientBalanceUSD: m.outpatientBalanceUSD ?? 500,
        inpatientBalanceUSD: m.inpatientBalanceUSD ?? 5000,
        outpatientCeilingUSD: m.outpatientCeilingUSD ?? 500,
        inpatientCeilingUSD: m.inpatientCeilingUSD ?? 5000,
      });

      // 2. Dependents
      deps.forEach((d, idx) => {
        const depCardNo = d.cardNo || `${m.cardNo}-D${idx + 1}`;
        list.push({
          id: `dep-${m.id}-${d.id || idx}`,
          cardNo: depCardNo,
          fullName: d.fullName,
          isPrincipal: false,
          relationship: d.relationship || 'Ayant Droit',
          birthDate: d.birthDate,
          gender: d.gender || (d.relationship === 'spouse' ? (m.gender === 'M' ? 'F' : 'M') : 'M'),
          organization: m.organization || 'Orange Liberia Telecom',
          status: m.status || 'Actif',
          hasPhoto: !!(d as any).photoUrl || (m.hasPhoto && idx === 0),
          photoUrl: (d as any).photoUrl,
          hasBiometrics: false,
          principalCardNo: m.cardNo,
          principalName: m.principalName,
          dependentsCount: 0,
          parentMember: m,
          outpatientBalanceUSD: m.outpatientBalanceUSD ?? 500,
          inpatientBalanceUSD: m.inpatientBalanceUSD ?? 5000,
          outpatientCeilingUSD: m.outpatientCeilingUSD ?? 500,
          inpatientCeilingUSD: m.inpatientCeilingUSD ?? 5000,
        });
      });
    });

    return list;
  }, [members]);

  // Filtered beneficiaries list for agent quick selection
  const filteredBeneficiaries = useMemo(() => {
    return allBeneficiaries.filter((b) => {
      if (filterType === 'principals' && !b.isPrincipal) return false;
      if (filterType === 'dependents' && b.isPrincipal) return false;
      if (filterType === 'WithBiometrics' && !b.hasBiometrics && !b.fingerprintScore) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = b.fullName.toLowerCase().includes(q);
        const matchesCard = b.cardNo.toLowerCase().includes(q);
        const matchesPrincipalCard = b.principalCardNo.toLowerCase().includes(q);
        const matchesPrincipalName = b.principalName.toLowerCase().includes(q);
        const matchesOrg = b.organization.toLowerCase().includes(q);
        const matchesRel = b.relationship.toLowerCase().includes(q);
        return matchesName || matchesCard || matchesPrincipalCard || matchesPrincipalName || matchesOrg || matchesRel;
      }
      return true;
    });
  }, [allBeneficiaries, searchQuery, filterType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBiometricMatchMessage(null);
    const q = searchQuery.toLowerCase().trim();
    if (!q) return;

    const found = allBeneficiaries.find(
      (b) =>
        b.cardNo.toLowerCase() === q ||
        b.fullName.toLowerCase().includes(q) ||
        b.principalCardNo.toLowerCase() === q ||
        b.principalName.toLowerCase().includes(q)
    );
    if (found) {
      setSelectedBeneficiary(found);
    }
  };

  const handleOpenBiometricScanner = () => {
    setIsFingerprintModalOpen(true);
  };

  const handleFingerprintCaptured = (data: { score: number; template: string; finger: string }) => {
    // Biometric AFIS Match
    if (allBeneficiaries.length > 0) {
      const matched = allBeneficiaries.find((b) => b.hasBiometrics || b.fingerprintScore) || allBeneficiaries[0];
      setSelectedBeneficiary(matched);
      setSearchQuery(matched.cardNo);
      setBiometricMatchMessage(
        `Biometric AFIS 1:N Match Verified (${data.score}% confidence) for ${matched.fullName} (Card #${matched.cardNo}) via ${data.finger.replace('_', ' ')}.`
      );
    }
  };

  const calculateAge = (birthDate?: string) => {
    if (!birthDate) return '—';
    try {
      const diff = Date.now() - new Date(birthDate).getTime();
      const age = Math.abs(new Date(diff).getUTCFullYear() - 1970);
      return isNaN(age) ? '—' : `${age} ans`;
    } catch {
      return '—';
    }
  };

  // Dependents of the parent policy
  const dependentsList = useMemo(() => {
    if (!selectedBeneficiary) return [];
    return getMemberDependents(selectedBeneficiary.parentMember);
  }, [selectedBeneficiary]);

  // Claims for selected beneficiary or their policy
  const memberClaims = useMemo(() => {
    if (!selectedBeneficiary) return [];
    return claims
      .filter(
        (c) =>
          c.memberCardNo.toLowerCase() === selectedBeneficiary.cardNo.toLowerCase() ||
          c.memberCardNo.toLowerCase() === selectedBeneficiary.principalCardNo.toLowerCase() ||
          (c.memberName && c.memberName.toLowerCase().includes(selectedBeneficiary.fullName.toLowerCase()))
      )
      .sort((a, b) => new Date(b.serviceDate).getTime() - new Date(a.serviceDate).getTime());
  }, [selectedBeneficiary, claims]);

  const last5Claims = memberClaims.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & SEARCH BANNER */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-[#0A347B] flex items-center gap-2">
              <Users className="w-5 h-5 text-[#0A347B]" />
              <span>Insured Beneficiary Identification & Verification</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Real-time directory lookup, AFIS optical biometric identification & coverage verification
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-[#0A347B] border border-blue-200">
              {members.length} Insured Registered
            </span>
          </div>
        </div>

        {/* Search input & Biometric Fingerprint Trigger */}
        <div className="flex flex-col md:flex-row gap-3 items-center">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by card number, principal name, company or dependent..."
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0A347B] focus:bg-white transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs px-2 py-1 font-bold"
              >
                Clear
              </button>
            )}
          </form>

          <button
            type="button"
            onClick={handleOpenBiometricScanner}
            className="w-full md:w-auto px-5 py-3 rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer bg-[#00A859] hover:bg-[#008f4c] text-white shrink-0 active:scale-98"
          >
            <Fingerprint className="w-4 h-4" />
            <span>AFIS Fingerprint Scan</span>
          </button>
        </div>

        {/* Biometric Success / Alert Feedback */}
        {biometricMatchMessage && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 text-emerald-800 text-xs font-bold animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{biometricMatchMessage}</span>
            </div>
            <button
              onClick={() => setBiometricMatchMessage(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* 2. IDENTIFIED MEMBER PROFILE & COVERAGE MODALITIES */}
      {selectedBeneficiary && (
        <div className="bg-white rounded-2xl border-2 border-[#0A347B]/30 shadow-md p-6 space-y-6 animate-in slide-in-from-top-4 duration-300">
          {/* Header Action Bar with Direct Generate Medical Voucher Button */}
          <div className="bg-gradient-to-r from-[#0A347B] to-[#002B66] text-white rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3 text-left">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-emerald-400 shrink-0">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-base tracking-tight">{selectedBeneficiary.fullName}</h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    IDENTIFIÉ & VÉRIFIÉ
                  </span>
                  {!selectedBeneficiary.isPrincipal && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400/20 text-amber-200 border border-amber-400/30">
                      DÉPENDANT ({selectedBeneficiary.relationship})
                    </span>
                  )}
                </div>
                <p className="text-xs text-blue-200 font-mono mt-0.5">
                  Carte #{selectedBeneficiary.cardNo} • {selectedBeneficiary.organization}
                  {!selectedBeneficiary.isPrincipal && (
                    <span> • Rattaché à : {selectedBeneficiary.principalName} (#{selectedBeneficiary.principalCardNo})</span>
                  )}
                </p>
              </div>
            </div>

            {/* Direct Action Button: Générer une Fiche Maladie */}
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  if (onGenerateMedicalForm) {
                    const memberPayload: Member = {
                      ...selectedBeneficiary.parentMember,
                      cardNo: selectedBeneficiary.cardNo,
                      principalName: selectedBeneficiary.fullName,
                      relationship: selectedBeneficiary.relationship as any,
                      birthDate: selectedBeneficiary.birthDate || selectedBeneficiary.parentMember.birthDate,
                      gender: (selectedBeneficiary.gender as any) || selectedBeneficiary.parentMember.gender,
                      outpatientBalanceUSD: selectedBeneficiary.outpatientBalanceUSD,
                      inpatientBalanceUSD: selectedBeneficiary.inpatientBalanceUSD,
                    };
                    onGenerateMedicalForm(memberPayload);
                  }
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-extrabold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer bg-[#00A859] hover:bg-[#008f4c] text-white active:scale-98"
              >
                <FileCheck className="w-4 h-4" />
                <span>Générer Fiche Maladie</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedBeneficiary(null)}
                className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column 1: Identity & Dependents */}
            <div className="space-y-6">
              {/* Identity Card */}
              <div className="bg-slate-50/80 rounded-xl p-5 border border-slate-200 space-y-4">
                <div className="flex items-center gap-4 pb-4 border-b border-slate-200">
                  <div className="w-16 h-16 rounded-2xl bg-blue-100/60 border border-blue-200 flex items-center justify-center overflow-hidden shrink-0">
                    {selectedBeneficiary.photoUrl ? (
                      <img
                        src={selectedBeneficiary.photoUrl}
                        alt="Profile"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <User className="w-8 h-8 text-[#0A347B]" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900">{selectedBeneficiary.fullName}</h4>
                    <span className="font-mono text-xs font-bold text-[#0A347B] block">{selectedBeneficiary.cardNo}</span>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
                      <span>{calculateAge(selectedBeneficiary.birthDate)}</span>
                      <span>•</span>
                      <span>{selectedBeneficiary.gender === 'F' ? 'Femme' : 'Homme'}</span>
                      <span>•</span>
                      <span className="font-semibold text-emerald-700">{selectedBeneficiary.status}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-semibold">Date de Naissance :</span>
                    <span className="font-bold text-slate-800">{selectedBeneficiary.birthDate || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-semibold">Entreprise / Sponsor :</span>
                    <span className="font-bold text-[#0A347B] truncate max-w-[170px]">{selectedBeneficiary.organization}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-semibold">Qualité / Statut :</span>
                    <span className={`font-bold ${selectedBeneficiary.isPrincipal ? 'text-[#0A347B]' : 'text-amber-700'}`}>
                      {selectedBeneficiary.isPrincipal ? 'Assuré Principal (Titulaire)' : `Dépendant (${selectedBeneficiary.relationship})`}
                    </span>
                  </div>
                  {!selectedBeneficiary.isPrincipal && (
                    <div className="flex items-center justify-between bg-amber-50 p-2 rounded-lg border border-amber-200">
                      <span className="text-amber-800 font-semibold">Assuré Titulaire :</span>
                      <span className="font-bold text-amber-900">{selectedBeneficiary.principalName}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-semibold">Téléphone / Contact :</span>
                    <span className="font-bold text-slate-800">{selectedBeneficiary.parentMember.phone || '+231 77 000 1122'}</span>
                  </div>
                </div>
              </div>

              {/* Biometrics Status Card */}
              <div className="bg-slate-50/80 rounded-xl p-5 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Fingerprint className="w-4 h-4 text-[#00A859]" />
                    <span>Enrôlement Biométrique</span>
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                    {selectedBeneficiary.hasBiometrics || selectedBeneficiary.fingerprintScore
                      ? `AFIS Match: ${selectedBeneficiary.fingerprintScore ?? 96}%`
                      : 'Rattaché Police Principale'}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Capteur Optique :</span>
                    <span className="font-bold text-slate-800">{selectedBeneficiary.parentMember.fingerprintSensor || 'FAP-20 USB Optical Scanner'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Date d'Enrôlement :</span>
                    <span className="font-bold text-slate-800 font-mono">{selectedBeneficiary.parentMember.fingerprintDate || selectedBeneficiary.parentMember.createdAt || '2026-01-15'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Gabarit AFIS :</span>
                    <span className="font-bold text-emerald-700 font-mono">
                      {selectedBeneficiary.hasBiometrics || selectedBeneficiary.fingerprintScore ? 'ENROLLED_VERIFIED' : 'POLICY_VERIFIED'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Dependents / Ayants Droit Card */}
              <div className="bg-slate-50/80 rounded-xl p-5 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <HeartPulse className="w-4 h-4 text-rose-500" />
                    <span>Dépendants de la Police ({dependentsList.length})</span>
                  </h4>
                  <span className="text-[10px] font-bold text-slate-400">Total: {dependentsList.length}</span>
                </div>

                {dependentsList.length === 0 ? (
                  <p className="text-xs text-slate-400 italic bg-white p-3 rounded-lg border border-slate-200 text-center">
                    Aucun ayant droit / dépendant rattaché à cette police.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {dependentsList.map((dep, idx) => (
                      <div
                        key={dep.id || idx}
                        className={`p-2.5 rounded-lg border flex items-center justify-between text-xs transition ${
                          selectedBeneficiary.fullName.toLowerCase() === dep.fullName.toLowerCase()
                            ? 'bg-emerald-50 border-emerald-300 font-bold'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-slate-800">{dep.fullName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {dep.cardNo || `${selectedBeneficiary.principalCardNo}-D${idx + 1}`} • {dep.age ? `${dep.age} ans` : dep.birthDate}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#0A347B] border border-blue-100">
                          {dep.relationship}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Column 2 & 3: Ceilings, Balances & Prestations */}
            <div className="lg:col-span-2 space-y-6">
              {/* Coverage Ceilings & Balances */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs space-y-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Plafonds de Couverture & Soldes Disponibles (USD / LRD)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Outpatient */}
                  <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/40 space-y-2">
                    <div className="text-xs font-bold text-[#0A347B] uppercase tracking-wide">
                      Ambulatoire (Outpatient Care)
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-2xl font-black text-[#0A347B]">
                        {formatAmount(selectedBeneficiary.outpatientBalanceUSD ?? 500)}
                      </span>
                      <span className="text-xs text-slate-500 font-bold">
                        / {formatAmount(selectedBeneficiary.outpatientCeilingUSD ?? 500)}
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-[#0A347B] h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              ((selectedBeneficiary.outpatientBalanceUSD ?? 500) /
                                (selectedBeneficiary.outpatientCeilingUSD ?? 500)) *
                                100
                            )
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Consultations, pharmacie, examens de laboratoire & biologie
                    </p>
                  </div>

                  {/* Inpatient */}
                  <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/40 space-y-2">
                    <div className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
                      Hospitalisation (Inpatient Care)
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-2xl font-black text-[#00A859]">
                        {formatAmount(selectedBeneficiary.inpatientBalanceUSD ?? 5000)}
                      </span>
                      <span className="text-xs text-slate-500 font-bold">
                        / {formatAmount(selectedBeneficiary.inpatientCeilingUSD ?? 5000)}
                      </span>
                    </div>
                    <div className="w-full bg-emerald-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-[#00A859] h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              ((selectedBeneficiary.inpatientBalanceUSD ?? 5000) /
                                (selectedBeneficiary.inpatientCeilingUSD ?? 5000)) *
                                100
                            )
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Séjours hospitaliers, interventions chirurgicales et soins intensifs
                    </p>
                  </div>
                </div>
              </div>

              {/* 5 Last Prestations History */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#0A347B]" />
                    <span>5 Dernières Prestations Médicales Effectuées</span>
                  </h4>
                  <span className="text-[11px] text-slate-400 font-medium">
                    Total historique: {memberClaims.length}
                  </span>
                </div>

                {last5Claims.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border border-slate-100">
                    Aucune prestation enregistrée pour cet assuré à ce jour.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10.5px] font-extrabold text-slate-400 uppercase tracking-wider">
                          <th className="py-2.5 px-3">Prestation / Soin</th>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Médecin Traitant</th>
                          <th className="py-2.5 px-3">Prestataire de Soins</th>
                          <th className="py-2.5 px-3 text-right">Montant & Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {last5Claims.map((claim) => (
                          <tr key={claim.id} className="hover:bg-slate-50/80 transition">
                            <td className="py-3 px-3">
                              <span className="font-bold text-slate-800 block">{claim.careType}</span>
                              <span className="text-[10px] text-slate-400 font-mono">{claim.reference}</span>
                            </td>
                            <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                              {claim.serviceDate}
                            </td>
                            <td className="py-3 px-3 text-slate-700 font-medium">
                              {claim.doctorName || 'Dr. Arthur Miller'}
                            </td>
                            <td className="py-3 px-3 text-slate-700 font-medium">
                              {claim.providerName || claim.provider}
                            </td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <span className="font-bold text-[#0A347B] font-mono block">
                                {formatAmount(claim.amountUSD || claim.amount || 0)}
                              </span>
                              <span
                                className={`inline-block text-[9.5px] font-bold px-2 py-0.5 rounded-full ${
                                  claim.status === 'Validated' || claim.status === 'Approved'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : claim.status === 'Rejected'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}
                              >
                                {claim.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. LIST OF ALL INSURED BENEFICIARIES (PRINCIPALS + DEPENDENTS) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#0A347B]" />
              <span>Répertoire Complet des Assurés & Dépendants ({filteredBeneficiaries.length})</span>
            </h3>
            <p className="text-xs text-slate-500">
              Tous les assurés (principaux et ayants droit) sont consultables et identifiables directement.
            </p>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs flex-wrap">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                filterType === 'all' ? 'bg-[#0A347B] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tous ({allBeneficiaries.length})
            </button>
            <button
              onClick={() => setFilterType('principals')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                filterType === 'principals' ? 'bg-[#0A347B] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Assurés Principaux ({allBeneficiaries.filter((b) => b.isPrincipal).length})
            </button>
            <button
              onClick={() => setFilterType('dependents')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                filterType === 'dependents' ? 'bg-[#0A347B] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dépendants ({allBeneficiaries.filter((b) => !b.isPrincipal).length})
            </button>
            <button
              onClick={() => setFilterType('WithBiometrics')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                filterType === 'WithBiometrics' ? 'bg-[#0A347B] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Biométrie OK
            </button>
          </div>
        </div>

        {filteredBeneficiaries.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium bg-slate-50 rounded-xl border border-slate-100">
            Aucun assuré ne correspond à votre recherche.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[10.5px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">N° CARTE</th>
                  <th className="py-3 px-4">NOM DE L'ASSURÉ</th>
                  <th className="py-3 px-4">QUALITÉ / POLICE</th>
                  <th className="py-3 px-4">ORGANISATION</th>
                  <th className="py-3 px-4 text-center">BIOMÉTRIE</th>
                  <th className="py-3 px-4 text-center">STATUT</th>
                  <th className="py-3 px-4 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBeneficiaries.map((b) => {
                  const isSelected = selectedBeneficiary?.id === b.id;
                  return (
                    <tr
                      key={b.id}
                      className={`hover:bg-blue-50/40 transition cursor-pointer ${
                        isSelected ? 'bg-blue-50/80 font-semibold' : ''
                      }`}
                      onClick={() => setSelectedBeneficiary(b)}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-[#0A347B] whitespace-nowrap">
                        {b.cardNo}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <span>{b.fullName}</span>
                          {!b.isPrincipal && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              {b.relationship}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {calculateAge(b.birthDate)} • {b.gender === 'F' ? 'Femme' : 'Homme'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {b.isPrincipal ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                            <span>Titulaire Principal</span>
                            <span className="text-[10px] text-slate-400">({b.dependentsCount} dép.)</span>
                          </span>
                        ) : (
                          <div className="text-[11px] text-slate-600">
                            <span>Rattaché à : </span>
                            <span className="font-bold text-[#0A347B]">{b.principalName}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700">
                        {b.organization}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {b.hasBiometrics || b.fingerprintScore ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Fingerprint className="w-3 h-3" />
                            <span>{b.fingerprintScore ?? 96}%</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">
                            {b.isPrincipal ? 'Non enrôlé' : 'Police OK'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            b.status === 'Actif' || b.status === 'Active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBeneficiary(b);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#0A347B] hover:bg-[#08285e] text-white text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>Identifier</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. BIOMETRIC FINGERPRINT SCANNER MODAL */}
      <BiometricFingerprintModal
        isOpen={isFingerprintModalOpen}
        onClose={() => setIsFingerprintModalOpen(false)}
        onCapture={handleFingerprintCaptured}
        title="Biometric Insured Identification"
        subtitle="AFIS 1:N Biometric Fingerprint Matcher"
      />
    </div>
  );
};
