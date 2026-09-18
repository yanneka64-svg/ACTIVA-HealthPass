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
  ChevronRight,
} from 'lucide-react';
import { NavSection, Language } from '../types';
import { useTranslation } from '../i18n/translations';
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
  // === AMÉLIORATION AJOUTÉE : correctif revue CodeRabbit, PR #80 (2026-09-18) === `text-slate-400`
  // sur fond blanc n'offre qu'un contraste ~2.5:1, sous le minimum WCAG 4.5:1 pour du texte
  // normal (les libellés de section restent en 11px, sous le seuil "texte large" qui
  // permettrait 3:1). `text-slate-600` reste neutre (aucun contour/texte coloré) tout en
  // satisfaisant le contraste requis.
  titleColor = 'text-slate-600',
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

    // === AMÉLIORATION AJOUTÉE : refonte visuelle (2026-09-18, demande explicite utilisateur —
    // "je veux que le sidebar soit exactement comme celle sur la photo ... retirez les contours
    // colorés partout") === Items de nav en pilule arrondie (au lieu de lignes pleine largeur à
    // angles droits avec un liseré de couleur sur le bord gauche) : fond bleu clair + texte/icône
    // colorés pour l'item actif, sans aucun contour/bordure colorée — un simple chevron indique
    // l'item actif, comme sur la maquette de référence. Basé sur les clés `sidebarLight*` (fond
    // clair, voir roleTheme.ts) ; les clés sombres `activeItemBg`/`activeItemText`/
    // `activeIndicator`/`activeIconColor`/`inactiveText`/`inactiveHoverBg`/`badgeBg` restent
    // inchangées pour leurs autres usages (graphiques, barre de navigation mobile).
    return (
      <button
        key={item.id}
        id={`nav-item-${item.id}`}
        onClick={() => onSelectSection(item.id)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] transition-all duration-150 group text-left cursor-pointer ${
          isActive
            ? `${theme.palette.sidebarLightActiveBg} ${theme.palette.sidebarLightActiveText}`
            : `${theme.palette.sidebarLightInactiveText} ${theme.palette.sidebarLightInactiveHoverBg} font-medium`
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon
            className={`w-4 h-4 flex-shrink-0 transition-colors ${
              isActive ? theme.palette.sidebarLightActiveIcon : 'opacity-70 group-hover:opacity-100'
            }`}
          />
          <span className="truncate">{item.label}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {item.badge !== undefined && item.badge > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${theme.palette.sidebarLightBadgeBg}`}>
              {item.badge}
            </span>
          )}
          {isActive && <ChevronRight className={`w-3.5 h-3.5 ${theme.palette.sidebarLightActiveIcon}`} />}
        </div>
      </button>
    );
  };

  return (
    // === AMÉLIORATION AJOUTÉE : refonte visuelle (2026-09-18, demande explicite utilisateur —
    // "le sidebar et le top bar doivent être détaché l'un de l'autre ... et le logo [doit être]
    // sur le topbar") === Sidebar blanche sans en-tête ni logo (le logo vit désormais dans
    // Topbar.tsx) — structure identique à la maquette de référence, qui n'affiche aucun bandeau
    // au-dessus de la liste de navigation. `theme.palette.sidebarLightBg`/`sidebarLightBorder`
    // (nouvelles clés, neutres — voir roleTheme.ts) au lieu de `sidebarGradient`/`sidebarBorder`/
    // `sidebarBg` (inchangées, toujours utilisées ailleurs — graphiques, barre de navigation
    // mobile).
    <aside
      className={`w-[248px] ${theme.palette.sidebarLightBg} text-slate-700 flex flex-col h-full select-none border-r ${theme.palette.sidebarLightBorder} relative overflow-hidden`}
    >
      {/* Mobile-only close button (no header/logo block anymore — the logo is in the Topbar) */}
      {onCloseMobile && (
        <div className="lg:hidden flex justify-end p-2">
          <button
            onClick={onCloseMobile}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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


