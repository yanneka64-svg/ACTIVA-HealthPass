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
// === AMÉLIORATION AJOUTÉE : visuel de carte membre — voir MemberIdCard.tsx pour le détail.
import { MemberIdCard } from '../../modules/membercard/MemberIdCard';

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

// === AMÉLIORATION AJOUTÉE : jauge circulaire réutilisable pour "Coverage Balances & Ceiling
// Limits" (2026-09-10, refonte de page "Proposition B" choisie par l'utilisateur). Affiche
// exactement les mêmes valeurs que l'ancienne barre de progression linéaire (même pourcentage,
// même solde/plafond déjà formatés en amont via formatAmount) — seul le rendu visuel change,
// pour un format plus lisible en un coup d'œil dans la grille dense à droite de la page.
const CircularGauge: React.FC<{
  label: string;
  icon: React.ReactNode;
  ringColor: string;
  balanceLabel: string;
  ceilingLabel: string;
  consumedLabel: string;
  usedPct: number;
  unitLabel: string;
  // === AMÉLIORATION AJOUTÉE : libellés traduits en props optionnelles (repli en anglais si
  // non fournis) pour ne rien changer au comportement existant.
  remainingBalanceText?: string;
  ofText?: string;
  ceilingSuffixText?: string;
  consumedText?: string;
  usedText?: string;
}> = ({
  label,
  icon,
  ringColor,
  balanceLabel,
  ceilingLabel,
  consumedLabel,
  usedPct,
  unitLabel,
  remainingBalanceText = 'Remaining Balance',
  ofText = 'of',
  ceilingSuffixText = 'ceiling',
  consumedText = 'Consumed:',
  usedText = 'used',
}) => {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c - (usedPct / 100) * c;
  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5" style={{ color: ringColor }}>
          {icon}
          <span>{label}</span>
        </span>
        <span
          className="px-2 py-0.5 rounded-md bg-white border text-[10px] font-extrabold"
          style={{ borderColor: ringColor, color: ringColor }}
        >
          {unitLabel}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative w-[78px] h-[78px] shrink-0">
          <svg width="78" height="78" viewBox="0 0 84 84">
            <circle cx="42" cy="42" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
            <circle
              cx="42"
              cy="42"
              r={r}
              fill="none"
              stroke={ringColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={offset}
              transform="rotate(-90 42 42)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-black text-slate-800">{usedPct}%</span>
            <span className="text-[8px] font-bold text-slate-400 uppercase">{usedText}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{remainingBalanceText}</div>
          <div className="text-lg font-black text-[#00A859] truncate">{balanceLabel}</div>
          <div className="text-[10.5px] text-slate-500 font-medium truncate">{ofText} {ceilingLabel} {ceilingSuffixText}</div>
        </div>
      </div>
      <div className="text-[10.5px] text-slate-500 font-medium pt-1 border-t border-slate-100">
        {consumedText} <span className="font-bold text-slate-700">{consumedLabel}</span>
      </div>
    </div>
  );
};

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
        t.agentId.biometricMatchTemplate
          .replace('{score}', String(data.score))
          .replace('{name}', matched.fullName)
          .replace('{cardNo}', matched.cardNo)
          .replace('{finger}', data.finger.replace('_', ' '))
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
  const currentMonthLabel = now.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' });
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
            placeholder={t.agentId.searchPlaceholder}
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
            <span>{t.agentId.scanBiometric}</span>
          </button>
          {onNewEnrollment && (
            <button
              type="button"
              onClick={onNewEnrollment}
              className="px-4 py-3 rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer bg-[#0A347B] hover:bg-[#08285e] text-white whitespace-nowrap"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{t.agentId.newEnrollment}</span>
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
            {t.agentId.dismiss}
          </button>
        </div>
      )}

      {/* 2. TWO-COLUMN LAYOUT: DIRECTORY (left) + SELECTED MEMBER DETAIL (right) */}
      {/* === AMÉLIORATION AJOUTÉE : sur mobile (< lg), l'annuaire (liste des assurés) n'est plus
          affiché du tout, même avant sélection — précision explicite de l'utilisateur (2026-09-10) :
          plus aucune liste d'assurés parcourable sur mobile, côté Agent. Le champ de recherche et
          le scan biométrique du bandeau du haut restent pleinement fonctionnels pour retrouver un
          assuré précis (voir handleSearchSubmit/handleOpenBiometricScanner) — seule la LISTE
          parcourable disparaît. Annuaire inchangé à partir de `lg`. === */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
        {/* LEFT: Insured Directory — hidden below lg regardless of selection (mobile: search/biometric only) */}
        <div className="hidden lg:block bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
              {t.agentId.insuredDirectory} ({filteredDirectory.length})
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {activeCount} {t.active}
            </span>
          </div>

          {filteredDirectory.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs font-medium">
              {t.agentId.noSearchMatch}
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
                        {age !== null ? `${age} ${t.agentId.ageUnit}` : '—'} • {t.agentId.genderLabel} {b.gender === 'F' ? 'F' : 'M'}
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
            <p className="text-sm font-bold text-slate-500">{t.agentId.identifyMember}</p>
            {/* === AMÉLIORATION AJOUTÉE : copie ajustée (2026-09-10) — l'annuaire n'étant plus
                affiché du tout sur mobile (voir plus haut), le renvoi vers "on the left" ne
                s'applique qu'à partir de `lg`. */}
            <p className="text-xs text-slate-400 max-w-sm">
              {t.agentId.identifyMemberDesc}
              <span className="hidden lg:inline">{t.agentId.browseDirectoryHint}</span>
            </p>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Mobile-only "New Search" — l'annuaire n'étant plus affiché du tout sur mobile
                (voir plus haut), ce bouton efface la sélection pour revenir à l'état de
                recherche ci-dessus, au lieu de faire défiler toute la fiche détaillée. */}
            <button
              type="button"
              onClick={() => setSelectedBeneficiary(null)}
              className="lg:hidden flex items-center gap-1.5 text-xs font-bold text-[#0A347B] hover:text-[#08285e] cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5 rotate-180" />
              <span>{t.agentId.newSearch}</span>
            </button>

            {/* === AMÉLIORATION AJOUTÉE : refonte complète de la page ("Proposition B", choisie
                explicitement par l'utilisateur parmi 2 propositions visuelles présentées et
                validées via captures d'écran, 2026-09-10). La carte membre (MemberIdCard) devient
                l'unique repère visuel d'identité — nom, n° de carte, organisation et statut n'y
                sont plus dupliqués dans un second bloc "Profile Header" séparé — et reste visible
                en colonne fixe (sticky) à gauche pendant le défilement ; à droite, soldes/famille/
                historique s'organisent en grille dense de cartes au lieu d'un long empilement
                plein-largeur. AUCUNE logique métier n'a changé : guardHealthcareAction, l'alerte
                de couverture bloquante (voir blockedActionAlert plus bas), le calcul des soldes et
                l'historique du mois en cours restent strictement identiques à avant. === */}
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
              {/* LEFT: repère d'identité fixe (carte + infos complémentaires + actions) */}
              <div className="lg:sticky lg:top-4 space-y-4">
                <MemberIdCard
                  fullName={selectedBeneficiary.fullName}
                  organization={selectedBeneficiary.organization}
                  cardNo={selectedBeneficiary.cardNo}
                  status={selectedBeneficiary.status}
                  relationship={!selectedBeneficiary.isPrincipal ? formatRelationship(selectedBeneficiary.relationship) : undefined}
                  birthDate={selectedBeneficiary.birthDate}
                  photoUrl={selectedBeneficiary.photoUrl}
                  lang={lang}
                />

                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
                  {/* === AMÉLIORATION AJOUTÉE : pastille de statut de couverture compacte
                      (remplace l'ancien badge "Card Active" redondant avec le statut déjà visible
                      sur la carte) — n'apparaît que si une police a été configurée pour
                      l'organisation de l'assuré, comme le bandeau détaillé ci-contre. === */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {policyCoverage && (
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                          policyCoverage.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : policyCoverage.status === 'Expiring Soon'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {policyCoverage.coverageBlocked ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                        {policyCoverage.status === 'Active' && t.agentId.coverageActive}
                        {policyCoverage.status === 'Expiring Soon' && t.agentId.coverageExpiringSoon}
                        {policyCoverage.status === 'Expired' && t.agentId.coverageBlockedBadge}
                        {policyCoverage.status === 'Suspended' && t.agentId.coverageSuspendedBadge}
                        {policyCoverage.status === 'Pending Renewal' && t.agentId.coveragePendingRenewal}
                      </span>
                    )}
                    {(selectedBeneficiary.hasBiometrics || selectedBeneficiary.fingerprintScore) && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-blue-50 text-[#0A347B] border border-blue-200">
                        {t.agentId.icaoCompliant}
                      </span>
                    )}
                  </div>

                  {/* === AMÉLIORATION AJOUTÉE : taille de police réduite sur demande explicite
                      (text-sm → text-xs → text-[11px]) pour Policy Number/Age & Gender/Date of
                      Birth — mêmes valeurs, mêmes libellés, juste plus compact. === */}
                  <div className="space-y-2.5">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{t.agentId.policyNumber}</div>
                      <div className="font-mono font-bold text-[11px] text-slate-800 truncate" title={policyNumber || t.agentId.notAvailable}>{policyNumber || t.agentId.notAvailable}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{t.agentId.ageGender}</div>
                      <div className="font-bold text-[11px] text-slate-800 truncate">
                        {calculateAgeNumber(selectedBeneficiary.birthDate) ?? '—'} {t.agentId.ageUnit} ({selectedBeneficiary.gender === 'F' ? t.agentId.female : t.agentId.male})
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{t.agentId.dateOfBirth}</div>
                      <div className="font-bold text-[11px] text-slate-800 truncate">{selectedBeneficiary.birthDate || t.agentId.notAvailable}</div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
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
                        className="w-full px-3.5 py-2.5 rounded-xl font-extrabold text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer bg-[#00A859] hover:bg-[#008f4c] text-white whitespace-nowrap"
                      >
                        <FileCheck className="w-3.5 h-3.5" />
                        <span>{t.agentId.generateMedicalForm}</span>
                      </button>
                    )}
                    {/* === AMÉLIORATION AJOUTÉE : bouton "New Claim" retiré de l'affichage
                        (2026-09-10, demande explicite) — le prop onNewClaim et sa logique
                        restent intacts (interface, wiring App.tsx) pour ne rien casser si le
                        bouton doit revenir plus tard ; seul son rendu ici est retiré. === */}
                  </div>
                </div>
              </div>

              {/* RIGHT: grille dense — bandeau de couverture détaillé, soldes, famille, historique */}
              <div className="space-y-4 min-w-0">
                {/* === AMÉLIORATION AJOUTÉE : bandeau de statut de couverture, calculé
                    immédiatement après identification via le moteur centralisé de police
                    d'assurance santé. N'apparaît que si une police a été configurée pour
                    l'organisation de l'assuré (module opt-in, aucun impact sur les organisations
                    n'ayant pas encore de police renseignée). Contenu strictement identique à
                    avant, seul son emplacement dans la page a changé. === */}
                {/* === AMÉLIORATION AJOUTÉE : bannière réduite (padding/texte plus petits, sur
                    demande explicite) — même contenu et mêmes conditions qu'avant. === */}
                {policyCoverage && selectedPolicy && (
                  <div
                    className={`rounded-xl border px-3.5 py-2.5 space-y-1 ${
                      policyCoverage.status === 'Active'
                        ? 'bg-emerald-50 border-emerald-200'
                        : policyCoverage.status === 'Expiring Soon'
                        ? 'bg-amber-50 border-amber-200'
                        : policyCoverage.status === 'Expired'
                        ? 'bg-red-50 border-red-300'
                        : 'bg-rose-50 border-rose-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4
                        className={`text-[10.5px] font-black uppercase tracking-wide flex items-center gap-1 ${
                          policyCoverage.status === 'Active'
                            ? 'text-emerald-800'
                            : policyCoverage.status === 'Expiring Soon'
                            ? 'text-amber-800'
                            : 'text-rose-800'
                        }`}
                      >
                        {policyCoverage.coverageBlocked ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                        <span>
                          {policyCoverage.status === 'Active' && t.agentId.memberVerifiedActive}
                          {policyCoverage.status === 'Expiring Soon' && t.agentId.memberVerifiedExpiring}
                          {policyCoverage.status === 'Expired' && t.agentId.healthcareBlocked}
                          {policyCoverage.status === 'Suspended' && t.agentId.healthcareSuspended}
                          {policyCoverage.status === 'Pending Renewal' && t.agentId.policyPendingRenewal}
                        </span>
                      </h4>
                      <span className="text-[9.5px] font-mono font-bold text-slate-500 shrink-0">{t.agentId.policyLabel} {selectedPolicy.policyNumber}</span>
                    </div>

                    {policyCoverage.status === 'Active' && (
                      <p className="text-[11px] text-emerald-800 font-medium">
                        {t.agentId.policyStatusLabel} <strong>{t.agentId.statusActiveWord}</strong> &bull; {t.agentId.coverageValidUntil} <strong>{selectedPolicy.expirationDate}</strong>
                        {selectedPolicy.nextPaymentDueDate && (
                          <>
                            {' '}&bull; {t.agentId.nextPremiumDue} <strong>{selectedPolicy.nextPaymentDueDate}</strong>
                          </>
                        )}
                      </p>
                    )}
                    {policyCoverage.status === 'Expiring Soon' && (
                      <p className="text-[11px] text-amber-800 font-medium">
                        {t.agentId.policyStatusLabel} <strong>{t.agentId.statusExpiringSoonWord}</strong> &bull; {t.agentId.coverageValidUntil} <strong>{selectedPolicy.expirationDate}</strong> ({policyCoverage.daysUntilExpiration} {t.agentId.daysLeftSuffix})
                      </p>
                    )}
                    {policyCoverage.status === 'Expired' && (
                      <p className="text-[11px] text-rose-800 font-medium leading-relaxed">
                        {t.status}: <strong>{t.agentId.statusExpiredWord}</strong> &bull; {t.agentId.expiredOn} <strong>{selectedPolicy.expirationDate}</strong>
                        <br />
                        {t.agentId.notEligibleNotice}
                      </p>
                    )}
                    {policyCoverage.status === 'Suspended' && (
                      <p className="text-[11px] text-rose-800 font-medium leading-relaxed">
                        {t.status}: <strong>{t.agentId.statusSuspendedWord}</strong> &bull; {t.agentId.reasonLabel} <strong>{(policyCoverage.suspensionReason || t.agentId.administrative).toUpperCase()}</strong>
                        {selectedPolicy.nextPaymentDueDate && (
                          <>
                            <br />{t.agentId.premiumDue} <strong>{selectedPolicy.nextPaymentDueDate}</strong> &bull; {t.agentId.amountDue} <strong>{selectedPolicy.currency} {(selectedPolicy.outstandingAmount ?? 0).toLocaleString()}</strong>
                          </>
                        )}
                        <br />
                        {t.agentId.servicesUnavailableNotice}
                      </p>
                    )}
                  </div>
                )}

                {/* Coverage Balances & Ceiling Limits — jauges circulaires (mêmes valeurs et
                    mêmes calculs qu'avant, cf. CircularGauge plus haut dans ce fichier) */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                      <Shield className="w-4 h-4 text-[#0A347B]" />
                      <span>{t.agentId.coverageBalancesTitle}</span>
                    </h4>
                    <span className="text-[11px] font-semibold text-slate-400">{t.agentId.contractualCeilings}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <CircularGauge
                      label={t.agentId.outpatientConsultation}
                      icon={<Stethoscope className="w-3.5 h-3.5" />}
                      ringColor="#0A347B"
                      unitLabel="USD ($)"
                      balanceLabel={formatAmount(selectedBeneficiary.outpatientBalanceUSD ?? 500)}
                      ceilingLabel={formatAmount(selectedBeneficiary.outpatientCeilingUSD ?? 500)}
                      consumedLabel={formatAmount(
                        Math.max(0, (selectedBeneficiary.outpatientCeilingUSD ?? 500) - (selectedBeneficiary.outpatientBalanceUSD ?? 500))
                      )}
                      usedPct={Math.min(
                        100,
                        Math.round(
                          (1 -
                            (selectedBeneficiary.outpatientBalanceUSD ?? 500) /
                              (selectedBeneficiary.outpatientCeilingUSD || selectedBeneficiary.outpatientBalanceUSD || 1)) *
                            100
                        )
                      )}
                      remainingBalanceText={t.agentId.remainingBalance}
                      ofText={t.agentId.ofCeiling}
                      ceilingSuffixText={t.agentId.ceilingSuffix}
                      consumedText={t.agentId.consumedLabel}
                      usedText={t.agentId.usedLabel}
                    />
                    <CircularGauge
                      label={t.agentId.inpatientHospitalization}
                      icon={<HeartPulse className="w-3.5 h-3.5" />}
                      ringColor="#00A859"
                      unitLabel="USD ($)"
                      balanceLabel={formatAmount(selectedBeneficiary.inpatientBalanceUSD ?? 5000)}
                      ceilingLabel={formatAmount(selectedBeneficiary.inpatientCeilingUSD ?? 5000)}
                      consumedLabel={formatAmount(
                        Math.max(0, (selectedBeneficiary.inpatientCeilingUSD ?? 5000) - (selectedBeneficiary.inpatientBalanceUSD ?? 5000))
                      )}
                      usedPct={Math.min(
                        100,
                        Math.round(
                          (1 -
                            (selectedBeneficiary.inpatientBalanceUSD ?? 5000) /
                              (selectedBeneficiary.inpatientCeilingUSD || selectedBeneficiary.inpatientBalanceUSD || 1)) *
                            100
                        )
                      )}
                      remainingBalanceText={t.agentId.remainingBalance}
                      ofText={t.agentId.ofCeiling}
                      ceilingSuffixText={t.agentId.ceilingSuffix}
                      consumedText={t.agentId.consumedLabel}
                      usedText={t.agentId.usedLabel}
                    />
                  </div>
                </div>

                {/* Family Members & Dependents + Current Month Care History, côte à côte sur
                    desktop (grille dense) au lieu de deux blocs pleine largeur empilés.
                    === AMÉLIORATION AJOUTÉE : `md:grid-cols-2` → `lg:grid-cols-2` (2026-09-10) —
                    Care History étant désormais masqué en dessous de `lg` (voir plus bas), la
                    grille ne passe en 2 colonnes qu'à partir de ce même seuil, pour que Family &
                    Dependents reste seul en pleine largeur sans case vide entre `md` et `lg`. === */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Family Members & Dependents */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-[#0A347B]" />
                        <span>{t.agentId.familyDependents} ({dependentsList.length + 1})</span>
                      </h4>
                    </div>
                    <span className="block text-[10.5px] font-semibold text-slate-400 -mt-2">{t.agentId.clickToSelect}</span>

                    <div className="grid grid-cols-2 gap-2.5">
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
                            className={`relative text-left p-2.5 rounded-xl border transition cursor-pointer ${
                              isSelf ? 'border-[#0A347B] bg-blue-50/60 ring-1 ring-[#0A347B]/30' : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {isSelf && (
                              <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#0A347B] flex items-center justify-center">
                                <Check className="w-2.5 h-2.5 text-white" />
                              </span>
                            )}
                            <div className="w-8 h-8 rounded-lg bg-blue-100/60 border border-blue-200 flex items-center justify-center overflow-hidden mb-1.5">
                              {principalSelf.photoUrl ? (
                                <img src={principalSelf.photoUrl} alt={principalSelf.fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <User className="w-4 h-4 text-[#0A347B]" />
                              )}
                            </div>
                            <div className="font-bold text-[11px] text-slate-900 truncate">{principalSelf.fullName}</div>
                            <div className="text-[9.5px] font-bold text-[#0A347B]">{t.agentId.principalSelf}</div>
                            <div className="text-[9.5px] text-slate-400 font-mono">
                              {calculateAgeNumber(principalSelf.birthDate) ?? '—'} {t.agentId.ageUnit}
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
                            className={`relative text-left p-2.5 rounded-xl border transition cursor-pointer ${
                              isSelectedDep ? 'border-[#0A347B] bg-blue-50/60 ring-1 ring-[#0A347B]/30' : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {isSelectedDep && (
                              <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#0A347B] flex items-center justify-center">
                                <Check className="w-2.5 h-2.5 text-white" />
                              </span>
                            )}
                            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden mb-1.5">
                              <User className="w-4 h-4 text-slate-400" />
                            </div>
                            <div className="font-bold text-[11px] text-slate-900 truncate">{dep.fullName}</div>
                            <div className="text-[9.5px] font-bold text-slate-500 truncate">{formatRelationship(dep.relationship)}</div>
                            <div className="text-[9.5px] text-slate-400 font-mono">
                              {dep.age ? `${dep.age} ${t.agentId.ageUnit}` : '—'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Current Month Care History — === AMÉLIORATION AJOUTÉE : le tableau desktop
                      cède la place au même format de liste compacte utilisé auparavant sur mobile
                      uniquement (mêmes champs : date, référence, procédure, prestataire, montant,
                      statut — rien retiré), pour tenir dans la colonne plus étroite de la grille
                      dense "Proposition B". ===
                      === AMÉLIORATION AJOUTÉE : masqué en dessous de `lg` (précision explicite de
                      l'utilisateur, 2026-09-10) — l'historique des opérations (actes médicaux du
                      mois en cours) n'est plus visible sur mobile, côté Agent. === */}
                  <div className="hidden lg:block bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-[#0A347B]" />
                        <span>{t.agentId.careHistory}</span>
                      </h4>
                      <span className="text-[10px] font-semibold text-slate-400">{currentMonthLabel}</span>
                    </div>

                    {currentMonthClaims.length === 0 ? (
                      <div className="p-6 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border border-slate-100">
                        {t.agentId.noHistoryPrefix} {currentMonthLabel}.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
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
                                  ? t.approvedStatus
                                  : claim.status === 'Rejected' || claim.status === 'rejected'
                                  ? t.rejectedStatus
                                  : t.pending}
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
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. BIOMETRIC FINGERPRINT SCANNER MODAL */}
      <BiometricFingerprintModal
        isOpen={isFingerprintModalOpen}
        onClose={() => setIsFingerprintModalOpen(false)}
        onCapture={handleFingerprintCaptured}
        title={t.agentId.biometricModalTitle}
        subtitle={t.agentId.biometricModalSubtitle}
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
                    {policyCoverage.status === 'Expired' ? t.agentId.healthcareBlocked : t.agentId.healthcareSuspended}
                  </h3>
                  <p className="text-xs font-bold text-slate-700 mt-1">{selectedBeneficiary.fullName}</p>
                  <p className="text-[11px] font-mono text-slate-500">{t.agentId.policyLabel} {selectedPolicy.policyNumber}</p>
                </div>
              </div>

              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium leading-relaxed">
                {policyCoverage.status === 'Expired' ? (
                  <>
                    {t.status}: <strong>{t.agentId.statusExpiredWord}</strong> &bull; {t.agentId.expiredOn} <strong>{selectedPolicy.expirationDate}</strong>
                    <br /><br />
                    {t.agentId.notEligibleNotice}
                  </>
                ) : (
                  <>
                    {t.status}: <strong>{t.agentId.statusSuspendedWord}</strong> &bull; {t.agentId.reasonLabel} <strong>{(policyCoverage.suspensionReason || t.agentId.administrative).toUpperCase()}</strong>
                    {selectedPolicy.nextPaymentDueDate && (
                      <>
                        <br />{t.agentId.premiumDue} <strong>{selectedPolicy.nextPaymentDueDate}</strong> &bull; {t.agentId.amountDue} <strong>{selectedPolicy.currency} {(selectedPolicy.outstandingAmount ?? 0).toLocaleString()}</strong>
                      </>
                    )}
                    <br /><br />
                    {t.agentId.servicesUnavailableNotice}
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
                {t.agentId.viewPolicy}
              </button>
              <button
                type="button"
                onClick={() => setBlockedActionAlert(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition cursor-pointer"
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
