import { normalizeRole } from '../utils/authUtils';

export type UserRole = 'Admin' | 'Supervisor' | 'Agent';

export interface RoleThemeConfig {
  role: UserRole;
  displayName: string;
  palette: {
    sidebarBg: string;
    sidebarGradient: string;
    sidebarBorder: string;
    activeItemBg: string;
    activeItemText: string;
    activeIndicator: string;
    activeIconColor: string;
    inactiveText: string;
    inactiveHoverBg: string;
    badgeBg: string;
    primaryColor: string;
    primaryHover: string;
    primaryText: string;
    pageTitleColor: string;
    avatarBg: string;
    bannerGradient: string;
    bannerBorder: string;
    modalHeaderBg: string;
    accentBadge: string;
    accentRing: string;
    accentGlow: string;
  };
}

export const ADMIN_THEME: RoleThemeConfig = {
  role: 'Admin',
  displayName: 'Administrator',
  palette: {
    sidebarBg: '#334155',
    sidebarGradient: 'bg-gradient-to-b from-[#334155] via-[#3B485C] to-[#1E293B]',
    sidebarBorder: 'border-slate-600/70',
    activeItemBg: 'bg-white/20 hover:bg-white/25',
    activeItemText: 'text-white font-bold',
    activeIndicator: 'bg-white',
    activeIconColor: 'text-white',
    inactiveText: 'text-slate-200/90 hover:text-white',
    inactiveHoverBg: 'hover:bg-white/10',
    badgeBg: 'bg-slate-700 text-white border border-slate-500',
    primaryColor: 'bg-slate-700 hover:bg-slate-800',
    primaryHover: 'hover:bg-slate-800',
    primaryText: 'text-slate-700',
    pageTitleColor: 'text-slate-800',
    avatarBg: 'bg-slate-700',
    bannerGradient: 'bg-gradient-to-r from-slate-700 via-slate-800 to-slate-700',
    bannerBorder: 'border-slate-600',
    modalHeaderBg: 'bg-slate-700',
    accentBadge: 'bg-slate-700 text-white',
    accentRing: 'focus:ring-slate-500',
    accentGlow: 'bg-slate-400/20',
  },
};

export const SUPERVISOR_THEME: RoleThemeConfig = {
  role: 'Supervisor',
  displayName: 'Medical Advisor & Supervisor',
  palette: {
    sidebarBg: '#134E4A',
    sidebarGradient: 'bg-gradient-to-b from-[#042F2E] via-[#115E59] to-[#134E4A]',
    sidebarBorder: 'border-[#115E59]',
    activeItemBg: 'bg-[#0D9488] hover:bg-[#0F766E]',
    activeItemText: 'text-white font-bold',
    activeIndicator: 'bg-[#2DD4BF]',
    activeIconColor: 'text-[#2DD4BF]',
    inactiveText: 'text-teal-100/80 hover:text-white',
    inactiveHoverBg: 'hover:bg-white/10',
    badgeBg: 'bg-[#0D9488] text-white',
    primaryColor: 'bg-[#0F766E] hover:bg-[#115E59]',
    primaryHover: 'hover:bg-[#115E59]',
    primaryText: 'text-[#0F766E]',
    pageTitleColor: 'text-[#0F766E]',
    avatarBg: 'bg-[#0F766E]',
    bannerGradient: 'bg-gradient-to-r from-[#042F2E] via-[#0F766E] to-[#134E4A]',
    bannerBorder: 'border-teal-800',
    modalHeaderBg: 'bg-[#0F766E]',
    accentBadge: 'bg-[#0F766E] text-white',
    accentRing: 'focus:ring-[#0F766E]',
    accentGlow: 'bg-teal-400/20',
  },
};

export const AGENT_THEME: RoleThemeConfig = {
  role: 'Agent',
  displayName: 'Front Desk & Processing Agent',
  palette: {
    sidebarBg: '#0A347B',
    sidebarGradient: 'bg-gradient-to-b from-[#072659] via-[#0A347B] to-[#0D2B63]',
    sidebarBorder: 'border-[#082b66]',
    activeItemBg: 'bg-white/20 hover:bg-white/25',
    activeItemText: 'text-white font-bold',
    activeIndicator: 'bg-[#10B981]',
    activeIconColor: 'text-[#10B981]',
    inactiveText: 'text-blue-100/85 hover:text-white',
    inactiveHoverBg: 'hover:bg-white/10',
    badgeBg: 'bg-[#2563EB] text-white',
    primaryColor: 'bg-[#0A347B] hover:bg-[#072659]',
    primaryHover: 'hover:bg-[#072659]',
    primaryText: 'text-[#0A347B]',
    pageTitleColor: 'text-[#0A347B]',
    avatarBg: 'bg-[#0A347B]',
    bannerGradient: 'bg-gradient-to-r from-[#072659] via-[#0A347B] to-[#0D2B63]',
    bannerBorder: 'border-blue-900',
    modalHeaderBg: 'bg-[#0A347B]',
    accentBadge: 'bg-[#0A347B] text-white',
    accentRing: 'focus:ring-[#0A347B]',
    accentGlow: 'bg-blue-400/20',
  },
};

export function getRoleTheme(roleInput?: string | null): RoleThemeConfig {
  const normalized = normalizeRole(roleInput);
  if (normalized === 'Supervisor') {
    return SUPERVISOR_THEME;
  }
  if (normalized === 'Agent') {
    return AGENT_THEME;
  }
  return ADMIN_THEME;
}
