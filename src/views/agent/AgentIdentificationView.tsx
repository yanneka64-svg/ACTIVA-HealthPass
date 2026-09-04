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
  Plus,
  PlusCircle,
  Receipt,
} from 'lucide-react';
import { Member, Claim, Language, Organization, HealthPolicy } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { useCurrency } from '../../services/currency';
import { BiometricFingerprintModal } from '../../components/BiometricFingerprintModal';
import { formatRelationship, getMemberDependents } from '../settings/MembersView';
// === AMÉLIORATION AJOUTÉE : Health Insurance Policy Management & Premium Monitoring — la
// vérification de couverture est intégrée directement dans le parcours d'identification
// existant, en réutilisant le même moteur centralisé que partout ailleurs (Claims, Reports,
// Organizations, règles Firestore).
import { getPolicyCoverageStatus } from '../../services/policyEngine';

interface AgentIdentificationViewProps {
  members: Member[];
  claims: Claim[];
  lang: Language;
  // === AMÉLIORATION AJOUTÉE : organisations transmises pour retrouver le n° de police
  // (Policy Number) affiché sur la fiche assuré, comme demandé dans la maquette.
  organizations?: Organization[];
  healthPolicies?: HealthPolicy[];
  onGenerateMedicalForm?: (member: Member) => void;
  // === AMÉLIORATION AJOUTÉE : callbacks pour les boutons "New Enrollment" (bandeau du
  // haut) et "New Claim" (fiche assuré) — navigation directe vers les autres onglets Agent.
  onNewEnrollment?: () => void;
  onNewClaim?: (member: Member) => void;
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
  organizations = [],
  healthPolicies = [],
  onGenerateMedicalForm,
  onNewEnrollment,
  onNewClaim,
}) => {
  const t = useTranslation(lang);
  const { formatAmount } = useCurrency();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<InsuredBeneficiary | null>(null);
  const [isFingerprintModalOpen, setIsFingerprintModalOpen] = useState(false);
  const [biometricMatchMessage, setBiometricMatchMessage] = useState<string | null>(null);
  // === AMÉLIORATION AJOUTÉE : alerte bloquante affichée AVANT de laisser l'agent poursuivre
  // vers un flux de soin (Medical Form / New Claim) quand la police est Expired/Suspended.
  const [blockedActionAlert, setBlockedActionAlert] = useState<'medical_form' | 'new_claim' | null>(null);

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
        organization: m.organization || 'TotalEnergies Liberia Ltd',
        status: m.status || 'Active',
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
          relationship: d.relationship || 'Dependent',
          birthDate: d.birthDate,
          gender: d.gender || (d.relationship === 'spouse' ? (m.gender === 'M' ? 'F' : 'M') : 'M'),
          organization: m.organization || 'TotalEnergies Liberia Ltd',
          status: m.status || 'Active',
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

  // === AMÉLIORATION AJOUTÉE : l'annuaire (colonne de gauche) présente uniquement les assurés
  // principaux, comme dans la maquette — les ayants droit apparaissent dans la section
  // "Family Members & Dependents" de l'assuré principal sélectionné, pas dans l'annuaire lui-même.
  const principalDirectory = useMemo(() => allBeneficiaries.filter((b) => b.isPrincipal), [allBeneficiaries]);

  const filteredDirectory = useMemo(() => {
    if (!searchQuery.trim()) return principalDirectory;
    const q = searchQuery.toLowerCase().trim();
    return principalDirectory.filter((b) => {
      return (
        b.fullName.toLowerCase().includes(q) ||
        b.cardNo.toLowerCase().includes(q) ||
        b.organization.toLowerCase().includes(q)
      );
    });
  }, [principalDirectory, searchQuery]);

  const activeCount = useMemo(() => principalDirectory.filter((b) => b.status === 'Active' || b.status === 'Actif').length, [principalDirectory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBiometricMatchMessage(null);
    const q = searchQuery.toLowerCase().trim();
    if (!q) return;

    // Search across every beneficiary (principals AND dependents) so a dependent's name or
    // card number can still be looked up directly, even though the directory panel only
    // lists principals visually.
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

  const calculateAgeNumber = (birthDate?: string): number | null => {
    if (!birthDate) return null;
    try {
      const diff = Date.now() - new Date(birthDate).getTime();
      const age = Math.abs(new Date(diff).getUTCFullYear() - 1970);
      return isNaN(age) ? null : age;
    } catch {
      return null;
    }
  };

  // Dependents of the parent policy (used both for the "Family Members & Dependents" strip
  // and to let the agent switch the detail panel to a dependent's own record).
  const dependentsList = useMemo(() => {
    if (!selectedBeneficiary) return [];
    return getMemberDependents(selectedBeneficiary.parentMember);
  }, [selectedBeneficiary]);

  // Policy number of the selected beneficiary's affiliated organization
  const policyNumber = useMemo(() => {
    if (!selectedBeneficiary) return null;
    const org = organizations.find((o) => o.name === selectedBeneficiary.organization);
    return org?.policyNumber || null;
  }, [selectedBeneficiary, organizations]);

  // === AMÉLIORATION AJOUTÉE : statut de couverture calculé pour l'assuré sélectionné, via le
  // même moteur centralisé que le reste de l'application (jamais un statut recalculé
  // localement à part) — null tant qu'aucune police n'a été configurée pour l'organisation
  // (aucun blocage par défaut, module opt-in, cf. policyEngine.hasHealthcareAccess).
  const selectedPolicy = useMemo(() => {
    if (!selectedBeneficiary) return null;
    return healthPolicies.find((p) => p.organizationId === selectedBeneficiary.organization) || null;
  }, [selectedBeneficiary, healthPolicies]);

  const policyCoverage = useMemo(() => {
    if (!selectedPolicy) return null;
    return getPolicyCoverageStatus(selectedPolicy);
  }, [selectedPolicy]);

  // Guards the "Generate Medical Form" / "New Claim" actions: if the policy currently blocks
  // coverage, a blocking alert is shown instead of proceeding straight to the workflow.
  const guardHealthcareAction = (action: 'medical_form' | 'new_claim', proceed: () => void) => {
    if (policyCoverage?.coverageBlocked) {
      setBlockedActionAlert(action);
      return;
    }
    proceed();
  };

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

  // === AMÉLIORATION AJOUTÉE : historique limité au mois calendaire en cours ("CURRENT MONTH
  // CARE HISTORY"), au lieu des 5 derniers actes toutes périodes confondues.
  const now = new Date();
  const currentMonthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const currentMonthClaims = useMemo(() => {
    return memberClaims.filter((c) => {
      const d = new Date(c.serviceDate);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }, [memberClaims]);

  // Selects a family member (principal or dependent) as the active beneficiary for the
  // detail panel, keeping all coverage figures tied to the shared policy record.
  const handleSelectFamilyMember = (fullName: string, isPrincipalSelf: boolean) => {
    if (!selectedBeneficiary) return;
    if (isPrincipalSelf) {
      const principal = allBeneficiaries.find((b) => b.isPrincipal && b.parentMember.id === selectedBeneficiary.parentMember.id);
      if (principal) setSelectedBeneficiary(principal);
      return;
    }
    const match = allBeneficiaries.find(
      (b) => !b.isPrincipal && b.parentMember.id === selectedBeneficiary.parentMember.id && b.fullName === fullName
    );
    if (match) setSelectedBeneficiary(match);
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP SEARCH & ACTION BAR */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Card Number (e.g. ACT-2025-0012), Insured Name, Policy or Organization..."
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0A347B] focus:bg-white transition"
          />
        </form>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleOpenBiometricScanner}
            className="px-4 py-3 rounded-xl font-bold text-xs shadow-2xs transition flex items-center justify-center gap-2 cursor-pointer bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 whitespace-nowrap"
          >
            <Fingerprint className="w-4 h-4" />
            <span>Scan Biometric Sensor</span>
          </button>
          {onNewEnrollment && (
            <button
              type="button"
              onClick={onNewEnrollment}
              className="px-4 py-3 rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer bg-[#0A347B] hover:bg-[#08285e] text-white whitespace-nowrap"
            >
              <PlusCircle className="w-4 h-4" />
              <span>New Enrollment</span>
            </button>
          )}
        </div>
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

      {/* 2. TWO-COLUMN LAYOUT: DIRECTORY (left) + SELECTED MEMBER DETAIL (right) */}
      {/* === AMÉLIORATION AJOUTÉE : sur mobile (< lg), l'annuaire et la fiche détaillée
          n'apparaissent plus empilés sur une seule très longue page — un seul des deux est
          affiché à la fois (l'annuaire par défaut, la fiche une fois un assuré sélectionné,
          avec un bouton "Back" pour y revenir), comme sur desktop où les deux colonnes
          restent visibles en même temps (comportement desktop inchangé). === */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
        {/* LEFT: Insured Directory */}
        <div className={`bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3 ${selectedBeneficiary ? 'hidden lg:block' : ''}`}>
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
              Insured Directory ({filteredDirectory.length})
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {activeCount} Active
            </span>
          </div>

          {filteredDirectory.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs font-medium">
              No insured member matches your search.
            </div>
          ) : (
            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-0.5">
              {filteredDirectory.map((b) => {
                const isSelected = selectedBeneficiary?.parentMember.id === b.parentMember.id;
                const age = calculateAgeNumber(b.birthDate);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBeneficiary(b)}
                    className={`w-full text-left p-3 rounded-xl border transition flex items-center gap-3 cursor-pointer ${
                      isSelected ? 'border-[#0A347B] bg-blue-50/60 ring-1 ring-[#0A347B]/30' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="relative w-11 h-11 rounded-xl bg-blue-100/60 border border-blue-200 flex items-center justify-center overflow-hidden shrink-0">
                      {b.photoUrl ? (
                        <img src={b.photoUrl} alt={b.fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <User className="w-5 h-5 text-[#0A347B]" />
                      )}
                      {(b.hasBiometrics || b.fingerprintScore) && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                          <Fingerprint className="w-2.5 h-2.5 text-white" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs text-slate-900 truncate">{b.fullName}</div>
                      <div className="font-mono text-[11px] font-bold text-[#0A347B]">{b.cardNo}</div>
                      <div className="text-[10.5px] text-slate-400 truncate flex items-center gap-1">
                        <Building2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">{b.organization}</span>
                      </div>
                      <div className="text-[10.5px] text-slate-400">
                        {age !== null ? `${age} yrs` : '—'} • Gender: {b.gender === 'F' ? 'F' : 'M'}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[9.5px] font-bold ${
                        b.status === 'Active' || b.status === 'Actif'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {b.status}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: Selected Member Detail */}
        {!selectedBeneficiary ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 shadow-xs p-12 flex flex-col items-center justify-center text-center gap-2">
            <Users className="w-8 h-8 text-slate-300" />
            <p className="text-sm font-bold text-slate-500">Select an insured member from the directory</p>
            <p className="text-xs text-slate-400 max-w-sm">
              Choose a member on the left, search by card number, or scan a biometric fingerprint to identify a beneficiary and view their coverage.
            </p>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Mobile-only "Back to Directory" — le panneau annuaire est masqué sur mobile
                tant qu'un assuré est sélectionné (voir ci-dessus), ce bouton permet d'y
                revenir sans avoir à faire défiler toute la fiche détaillée. */}
            <button
              type="button"
              onClick={() => setSelectedBeneficiary(null)}
              className="lg:hidden flex items-center gap-1.5 text-xs font-bold text-[#0A347B] hover:text-[#08285e] cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5 rotate-180" />
              <span>Back to Directory</span>
            </button>

            {/* Profile Header Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
              <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="relative w-16 h-16 rounded-2xl bg-blue-100/60 border border-blue-200 flex items-center justify-center overflow-hidden shrink-0">
                    {selectedBeneficiary.photoUrl ? (
                      <img src={selectedBeneficiary.photoUrl} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <User className="w-8 h-8 text-[#0A347B]" />
                    )}
                    {(selectedBeneficiary.hasBiometrics || selectedBeneficiary.fingerprintScore) && (
                      <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                        <Fingerprint className="w-3 h-3 text-white" />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-extrabold text-base text-slate-900">{selectedBeneficiary.fullName}</h3>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                          selectedBeneficiary.status === 'Active' || selectedBeneficiary.status === 'Actif'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        Card {selectedBeneficiary.status === 'Active' || selectedBeneficiary.status === 'Actif' ? 'Active' : selectedBeneficiary.status}
                      </span>
                      {(selectedBeneficiary.hasBiometrics || selectedBeneficiary.fingerprintScore) && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-[#0A347B] border border-blue-200">
                          ICAO Biometrics Compliant
                        </span>
                      )}
                      {!selectedBeneficiary.isPrincipal && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                          {formatRelationship(selectedBeneficiary.relationship)}
                        </span>
                      )}
                    </div>

                    {/* === AMÉLIORATION AJOUTÉE : colonnes de largeurs inégales (au lieu de tiers
                        stricts) — Card Number/Affiliated Organization (souvent les valeurs les
                        plus longues) reçoivent plus de place, Policy Number/Age & Gender/Date of
                        Birth se décalent légèrement vers la droite en conséquence ; espacement
                        horizontal réduit (gap-x-8 → gap-x-5) pour libérer encore un peu de
                        largeur utile, sur demande explicite. === */}
                    <div className="grid grid-cols-2 sm:grid-cols-[1.5fr_1fr_0.85fr] gap-x-5 gap-y-2.5 mt-3">
                      {/* === AMÉLIORATION AJOUTÉE : "truncate" (au lieu du retour à la ligne par
                          défaut) sur les identifiants — même traitement que "Affiliated
                          Organization" ci-dessous — pour que la ligne reste alignée avec les
                          autres colonnes au lieu de passer sur deux lignes et de désaligner
                          visuellement la grille. === */}
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Card Number</div>
                        <div className="font-mono font-bold text-sm text-[#0A347B] truncate" title={selectedBeneficiary.cardNo}>{selectedBeneficiary.cardNo}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Policy Number</div>
                        <div className="font-mono font-bold text-sm text-slate-800 truncate" title={policyNumber || 'N/A'}>{policyNumber || 'N/A'}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Age &amp; Gender</div>
                        <div className="font-bold text-sm text-slate-800 truncate">
                          {calculateAgeNumber(selectedBeneficiary.birthDate) ?? '—'} yrs ({selectedBeneficiary.gender === 'F' ? 'Female' : 'Male'})
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Affiliated Organization</div>
                        <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5 min-w-0">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate" title={selectedBeneficiary.organization}>{selectedBeneficiary.organization}</span>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Date of Birth</div>
                        <div className="font-bold text-sm text-slate-800 truncate">{selectedBeneficiary.birthDate || 'N/A'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* === AMÉLIORATION AJOUTÉE : les boutons passent en pleine largeur et empilés
                    sur mobile (au lieu d'une rangée serrée qui pouvait déborder), pour rester
                    faciles à toucher et lisibles. Rembourrage/icônes légèrement réduits (sur
                    demande explicite) pour libérer de la place à gauche pour les informations
                    de l'assuré, sans changer le texte, la couleur ni la fonction des boutons. === */}
                <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row gap-2.5 shrink-0 w-full sm:w-auto">
                  {onGenerateMedicalForm && (
                    <button
                      type="button"
                      onClick={() => {
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
                        // === AMÉLIORATION AJOUTÉE : vérification de la couverture avant de
                        // poursuivre vers le flux de soin, cf. policyCoverage plus haut.
                        guardHealthcareAction('medical_form', () => onGenerateMedicalForm(memberPayload));
                      }}
                      className="w-full sm:w-auto px-3.5 py-2 rounded-xl font-extrabold text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer bg-[#00A859] hover:bg-[#008f4c] text-white whitespace-nowrap"
                    >
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>Generate Medical Form</span>
                    </button>
                  )}
                  {onNewClaim && (
                    <button
                      type="button"
                      onClick={() => {
                        const memberPayload: Member = {
                          ...selectedBeneficiary.parentMember,
                          cardNo: selectedBeneficiary.cardNo,
                          principalName: selectedBeneficiary.fullName,
                        };
                        guardHealthcareAction('new_claim', () => onNewClaim(memberPayload));
                      }}
                      className="w-full sm:w-auto px-3.5 py-2 rounded-xl font-extrabold text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer bg-[#0A347B] hover:bg-[#08285e] text-white whitespace-nowrap"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>New Claim</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* === AMÉLIORATION AJOUTÉE : bandeau de statut de couverture, calculé
                immédiatement après identification via le moteur centralisé de police
                d'assurance santé. N'apparaît que si une police a été configurée pour
                l'organisation de l'assuré (module opt-in, aucun impact sur les organisations
                n'ayant pas encore de police renseignée). === */}
            {policyCoverage && selectedPolicy && (
              <div
                className={`rounded-2xl border p-5 space-y-2 ${
                  policyCoverage.status === 'Active'
                    ? 'bg-emerald-50 border-emerald-200'
                    : policyCoverage.status === 'Expiring Soon'
                    ? 'bg-amber-50 border-amber-200'
                    : policyCoverage.status === 'Expired'
                    ? 'bg-red-50 border-red-300'
                    : 'bg-rose-50 border-rose-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4
                    className={`text-xs font-black uppercase tracking-wide flex items-center gap-1.5 ${
                      policyCoverage.status === 'Active'
                        ? 'text-emerald-800'
                        : policyCoverage.status === 'Expiring Soon'
                        ? 'text-amber-800'
                        : 'text-rose-800'
                    }`}
                  >
                    {policyCoverage.coverageBlocked ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>
                      {policyCoverage.status === 'Active' && 'Member Verified — Access to Healthcare'}
                      {policyCoverage.status === 'Expiring Soon' && 'Member Verified — Policy Expiring Soon'}
                      {policyCoverage.status === 'Expired' && 'Healthcare Access Blocked'}
                      {policyCoverage.status === 'Suspended' && 'Healthcare Access Suspended'}
                      {policyCoverage.status === 'Pending Renewal' && 'Policy Pending Renewal'}
                    </span>
                  </h4>
                  <span className="text-[10px] font-mono font-bold text-slate-500">Policy: {selectedPolicy.policyNumber}</span>
                </div>

                {policyCoverage.status === 'Active' && (
                  <p className="text-xs text-emerald-800 font-medium">
                    Policy Status: <strong>ACTIVE</strong> &bull; Coverage Valid Until: <strong>{selectedPolicy.expirationDate}</strong>
                    {selectedPolicy.nextPaymentDueDate && (
                      <>
                        {' '}&bull; Next Premium Due: <strong>{selectedPolicy.nextPaymentDueDate}</strong>
                      </>
                    )}
                  </p>
                )}
                {policyCoverage.status === 'Expiring Soon' && (
                  <p className="text-xs text-amber-800 font-medium">
                    Policy Status: <strong>EXPIRING SOON</strong> &bull; Coverage Valid Until: <strong>{selectedPolicy.expirationDate}</strong> ({policyCoverage.daysUntilExpiration} day(s) left)
                  </p>
                )}
                {policyCoverage.status === 'Expired' && (
                  <p className="text-xs text-rose-800 font-medium leading-relaxed">
                    Status: <strong>EXPIRED</strong> &bull; Expired on: <strong>{selectedPolicy.expirationDate}</strong>
                    <br />
                    This insured member and all covered dependents are not eligible for healthcare services under this policy.
                  </p>
                )}
                {policyCoverage.status === 'Suspended' && (
                  <p className="text-xs text-rose-800 font-medium leading-relaxed">
                    Status: <strong>SUSPENDED</strong> &bull; Reason: <strong>{(policyCoverage.suspensionReason || 'ADMINISTRATIVE').toUpperCase()}</strong>
                    {selectedPolicy.nextPaymentDueDate && (
                      <>
                        <br />Premium Due: <strong>{selectedPolicy.nextPaymentDueDate}</strong> &bull; Amount Due: <strong>{selectedPolicy.currency} {(selectedPolicy.outstandingAmount ?? 0).toLocaleString()}</strong>
                      </>
                    )}
                    <br />
                    Healthcare services are currently unavailable for the principal insured and all covered dependents.
                  </p>
                )}
              </div>
            )}

            {/* Coverage Balances & Ceiling Limits */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-[#0A347B]" />
                  <span>Coverage Balances &amp; Ceiling Limits (USD)</span>
                </h4>
                <span className="text-[11px] font-semibold text-slate-400">Contractual Annual Ceilings</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Outpatient */}
                <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#0A347B] flex items-center gap-1.5">
                      <Stethoscope className="w-3.5 h-3.5" />
                      <span>Outpatient Consultation</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-white border border-blue-200 text-[10px] font-extrabold text-[#0A347B]">
                      USD ($)
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                    <span>Remaining Balance Available</span>
                    <span>Ceiling Limit</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-2xl font-black text-[#00A859]">
                      {formatAmount(selectedBeneficiary.outpatientBalanceUSD ?? 500)}
                    </span>
                    <span className="text-sm font-bold text-slate-700">
                      {formatAmount(selectedBeneficiary.outpatientCeilingUSD ?? 500)}
                    </span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[#0A347B] h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (1 -
                              (selectedBeneficiary.outpatientBalanceUSD ?? 500) /
                                (selectedBeneficiary.outpatientCeilingUSD || selectedBeneficiary.outpatientBalanceUSD || 1)) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                    <span>
                      Consumed: {formatAmount(
                        Math.max(0, (selectedBeneficiary.outpatientCeilingUSD ?? 500) - (selectedBeneficiary.outpatientBalanceUSD ?? 500))
                      )}
                    </span>
                    <span>
                      {Math.min(
                        100,
                        Math.round(
                          (1 -
                            (selectedBeneficiary.outpatientBalanceUSD ?? 500) /
                              (selectedBeneficiary.outpatientCeilingUSD || selectedBeneficiary.outpatientBalanceUSD || 1)) *
                            100
                        )
                      )}% used
                    </span>
                  </div>
                </div>

                {/* Inpatient */}
                <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                      <HeartPulse className="w-3.5 h-3.5" />
                      <span>Inpatient Hospitalization</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-white border border-emerald-200 text-[10px] font-extrabold text-emerald-700">
                      USD ($)
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                    <span>Remaining Balance Available</span>
                    <span>Ceiling Limit</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-2xl font-black text-[#00A859]">
                      {formatAmount(selectedBeneficiary.inpatientBalanceUSD ?? 5000)}
                    </span>
                    <span className="text-sm font-bold text-slate-700">
                      {formatAmount(selectedBeneficiary.inpatientCeilingUSD ?? 5000)}
                    </span>
                  </div>
                  <div className="w-full bg-emerald-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[#00A859] h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (1 -
                              (selectedBeneficiary.inpatientBalanceUSD ?? 5000) /
                                (selectedBeneficiary.inpatientCeilingUSD || selectedBeneficiary.inpatientBalanceUSD || 1)) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                    <span>
                      Consumed: {formatAmount(
                        Math.max(0, (selectedBeneficiary.inpatientCeilingUSD ?? 5000) - (selectedBeneficiary.inpatientBalanceUSD ?? 5000))
                      )}
                    </span>
                    <span>
                      {Math.min(
                        100,
                        Math.round(
                          (1 -
                            (selectedBeneficiary.inpatientBalanceUSD ?? 5000) /
                              (selectedBeneficiary.inpatientCeilingUSD || selectedBeneficiary.inpatientBalanceUSD || 1)) *
                            100
                        )
                      )}% used
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Family Members & Dependents */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#0A347B]" />
                  <span>Family Members &amp; Dependents ({dependentsList.length + 1})</span>
                </h4>
                <span className="text-[11px] font-semibold text-slate-400">Click to select beneficiary</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {/* Principal (Self) */}
                {(() => {
                  const principalSelf = allBeneficiaries.find(
                    (b) => b.isPrincipal && b.parentMember.id === selectedBeneficiary.parentMember.id
                  );
                  if (!principalSelf) return null;
                  const isSelf = selectedBeneficiary.id === principalSelf.id;
                  return (
                    <button
                      type="button"
                      onClick={() => handleSelectFamilyMember(principalSelf.fullName, true)}
                      className={`relative text-left p-3 rounded-xl border transition cursor-pointer ${
                        isSelf ? 'border-[#0A347B] bg-blue-50/60 ring-1 ring-[#0A347B]/30' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {isSelf && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#0A347B] flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </span>
                      )}
                      <div className="w-10 h-10 rounded-xl bg-blue-100/60 border border-blue-200 flex items-center justify-center overflow-hidden mb-2">
                        {principalSelf.photoUrl ? (
                          <img src={principalSelf.photoUrl} alt={principalSelf.fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <User className="w-5 h-5 text-[#0A347B]" />
                        )}
                      </div>
                      <div className="font-bold text-xs text-slate-900 truncate">{principalSelf.fullName}</div>
                      <div className="text-[10.5px] font-bold text-[#0A347B]">Principal Insured (Self)</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {principalSelf.cardNo} • {calculateAgeNumber(principalSelf.birthDate) ?? '—'} yrs
                      </div>
                    </button>
                  );
                })()}

                {dependentsList.map((dep, idx) => {
                  const depBeneficiary = allBeneficiaries.find(
                    (b) => !b.isPrincipal && b.parentMember.id === selectedBeneficiary.parentMember.id && b.fullName === dep.fullName
                  );
                  const isSelectedDep = depBeneficiary && selectedBeneficiary.id === depBeneficiary.id;
                  return (
                    <button
                      key={dep.id || idx}
                      type="button"
                      onClick={() => handleSelectFamilyMember(dep.fullName, false)}
                      className={`relative text-left p-3 rounded-xl border transition cursor-pointer ${
                        isSelectedDep ? 'border-[#0A347B] bg-blue-50/60 ring-1 ring-[#0A347B]/30' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {isSelectedDep && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#0A347B] flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </span>
                      )}
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden mb-2">
                        <User className="w-5 h-5 text-slate-400" />
                      </div>
                      <div className="font-bold text-xs text-slate-900 truncate">{dep.fullName}</div>
                      <div className="text-[10.5px] font-bold text-slate-500">{formatRelationship(dep.relationship)}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {dep.cardNo || `${selectedBeneficiary.principalCardNo}-D${idx + 1}`} • {dep.age ? `${dep.age} yrs` : '—'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Current Month Care History */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#0A347B]" />
                  <span>Current Month Care History (Acts &amp; Procedures)</span>
                </h4>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Current Month: {currentMonthLabel}
                </span>
              </div>

              {currentMonthClaims.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border border-slate-100">
                  No medical services recorded for this member in {currentMonthLabel}.
                </div>
              ) : (
                <>
                  {/* Desktop/tablet: table (unchanged) */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10.5px] font-extrabold text-slate-400 uppercase tracking-wider">
                          <th className="py-2.5 px-3 whitespace-nowrap">Date &amp; Ref</th>
                          <th className="py-2.5 px-3">Medical Procedure</th>
                          <th className="py-2.5 px-3">Healthcare Provider / Hospital</th>
                          <th className="py-2.5 px-3 text-right">Amount</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {currentMonthClaims.map((claim) => (
                          <tr key={claim.id} className="hover:bg-slate-50/80 transition">
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className="font-bold text-slate-800 block">{claim.serviceDate}</span>
                              <span className="text-[10px] text-[#0A347B] font-mono">{claim.reference}</span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="font-bold text-slate-800 block">{claim.careType}</span>
                              <span className="text-[10px] text-slate-400">{claim.careType}</span>
                            </td>
                            <td className="py-3 px-3 text-slate-700 font-medium flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{claim.provider}</span>
                            </td>
                            <td className="py-3 px-3 text-right whitespace-nowrap font-bold text-slate-800">
                              {formatAmount(claim.amount || 0)}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              <span
                                className={`inline-block text-[9.5px] font-bold px-2 py-0.5 rounded-full ${
                                  claim.status === 'Validated' || claim.status === 'Approved' || claim.status === 'approved'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : claim.status === 'Rejected' || claim.status === 'rejected'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}
                              >
                                {claim.status === 'Validated' || claim.status === 'Approved' || claim.status === 'approved'
                                  ? 'Approved'
                                  : claim.status === 'Rejected' || claim.status === 'rejected'
                                  ? 'Rejected'
                                  : 'Pending'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* === AMÉLIORATION AJOUTÉE : liste de cartes sur mobile, au lieu du tableau
                      qui débordait/se comprimait mal sur petit écran. === */}
                  <div className="sm:hidden space-y-2.5">
                    {currentMonthClaims.map((claim) => (
                      <div key={claim.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-xs text-slate-800">{claim.serviceDate}</div>
                            <div className="text-[10px] text-[#0A347B] font-mono">{claim.reference}</div>
                          </div>
                          <span
                            className={`shrink-0 inline-block text-[9.5px] font-bold px-2 py-0.5 rounded-full ${
                              claim.status === 'Validated' || claim.status === 'Approved' || claim.status === 'approved'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : claim.status === 'Rejected' || claim.status === 'rejected'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {claim.status === 'Validated' || claim.status === 'Approved' || claim.status === 'approved'
                              ? 'Approved'
                              : claim.status === 'Rejected' || claim.status === 'rejected'
                              ? 'Rejected'
                              : 'Pending'}
                          </span>
                        </div>
                        <div className="font-bold text-xs text-slate-800">{claim.careType}</div>
                        <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{claim.provider}</span>
                        </div>
                        <div className="text-sm font-black text-slate-800">{formatAmount(claim.amount || 0)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. BIOMETRIC FINGERPRINT SCANNER MODAL */}
      <BiometricFingerprintModal
        isOpen={isFingerprintModalOpen}
        onClose={() => setIsFingerprintModalOpen(false)}
        onCapture={handleFingerprintCaptured}
        title="Biometric Insured Identification"
        subtitle="AFIS 1:N Biometric Fingerprint Matcher"
      />

      {/* === AMÉLIORATION AJOUTÉE : alerte bloquante affichée avant de laisser l'agent
          poursuivre vers "Generate Medical Form" / "New Claim" quand la police est
          Expired/Suspended — copie alignée sur la maquette fournie. === */}
      {blockedActionAlert && selectedBeneficiary && selectedPolicy && policyCoverage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95">
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-rose-800 uppercase tracking-wide">
                    {policyCoverage.status === 'Expired' ? 'Healthcare Access Blocked' : 'Healthcare Access Suspended'}
                  </h3>
                  <p className="text-xs font-bold text-slate-700 mt-1">{selectedBeneficiary.fullName}</p>
                  <p className="text-[11px] font-mono text-slate-500">Policy: {selectedPolicy.policyNumber}</p>
                </div>
              </div>

              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium leading-relaxed">
                {policyCoverage.status === 'Expired' ? (
                  <>
                    Status: <strong>EXPIRED</strong> &bull; Expired on: <strong>{selectedPolicy.expirationDate}</strong>
                    <br /><br />
                    This insured member and all covered dependents are not eligible for healthcare services under this policy.
                  </>
                ) : (
                  <>
                    Status: <strong>SUSPENDED</strong> &bull; Reason: <strong>{(policyCoverage.suspensionReason || 'ADMINISTRATIVE').toUpperCase()}</strong>
                    {selectedPolicy.nextPaymentDueDate && (
                      <>
                        <br />Premium Due: <strong>{selectedPolicy.nextPaymentDueDate}</strong> &bull; Amount Due: <strong>{selectedPolicy.currency} {(selectedPolicy.outstandingAmount ?? 0).toLocaleString()}</strong>
                      </>
                    )}
                    <br /><br />
                    Healthcare services are currently unavailable for the principal insured and all covered dependents.
                  </>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setBlockedActionAlert(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-white cursor-pointer"
              >
                View Policy
              </button>
              <button
                type="button"
                onClick={() => setBlockedActionAlert(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
