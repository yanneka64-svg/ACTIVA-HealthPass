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
import { X, FileText, User, Building2, DollarSign, Clock } from 'lucide-react';
import { Claim, Member, Organization, Provider, Language } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { useCurrency } from '../../services/currency';
import { EntityTimeline } from '../timeline/EntityTimeline';

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

  const tabLabels: Record<Claim360Tab, string> = {
    overview: t.claim360.tabOverview,
    member: t.claim360.tabMember,
    provider: t.claim360.tabProvider,
    financial: t.claim360.tabFinancial,
    timeline: t.claim360.tabTimeline,
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
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0A347B] to-[#0D2B63] text-white px-6 py-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">{t.claim360.panelTitle}</p>
            <h3 className="font-black text-lg mt-0.5 truncate">{claim.reference} — {claim.memberName}</h3>
            <p className="text-xs text-white/75 mt-1 truncate">{claim.organization} · {claim.provider}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold border border-white/30 text-white bg-white/10">
              {claim.status}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
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
            <div className="space-y-4">
              <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{t.claim360.memberSectionTitle}</h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">{t.claims.insured}</span>
                  <span className="font-bold text-slate-800">{claim.memberName}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">{t.claim360.memberStatusLabel}</span>
                  <span className={`font-bold ${member?.status === 'Active' ? 'text-[#00A859]' : 'text-slate-800'}`}>
                    {member?.status || '—'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">{t.claim360.organizationLabel}</span>
                  <span className="font-bold text-slate-800">{claim.organization}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">{t.claim360.policyNumberLabel}</span>
                  <span className="font-bold text-slate-800">{organization?.policyNumber || '—'}</span>
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
