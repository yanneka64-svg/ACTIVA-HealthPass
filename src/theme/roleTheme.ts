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
    // === AMÉLIORATION AJOUTÉE : couleur (triplet RGB, utilisé dans des rgba()) du motif de
    // courbes décoratif de la sidebar — distincte par rôle, pour qu'on distingue visuellement
    // l'interface active en naviguant d'un rôle à l'autre, même si le dégradé de fond reste
    // dans une tonalité bleu/marine proche. Le motif lui-même (tracé SVG) est inchangé.
    motifStroke: string;
  };
}

// === AMÉLIORATION AJOUTÉE : UI (retour utilisateur, 2026-09-07) — palette grise neutre
// d'origine, conservée telle quelle pour le Superviseur (voir SUPERVISOR_THEME plus bas :
// "adopter les couleurs grises pour l'interface superviseur ... ne rien changer pour l'interface
// admin"). Admin, lui, en dérive ci-dessous en réchauffant TOUTES les couleurs (barre latérale,
// boutons, bandeaux, badges) vers un même rouge sourd — plus seulement la barre latérale — sur
// demande explicite ("tous les boutons et bouton de fenêtre doivent avoir la couleur du
// sidebar").
const NEUTRAL_GRAY_PALETTE = {
  sidebarBg: '#334155',
  sidebarGradient: 'bg-gradient-to-b from-[#334155] via-[#3B485C] to-[#1E293B]',
  sidebarBorder: 'border-slate-600/70',
  activeItemBg: 'bg-white/20 hover:bg-white/25',
  activeItemText: 'text-white font-bold',
  activeIndicator: 'bg-white',
  activeIconColor: 'text-white',
  inactiveText: 'text-slate-200/90 hover:text-white',
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
  } as BrandHexRamp,
  // Admin — teinte or/ambre (identité "exécutif"), distincte du bleu Agent et du vert Superviseur.
  motifStroke: '245, 197, 66',
};

export const ADMIN_THEME: RoleThemeConfig = {
  role: 'Admin',
  displayName: 'Administrator',
  palette: {
    ...NEUTRAL_GRAY_PALETTE,
    // === AMÉLIORATION AJOUTÉE : léger fond rouge (retour utilisateur, 2026-09-07, affiné trois
    // fois : intensité réduite, étendue à TOUTE l'interface, puis ici alignée exactement sur le
    // dégradé de la bannière "Real-Time Eligibility Verification" de l'onglet Coverage Ceilings
    // (voir CeilingsView.tsx : from-[#3F1212] via-[#2A0A0A] to-[#0D0404]) — cette bannière étant
    // déjà la teinte la plus sombre/la moins rouge de l'interface Admin, on en fait ici la seule
    // source de vérité : barre latérale, boutons, bandeaux, badges et fenêtres modales
    // reprennent désormais très exactement ces trois mêmes tons, au lieu d'une teinte proche
    // mais différente comme précédemment.
    sidebarBg: '#2A0A0A',
    sidebarGradient: 'bg-gradient-to-b from-[#3F1212] via-[#2A0A0A] to-[#0D0404]',
    sidebarBorder: 'border-red-950/70',
    badgeBg: 'bg-[#0D0404] text-white border border-[#3F1212]/70',
    primaryColor: 'bg-[#2A0A0A] hover:bg-[#0D0404]',
    primaryHover: 'hover:bg-[#0D0404]',
    primaryText: 'text-[#0D0404]',
    pageTitleColor: 'text-[#0D0404]',
    avatarBg: 'bg-[#2A0A0A]',
    bannerGradient: 'bg-gradient-to-r from-[#3F1212] via-[#2A0A0A] to-[#0D0404]',
    bannerBorder: 'border-red-950/70',
    modalHeaderBg: 'bg-[#2A0A0A]',
    accentBadge: 'bg-[#2A0A0A] text-white',
    accentRing: 'focus:ring-[#2A0A0A]',
    accentGlow: 'bg-[#2A0A0A]/25',
    // Rampe "slate" ci-dessus reproduite avec la même teinte que la bannière Coverage Ceilings :
    // les tons 700/800/900 sont désormais très exactement les 3 couleurs de son dégradé
    // (#3F1212/#2A0A0A/#0D0404), et les tons clairs (50-600) réduisent encore la saturation
    // rouge par rapport à la version précédente, tout en gardant les mêmes niveaux de clarté
    // que la rampe "slate" d'origine pour ne pas casser la lisibilité du texte/badges existants.
    hexRamp: {
      '50': '#fafafa', '100': '#f6f4f4', '200': '#ebe7e7', '300': '#dcd0d0', '400': '#bb9191',
      '500': '#a34c4c', '600': '#803030', '700': '#3f1212', '800': '#2a0a0a', '900': '#0d0404',
    },
  },
};

// === AMÉLIORATION AJOUTÉE : UI (retour utilisateur, 2026-09-07) — "adopter les couleurs grises
// pour l'interface superviseur (comme précédemment pour l'interface admin) ; ne rien changer
// pour l'interface admin". Le Superviseur reprend donc intégralement la palette grise neutre
// d'origine (barre latérale, boutons, bandeaux, badges, fenêtres modales) — la même logique que
// pour Admin ci-dessus, mais appliquée à sa propre couleur (gris) plutôt qu'au rouge. `role`/
// `displayName` inchangés : seule l'apparence est alignée.
export const SUPERVISOR_THEME: RoleThemeConfig = {
  role: 'Supervisor',
  displayName: 'Medical Advisor & Supervisor',
  palette: { ...NEUTRAL_GRAY_PALETTE },
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
    // Agent — blanc, identique à l'existant (comportement inchangé, sert de référence à la
    // page de connexion qui reprend ce même motif).
    motifStroke: '255, 255, 255',
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
