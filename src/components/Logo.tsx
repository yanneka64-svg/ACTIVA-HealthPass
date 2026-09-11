import React, { useEffect, useState } from 'react';

export type LogoVariant = 'full' | 'compact' | 'mini' | 'icon-only' | 'responsive';
export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface LogoProps {
  className?: string;
  size?: LogoSize;
  variant?: LogoVariant;
  showTagline?: boolean;
  transparent?: boolean;
}

// === AMÉLIORATION AJOUTÉE : remplace l'ancienne icône dessinée à la main (cœur + croix +
// feuille) par le logo officiel fourni par l'utilisateur — un cœur composé d'un lobe bleu
// plein (gauche) et d'un lobe bleu en contour (droite), une croix médicale verte au centre,
// et un léger paraphe vert en dessous. Le fichier /activa-heart-icon.png est le cœur seul,
// recadré depuis la version haute résolution du logo fourni (sans arrière-plan ni cadre
// autour, qui ne font pas partie du logo). Ratio largeur/hauteur natif ≈ 1.24 (427×344px),
// conservé via object-contain.
export const ACTIVA_HEART_ICON_ASPECT = 427 / 344;

// === AMÉLIORATION AJOUTÉE : le texte "ACTIVA HealthPass" + le slogan sont reconstruits en
// SVG avec Montserrat (police confirmée correcte par l'utilisateur) plutôt qu'affichés comme
// une image plate — texte net à toutes les tailles, fichier plus léger. La première tentative
// utilisait la MÊME couleur navy pour "ACTIVA" et "HealthPass", ce qui ne correspondait pas au
// logo fourni : les deux couleurs ci-dessous sont échantillonnées pixel par pixel directement
// sur le fichier logo transmis par l'utilisateur ("ACTIVA" et le slogan sont un bleu plus
// clair, "HealthPass" un navy plus foncé — deux teintes distinctes, pas un dégradé).
const ACTIVA_BLUE = '#0546AF'; // couleur exacte de "ACTIVA" et du slogan, échantillonnée sur le logo fourni
const HEALTHPASS_NAVY = '#0A2F6D'; // couleur exacte de "HealthPass", échantillonnée sur le logo fourni
const TAGLINE_GREEN = '#00A651'; // puces vertes du slogan, cohérent avec la croix de l'emblème

// === AMÉLIORATION AJOUTÉE : correctif logo (retour utilisateur, 2026-09-11 — "quand je me
// déconnecte le logo Activa a du mal à s'afficher") === Montserrat était auparavant chargée via
// un @import glissé dans la balise <style> du SVG ci-dessous, réinjecté à chaque affichage du
// logo — peu fiable sous réseau ralenti. Désormais déclarée une seule fois dans index.html
// (comme les autres polices de l'app), donc plus besoin de l'importer ici.
const LOGO_FONT_STACK = "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/**
 * Isolated Medical Heart + Green Cross Icon (official ACTIVA HealthPass emblem)
 */
export const LogoIcon: React.FC<{ className?: string; size?: number | string }> = ({
  className = 'w-8 h-8',
}) => {
  return (
    <img
      src="/activa-heart-icon.png"
      alt="ACTIVA HealthPass Emblem"
      className={`${className} flex-shrink-0 block object-contain select-none`}
      draggable={false}
    />
  );
};

/**
 * "ACTIVA HealthPass" wordmark + optional tagline, rendered as scalable SVG text in the two
 * exact colors sampled from the provided logo (bright blue "ACTIVA" / navy "HealthPass").
 */
