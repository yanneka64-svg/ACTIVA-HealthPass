import React, { useState } from 'react';
import {
  LayoutDashboard,
  FileCheck,
  Receipt,
  UserCheck,
  BarChart3,
  Users,
  Building2,
  Stethoscope,
  Sliders,
  ShieldCheck,
  History,
  X,
  ChevronDown,
} from 'lucide-react';
import { NavSection, Language } from '../types';
import { useTranslation } from '../i18n/translations';
import { Logo } from './Logo';
import { normalizeRole } from '../utils/authUtils';
import { getRoleTheme } from '../theme/roleTheme';
// === AMÉLIORATION AJOUTÉE : refonte visuelle (2026-09-18, demande explicite utilisateur —
// "je veux copier le style ... ne surtout pas copier le contenu", confirmé "toute
// l'application" + "tokens + structure de mise en page", puis "remplacer par un sidebar blanc
// (comme la maquette)") — la sidebar sombre avec photo de fond par rôle (Agent/Superviseur/
// Admin, ci-dessus dans l'historique du fichier) est remplacée par une sidebar blanche, sur
// confirmation explicite de l'utilisateur acceptant la perte de cette personnalisation. Les 3
// fichiers photo restent sur disque (non supprimés), seuls leur import et leur usage ici sont
// retirés puisqu'ils ne sont plus référencés par aucun autre composant.

interface SidebarProps {
  currentUser?: any;
  userRole?: string;
  currentSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  lang: Language;
  pendingClaimsCount: number;
  pendingEnrollmentsCount: number;
  onCloseMobile?: () => void;
}

interface CollapsibleNavSectionProps {
  id: string;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  titleColor?: string;
  children: React.ReactNode;
}

