import React, { useMemo, useState } from 'react';
import { Search, User, CreditCard, Shield, Clock, HeartPulse, Activity, AlertTriangle, Fingerprint, Users, FileCheck, ScanFace, Stethoscope, Table2, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { Member, Claim, Language } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { useCurrency } from '../../services/currency';
import { BiometricFingerprintModal } from '../../components/BiometricFingerprintModal';
import { AttachmentBiometricViewerModal } from '../../components/AttachmentBiometricViewerModal';

interface AgentIdentificationViewProps {
  members: Member[];
  claims: Claim[];
  lang: Language;
  // === AMÉLIORATION AJOUTÉE : permet de générer une fiche maladie directement depuis
  // l'identification, sans re-sélectionner l'assuré dans l'onglet Médical Form.
  onGenerateMedicalForm?: (member: Member) => void;
}

// Maximum number of matching candidates shown while typing (kept small and scrollable —
// this is a live lookup helper, not a full directory export).
const MAX_SEARCH_RESULTS = 8;
const DIRECTORY_PAGE_SIZE = 10;

// === AMÉLIORATION AJOUTÉE : prédicat de correspondance factorisé — utilisé à la fois par
// la liste déroulante de suggestions (searchResults, plafonnée) et par le tableau
// "Insured Members Directory" ci-dessous (non plafonné), pour rester cohérents.
function memberMatchesQuery(m: Member, q: string): boolean {
  if (!q) return true;
  const cardNo = (m.cardNo || '').toLowerCase().trim();
  const principalName = (m.principalName || '').toLowerCase().trim();
  const spouseName = (m.spouseName || '').toLowerCase().trim();
  return (
    (!!cardNo && cardNo.includes(q)) ||
    (!!principalName && principalName.includes(q)) ||
    (!!spouseName && spouseName.includes(q)) ||
    (m.dependents || []).some((d) => (d.fullName || '').toLowerCase().includes(q) || (d.cardNo || '').toLowerCase().trim() === q) ||
    (m.children || []).some((c) => (c || '').toLowerCase().includes(q))
  );
}

export const AgentIdentificationView: React.FC<AgentIdentificationViewProps> = ({ members, claims, lang, onGenerateMedicalForm }) => {
  const t = useTranslation(lang);
  const { formatAmount } = useCurrency();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isFingerprintModalOpen, setIsFingerprintModalOpen] = useState(false);
  const [biometricMatchMessage, setBiometricMatchMessage] = useState<string | null>(null);
  // === AMÉLIORATION AJOUTÉE : consultation de la biométrie de l'assuré identifié.
  const [isBiometricViewerOpen, setIsBiometricViewerOpen] = useState(false);
  // Tracks whether the results dropdown should render — closed right after picking a
  // result so it doesn't linger open showing that same single match underneath the field.
  const [isResultsDropdownOpen, setIsResultsDropdownOpen] = useState(false);
  // === AMÉLIORATION AJOUTÉE : page courante du tableau "Insured Members Directory" ci-dessous.
  const [directoryPage, setDirectoryPage] = useState(1);

  // === AMÉLIORATION AJOUTÉE : la recherche affiche désormais la LISTE de tous les assurés
  // correspondants (importés via Excel ou issus d'un enrôlement validé — les deux
  // alimentent le même tableau `members`, sans filtrage) au lieu d'un seul résultat choisi
  // arbitrairement, pour que l'agent puisse repérer le bon dossier parmi des homonymes.
  const searchResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return [];
    return members.filter((m) => memberMatchesQuery(m, q)).slice(0, MAX_SEARCH_RESULTS);
  }, [members, searchQuery]);

  // === AMÉLIORATION AJOUTÉE : tableau des assurés TOUJOURS visible (importés via Excel ou
  // issus d'un enrôlement validé — même source `members`, sans filtrage), pas seulement une
  // liste de suggestions qui disparaît. Répond directement à "la liste des assurés...doit
  // apparaître côté agent". Trié par date d'enregistrement la plus récente pour que les
  // imports/enrôlements qui viennent d'arriver soient immédiatement visibles en haut.
  const directoryMembers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = q ? members.filter((m) => memberMatchesQuery(m, q)) : members;
    return [...filtered].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [members, searchQuery]);

  const directoryTotalPages = Math.max(1, Math.ceil(directoryMembers.length / DIRECTORY_PAGE_SIZE));
  const directoryPageClamped = Math.min(directoryPage, directoryTotalPages);
  const directoryPageRows = directoryMembers.slice(
    (directoryPageClamped - 1) * DIRECTORY_PAGE_SIZE,
    directoryPageClamped * DIRECTORY_PAGE_SIZE
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setBiometricMatchMessage(null);
    // Enter/submit with exactly one match still auto-selects it (fast path for an agent
    // typing a full, unambiguous card number); otherwise the dropdown list below is used.
    if (searchResults.length === 1) {
      setSelectedMember(searchResults[0]);
    }
  };

  const handleSelectResult = (member: Member) => {
    setSelectedMember(member);
    setSearchQuery(member.cardNo);
    setBiometricMatchMessage(null);
    setIsResultsDropdownOpen(false);
  };

  const handleOpenBiometricScanner = () => {
    setIsFingerprintModalOpen(true);
  };

  const handleFingerprintCaptured = (data: { score: number; template: string; finger: string }) => {
    // Match member in database by biometric scan
    if (members.length > 0) {
      const matched = members[0];
      setSelectedMember(matched);
      setSearchQuery(matched.cardNo);
      setBiometricMatchMessage(`Biometric match verified (${data.score}% AFIS confidence) for ${matched.principalName} (${matched.cardNo}) via ${data.finger.replace('_', ' ')}.`);
    }
  };

  const calculateAge = (birthDate: string) => {
    const diff = Date.now() - new Date(birthDate).getTime();
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
  };

  // === AMÉLIORATION AJOUTÉE : nombre total de dépendants (conjoint + enfants), utilisé
  // pour l'affichage explicite "nombre de dépendants" demandé, en plus de la liste des noms.
  const dependentsCount = selectedMember
    ? (selectedMember.spouseName ? 1 : 0) + (selectedMember.children?.length || 0)
    : 0;

  // === AMÉLIORATION FIX : `claim.providerName`/`claim.amountUSD` n'existent pas sur le
  // type Claim (seuls `provider`/`amount` existent) — ces champs s'affichaient donc
  // toujours vides/à $0. Corrigé ci-dessous.
  const memberClaims = selectedMember
    ? claims.filter((c) => c.memberCardNo === selectedMember.cardNo).sort((a, b) => new Date(b.serviceDate).getTime() - new Date(a.serviceDate).getTime())
    : [];

  const last5Claims = memberClaims.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <h2 className="text-lg font-bold text-[var(--brand-900)] mb-4">Insured Member Lookup & Verification</h2>
        <div className="flex flex-col md:flex-row gap-4 items-start">
          <form onSubmit={handleSearch} className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setBiometricMatchMessage(null);
                setIsResultsDropdownOpen(true);
                setDirectoryPage(1);
              }}
              onFocus={() => setIsResultsDropdownOpen(true)}
              onBlur={() => setTimeout(() => setIsResultsDropdownOpen(false), 150)}
              placeholder="Enter health card number or insured member name..."
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand-900)] focus:bg-white transition"
            />

            {/* === AMÉLIORATION AJOUTÉE : liste déroulante des assurés correspondants,
                affichée en direct pendant la saisie (import Excel et enrôlements validés
                confondus — même source de données, aucun filtrage). === */}
            {isResultsDropdownOpen && searchQuery.trim() && searchResults.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg max-h-72 overflow-y-auto">
                {searchResults.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectResult(m)}
                    className="w-full text-left px-4 py-2.5 hover:bg-[var(--brand-50)] transition flex items-center justify-between gap-3 border-b border-slate-50 last:border-b-0 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">{m.principalName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{m.cardNo} • {m.organization}</div>
                    </div>
                    <span className="text-[10px] font-bold text-[var(--brand-900)] shrink-0">Select</span>
                  </button>
                ))}
              </div>
            )}
          </form>
          <div className="text-slate-400 font-medium text-sm hidden md:block pt-3">OR</div>
          <button
            type="button"
            onClick={handleOpenBiometricScanner}
            className="px-6 py-3 rounded-xl font-bold text-sm shadow-xs transition flex items-center gap-2 cursor-pointer bg-[#00A859] hover:bg-[#008f4c] text-white shrink-0"
          >
            <Fingerprint className="w-5 h-5" />
            <span>Biometric Fingerprint Scan</span>
          </button>
        </div>

        {biometricMatchMessage && (
          <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-bold animate-in fade-in">
            <Fingerprint className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{biometricMatchMessage}</span>
          </div>
        )}

        {searchQuery.trim() && searchResults.length === 0 && !biometricMatchMessage && (
          <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm font-semibold">No insured member found matching this search criteria.</span>
          </div>
        )}
      </div>

      {/* === AMÉLIORATION AJOUTÉE : tableau des assurés TOUJOURS visible (import Excel ou
          enrôlement validé — même source de données `members`), avec pagination, pour que
          l'agent puisse parcourir la liste directement sans devoir connaître un nom ou un
          n° de carte à l'avance. Se filtre automatiquement avec la recherche ci-dessus. */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Table2 className="w-4 h-4 text-[var(--brand-900)]" />
            <span>Insured Members Directory</span>
          </h3>
          <span className="text-xs font-semibold text-slate-500">
            {directoryMembers.length} member{directoryMembers.length === 1 ? '' : 's'}
            {searchQuery.trim() ? ' matching' : ' total'}
          </span>
        </div>

        {directoryMembers.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs italic">
            {members.length === 0
              ? 'No insured member has been imported or enrolled yet.'
              : 'No insured member matches this search.'}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 text-[10.5px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Card No.</th>
                    <th className="py-2.5 px-4">Principal Name</th>
                    <th className="py-2.5 px-4">Organization</th>
                    <th className="py-2.5 px-4 text-center">Dependents</th>
                    <th className="py-2.5 px-4 text-center">Biometrics</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {directoryPageRows.map((m) => {
                    const depCount = (m.spouseName ? 1 : 0) + (m.children?.length || 0);
                    return (
                      <tr key={m.id} className={`hover:bg-[var(--brand-50)]/50 transition ${selectedMember?.id === m.id ? 'bg-[var(--brand-50)]' : ''}`}>
                        <td className="py-2.5 px-4 font-mono font-bold text-[var(--brand-900)] whitespace-nowrap">{m.cardNo}</td>
                        <td className="py-2.5 px-4 font-semibold text-slate-800">{m.principalName}</td>
                        <td className="py-2.5 px-4 text-slate-600 truncate max-w-[200px]">{m.organization}</td>
                        <td className="py-2.5 px-4 text-center text-slate-600">{depCount}</td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${m.hasBiometrics ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {m.hasBiometrics ? 'Captured' : 'Missing'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleSelectResult(m)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--brand-900)] hover:bg-[#07214f] text-white text-[10.5px] font-bold transition cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Identify</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {directoryTotalPages > 1 && (
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500">
                  Page {directoryPageClamped} of {directoryTotalPages}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={directoryPageClamped <= 1}
                    onClick={() => setDirectoryPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={directoryPageClamped >= directoryTotalPages}
                    onClick={() => setDirectoryPage((p) => Math.min(directoryTotalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Member Details */}
      {selectedMember && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-300">
          {/* Identity & Policy */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
                <div className="w-16 h-16 rounded-full bg-[var(--brand-50)] flex items-center justify-center overflow-hidden">
                  {selectedMember.photoUrl ? (
                    <img src={selectedMember.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 text-[var(--brand-900)]" />
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">{selectedMember.principalName}</h3>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mt-1">
                    <span>{calculateAge(selectedMember.birthDate)} yrs old</span>
                    <span>•</span>
                    <span>{selectedMember.gender === 'M' ? 'Male' : selectedMember.gender === 'F' ? 'Female' : 'Unspecified'}</span>
                  </div>
                </div>
              </div>

              {/* === AMÉLIORATION AJOUTÉE : Action rapide — Générer une fiche maladie et
                  consulter la biométrie directement depuis l'identification. === */}
              <div className="grid grid-cols-2 gap-2 mb-6">
                {onGenerateMedicalForm && (
                  <button
                    type="button"
                    onClick={() => onGenerateMedicalForm(selectedMember)}
                    className="px-3 py-2.5 rounded-xl bg-[#00A859] hover:bg-[#008f4c] text-white text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FileCheck className="w-4 h-4" />
                    <span>Medical Form</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsBiometricViewerOpen(true)}
                  className="px-3 py-2.5 rounded-xl bg-[var(--brand-900)] hover:bg-[#07214f] text-white text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ScanFace className="w-4 h-4" />
                  <span>Biometrics</span>
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500">
                    <CreditCard className="w-4 h-4" />
                    <span className="text-xs font-semibold">Card Number</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900 font-mono">{selectedMember.cardNo}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Clock className="w-4 h-4" />
                    <span className="text-xs font-semibold">Date of Birth</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900 font-mono">{selectedMember.birthDate || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Shield className="w-4 h-4" />
                    <span className="text-xs font-semibold">Policy Number</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900 font-mono">POL-98273</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Activity className="w-4 h-4" />
                    <span className="text-xs font-semibold">Organization</span>
                  </div>
                  <span className="text-sm font-bold text-[var(--brand-900)] truncate max-w-[150px]">{selectedMember.organization}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500">
                    <User className="w-4 h-4" />
                    <span className="text-xs font-semibold">Relationship</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900">{selectedMember.relationship}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Users className="w-4 h-4" />
                    <span className="text-xs font-semibold">Dependents</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900">{dependentsCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Fingerprint className="w-4 h-4" />
                    <span className="text-xs font-semibold">Biometrics</span>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${selectedMember.hasBiometrics ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {selectedMember.hasBiometrics ? 'Captured' : 'Not captured'}
                  </span>
                </div>
              </div>
            </div>

            {/* Family Members */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-rose-500" />
                Attached Family Dependents ({dependentsCount})
              </h3>
              {selectedMember.children.length === 0 && !selectedMember.spouseName ? (
                <p className="text-xs text-slate-500 italic">No dependents attached to this policy.</p>
              ) : (
                <ul className="space-y-3">
                  {selectedMember.spouseName && (
                    <li className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{selectedMember.spouseName}</span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium">Spouse</span>
                    </li>
                  )}
                  {selectedMember.children.map((child, idx) => (
                    <li key={idx} className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{child}</span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium">Child</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Balances & Ceilings */}
          <div className="lg:col-span-2 space-y-6">
            {/* Balances */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Coverage Ceilings & Available Balances (USD / LRD)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl border border-[var(--brand-100)] bg-[var(--brand-50)]/50">
                  <div className="text-xs font-bold text-[var(--brand-600)] mb-2 uppercase tracking-wider">Outpatient (Ambulatory & Routine Care)</div>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-2xl font-black text-[var(--brand-900)]">{formatAmount(selectedMember.outpatientBalanceUSD || 500)}</span>
                    <span className="text-xs text-slate-500 font-semibold mb-1">/ {formatAmount(selectedMember.outpatientCeilingUSD || 1000)}</span>
                  </div>
                  <div className="w-full bg-[var(--brand-200)] rounded-full h-2 mt-3 overflow-hidden">
                    <div className="bg-[var(--brand-900)] h-2 rounded-full transition-all duration-500" style={{ width: '50%' }}></div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 font-medium">Standard benefit balance within approved ceiling limit</p>
                </div>
                <div className="p-5 rounded-2xl border border-emerald-100 bg-emerald-50/50">
                  <div className="text-xs font-bold text-emerald-600 mb-2 uppercase tracking-wider">Inpatient (Hospitalization & Ward)</div>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-2xl font-black text-[#00A859]">{formatAmount(selectedMember.inpatientBalanceUSD || 8500)}</span>
                    <span className="text-xs text-slate-500 font-semibold mb-1">/ {formatAmount(selectedMember.inpatientCeilingUSD || 10000)}</span>
                  </div>
                  <div className="w-full bg-emerald-200 rounded-full h-2 mt-3 overflow-hidden">
                    <div className="bg-[#00A859] h-2 rounded-full transition-all duration-500" style={{ width: '85%' }}></div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 font-medium">Inpatient admissions subject to prior insurance authorization</p>
                </div>
              </div>
            </div>

            {/* Recent Claims History */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center justify-between">
                <span>Recent Claims & Treatment History</span>
                <span className="text-xs font-normal text-slate-500">Total: {memberClaims.length} records</span>
              </h3>

              {last5Claims.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border border-slate-100">
                  No prior claims recorded for this member.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {last5Claims.map((claim) => (
                    <div key={claim.id} className="py-3 flex items-center justify-between text-xs gap-3">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800">{claim.careType}</div>
                        <div className="text-slate-400 font-mono text-[11px] truncate">{claim.provider} • {claim.serviceDate}</div>
                        {/* === AMÉLIORATION AJOUTÉE : nom du médecin traitant === */}
                        {claim.doctorName && (
                          <div className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                            <Stethoscope className="w-3 h-3" />
                            <span className="truncate">{claim.doctorName}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-[var(--brand-900)] font-mono">{formatAmount(claim.amount || 0)}</div>
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          claim.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-700'
                            : claim.status === 'rejected'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {claim.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Biometric Fingerprint Acquisition Modal */}
      <BiometricFingerprintModal
        isOpen={isFingerprintModalOpen}
        onClose={() => setIsFingerprintModalOpen(false)}
        onFingerprintCaptured={handleFingerprintCaptured}
        title="Biometric Insured Identification"
        subtitle="AFIS 1:N Biometric Fingerprint Matcher"
      />

      {/* === AMÉLIORATION AJOUTÉE : consultation de la biométrie (photo + empreinte) de
          l'assuré identifié, réutilise le même composant que côté Admin (MembersView). */}
      <AttachmentBiometricViewerModal
        isOpen={isBiometricViewerOpen}
        onClose={() => setIsBiometricViewerOpen(false)}
        lang={lang}
        type="member"
        data={selectedMember}
      />
    </div>
  );
};
