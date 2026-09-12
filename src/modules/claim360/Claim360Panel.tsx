// === AMÉLIORATION AJOUTÉE : module Claim 360 (HealthPass 3.0, revue 2026-09-12 — roadmap de
// modernisation), derrière le flag `hp3_claim_360` (voir src/config/featureFlags.ts, désactivé
// par défaut / mode shadow) ===
// Panneau à onglets qui agrège, pour un claim donné, des données DÉJÀ chargées côté client
// (members/organizations/providers, déjà passés en props aux écrans Claims existants) plus
// l'historique d'audit déjà journalisé (`auditLogs`, voir EntityTimeline) — aucune nouvelle
// lecture Firestore, aucun nouveau calcul métier, aucune modification des actions d'approbation/
// rejet existantes. Objectif : remplacer la navigation entre plusieurs écrans pour reconstituer
// le contexte d'un sinistre par une seule vue.
import React, { useMemo, useState } from 'react';
import { X, FileText, User, Building2, DollarSign, Clock, Phone, Mail, CheckCircle2, XCircle, LayoutGrid } from 'lucide-react';
import { Claim, Member, Organization, Provider, Language } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { useCurrency } from '../../services/currency';
import { EntityTimeline } from '../timeline/EntityTimeline';
// === AMÉLIORATION AJOUTÉE : réutilisation de la carte visuelle de l'assuré (MemberIdCard,
// déjà utilisée sur l'écran Agent Identification) et de la logique déjà existante de
// normalisation des ayants droit (getMemberDependents, MembersView.tsx) pour l'onglet
// "Member" (retour utilisateur, 2026-09-12 — "je veux voir la carte de l'assuré avec toute
// ses informations et détails complémentaires"). Aucune nouvelle donnée, aucun nouveau calcul :
// seule la présentation change. ===
import { MemberIdCard } from '../membercard/MemberIdCard';
import { getMemberDependents } from '../../views/settings/MembersView';

type Claim360Tab = 'overview' | 'member' | 'provider' | 'financial' | 'timeline';

interface Claim360PanelProps {
  claim: Claim;
  members: Member[];
  organizations: Organization[];
  providers: Provider[];
  logs: any[];
  lang: Language;
  onClose: () => void;
}

const TABS: { key: Claim360Tab; icon: React.ElementType }[] = [
  { key: 'overview', icon: FileText },
  { key: 'member', icon: User },
  { key: 'provider', icon: Building2 },
  { key: 'financial', icon: DollarSign },
  { key: 'timeline', icon: Clock },
];