const CollapsibleNavSection: React.FC<CollapsibleNavSectionProps> = ({
  id,
  title,
  isOpen,
  onToggle,
  titleColor = 'text-slate-400',
  children,
}) => {
  return (
    <div className="w-full px-2">
      <button
        type="button"
        id={`nav-toggle-${id}`}
        onClick={onToggle}
        className={`w-full px-3 py-2 flex items-center justify-between text-[11px] font-extrabold tracking-wider ${titleColor} hover:text-slate-700 uppercase transition-colors duration-150 cursor-pointer group select-none`}
        aria-expanded={isOpen}
      >
        <span className="truncate group-hover:text-slate-700 transition-colors">{title}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:text-slate-700 transition-transform duration-200 flex-shrink-0 ${
            isOpen ? 'rotate-180 text-slate-700 opacity-100' : ''
          }`}
        />
      </button>

      <div
        className={`grid transition-all duration-200 ease-in-out ${
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-1 pb-2 pt-0.5">{children}</div>
        </div>
      </div>
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  userRole,
  currentSection,
  onSelectSection,
  lang,
  pendingClaimsCount,
  pendingEnrollmentsCount,
  onCloseMobile,
}) => {
  const t = useTranslation(lang);

  const [isOverviewOpen, setIsOverviewOpen] = useState(true);
  const [isManagementOpen, setIsManagementOpen] = useState(true);
  const [isSystemOpen, setIsSystemOpen] = useState(true);

  const role = normalizeRole(userRole || currentUser?.profile || currentUser?.role);
  const theme = getRoleTheme(role);
  const isAgent = role === 'Agent';
  const isSupervisor = role === 'Supervisor';
  const isAdmin = role === 'Admin';

  const overviewItems = [
    { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: 'identification', label: t.nav.identification, icon: Users },
    { id: 'medical_form', label: t.nav.medical_form, icon: FileCheck },
    // === AMÉLIORATION AJOUTÉE : traduction (retour utilisateur, 2026-09-11 — "tout n'est pas
    // traduit") — ce libellé retombait sur le littéral anglais "Claims Processing" pour tout
    // rôle non-Agent (Admin), au lieu de suivre la langue active comme partout ailleurs.
    // t.nav.claims vaut déjà exactement "Claims Processing" en anglais — la valeur affichée ne
    // change donc pas en anglais, seul le français (et toute langue future) est désormais suivi.
    { id: 'claims', label: t.nav.claims, icon: Receipt, badge: pendingClaimsCount },
    { id: 'claims_validation', label: t.nav.claims_validation, icon: FileCheck, badge: pendingClaimsCount },
    { id: 'enrollments_validation', label: t.nav.enrollments_validation, icon: UserCheck, badge: pendingEnrollmentsCount },
    { id: 'receipts', label: t.nav.receipts, icon: Receipt },
    { id: 'invoices', label: t.nav.invoices, icon: Receipt },
    { id: 'enrollments', label: t.nav.enrollments, icon: UserCheck, badge: pendingEnrollmentsCount },
    { id: 'reports', label: t.nav.reports, icon: BarChart3 },
  ] as any;

  const filteredOverviewItems = overviewItems.filter((item: any) => {
    if (isAdmin) {
      return ['dashboard', 'claims', 'invoices', 'enrollments', 'reports'].includes(item.id);
    }
    if (isAgent) {
      return ['identification', 'medical_form', 'claims', 'enrollments'].includes(item.id);
    }
    if (isSupervisor) {
      // === AMÉLIORATION AJOUTÉE : "Identification" ajouté côté Superviseur (retour
      // utilisateur explicite, 2026-09-11 — "ajouter également l'identification comme sur
      // le profil agent"), même écran (AgentIdentificationView) que pour l'Agent — voir
      // App.tsx, effectiveSection === 'identification' (déjà indépendant du rôle).
      return ['dashboard', 'identification', 'medical_form', 'claims_validation', 'enrollments_validation', 'receipts', 'reports'].includes(item.id);
    }
    return false;
  });

  // === AMÉLIORATION AJOUTÉE : traduction (retour utilisateur, 2026-09-11 — "tout n'est pas
  // traduit") — ces 6 libellés étaient codés en dur en anglais au lieu d'utiliser les clés
  // t.nav.* correspondantes, déjà traduites (voir src/i18n/translations.ts) et déjà utilisées
  // pour tous les autres éléments de la sidebar. Aucun changement en anglais (mêmes valeurs).
  const managementItems = [
    { id: 'members', label: t.nav.members, icon: Users },
    { id: 'organizations', label: t.nav.organizations, icon: Building2 },
    { id: 'providers', label: t.nav.providers, icon: Stethoscope },
    { id: 'ceilings', label: t.nav.ceilings, icon: Sliders },
  ] as any;

  const systemItems = [
    { id: 'accounts', label: t.nav.accounts, icon: ShieldCheck },
    { id: 'logs', label: t.nav.logs, icon: History },
  ] as any;

  const renderNavItem = (item: { id: NavSection; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }) => {
    const isActive = currentSection === item.id;
    const Icon = item.icon;

    // === AMÉLIORATION AJOUTÉE : forme arrondie retirée de la barre de navigation (menu
    // latéral) sur demande — boutons de menu désormais à angles droits (rounded-xl
    // supprimé), même chose pour le petit indicateur d'item actif (rounded-r-full retiré) ===
    // === AMÉLIORATION AJOUTÉE : refonte visuelle (2026-09-18) — items de nav basés sur les
    // nouvelles clés `sidebarLight*` (fond clair) au lieu des clés sombres `activeItemBg`/
    // `activeItemText`/`activeIndicator`/`activeIconColor`/`inactiveText`/`inactiveHoverBg`/
    // `badgeBg`, ces dernières restant inchangées pour leurs autres usages (graphiques,
    // barre de navigation mobile — voir roleTheme.ts).
    return (
      <button
        key={item.id}
        id={`nav-item-${item.id}`}
        onClick={() => onSelectSection(item.id)}
        className={`w-full relative flex items-center justify-between px-3.5 py-2.5 text-[13px] transition-all duration-150 group text-left cursor-pointer ${
          isActive
            ? `${theme.palette.sidebarLightActiveBg} ${theme.palette.sidebarLightActiveText}`
            : `${theme.palette.sidebarLightInactiveText} ${theme.palette.sidebarLightInactiveHoverBg} font-medium`
        }`}
      >
        {/* Subtle active indicator bar on the left */}
        {isActive && (
          <div className={`absolute left-0 top-2 bottom-2 w-1 ${theme.palette.sidebarLightActiveIndicator}`} />
        )}

        <div className="flex items-center gap-3 min-w-0 pl-1">
          <Icon
            className={`w-4 h-4 flex-shrink-0 transition-colors ${
              isActive ? theme.palette.sidebarLightActiveIcon : 'opacity-70 group-hover:opacity-100'
            }`}
          />
          <span className="truncate">{item.label}</span>
        </div>

        {item.badge !== undefined && item.badge > 0 && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${theme.palette.sidebarLightBadgeBg}`}>
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    // === AMÉLIORATION AJOUTÉE : refonte visuelle (2026-09-18) — sidebar blanche (structure
    // inspirée de la maquette de référence), remplaçant le fond sombre en dégradé/photo par
    // rôle. `theme.palette.sidebarLightBg`/`sidebarLightBorder` (nouvelles clés, voir
    // roleTheme.ts) au lieu de `sidebarGradient`/`sidebarBorder`/`sidebarBg` (inchangées,
    // toujours utilisées ailleurs — graphiques, barre de navigation mobile).
    <aside
      className={`w-[248px] ${theme.palette.sidebarLightBg} text-slate-700 flex flex-col h-full shadow-sm select-none border-r ${theme.palette.sidebarLightBorder} relative overflow-hidden`}
    >
      {/* Brand Header with Logo & Mobile Close Button */}
      <div className="p-3 relative z-10">
        <div className="rounded-2xl p-3 flex items-center justify-between border-b border-slate-100">
          <div className="flex-1 flex justify-center">
            <Logo size="sm" showTagline={true} transparent={true} />
          </div>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg ml-2"
              aria-label="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation list */}
      <div className="flex-1 overflow-y-auto py-2 space-y-3 relative z-10">
        {/* Section 1: Overview */}
        <CollapsibleNavSection
          id="overview"
          title="OVERVIEW"
          isOpen={isOverviewOpen}
          onToggle={() => setIsOverviewOpen((prev) => !prev)}
        >
          {filteredOverviewItems.map(renderNavItem)}
        </CollapsibleNavSection>

        {/* Section 2: Management */}
        {isAdmin && (
          <CollapsibleNavSection
            id="management"
            title="MANAGEMENT"
            isOpen={isManagementOpen}
            onToggle={() => setIsManagementOpen((prev) => !prev)}
          >
            {managementItems.map(renderNavItem)}
          </CollapsibleNavSection>
        )}

        {/* Section 3: System */}
        {isAdmin && (
          <CollapsibleNavSection
            id="system"
            title="SYSTEM"
            isOpen={isSystemOpen}
            onToggle={() => setIsSystemOpen((prev) => !prev)}
          >
            {systemItems.map(renderNavItem)}
          </CollapsibleNavSection>
        )}
      </div>

      {/* Bottom Status & Version Indicator */}
      {/* === AMÉLIORATION AJOUTÉE : refonte visuelle (2026-09-18) — mêmes informations, couleurs
          adaptées au fond blanc (texte sombre au lieu de texte blanc/translucide). === */}
      <div className="p-3 border-t border-slate-100 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 min-w-0">
            <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse flex-shrink-0" />
            <span className="text-[10px] font-semibold text-slate-600 tracking-wide truncate">
              {currentUser?.entity || 'ACTIVA Liberia'}
            </span>
          </div>
          <span className="text-slate-400 text-[10px] font-mono font-bold shrink-0">
            v2.4.0
          </span>
        </div>
      </div>
    </aside>
  );
};