const WordmarkSvg: React.FC<{ className?: string; showTagline?: boolean }> = ({
  className = 'h-9',
  showTagline = true,
}) => {
  // === AMÉLIORATION AJOUTÉE : correctif complémentaire (retour utilisateur, 2026-09-11 — "le
  // logo Activa a du mal à charger" à la déconnexion, persistant malgré le premier correctif
  // ci-dessus qui déclare Montserrat dans index.html) — même bien déclarée, certains
  // navigateurs ne redessinent pas un texte SVG déjà monté une fois la police effectivement
  // chargée (contrairement au texte HTML classique, qui se redessine automatiquement quand la
  // police "swap" arrive) : si ce composant SVG se monte avant que Montserrat ne soit prête
  // (cas typique juste après la déconnexion, où l'écran de connexion réapparaît), le texte peut
  // rester bloqué sur la police de repli. On attend ici une confirmation explicite via l'API
  // CSS Font Loading, puis on force un nouveau montage du SVG (clé React) une fois la police
  // garantie disponible, éliminant cette course — sans rien changer à l'apparence.
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (typeof document !== 'undefined' && 'fonts' in document) {
      Promise.all([
        document.fonts.load('900 21px Montserrat'),
        document.fonts.load('700 21px Montserrat'),
        document.fonts.load('600 21px Montserrat'),
      ])
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setFontReady(true);
        });
    } else {
      setFontReady(true);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  return (
  <svg
    key={fontReady ? 'font-ready' : 'font-loading'}
    viewBox={showTagline ? '0 0 256 56' : '0 0 256 40'}
    className={`${className} w-auto max-w-full block`}
    xmlns="http://www.w3.org/2000/svg"
    aria-label="ACTIVA HealthPass"
    preserveAspectRatio="xMidYMid meet"
  >
    <defs>
      <style>
        {`
          .logo-activa-bold {
            font-family: ${LOGO_FONT_STACK};
            font-weight: 900;
            font-size: 21px;
            fill: ${ACTIVA_BLUE};
            letter-spacing: -0.2px;
          }
          .logo-healthpass-title {
            font-family: ${LOGO_FONT_STACK};
            font-weight: 700;
            font-size: 21px;
            fill: ${HEALTHPASS_NAVY};
            letter-spacing: -0.3px;
          }
          .logo-tagline-text {
            font-family: ${LOGO_FONT_STACK};
            font-weight: 600;
            font-size: 9.5px;
            fill: ${ACTIVA_BLUE};
            letter-spacing: 0.3px;
          }
        `}
      </style>
    </defs>
    <text x="0" y="30">
      <tspan className="logo-activa-bold">ACTIVA</tspan>
      <tspan dx="5" className="logo-healthpass-title">HealthPass</tspan>
    </text>
    {showTagline && (
      <g transform="translate(1, 47)">
        <text x="0" y="0" className="logo-tagline-text">Health</text>
        <circle cx="41" cy="-3.5" r="2.2" fill={TAGLINE_GREEN} />
        <text x="51" y="0" className="logo-tagline-text">Safety</text>
        <circle cx="95" cy="-3.5" r="2.2" fill={TAGLINE_GREEN} />
        <text x="105" y="0" className="logo-tagline-text">Serenity</text>
      </g>
    )}
  </svg>
  );
};

/**
 * Miniature Simplified Logo Badge (Ideal for mobile topbars, cards, and compact navigation)
 */
