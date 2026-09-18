import type { CSSProperties } from 'react';
import { normalizeRole } from '../utils/authUtils';

// === AMÉLIORATION AJOUTÉE : ACTIVA Health Claims — Phase 1 (fondation, additif) — 4 nouveaux
// rôles (voir src/utils/authUtils.ts AppRole). Aucune valeur/écran existant n'est modifié.
export type UserRole = 'Admin' | 'Supervisor' | 'Agent' | 'ClaimsAgent' | 'MedicalReviewer' | 'Finance' | 'Management';

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
    // === AMÉLIORATION AJOUTÉE : refonte visuelle (2026-09-18) — nouvelle variante "claire" de
    // la barre latérale (fond blanc, structure inspirée de la maquette "activa-whistleblowing"),
    // ajoutée à côté des clés existantes (sidebarBg/sidebarGradient/... et activeItemBg/...)
    // sans les modifier : ces dernières restent utilisées telles quelles ailleurs dans l'app
    // (sidebarBg sert de couleur de marque dans des graphiques — ReportsView/DashboardView —, et
    // activeIconColor est réutilisé par la barre de navigation mobile sombre dans App.tsx). Ces
    // nouvelles clés ne sont consommées que par le nouveau rendu de Sidebar.tsx.
    sidebarLightBg: string;
    sidebarLightBorder: string;
    sidebarLightActiveBg: string;
    sidebarLightActiveText: string;
    sidebarLightActiveIndicator: string;
    sidebarLightActiveIcon: string;
    sidebarLightInactiveText: string;
    sidebarLightInactiveHoverBg: string;
    sidebarLightBadgeBg: string;
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
  // === AMÉLIORATION AJOUTÉE : variante claire de la sidebar — accent gris-ardoise (identique à
  // pageTitleColor/avatarBg d'ADMIN_THEME) pour rester cohérent avec le reste de l'interface Admin.
  sidebarLightBg: 'bg-white',
  sidebarLightBorder: 'border-slate-200',
  sidebarLightActiveBg: 'bg-[#f1f5f9]',
  sidebarLightActiveText: 'text-[#2c394c] font-bold',
  sidebarLightActiveIndicator: 'bg-[#404e62]',
  sidebarLightActiveIcon: 'text-[#404e62]',
  sidebarLightInactiveText: 'text-slate-500 hover:text-slate-800',
  sidebarLightInactiveHoverBg: 'hover:bg-slate-50',
  sidebarLightBadgeBg: 'bg-[#f1f5f9] text-[#2c394c]',
};

export const ADMIN_THEME: RoleThemeConfig = {
  role: 'Admin',
  displayName: 'Administrator',
  palette: {
    ...NEUTRAL_GRAY_PALETTE,
    // === AMÉLIORATION AJOUTÉE : retour au gris (retour utilisateur, 2026-09-07) — le fond rouge
    // (introduit puis affiné à plusieurs reprises) est abandonné : "revient au gris comme
    // c'était avant mais en plus claire". On revient donc à la même famille slate que
    // NEUTRAL_GRAY_PALETTE (celle utilisée "avant", et toujours utilisée telle quelle par
    // Superviseur ci-dessous), mais éclaircie d'un cran (slate-500/600/700 au lieu de
    // slate-700/800/900) afin de rester bien distincte du gris plus sombre du Superviseur tout
    // en gardant un contraste suffisant avec le texte blanc de la barre latérale.
    // === AMÉLIORATION AJOUTÉE : gris légèrement augmenté (retour utilisateur, 2026-09-08) —
    // chaque teinte rapprochée d'environ 35% de celle du Superviseur (mélange HSL, pas un
    // simple cran Tailwind entier), pour un gris un peu plus marqué qu'avant tout en restant
    // clairement plus clair/distinct que le Superviseur.
    sidebarBg: '#404e62',
    sidebarGradient: 'bg-gradient-to-b from-[#536278] via-[#435064] to-[#2c394c]',
    sidebarBorder: 'border-slate-400/70',
    badgeBg: 'bg-[#2c394c] text-white border border-slate-400',
    primaryColor: 'bg-[#404e62] hover:bg-[#2c394c]',
    primaryHover: 'hover:bg-[#2c394c]',
    primaryText: 'text-[#2c394c]',
    pageTitleColor: 'text-[#2c394c]',
    avatarBg: 'bg-[#404e62]',
    bannerGradient: 'bg-gradient-to-r from-[#2c394c] via-[#404e62] to-[#1E293B]',
    bannerBorder: 'border-slate-400',
    modalHeaderBg: 'bg-[#404e62]',
    accentBadge: 'bg-[#404e62] text-white',
    accentRing: 'focus:ring-[#404e62]',
    accentGlow: 'bg-slate-400/25',
    // hexRamp et motifStroke reviennent à ceux hérités de NEUTRAL_GRAY_PALETTE (rampe "slate"
    // Tailwind standard, motif or/ambre) — aucune surcharge nécessaire ici.
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
    // Agent — blanc, identique à l'existant (comportement inchangé, sert de référence à la
    // page de connexion qui reprend ce même motif).
    motifStroke: '255, 255, 255',
    // === AMÉLIORATION AJOUTÉE : variante claire de la sidebar — accent bleu marine (identique à
    // pageTitleColor/primaryText de AGENT_THEME).
    sidebarLightBg: 'bg-white',
    sidebarLightBorder: 'border-slate-200',
    sidebarLightActiveBg: 'bg-[#eff6ff]',
    sidebarLightActiveText: 'text-[#0A347B] font-bold',
    sidebarLightActiveIndicator: 'bg-[#0A347B]',
    sidebarLightActiveIcon: 'text-[#0A347B]',
    sidebarLightInactiveText: 'text-slate-500 hover:text-slate-800',
    sidebarLightInactiveHoverBg: 'hover:bg-slate-50',
    sidebarLightBadgeBg: 'bg-[#dbeafe] text-[#0A347B]',
  },
};

