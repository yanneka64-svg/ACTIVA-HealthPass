import React from 'react';

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

// === AMÉLIORATION AJOUTÉE : partout où le texte "ACTIVA HealthPass" + le slogan doivent
// s'afficher, on utilise désormais l'image COMPLÈTE du logo fourni (icône + texte + slogan)
// recadrée telle quelle depuis le fichier haute résolution transmis par l'utilisateur — au
// lieu de reconstruire le texte en SVG avec une police Google Fonts (Montserrat), qui ne
// correspondait pas exactement à la police du logo d'origine. Ceci garantit un rendu
// PIXEL-IDENTIQUE au logo fourni (police, graisse, dégradé sur "HealthPass", espacement),
// sans aucune reconstruction. Ratio largeur/hauteur natif ≈ 5.25 (1775×338px).
const FULL_LOGO_SRC = '/activa-healthpass-full-logo.png';
export const ACTIVA_FULL_LOGO_ASPECT = 1775 / 338;

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
 * Full lockup (emblem + "ACTIVA HealthPass" + tagline) as a single image, pixel-identical to
 * the logo file provided by the user — used by every variant below that shows the wordmark.
 */
const FullLogoImage: React.FC<{ className?: string }> = ({ className = 'h-9' }) => (
  <img
    src={FULL_LOGO_SRC}
    alt="ACTIVA HealthPass"
    className={`${className} w-auto object-contain select-none`}
    draggable={false}
  />
);

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
      className={`inline-flex items-center select-none transition-all duration-200 ${
        transparent
          ? 'bg-transparent'
          : 'bg-white rounded-lg px-2 py-1 shadow-2xs border border-slate-200/90'
      } ${className}`}
    >
      {showText ? <FullLogoImage className="h-7 sm:h-8" /> : <LogoIcon className="w-6 h-6 sm:w-7 sm:h-7" />}
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

  // If compact variant requested (icon + single line brand name — same exact lockup image,
  // the tagline stays baked in since it is not toggleable pixel-for-pixel)
  if (variant === 'compact') {
    return (
      <div
        className={`inline-flex items-center select-none transition-all duration-200 whitespace-nowrap ${
          transparent
            ? 'bg-transparent'
            : 'bg-white rounded-lg px-2.5 py-1.5 shadow-2xs border border-slate-200/90'
        } ${className}`}
      >
        <FullLogoImage className="h-8 sm:h-9" />
      </div>
    );
  }

  // Responsive & Full modes both render the exact same provided lockup image, just at
  // different heights — kept as separate variants for API compatibility with existing callers.
  return (
    <div
      className={`inline-flex items-center justify-center select-none transition-all duration-200 ${
        transparent
          ? 'bg-transparent'
          : 'bg-white rounded-lg px-2 sm:px-2.5 py-1 sm:py-1.5 shadow-2xs border border-slate-200/90'
      } ${className}`}
    >
      <FullLogoImage className={`${currentHeight} max-w-full`} />
    </div>
  );
};