export const MiniLogo: React.FC<{
  className?: string;
  showText?: boolean;
  transparent?: boolean;
}> = ({ className = '', showText = true, transparent = false }) => {
  return (
    <div
      className={`inline-flex items-center gap-1.5 select-none transition-all duration-200 ${
        transparent
          ? 'bg-transparent'
          : 'bg-white rounded-lg px-2 py-1 shadow-2xs border border-slate-200/90'
      } ${className}`}
    >
      <LogoIcon className="w-6 h-6 sm:w-7 sm:h-7" />
      {showText && (
        <div className="flex flex-col leading-none whitespace-nowrap">
          <div className="flex items-baseline gap-1">
            <span className="font-extrabold text-xs sm:text-sm tracking-tight font-sans" style={{ color: ACTIVA_BLUE }}>
              ACTIVA
            </span>
            <span className="font-bold text-[11px] sm:text-xs font-sans" style={{ color: HEALTHPASS_NAVY }}>
              HealthPass
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-semibold tracking-wide mt-0.5" style={{ color: ACTIVA_BLUE }}>
            <span>Health</span>
            <span className="font-bold" style={{ color: TAGLINE_GREEN }}>•</span>
            <span>Safety</span>
            <span className="font-bold" style={{ color: TAGLINE_GREEN }}>•</span>
            <span>Serenity</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const Logo: React.FC<LogoProps> = ({
  className = '',
  size = 'md',
  variant = 'responsive',
  showTagline = true,
  transparent = false,
}) => {
  // If icon-only variant requested
  if (variant === 'icon-only') {
    const iconSizeMap: Record<LogoSize, string> = {
      xs: 'w-6 h-6',
      sm: 'w-7 h-7',
      md: 'w-9 h-9',
      lg: 'w-12 h-12',
      xl: 'w-15 h-15',
      '2xl': 'w-18 h-18',
    };
    return (
      <div
        className={`inline-flex items-center justify-center select-none ${
          transparent
            ? 'bg-transparent'
            : 'bg-white rounded-lg p-1.5 shadow-xs border border-slate-200/90'
        } ${className}`}
      >
        <LogoIcon className={iconSizeMap[size] || 'w-9 h-9'} />
      </div>
    );
  }

  // If explicit miniature variant requested
  if (variant === 'mini') {
    return <MiniLogo className={className} transparent={transparent} />;
  }

  // If compact variant requested (icon + single line brand name, no tagline)
  if (variant === 'compact') {
    return (
      <div
        className={`inline-flex items-center gap-2 select-none transition-all duration-200 whitespace-nowrap ${
          transparent
            ? 'bg-transparent'
            : 'bg-white rounded-lg px-2.5 py-1.5 shadow-2xs border border-slate-200/90'
        } ${className}`}
      >
        <LogoIcon className="w-7 h-7 sm:w-8 sm:h-8" />
        <div className="flex items-baseline gap-1 leading-none">
          <span className="font-black text-sm sm:text-base tracking-tight" style={{ color: ACTIVA_BLUE }}>
            ACTIVA
          </span>
          <span className="font-bold text-xs sm:text-sm" style={{ color: HEALTHPASS_NAVY }}>
            HealthPass
          </span>
        </div>
      </div>
    );
  }

  // Height mapping that scales cleanly with parent and never overflows
  const heightMap: Record<LogoSize, string> = {
    xs: 'h-6 sm:h-7',
    sm: 'h-7 sm:h-8',
    md: 'h-9 sm:h-10 md:h-11',
    lg: 'h-12 sm:h-13 md:h-14',
    xl: 'h-15 sm:h-16 md:h-18',
    '2xl': 'h-18 sm:h-20 md:h-24',
  };

  const currentHeight = heightMap[size] || 'h-9 sm:h-10 md:h-11';

  // Responsive mode: Compact white frame, strictly bounded contents with full text visibility
  if (variant === 'responsive') {
    return (
      <div
        className={`inline-flex items-center justify-center select-none transition-all duration-200 ${
          transparent
            ? 'bg-transparent'
            : 'bg-white rounded-lg px-2 sm:px-2.5 py-1 sm:py-1.5 shadow-2xs border border-slate-200/90'
        } ${className}`}
      >
        {/* Mobile & Tablet Compact View (< md) */}
        <div className="flex md:hidden items-center gap-1.5 sm:gap-2 whitespace-nowrap max-w-full">
          <LogoIcon className="w-6 h-6 sm:w-7 sm:h-7 shrink-0" />
          <div className="flex flex-col text-left leading-tight">
            <div className="flex items-baseline gap-1">
              <span className="font-black text-xs sm:text-sm tracking-tight" style={{ color: ACTIVA_BLUE }}>
                ACTIVA
              </span>
              <span className="font-bold text-[11px] sm:text-xs" style={{ color: HEALTHPASS_NAVY }}>
                HealthPass
              </span>
            </div>
            {showTagline && (
              <div className="flex items-center gap-1 text-[10px] sm:text-[10px] font-semibold tracking-wide mt-0.5" style={{ color: ACTIVA_BLUE }}>
                <span>Health</span>
                <span className="font-bold" style={{ color: TAGLINE_GREEN }}>•</span>
                <span>Safety</span>
                <span className="font-bold" style={{ color: TAGLINE_GREEN }}>•</span>
                <span>Serenity</span>
              </div>
            )}
          </div>
        </div>

        {/* Desktop View (>= md): icon (raster, official emblem) + wordmark (scalable SVG text) */}
        <div className="hidden md:flex items-center gap-1.5">
          <LogoIcon className={`${currentHeight} w-auto`} />
          <WordmarkSvg className={currentHeight} showTagline={showTagline} />
        </div>
      </div>
    );
  }

  // Full mode: same icon + wordmark composition, explicit variant for API compatibility
  return (
    <div
      className={`inline-flex items-center justify-center select-none transition-all duration-200 ${
        transparent
          ? 'bg-transparent'
          : 'bg-white rounded-lg px-2 sm:px-2.5 py-1 sm:py-1.5 shadow-2xs border border-slate-200/90'
      } ${className}`}
    >
      <div className="flex items-center gap-1.5 max-w-full">
        <LogoIcon className={`${currentHeight} w-auto`} />
        <WordmarkSvg className={currentHeight} showTagline={showTagline} />
      </div>
    </div>
  );
};