// === AMÉLIORATION AJOUTÉE : identité Superviseur alignée sur le bleu marine Agent, distinguée
// par un liseré rouge (retour utilisateur, 2026-09-08 — aperçu validé avant implémentation,
// voir l'Artifact "Supervisor Theme Proposal"). Remplace la palette grise neutre utilisée
// depuis le 2026-09-07 ("adopter les couleurs grises pour l'interface superviseur ... ne rien
// changer pour l'interface admin") : même remplissage bleu marine que AGENT_THEME (barre
// latérale, boutons, badges, texte, rampe de couleurs, hérités via le spread ci-dessous) —
// seuls les bords (barre latérale, boutons pleins, badges, bannière) et le motif de courbes
// décoratif portent désormais un rouge brique. Couleur (RGB 194,79,71) affinée à deux reprises
// sur retour utilisateur : d'abord assombrie/désaturée ("augmente encore le rouge mais
// adoucis-le" — décalée du rouge vif #DC2626 vers ce rouge brique), puis les BORDS
// spécifiquement rendus plus discrets ("adoucir encore les contours, je veux que le rouge soit
// fin, excepté les motifs" — opacité des bords ramenée de 0.78 à 0.4 ; seul le motif de
// courbes, qui doit rester visible pour marquer la différence avec Agent, garde ses propres
// niveaux d'opacité inchangés dans Sidebar.tsx).
// === AMÉLIORATION AJOUTÉE : rouge du motif de courbes de la sidebar Superviseur intensifié
// (retour utilisateur, 2026-09-10 — "augmente la couleur rouge des motifs de l'interface
// superviseur (sidebar)") — uniquement `motifStroke` (194,79,71 -> 214,52,44), qui gouverne
// exclusivement le tracé décoratif de la sidebar (voir Sidebar.tsx). Les bords/badges/bannière
// ci-dessous gardent leur rouge brique adouci d'origine, inchangé — ils avaient été
// explicitement assourdis sur une demande précédente distincte ("adoucir les contours...
// excepté les motifs").
export const SUPERVISOR_THEME: RoleThemeConfig = {
  role: 'Supervisor',
  displayName: 'Medical Advisor & Supervisor',
  palette: {
    ...AGENT_THEME.palette,
    sidebarBorder: 'border-[rgba(194,79,71,0.4)]',
    badgeBg: 'bg-[#2563EB] text-white border border-[rgba(194,79,71,0.4)]',
    primaryColor: 'bg-[#0A347B] hover:bg-[#072659] border border-[rgba(194,79,71,0.4)]',
    bannerBorder: 'border-[rgba(194,79,71,0.4)]',
    accentBadge: 'bg-[#0A347B] text-white border border-[rgba(194,79,71,0.4)]',
    motifStroke: '214, 52, 44',
    // === AMÉLIORATION AJOUTÉE : variante claire de la sidebar — texte/fond actif hérités du bleu
    // marine Agent (spread ci-dessus). Le liseré rouge brique distinguant le Superviseur (utilisé
    // pour `sidebarBorder`, le thème sombre) n'est PAS repris ici : demande explicite
    // utilisateur (2026-09-18) — "retirez les contours colorés partout" — la bordure de la
    // sidebar claire reste neutre (`sidebarLightBorder`, héritée du spread ci-dessus), quel que
    // soit le rôle.
  },
};

