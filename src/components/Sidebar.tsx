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
// === AMÉLIORATION AJOUTÉE : photos fournies par l'utilisateur, fond des sidebars Agent,
// Superviseur et Admin (retour utilisateur explicite, 2026-09-11 — "ajoute cette photo comme
// fond d'écran pour le sidebar interface agent", puis "utilise ceci pour le sidebar côté
// superviseur", puis "utilise cette photo pour le sidebar côté admin") — voir plus bas
// (sidebarPhoto).
import agentSidebarPhoto from '../assets/sidebar-agent-photo.webp';
import supervisorSidebarPhoto from '../assets/sidebar-supervisor-photo.webp';
import adminSidebarPhoto from '../assets/sidebar-admin-photo.webp';

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
  titleColor = 'text-white/60',
  children,
}) => {
  return (
    <div className="w-full px-2">
      <button
        type="button"
        id={`nav-toggle-${id}`}
        onClick={onToggle}
        className={`w-full px-3 py-2 flex items-center justify-between text-[11px] font-extrabold tracking-wider ${titleColor} hover:text-white uppercase transition-colors duration-150 cursor-pointer group select-none`}
        aria-expanded={isOpen}
      >
        <span className="truncate group-hover:text-white transition-colors">{title}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:text-white transition-transform duration-200 flex-shrink-0 ${
            isOpen ? 'rotate-180 text-white opacity-100' : ''
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
  // === AMÉLIORATION AJOUTÉE : photo de fond par rôle (Agent/Superviseur/Admin, retour
  // utilisateur explicite, 2026-09-11) — voir l'import en haut du fichier et l'utilisation
  // sur <aside> plus bas.
  const sidebarPhoto = isAgent
    ? agentSidebarPhoto
    : isSupervisor
    ? supervisorSidebarPhoto
    : isAdmin
    ? adminSidebarPhoto
    : null;

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
    return (
      <button
        key={item.id}
        id={`nav-item-${item.id}`}
        onClick={() => onSelectSection(item.id)}
        className={`w-full relative flex items-center justify-between px-3.5 py-2.5 text-[13px] transition-all duration-150 group text-left cursor-pointer ${
          isActive
            ? `${theme.palette.activeItemBg} ${theme.palette.activeItemText} shadow-xs`
            : `${theme.palette.inactiveText} ${theme.palette.inactiveHoverBg} font-medium`
        }`}
      >
        {/* Subtle active indicator bar on the left */}
        {isActive && (
          <div className={`absolute left-0 top-2 bottom-2 w-1 ${theme.palette.activeIndicator}`} />
        )}

        <div className="flex items-center gap-3 min-w-0 pl-1">
          <Icon
            className={`w-4 h-4 flex-shrink-0 transition-colors ${
              isActive ? theme.palette.activeIconColor : 'opacity-80 group-hover:opacity-100 group-hover:text-white'
            }`}
          />
          <span className="truncate">{item.label}</span>
        </div>

        {item.badge !== undefined && item.badge > 0 && (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              isAdmin ? 'bg-white/20 text-white' : theme.palette.badgeBg
            }`}
          >
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className={`w-[248px] ${sidebarPhoto ? 'bg-cover bg-center' : theme.palette.sidebarGradient} text-white flex flex-col h-full shadow-2xl select-none border-r ${theme.palette.sidebarBorder} relative overflow-hidden`}
      style={sidebarPhoto ? { backgroundImage: `url(${sidebarPhoto})` } : undefined}
    >
      {/* === AMÉLIORATION AJOUTÉE : photo en fond pour les 3 rôles (Agent, Superviseur, Admin),
          avec le dégradé d'origine de chaque rôle (theme.palette.sidebarGradient — bleu marine
          pour Agent/Superviseur, gris ardoise pour Admin) posé en surcouche semi-transparente
          par-dessus — identique au traitement déjà appliqué au panneau gauche de la page de
          connexion (LoginView.tsx) — afin que le logo, le motif et les libellés blancs restent
          parfaitement lisibles. Les 3 photos sont pré-recadrées (voir src/assets/sidebar-*-
          photo.webp) au même ratio étroit que le sidebar, pour que le cadrage automatique en
          fond ("cover") ne coupe pas les repères visuels du genre — cravate/barbe naissante
          côté Agent et Admin, cheveux bouclés/visage côté Superviseur. Surcouche allégée pour
          les 3 rôles (0.60/0.55/0.65 au lieu des 0.90/0.85/0.92 d'origine, repris de LoginView)
          — retour utilisateur explicite : "rassure toi qu'on voit bien qu'il s'agit d'une
          femme" puis "... qu'il s'agit d'un homme un peu comme sur l'interface superviseur" —
          la surcouche standard rendait ces repères trop peu distincts. === */}
      {sidebarPhoto && (
        <div
          className={`absolute inset-0 bg-gradient-to-b pointer-events-none ${
            isAdmin
              ? 'from-[#334155]/60 via-[#3B485C]/55 to-[#1E293B]/65'
              : 'from-[#072659]/60 via-[#0A347B]/55 to-[#0D2B63]/65'
          }`}
        />
      )}

      {/* Background ambient light glow */}
      <div className={`absolute -bottom-16 -left-16 w-56 h-56 ${theme.palette.accentGlow} rounded-full blur-3xl pointer-events-none`} />

      {/* Clean subtle ACTIVA vector background curves without dots */}
      {/* === AMÉLIORATION AJOUTÉE : couleur du motif désormais tirée de theme.palette.motifStroke
          (or/ambre pour Admin, turquoise pour Superviseur, blanc inchangé pour Agent) au lieu
          d'un blanc fixe pour les 3 rôles — le tracé SVG et les niveaux d'opacité restent
          strictement identiques, seule la teinte varie selon l'interface active. ===
          === AMÉLIORATION AJOUTÉE : taille du motif augmentée (retour utilisateur, 2026-09-11 —
          "augmente la taille des motifs côté superviseur, assure-toi qu'il ait la même taille
          que celle de l'agent") — ce composant est déjà strictement PARTAGÉ entre les 3 rôles
          (Agent/Superviseur/Admin, même code, seule la couleur change ci-dessus) : Agent et
          Superviseur ont donc déjà rigoureusement la même taille de motif. L'agrandissement
          ci-dessous (scale-125, ancré en bas à gauche comme le motif lui-même) s'applique donc
          identiquement aux deux, garantissant qu'ils restent alignés en le devenant plus grand.
          === AMÉLIORATION AJOUTÉE : opacité du motif augmentée côté Superviseur (retour
          utilisateur explicite, 2026-09-11 — "pas suffisamment visible... maintenir la couleur
          rouge mais rendre visible comme ceux de l'interface agent") — à opacité identique, le
          rouge du motif Superviseur (motifStroke) est perçu bien plus sombre/discret que le
          blanc du motif Agent sur le même fond bleu marine. Couleur inchangée : seule l'opacité
          du conteneur est relevée pour ce rôle, afin d'égaliser la visibilité perçue avec Agent. */}
      <div className={`absolute inset-0 pointer-events-none ${isSupervisor ? 'opacity-90' : 'opacity-50'} overflow-hidden z-0`}>
        <svg className="absolute bottom-0 left-0 w-full h-84 scale-125 origin-bottom-left" viewBox="0 0 250 320" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M-40 320 C 30 240, 110 220, 270 250" stroke={`rgba(${theme.palette.motifStroke}, 0.55)`} strokeWidth="1.8" />
          <path d="M-40 280 C 50 210, 130 190, 270 220" stroke={`rgba(${theme.palette.motifStroke}, 0.45)`} strokeWidth="1.5" />
          <path d="M-40 240 C 70 180, 150 160, 270 190" stroke={`rgba(${theme.palette.motifStroke}, 0.38)`} strokeWidth="1.3" />
          <path d="M-40 200 C 90 150, 170 130, 270 160" stroke={`rgba(${theme.palette.motifStroke}, 0.30)`} strokeWidth="1.2" />
        </svg>
      </div>

      {/* Brand Header with White Background Logo & Mobile Close Button */}
      <div className="p-3 relative z-10">
        <div className="bg-white rounded-2xl p-3 shadow-md border border-slate-100/90 flex items-center justify-between">
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
          titleColor={isAdmin || isSupervisor ? 'text-slate-300/90' : 'text-blue-200/80'}
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
            titleColor="text-slate-300/90"
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
            titleColor="text-slate-300/90"
          >
            {systemItems.map(renderNavItem)}
          </CollapsibleNavSection>
        )}
      </div>

      {/* Bottom Status & Version Indicator */}
      {/* === AMÉLIORATION AJOUTÉE : bannière/fond retiré (plus de bg-white/10 ni de bordure)
          sur les deux badges — texte nu directement sur le fond de la sidebar — et taille
          encore réduite (padding supprimé, texte plus petit), sur demande explicite. === */}
      <div className="p-3 border-t border-white/10 bg-slate-900/20 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 min-w-0">
            <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse flex-shrink-0" />
            <span className="text-[10px] font-semibold text-white/90 tracking-wide truncate">
              {currentUser?.entity || 'ACTIVA Liberia'}
            </span>
          </div>
          <span className="text-white/60 text-[10px] font-mono font-bold shrink-0">
            v2.4.0
          </span>
        </div>
      </div>
    </aside>
  );
};


