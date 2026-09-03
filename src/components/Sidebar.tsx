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
        className={`w-full px-3 py-2 flex items-center justify-between text-[10.5px] font-extrabold tracking-wider ${titleColor} hover:text-white uppercase transition-colors duration-150 cursor-pointer group select-none`}
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

  const overviewItems = [
    { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: 'identification', label: t.nav.identification, icon: Users },
    { id: 'medical_form', label: t.nav.medical_form, icon: FileCheck },
    { id: 'claims', label: isAgent ? t.nav.claims : 'Claims Processing', icon: Receipt, badge: pendingClaimsCount },
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
      return ['dashboard', 'medical_form', 'claims_validation', 'enrollments_validation', 'receipts', 'reports'].includes(item.id);
    }
    return false;
  });

  const managementItems = [
    { id: 'members', label: 'Insured Members', icon: Users },
    { id: 'organizations', label: 'Organizations', icon: Building2 },
    { id: 'providers', label: 'Healthcare Providers', icon: Stethoscope },
    { id: 'ceilings', label: 'Coverage Ceilings', icon: Sliders },
  ] as any;

  const systemItems = [
    { id: 'accounts', label: 'User Accounts', icon: ShieldCheck },
    { id: 'logs', label: 'Audit & Access Logs', icon: History },
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
    <aside className={`w-[248px] ${theme.palette.sidebarGradient} text-white flex flex-col h-full shadow-2xl select-none border-r ${theme.palette.sidebarBorder} relative overflow-hidden`}>
      {/* Background ambient light glow */}
      <div className={`absolute -bottom-16 -left-16 w-56 h-56 ${theme.palette.accentGlow} rounded-full blur-3xl pointer-events-none`} />

      {/* Clean subtle ACTIVA vector background curves without dots */}
      {/* === AMÉLIORATION AJOUTÉE : couleur du motif désormais tirée de theme.palette.motifStroke
          (or/ambre pour Admin, turquoise pour Superviseur, blanc inchangé pour Agent) au lieu
          d'un blanc fixe pour les 3 rôles — le tracé SVG et les niveaux d'opacité restent
          strictement identiques, seule la teinte varie selon l'interface active. === */}
      <div className="absolute inset-0 pointer-events-none opacity-50 overflow-hidden z-0">
        <svg className="absolute bottom-0 left-0 w-full h-84" viewBox="0 0 250 320" fill="none" xmlns="http://www.w3.org/2000/svg">
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
          titleColor={isAdmin ? 'text-slate-300/90' : isSupervisor ? 'text-teal-200/80' : 'text-blue-200/80'}
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
            <span className="text-[9.5px] font-semibold text-white/90 tracking-wide truncate">
              {currentUser?.entity || 'ACTIVA Liberia'}
            </span>
          </div>
          <span className="text-white/60 text-[9.5px] font-mono font-bold shrink-0">
            v2.4.0
          </span>
        </div>
      </div>
    </aside>
  );
};