// === AMÉLIORATION AJOUTÉE : ACTIVA Health Claims — Phase 1 (fondation, additif) — 4 palettes
// distinctes pour les nouveaux rôles, suivant exactement le même motif que SUPERVISOR_THEME
// ci-dessus (spread d'une palette existante + surcharges), pour rester cohérent visuellement
// avec l'app sans introduire un second système de design. Non utilisées par aucun écran tant
// que la Phase 2/3 (écrans du module) n'est pas construite.
export const CLAIMS_AGENT_THEME: RoleThemeConfig = {
  role: 'ClaimsAgent',
  displayName: 'Claims Agent',
  palette: {
    ...AGENT_THEME.palette,
    sidebarBg: '#0F766E',
    sidebarGradient: 'bg-gradient-to-b from-[#134E4A] via-[#0F766E] to-[#115E59]',
    sidebarBorder: 'border-teal-800/70',
    badgeBg: 'bg-[#0D9488] text-white',
    primaryColor: 'bg-[#0F766E] hover:bg-[#134E4A]',
    primaryHover: 'hover:bg-[#134E4A]',
    primaryText: 'text-[#0F766E]',
    pageTitleColor: 'text-[#0F766E]',
    avatarBg: 'bg-[#0F766E]',
    bannerGradient: 'bg-gradient-to-r from-[#134E4A] via-[#0F766E] to-[#115E59]',
    bannerBorder: 'border-teal-800',
    modalHeaderBg: 'bg-[#0F766E]',
    accentBadge: 'bg-[#0F766E] text-white',
    accentRing: 'focus:ring-[#0F766E]',
    accentGlow: 'bg-teal-400/20',
    hexRamp: {
      '50': '#f0fdfa', '100': '#ccfbf1', '200': '#99f6e4', '300': '#5eead4', '400': '#2dd4bf',
      '500': '#14b8a6', '600': '#0d9488', '700': '#0f766e', '800': '#115e59', '900': '#134e4a',
    },
    motifStroke: '20, 184, 166',
    // === AMÉLIORATION AJOUTÉE : variante claire de la sidebar — accent teal (identique à
    // pageTitleColor/primaryText de CLAIMS_AGENT_THEME).
    sidebarLightActiveBg: 'bg-[#f0fdfa]',
    sidebarLightActiveText: 'text-[#0F766E] font-bold',
    sidebarLightActiveIndicator: 'bg-[#0F766E]',
    sidebarLightActiveIcon: 'text-[#0F766E]',
    sidebarLightBadgeBg: 'bg-[#ccfbf1] text-[#0F766E]',
  },
};

export const MEDICAL_REVIEWER_THEME: RoleThemeConfig = {
  role: 'MedicalReviewer',
  displayName: 'Medical Reviewer',
  palette: {
    ...AGENT_THEME.palette,
    sidebarBg: '#4338CA',
    sidebarGradient: 'bg-gradient-to-b from-[#312E81] via-[#4338CA] to-[#3730A3]',
    sidebarBorder: 'border-indigo-800/70',
    badgeBg: 'bg-[#4F46E5] text-white',
    primaryColor: 'bg-[#4338CA] hover:bg-[#312E81]',
    primaryHover: 'hover:bg-[#312E81]',
    primaryText: 'text-[#4338CA]',
    pageTitleColor: 'text-[#4338CA]',
    avatarBg: 'bg-[#4338CA]',
    bannerGradient: 'bg-gradient-to-r from-[#312E81] via-[#4338CA] to-[#3730A3]',
    bannerBorder: 'border-indigo-800',
    modalHeaderBg: 'bg-[#4338CA]',
    accentBadge: 'bg-[#4338CA] text-white',
    accentRing: 'focus:ring-[#4338CA]',
    accentGlow: 'bg-indigo-400/20',
    hexRamp: {
      '50': '#eef2ff', '100': '#e0e7ff', '200': '#c7d2fe', '300': '#a5b4fc', '400': '#818cf8',
      '500': '#6366f1', '600': '#4f46e5', '700': '#4338ca', '800': '#3730a3', '900': '#312e81',
    },
    motifStroke: '79, 70, 229',
    // === AMÉLIORATION AJOUTÉE : variante claire de la sidebar — accent indigo (identique à
    // pageTitleColor/primaryText de MEDICAL_REVIEWER_THEME).
    sidebarLightActiveBg: 'bg-[#eef2ff]',
    sidebarLightActiveText: 'text-[#4338CA] font-bold',
    sidebarLightActiveIndicator: 'bg-[#4338CA]',
    sidebarLightActiveIcon: 'text-[#4338CA]',
    sidebarLightBadgeBg: 'bg-[#e0e7ff] text-[#4338CA]',
  },
};

