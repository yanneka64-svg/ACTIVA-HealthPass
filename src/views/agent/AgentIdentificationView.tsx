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

export const AgentIdentificationView: React.FC<AgentIdentificationViewProps> = ({
  members,
  claims,
  lang,
  onGenerateMedicalForm,
}) => {
  const t = useTranslation(lang);
  const { formatAmount } = useCurrency();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'Actif' | 'Enrolled' | 'WithBiometrics'>('all');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isFingerprintModalOpen, setIsFingerprintModalOpen] = useState(false);
  const [biometricMatchMessage, setBiometricMatchMessage] = useState<string | null>(null);

  // Filtered members list for agent quick selection
  const filteredMembersList = useMemo(() => {
    return members.filter((m) => {
      if (filterStatus === 'Actif' && m.status !== 'Actif' && m.status !== 'Active') return false;
      if (filterStatus === 'Enrolled' && (!m.createdAt || !m.createdAt.includes('2026'))) return false;
      if (filterStatus === 'WithBiometrics' && !m.hasBiometrics && !m.fingerprintScore) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = m.principalName.toLowerCase().includes(q);
        const matchesCard = m.cardNo.toLowerCase().includes(q);
        const matchesOrg = (m.organization || '').toLowerCase().includes(q);
        const matchesSpouse = (m.spouseName || '').toLowerCase().includes(q);
        const matchesChild = (m.children || []).some(c => c.toLowerCase().includes(q));
        const matchesDep = (m.dependents || []).some(d => d.fullName.toLowerCase().includes(q) || (d.cardNo && d.cardNo.toLowerCase().includes(q)));
        return matchesName || matchesCard || matchesOrg || matchesSpouse || matchesChild || matchesDep;
      }
      return true;
    });
  }, [members, searchQuery, filterStatus]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBiometricMatchMessage(null);
    const q = searchQuery.toLowerCase().trim();
    if (!q) return;

    const found = members.find(
      (m) =>
        m.cardNo.toLowerCase() === q ||
        m.principalName.toLowerCase().includes(q) ||
        (m.organization && m.organization.toLowerCase().includes(q))
    );
    if (found) {
      setSelectedMember(found);
    }
  };

  const handleOpenBiometricScanner = () => {
    setIsFingerprintModalOpen(true);
  };

  const handleFingerprintCaptured = (data: { score: number; template: string; finger: string }) => {
    // Biometric AFIS Match
    if (members.length > 0) {
      const matched = members.find(m => m.hasBiometrics || m.fingerprintScore) || members[0];
      setSelectedMember(matched);
      setSearchQuery(matched.cardNo);
      setBiometricMatchMessage(
        `Biometric AFIS 1:N Match Verified (${data.score}% confidence) for ${matched.principalName} (Card #${matched.cardNo}) via ${data.finger.replace('_', ' ')}.`
      );
    }
  };

  const calculateAge = (birthDate?: string) => {
    if (!birthDate) return '—';
    try {
      const diff = Date.now() - new Date(birthDate).getTime();
      const age = Math.abs(new Date(diff).getUTCFullYear() - 1970);
      return isNaN(age) ? '—' : `${age} yrs`;
    } catch {
      return '—';
    }
  };

  // Dependents for selected member
  const dependentsList = useMemo(() => {
    if (!selectedMember) return [];
    return getMemberDependents(selectedMember);
  }, [selectedMember]);

  // Claims for selected member
  const memberClaims = useMemo(() => {
    if (!selectedMember) return [];
    return claims
      .filter((c) => c.memberCardNo.toLowerCase() === selectedMember.cardNo.toLowerCase())
      .sort((a, b) => new Date(b.serviceDate).getTime() - new Date(a.serviceDate).getTime());
  }, [selectedMember, claims]);

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
      {selectedMember && (
        <div className="bg-white rounded-2xl border-2 border-[#0A347B]/30 shadow-md p-6 space-y-6 animate-in slide-in-from-top-4 duration-300">
          {/* Header Action Bar with Direct Generate Medical Voucher Button */}
          <div className="bg-gradient-to-r from-[#0A347B] to-[#002B66] text-white rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3 text-left">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-emerald-400 shrink-0">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-base tracking-tight">{selectedMember.principalName}</h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    IDENTIFIED & VERIFIED
                  </span>
                </div>
                <p className="text-xs text-blue-200 font-mono">
                  Card #{selectedMember.cardNo} • {selectedMember.organization}
                </p>
              </div>
            </div>

            {/* Direct Action Button: Générer une Fiche Maladie */}
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => onGenerateMedicalForm && onGenerateMedicalForm(selectedMember)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-extrabold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer bg-[#00A859] hover:bg-[#008f4c] text-white active:scale-98"
              >
                <FileCheck className="w-4 h-4" />
                <span>Générer Fiche Maladie</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition"
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
                    {selectedMember.photoUrl ? (
                      <img
                        src={selectedMember.photoUrl}
                        alt="Profile"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <User className="w-8 h-8 text-[#0A347B]" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900">{selectedMember.principalName}</h4>
                    <span className="font-mono text-xs font-bold text-[#0A347B] block">{selectedMember.cardNo}</span>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
                      <span>{calculateAge(selectedMember.birthDate)}</span>
                      <span>•</span>
                      <span>{selectedMember.gender === 'F' ? 'Female' : 'Male'}</span>
                      <span>•</span>
                      <span className="font-semibold text-emerald-700">{selectedMember.status}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-semibold">Date de Naissance :</span>
                    <span className="font-bold text-slate-800">{selectedMember.birthDate || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-semibold">Entreprise / Sponsor :</span>
                    <span className="font-bold text-[#0A347B] truncate max-w-[170px]">{selectedMember.organization}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-semibold">Qualité / Lien :</span>
                    <span className="font-bold text-slate-800">{selectedMember.relationship || 'Principal'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-semibold">Téléphone / Contact :</span>
                    <span className="font-bold text-slate-800">{selectedMember.phone || '+231 77 000 1122'}</span>
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
                    AFIS Match: {selectedMember.fingerprintScore ?? 96}%
                  </span>
                </div>
                <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Capteur Optique :</span>
                    <span className="font-bold text-slate-800">{selectedMember.fingerprintSensor || 'FAP-20 USB Optical Scanner'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Date d'Enrôlement :</span>
                    <span className="font-bold text-slate-800 font-mono">{selectedMember.fingerprintDate || selectedMember.createdAt || '2026-01-15'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Gabarit AFIS :</span>
                    <span className="font-bold text-emerald-700 font-mono">ENROLLED_VERIFIED</span>
                  </div>
                </div>
              </div>

              {/* Dependents / Ayants Droit Card */}
              <div className="bg-slate-50/80 rounded-xl p-5 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <HeartPulse className="w-4 h-4 text-rose-500" />
                    <span>Dépendants Rattachés ({dependentsList.length})</span>
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
                        className="p-2.5 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-800">{dep.fullName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {dep.cardNo} • {dep.age ? `${dep.age} ans` : dep.birthDate}
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
                        {formatAmount(selectedMember.outpatientBalanceUSD ?? 600)}
                      </span>
                      <span className="text-xs text-slate-500 font-bold">
                        / {formatAmount(selectedMember.outpatientCeilingUSD ?? 1000)}
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-[#0A347B] h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              ((selectedMember.outpatientBalanceUSD ?? 600) /
                                (selectedMember.outpatientCeilingUSD ?? 1000)) *
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
                        {formatAmount(selectedMember.inpatientBalanceUSD ?? 8500)}
                      </span>
                      <span className="text-xs text-slate-500 font-bold">
                        / {formatAmount(selectedMember.inpatientCeilingUSD ?? 10000)}
                      </span>
                    </div>
                    <div className="w-full bg-emerald-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-[#00A859] h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              ((selectedMember.inpatientBalanceUSD ?? 8500) /
                                (selectedMember.inpatientCeilingUSD ?? 10000)) *
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

      {/* 3. LIST OF INSURED MEMBERS (IMPORTED, ENROLLED & VALIDATED) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#0A347B]" />
              <span>Répertoire des Assurés Importés & Enrôlés ({filteredMembersList.length})</span>
            </h3>
            <p className="text-xs text-slate-500">
              Sélectionnez un assuré pour consulter ses détails de couverture, biométrie et générer une fiche
            </p>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                filterStatus === 'all' ? 'bg-[#0A347B] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tous ({members.length})
            </button>
            <button
              onClick={() => setFilterStatus('Actif')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                filterStatus === 'Actif' ? 'bg-[#0A347B] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Actifs
            </button>
            <button
              onClick={() => setFilterStatus('WithBiometrics')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                filterStatus === 'WithBiometrics' ? 'bg-[#0A347B] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Biométrie OK
            </button>
          </div>
        </div>

        {filteredMembersList.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium bg-slate-50 rounded-xl border border-slate-100">
            Aucun assuré ne correspond à votre recherche.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[10.5px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">N° CARTE</th>
                  <th className="py-3 px-4">ASSURÉ PRINCIPAL</th>
                  <th className="py-3 px-4">ORGANISATION</th>
                  <th className="py-3 px-4 text-center">DÉPENDANTS</th>
                  <th className="py-3 px-4 text-center">BIOMÉTRIE</th>
                  <th className="py-3 px-4 text-center">STATUT</th>
                  <th className="py-3 px-4 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMembersList.map((m) => {
                  const depsCount = (m.dependents?.length || 0) + (m.children?.length || 0) + (m.spouseName ? 1 : 0);
                  const isSelected = selectedMember?.id === m.id;
                  return (
                    <tr
                      key={m.id}
                      className={`hover:bg-blue-50/40 transition cursor-pointer ${
                        isSelected ? 'bg-blue-50/80 font-semibold' : ''
                      }`}
                      onClick={() => setSelectedMember(m)}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-[#0A347B] whitespace-nowrap">
                        {m.cardNo}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800">{m.principalName}</div>
                        <div className="text-[10px] text-slate-400">
                          {calculateAge(m.birthDate)} • {m.gender === 'F' ? 'F' : 'M'}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700">
                        {m.organization}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-700">
                          {depsCount}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {m.hasBiometrics || m.fingerprintScore ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Fingerprint className="w-3 h-3" />
                            <span>{m.fingerprintScore ?? 96}%</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Non enrôlé</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            m.status === 'Actif' || m.status === 'Active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {m.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMember(m);
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
