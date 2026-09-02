import type { CSSProperties } from 'react';
import { normalizeRole } from '../utils/authUtils';

export type UserRole = 'Admin' | 'Supervisor' | 'Agent';

// === AMÉLIORATION AJOUTÉE : rampe de nuances (50 -> 900) par rôle ===
// Toutes les vues de l'application utilisaient auparavant la couleur "Activa Navy"
// (#0a2e6b) codée en dur pour les boutons, bandeaux, fenêtres modales et badges — même
// dans les interfaces Admin (slate) et Superviseur (sarcelle), qui n'ont donc jamais
// vraiment porté leur propre couleur ailleurs que dans la barre latérale. Cette rampe
// fournit, pour chaque rôle, un jeu de nuances Tailwind-compatibles (mêmes teintes que
// celles déjà utilisées dans la palette ci-dessous : slate pour Admin, teal pour
// Superviseur, blue pour Agent — 900 = couleur de marque exacte du rôle) afin que TOUT
// élément (bouton, fenêtre, barre) puisse désormais suivre la couleur du bandeau qui
// porte le menu. Exposée à la fois en variables CSS (getRoleCssVars, pour les classes
// Tailwind `bg-[var(--brand-900)]` etc.) et en valeurs hexadécimales brutes (pour les
// couleurs de graphiques calculées en JS, ex. Recharts).
export type BrandRampKey = '50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
export type BrandHexRamp = Record<BrandRampKey, string>;

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
    hexRamp: BrandHexRamp;
  };
}

export const ADMIN_THEME: RoleThemeConfig = {
  role: 'Admin',
  displayName: 'Administrator',
  palette: {
    sidebarBg: '#111827',
    sidebarGradient: 'bg-gradient-to-b from-[#111827] via-[#1F2937] to-[#0F172A]',
    sidebarBorder: 'border-[#374151]',
    activeItemBg: 'bg-white/15 hover:bg-white/20',
    activeItemText: 'text-white font-bold',
    activeIndicator: 'bg-white',
    activeIconColor: 'text-white',
    inactiveText: 'text-gray-300 hover:text-white',
    inactiveHoverBg: 'hover:bg-white/10',
    badgeBg: 'bg-[#111827] text-white border border-gray-600',
    primaryColor: 'bg-[#1F2937] hover:bg-[#111827]',
    primaryHover: 'hover:bg-[#111827]',
    primaryText: 'text-[#111827]',
    pageTitleColor: 'text-[#111827]',
    avatarBg: 'bg-[#1F2937]',
    bannerGradient: 'bg-gradient-to-r from-[#111827] via-[#1F2937] to-[#0F172A]',
    bannerBorder: 'border-gray-800',
    modalHeaderBg: 'bg-[#1F2937]',
    accentBadge: 'bg-[#1F2937] text-white',
    accentRing: 'focus:ring-[#1F2937]',
    accentGlow: 'bg-gray-500/20',
    // Tailwind's native "slate" ramp — already the exact family used above (#0F172A = slate-900).
    hexRamp: {
      '50': '#f8fafc', '100': '#f1f5f9', '200': '#e2e8f0', '300': '#cbd5e1', '400': '#94a3b8',
      '500': '#64748b', '600': '#475569', '700': '#334155', '800': '#1e293b', '900': '#0f172a',
    },
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
    // Tailwind's native "teal" ramp — already the exact family used above (#134E4A = teal-900).
    hexRamp: {
      '50': '#f0fdfa', '100': '#ccfbf1', '200': '#99f6e4', '300': '#5eead4', '400': '#2dd4bf',
      '500': '#14b8a6', '600': '#0d9488', '700': '#0f766e', '800': '#115e59', '900': '#134e4a',
    },
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
    // Tailwind's native "blue" ramp for 50-800; 900 kept as the exact original brand hex
    // (#0a2e6b, slightly darker than Tailwind's blue-900) so Agent's UI stays pixel-identical.
    hexRamp: {
      '50': '#eff6ff', '100': '#dbeafe', '200': '#bfdbfe', '300': '#93c5fd', '400': '#60a5fa',
      '500': '#3b82f6', '600': '#2563eb', '700': '#1d4ed8', '800': '#1e40af', '900': '#0a2e6b',
    },
  },
};

/**
 * Returns a React inline-style object of CSS custom properties (--brand-50 .. --brand-900)
 * for the given role, meant to be spread on a top-level wrapping element once the user's
 * role is known (post-authentication). Every view/component below that element can then
 * reference `bg-[var(--brand-900)]`, `text-[var(--brand-600)]`, etc. instead of a hardcoded
 * color, and automatically picks up the correct role color everywhere.
 */
export function getRoleCssVars(roleInput?: string | null): CSSProperties {
  const theme = getRoleTheme(roleInput);
  const vars: Record<string, string> = {};
  (Object.keys(theme.palette.hexRamp) as BrandRampKey[]).forEach((key) => {
    vars[`--brand-${key}`] = theme.palette.hexRamp[key];
  });
  return vars as CSSProperties;
}

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