export const FINANCE_THEME: RoleThemeConfig = {
  role: 'Finance',
  displayName: 'Finance',
  palette: {
    ...AGENT_THEME.palette,
    sidebarBg: '#047857',
    sidebarGradient: 'bg-gradient-to-b from-[#064E3B] via-[#047857] to-[#065F46]',
    sidebarBorder: 'border-emerald-800/70',
    badgeBg: 'bg-[#059669] text-white',
    primaryColor: 'bg-[#047857] hover:bg-[#064E3B]',
    primaryHover: 'hover:bg-[#064E3B]',
    primaryText: 'text-[#047857]',
    pageTitleColor: 'text-[#047857]',
    avatarBg: 'bg-[#047857]',
    bannerGradient: 'bg-gradient-to-r from-[#064E3B] via-[#047857] to-[#065F46]',
    bannerBorder: 'border-emerald-800',
    modalHeaderBg: 'bg-[#047857]',
    accentBadge: 'bg-[#047857] text-white',
    accentRing: 'focus:ring-[#047857]',
    accentGlow: 'bg-emerald-400/20',
    hexRamp: {
      '50': '#ecfdf5', '100': '#d1fae5', '200': '#a7f3d0', '300': '#6ee7b7', '400': '#34d399',
      '500': '#10b981', '600': '#059669', '700': '#047857', '800': '#065f46', '900': '#064e3b',
    },
    motifStroke: '5, 150, 105',
    // === AMÉLIORATION AJOUTÉE : variante claire de la sidebar — accent émeraude (identique à
    // pageTitleColor/primaryText de FINANCE_THEME).
    sidebarLightActiveBg: 'bg-[#ecfdf5]',
    sidebarLightActiveText: 'text-[#047857] font-bold',
    sidebarLightActiveIndicator: 'bg-[#047857]',
    sidebarLightActiveIcon: 'text-[#047857]',
    sidebarLightBadgeBg: 'bg-[#d1fae5] text-[#047857]',
  },
};

export const MANAGEMENT_THEME: RoleThemeConfig = {
  role: 'Management',
  displayName: 'Management',
  palette: {
    ...AGENT_THEME.palette,
    sidebarBg: '#B45309',
    sidebarGradient: 'bg-gradient-to-b from-[#78350F] via-[#B45309] to-[#92400E]',
    sidebarBorder: 'border-amber-800/70',
    badgeBg: 'bg-[#D97706] text-white',
    primaryColor: 'bg-[#B45309] hover:bg-[#78350F]',
    primaryHover: 'hover:bg-[#78350F]',
    primaryText: 'text-[#B45309]',
    pageTitleColor: 'text-[#B45309]',
    avatarBg: 'bg-[#B45309]',
    bannerGradient: 'bg-gradient-to-r from-[#78350F] via-[#B45309] to-[#92400E]',
    bannerBorder: 'border-amber-800',
    modalHeaderBg: 'bg-[#B45309]',
    accentBadge: 'bg-[#B45309] text-white',
    accentRing: 'focus:ring-[#B45309]',
    accentGlow: 'bg-amber-400/20',
    hexRamp: {
      '50': '#fffbeb', '100': '#fef3c7', '200': '#fde68a', '300': '#fcd34d', '400': '#fbbf24',
      '500': '#f59e0b', '600': '#d97706', '700': '#b45309', '800': '#92400e', '900': '#78350f',
    },
    motifStroke: '217, 119, 6',
    // === AMÉLIORATION AJOUTÉE : variante claire de la sidebar — accent ambre (identique à
    // pageTitleColor/primaryText de MANAGEMENT_THEME).
    sidebarLightActiveBg: 'bg-[#fffbeb]',
    sidebarLightActiveText: 'text-[#B45309] font-bold',
    sidebarLightActiveIndicator: 'bg-[#B45309]',
    sidebarLightActiveIcon: 'text-[#B45309]',
    sidebarLightBadgeBg: 'bg-[#fef3c7] text-[#B45309]',
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
  // === AMÉLIORATION AJOUTÉE : ACTIVA Health Claims — Phase 1 (fondation, additif) ===
  if (normalized === 'ClaimsAgent') {
    return CLAIMS_AGENT_THEME;
  }
  if (normalized === 'MedicalReviewer') {
    return MEDICAL_REVIEWER_THEME;
  }
  if (normalized === 'Finance') {
    return FINANCE_THEME;
  }
  if (normalized === 'Management') {
    return MANAGEMENT_THEME;
  }
  return ADMIN_THEME;
}