export const Claim360Panel: React.FC<Claim360PanelProps> = ({ claim, members, organizations, providers, logs, lang, onClose }) => {
  const t = useTranslation(lang);
  const { formatAmount } = useCurrency();
  const [activeTab, setActiveTab] = useState<Claim360Tab>('overview');

  const member = useMemo(
    () => members.find((m) => m.cardNo?.toLowerCase() === claim.memberCardNo?.toLowerCase()),
    [members, claim.memberCardNo]
  );
  const organization = useMemo(
    () => organizations.find((o) => o.name?.toLowerCase() === claim.organization?.toLowerCase()),
    [organizations, claim.organization]
  );
  const provider = useMemo(
    () => providers.find((p) => p.name?.toLowerCase() === claim.provider?.toLowerCase()),
    [providers, claim.provider]
  );

  const coverageRate = organization?.coverageRate ?? 80;
  const covered = (claim.amount || 0) * (coverageRate / 100);
  const memberShare = (claim.amount || 0) - covered;

  // === AMÉLIORATION AJOUTÉE : identifie précisément QUI, dans le foyer assuré (fiche `member`,
  // qui regroupe assuré principal + ayants droit), a fait l'objet de ce sinistre — le nom exact
  // vient toujours de `claim.memberName` (fiable, propre au sinistre), la fiche familiale sert
  // uniquement à retrouver le lien de parenté/la date de naissance/le statut biométrique quand
  // il s'agit d'un ayant droit plutôt que de l'assuré principal. ===
  const dependents = useMemo(() => (member ? getMemberDependents(member) : []), [member]);
  const claimedDependent = useMemo(
    () => dependents.find((d) => d.fullName?.toLowerCase() === claim.memberName?.toLowerCase()),
    [dependents, claim.memberName]
  );

  const tabLabels: Record<Claim360Tab, string> = {
    overview: t.claim360.tabOverview,
    member: t.claim360.tabMember,
    provider: t.claim360.tabProvider,
    financial: t.claim360.tabFinancial,
    timeline: t.claim360.tabTimeline,
  };

  // === AMÉLIORATION AJOUTÉE : harmonisation visuelle (retour utilisateur, 2026-09-12 — "fond
  // blanc") — même palette de pastille de statut que celle déjà utilisée dans ClaimsView
  // (Decision History : Validated en émeraude, Returned/pending en ambre, Rejected en rose).
  const statusPill: Record<string, { label: string; className: string }> = {
    pending: { label: t.pending, className: 'bg-amber-50 text-amber-800 border-amber-200' },
    approved: { label: t.validated, className: 'bg-emerald-50 text-[#00A859] border-emerald-200' },
    returned: { label: t.claims.returnedStatus, className: 'bg-amber-50 text-amber-800 border-amber-200' },
    rejected: { label: t.rejectedStatus, className: 'bg-rose-50 text-rose-600 border-rose-200' },
  };
  const statusPillStyle = statusPill[claim.status] || {
    label: claim.status,
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — === AMÉLIORATION AJOUTÉE : fond blanc (auparavant dégradé bleu marine),
            harmonisé avec les autres fenêtres de l'interface (retour utilisateur, 2026-09-12 —
            voir AttachmentBiometricViewerModal.tsx pour le même traitement déjà appliqué). === */}
        <div className="bg-white px-6 py-4 text-slate-900 flex items-center justify-between gap-4 border-b border-slate-200">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200 flex-shrink-0">
              <LayoutGrid className="w-5 h-5 text-[#0A347B]" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.claim360.panelTitle}</p>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 truncate">{claim.reference} — {claim.memberName}</h3>
              <p className="text-[11px] text-slate-500 truncate">{claim.organization} · {claim.provider}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${statusPillStyle.className}`}>
              {statusPillStyle.label}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 px-2 overflow-x-auto">
          {TABS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition cursor-pointer ${
                activeTab === key
                  ? 'border-[#0A347B] text-[#0A347B]'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tabLabels[key]}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{t.claim360.overviewSectionTitle}</h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">{t.claim360.careTypeLabel}</span>
                  <span className="font-bold text-slate-800">{claim.careType}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">{t.claim360.serviceDateLabel}</span>
                  <span className="font-bold text-slate-800">{claim.serviceDate}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">{t.claim360.attendingPhysicianLabel}</span>
                  <span className="font-bold text-slate-800">{claim.doctorName || '—'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">{t.claim360.cardNumberLabel}</span>
                  <span className="font-bold text-slate-800 font-mono">{claim.memberCardNo}</span>
                </div>
              </div>
              {(claim.rejectionReason || claim.returnReason || claim.comments) && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600">
                  {claim.rejectionReason || claim.returnReason || claim.comments}
                </div>
              )}
            </div>
          )}

          {activeTab === 'member' && (
            <div className="space-y-5">
              <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{t.claim360.memberSectionTitle}</h4>

              {!member && (
                <p className="text-xs text-slate-400 italic">{t.claim360.memberNotFoundLabel}</p>
              )}

              <div className="flex flex-col md:flex-row gap-5 items-start">
                {/* Carte visuelle de l'assuré — mêmes données que celles déjà affichées sur
                    l'écran Agent Identification, réutilisées ici telles quelles. */}
                <div className="w-full md:w-[300px] shrink-0 mx-auto md:mx-0">
                  <MemberIdCard
                    fullName={claim.memberName}
                    organization={claim.organization}
                    cardNo={claimedDependent?.cardNo || member?.cardNo || claim.memberCardNo}
                    status={member?.status || '—'}
                    relationship={claimedDependent?.relationship}
                    birthDate={claimedDependent?.birthDate || member?.birthDate}
                    photoUrl={member?.photoUrl}
                    lang={lang}
                  />
                </div>

                {/* Détails complémentaires — informations du foyer assuré non affichées sur la
                    carte elle-même (contact, adhésion, ayants droit, biométrie, soldes). */}
                <div className="flex-1 min-w-0 w-full space-y-4">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-500">{t.claim360.organizationLabel}</span>
                      <span className="font-bold text-slate-800">{claim.organization}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-500">{t.claim360.policyNumberLabel}</span>
                      <span className="font-bold text-slate-800">{organization?.policyNumber || '—'}</span>
                    </div>
                    {member?.phone && (
                      <div className="flex justify-between border-b border-slate-100 pb-2">
                        <span className="text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" />{t.claim360.phoneLabel}</span>
                        <span className="font-bold text-slate-800">{member.phone}</span>
                      </div>
                    )}
                    {member?.email && (
                      <div className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                        <span className="text-slate-500 flex items-center gap-1 shrink-0"><Mail className="w-3 h-3" />{t.claim360.emailLabel}</span>
                        <span className="font-bold text-slate-800 truncate">{member.email}</span>
                      </div>
                    )}
                    {(claimedDependent?.gender || member?.gender) && (
                      <div className="flex justify-between border-b border-slate-100 pb-2">
                        <span className="text-slate-500">{t.agentId.genderLabel}</span>
                        <span className="font-bold text-slate-800">
                          {(claimedDependent?.gender || member?.gender) === 'F' ? t.agentId.female : t.agentId.male}
                        </span>
                      </div>
                    )}
                    {member?.createdAt && (
                      <div className="flex justify-between border-b border-slate-100 pb-2">
                        <span className="text-slate-500">{t.claim360.enrollmentDateLabel}</span>
                        <span className="font-bold text-slate-800">{member.createdAt}</span>
                      </div>
                    )}
                    {member && (
                      <div className="flex justify-between border-b border-slate-100 pb-2">
                        <span className="text-slate-500">{t.claim360.dependentsCountLabel}</span>
                        <span className="font-bold text-slate-800">{dependents.length}</span>
                      </div>
                    )}
                    {member && (
                      <div className="flex justify-between border-b border-slate-100 pb-2">
                        <span className="text-slate-500">{t.members.hasPhoto}</span>
                        {member.hasPhoto ? (
                          <CheckCircle2 className="w-4 h-4 text-[#00A859]" />
                        ) : (
                          <XCircle className="w-4 h-4 text-slate-300" />
                        )}
                      </div>
                    )}
                    {member && (
                      <div className="flex justify-between border-b border-slate-100 pb-2">
                        <span className="text-slate-500">{t.members.hasBiometrics}</span>
                        {(claimedDependent ? claimedDependent.hasBiometrics : member.hasBiometrics) ? (
                          <CheckCircle2 className="w-4 h-4 text-[#00A859]" />
                        ) : (
                          <XCircle className="w-4 h-4 text-slate-300" />
                        )}
                      </div>
                    )}
                  </div>

                  {member && (member.outpatientBalanceUSD !== undefined || member.inpatientBalanceUSD !== undefined) && (
                    <div>
                      <h5 className="text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">{t.claim360.balancesSectionTitle}</h5>
                      <div className="grid grid-cols-2 gap-3">
                        {member.outpatientBalanceUSD !== undefined && (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                            <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">{t.claim360.outpatientLabel}</p>
                            <p className="text-sm font-black text-slate-800 mt-0.5">
                              {formatAmount(member.outpatientBalanceUSD)} / {formatAmount(member.outpatientCeilingUSD || 0)}
                            </p>
                          </div>
                        )}
                        {member.inpatientBalanceUSD !== undefined && (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                            <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">{t.claim360.inpatientLabel}</p>
                            <p className="text-sm font-black text-slate-800 mt-0.5">
                              {formatAmount(member.inpatientBalanceUSD)} / {formatAmount(member.inpatientCeilingUSD || 0)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'provider' && (
            <div className="space-y-4">
              <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{t.claim360.providerSectionTitle}</h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">{t.claims.provider}</span>
                  <span className="font-bold text-slate-800">{claim.provider}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">{t.claim360.providerTypeLabel}</span>
                  <span className="font-bold text-slate-800">{provider?.type || '—'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">{t.claim360.providerLocationLabel}</span>
                  <span className="font-bold text-slate-800">{provider?.location || '—'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">{t.claim360.providerKypLabel}</span>
                  <span className="font-bold text-slate-800">{provider?.kypStatus || '—'}</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'financial' && (
            <div className="space-y-4">
              <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{t.claim360.financialSectionTitle}</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <p className="text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400">{t.claim360.billedLabel}</p>
                  <p className="text-base font-black text-slate-800 mt-0.5">{formatAmount(claim.amount || 0)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <p className="text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400">{t.claim360.coverageRateLabel}</p>
                  <p className="text-base font-black text-slate-800 mt-0.5">{coverageRate}%</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
                  <p className="text-[9.5px] font-extrabold uppercase tracking-wider text-emerald-700">{t.claim360.coveredLabel}</p>
                  <p className="text-base font-black text-[#00A859] mt-0.5">{formatAmount(covered)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <p className="text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400">{t.claim360.memberShareLabel}</p>
                  <p className="text-base font-black text-slate-800 mt-0.5">{formatAmount(memberShare)}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'timeline' && (
            <EntityTimeline
              logs={logs}
              entityId={claim.id}
              entityType="claim"
              title={t.claim360.timelineTitle}
              emptyLabel={t.claim360.noTimelineEvents}
            />
          )}
        </div>
      </div>
    </div>
  );
};
