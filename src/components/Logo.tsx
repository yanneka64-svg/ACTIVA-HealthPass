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
// recadré depuis le logo fourni SANS le cadre bleu qui l'entourait (qui ne fait pas partie
// du logo). Ratio largeur/hauteur natif ≈ 1.297 (384×296px), conservé via object-contain.
export const ACTIVA_HEART_ICON_ASPECT = 384 / 296;

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
            <span className="font-extrabold text-xs sm:text-sm text-[#0a2e6b] tracking-tight font-sans">
              ACTIVA
            </span>
            <span className="font-bold text-[11px] sm:text-xs text-[#0a2e6b]/90 font-sans">
              HealthPass
            </span>
          </div>
          <div className="flex items-center gap-1 text-[7.5px] font-semibold text-[#0a2e6b]/80 tracking-wide mt-0.5">
            <span>Health</span>
            <span className="text-[#00A651] font-bold">•</span>
            <span>Safety</span>
            <span className="text-[#00A651] font-bold">•</span>
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

  // If compact variant requested (icon + single line brand name)
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
          <span className="font-black text-sm sm:text-base text-[#0a2e6b] tracking-tight">
            ACTIVA
          </span>
          <span className="font-bold text-xs sm:text-sm text-[#0a2e6b]">
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
              <span className="font-black text-xs sm:text-sm text-[#0a2e6b] tracking-tight">
                ACTIVA
              </span>
              <span className="font-bold text-[11px] sm:text-xs text-[#0a2e6b]">
                HealthPass
              </span>
            </div>
            {showTagline && (
              <div className="flex items-center gap-1 text-[7px] sm:text-[8.5px] font-semibold text-[#0a2e6b]/80 tracking-wide mt-0.5">
                <span>Health</span>
                <span className="text-[#00A651] font-bold">•</span>
                <span>Safety</span>
                <span className="text-[#00A651] font-bold">•</span>
                <span>Serenity</span>
              </div>
            )}
          </div>
        </div>

        {/* Desktop Full High-Res SVG View (>= md) - ViewBox 320x56 fits all text 100% with ample margins */}
        <svg
          viewBox="0 0 320 56"
          className={`hidden md:block ${currentHeight} w-auto max-w-full`}
          xmlns="http://www.w3.org/2000/svg"
          aria-label="ACTIVA HealthPass Logo"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <style>
              {`
                @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800;900&display=swap');
                .logo-activa-bold {
                  font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  font-weight: 900;
                  font-size: 21px;
                  fill: #0a2e6b;
                  letter-spacing: -0.2px;
                }
                .logo-healthpass-title {
                  font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  font-weight: 700;
                  font-size: 20px;
                  fill: #0a2e6b;
                  letter-spacing: -0.3px;
                }
                .logo-tagline-text {
                  font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  font-weight: 600;
                  font-size: 9.5px;
                  fill: #0a2e6b;
                  letter-spacing: 0.3px;
                }
              `}
            </style>
          </defs>

          {/* === AMÉLIORATION AJOUTÉE : emblème officiel (image raster recadrée sans le cadre
              bleu du logo fourni) au lieu des anciennes formes dessinées à la main ===
              HEALTHCARE EMBLEM */}
          <image
            href="/activa-heart-icon.png"
            x="0"
            y="3.3"
            width="64"
            height="49.3"
            preserveAspectRatio="xMidYMid meet"
          />

          {/* RIGHT TYPOGRAPHY - Centered and completely within bounds */}
          <g id="activa-brand-text" transform="translate(70, 0)">
            <text x="0" y="30">
              <tspan className="logo-activa-bold">ACTIVA</tspan>
              <tspan dx="5" className="logo-healthpass-title">HealthPass</tspan>
            </text>

            {showTagline && (
              <g id="activa-tagline" transform="translate(1, 47)">
                <text x="0" y="0" className="logo-tagline-text">Health</text>
                <circle cx="41" cy="-3.5" r="2.2" fill="#00A651" />
                <text x="51" y="0" className="logo-tagline-text">Safety</text>
                <circle cx="95" cy="-3.5" r="2.2" fill="#00A651" />
                <text x="105" y="0" className="logo-tagline-text">Serenity</text>
              </g>
            )}
          </g>
        </svg>
      </div>
    );
  }

  // Full SVG explicit mode
  return (
    <div
      className={`inline-flex items-center justify-center select-none transition-all duration-200 ${
        transparent
          ? 'bg-transparent'
          : 'bg-white rounded-lg px-2 sm:px-2.5 py-1 sm:py-1.5 shadow-2xs border border-slate-200/90'
      } ${className}`}
    >
      <svg
        viewBox="0 0 320 56"
        className={`${currentHeight} w-auto max-w-full block`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="ACTIVA HealthPass Logo"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <style>
            {`
              @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800;900&display=swap');
              .logo-activa-bold {
                font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-weight: 900;
                font-size: 21px;
                fill: #0a2e6b;
                letter-spacing: -0.2px;
              }
              .logo-healthpass-title {
                font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-weight: 700;
                font-size: 20px;
                fill: #0a2e6b;
                letter-spacing: -0.3px;
              }
              .logo-tagline-text {
                font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-weight: 600;
                font-size: 9.5px;
                fill: #0a2e6b;
                letter-spacing: 0.3px;
              }
            `}
          </style>
        </defs>

        <g id="activa-health-icon" transform="translate(2, 0) scale(0.78)">
          <path
            d="M 35,21 
               C 30,9 18,4 9,13 
               C 0,22 1,38 13,50 
               C 20,57 29,63 35,66 
               L 35,21 Z"
            fill="#0a2e6b"
          />
          <g id="healthcare-cross">
            <rect x="28" y="23" width="13" height="26" rx="2.5" fill="#00A651" />
            <rect x="21" y="30" width="27" height="12" rx="2.5" fill="#00A651" />
          </g>
          <path
            d="M 35,66 
               C 43,62 52,56 58,49 
               C 68,37 69,21 60,12 
               C 51,4 40,9 35,21 
               C 43,27 48,37 48,49 
               C 48,57 43,63 35,66 Z"
            fill="#00833E"
          />
          <path
            d="M 35,66 
               C 44,61 54,53 60,40 
               C 66,27 64,16 58,12 
               C 68,20 68,37 58,49 
               C 49,59 40,64 35,66 Z"
            fill="#00A651"
          />
        </g>

        <g id="activa-brand-text" transform="translate(64, 0)">
          <text x="0" y="30">
            <tspan className="logo-activa-bold">ACTIVA</tspan>
            <tspan dx="5" className="logo-healthpass-title">HealthPass</tspan>
          </text>

          {showTagline && (
            <g id="activa-tagline" transform="translate(1, 47)">
              <text x="0" y="0" className="logo-tagline-text">Health</text>
              <circle cx="41" cy="-3.5" r="2.2" fill="#00A651" />
              <text x="51" y="0" className="logo-tagline-text">Safety</text>
              <circle cx="95" cy="-3.5" r="2.2" fill="#00A651" />
              <text x="105" y="0" className="logo-tagline-text">Serenity</text>
            </g>
          )}
        </g>
      </svg>
    </div>
  );
};
