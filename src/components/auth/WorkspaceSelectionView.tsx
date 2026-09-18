import React from 'react';
import { ArrowRight, Globe, Shield, Stethoscope, ClipboardCheck, Settings2 } from 'lucide-react';
import { Language } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { AppRole } from '../../utils/authUtils';
import activaLogoOriginal from '../../assets/logos/logo-activa.png';
import loginDoctorPhoto from '../../assets/login-doctor.webp';

// === AMÉLIORATION AJOUTÉE : nouvel écran (demande explicite) — première page vue à l'arrivée
// sur l'application, avant l'écran de connexion existant (LoginView, strictement inchangé).
// Propose les 3 espaces de travail (Agent Médical / Superviseur / Administrateur) ; un clic
// redirige directement vers la page de connexion habituelle (aucune logique d'authentification
// ici, aucun accès direct à une section de l'app — uniquement un aiguillage visuel avant le
// formulaire de connexion). Mise en page reprise à l'identique de LoginView (panneau gauche
// photo + dégradé bleu, sélecteur de langue, pied de page) pour rester cohérent visuellement.

interface WorkspaceSelectionViewProps {
  lang: Language;
  onLanguageChange?: (lang: Language) => void;
  onSelectWorkspace: (role: AppRole) => void;
}

interface WorkspaceOption {
  role: AppRole;
  icon: React.ReactNode;
  title: string;
  description: string;
  hoverBorderClass: string;
  accentText: string;
  accentBg: string;
}

export const WorkspaceSelectionView: React.FC<WorkspaceSelectionViewProps> = ({
  lang,
  onLanguageChange,
  onSelectWorkspace,
}) => {
  const t = useTranslation(lang || 'en');

  // Couleurs alignées sur celles des interfaces post-connexion (voir src/theme/roleTheme.ts) :
  // bleu marine pour l'Agent, même bleu avec un liseré rouge brique pour le Superviseur, gris
  // ardoise pour l'Administrateur — uniquement pour que l'utilisateur reconnaisse déjà ici la
  // couleur de l'espace qu'il retrouvera une fois connecté.
  const workspaces: WorkspaceOption[] = [
    {
      role: 'Agent',
      icon: <Stethoscope className="w-4 h-4" />,
      title: t.auth.workspaceAgentTitle,
      description: t.auth.workspaceAgentDesc,
      hoverBorderClass: 'hover:border-[#0A347B]',
      accentText: 'text-[#0A347B]',
      accentBg: 'bg-[#0A347B]/10',
    },
    {
      role: 'Supervisor',
      icon: <ClipboardCheck className="w-4 h-4" />,
      title: t.auth.workspaceSupervisorTitle,
      description: t.auth.workspaceSupervisorDesc,
      hoverBorderClass: 'hover:border-[#C24F47]',
      accentText: 'text-[#0A347B]',
      accentBg: 'bg-[#C24F47]/10',
    },
    {
      role: 'Admin',
      icon: <Settings2 className="w-4 h-4" />,
      title: t.auth.workspaceAdminTitle,
      description: t.auth.workspaceAdminDesc,
      hoverBorderClass: 'hover:border-[#404E62]',
      accentText: 'text-[#404E62]',
      accentBg: 'bg-[#404E62]/10',
    },
  ];

  return (
    <div className="min-h-screen w-full flex font-sans antialiased select-none">
      {/* Mobile-only top bar — repris à l'identique de LoginView */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-20 flex items-center justify-between gap-2 px-4 py-3 bg-white border-b border-[#E8EDF2]">
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#F8FAFC] border border-[#E8EDF2] rounded-lg text-[11px] font-semibold text-[#0D2B63]">
          <Shield className="w-3.5 h-3.5 text-[#0A347B]" />
          <span>{t.auth.securePortal}</span>
        </div>
        <div className="relative">
          <Globe className="w-3.5 h-3.5 text-[#0A34A3] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={lang || 'en'}
            onChange={(e) => onLanguageChange?.(e.target.value as Language)}
            className="appearance-none pl-7 pr-5 py-1 bg-[#F8FAFC] border border-[#E8EDF2] rounded-lg text-[11px] font-semibold text-[#0D2B63] cursor-pointer focus:outline-none"
            aria-label="Select display language"
          >
            <option value="en">EN</option>
            <option value="fr">FR</option>
          </select>
        </div>
      </div>

      {/* LEFT PANEL — identique à LoginView (photo + dégradé bleu + logo + accroche) */}
      <div
        className="hidden lg:flex lg:w-[56%] xl:w-[54%] relative overflow-hidden flex-col justify-between p-10 xl:p-14 bg-cover bg-center"
        // === AMÉLIORATION AJOUTÉE : couleur de fond unie posée derrière la photo (retour
        // utilisateur explicite — "les images ont du mal à charger") — c'est la toute première
        // image vue à l'arrivée sur l'application ; sans `backgroundColor`, tout délai réseau
        // se traduisait par un flash de fond blanc/transparent avant que la photo n'apparaisse.
        style={{ backgroundColor: '#0A347B', backgroundImage: `url(${loginDoctorPhoto})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#072659]/90 via-[#0A347B]/85 to-[#0D2B63]/92 pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />
        {/* === AMÉLIORATION AJOUTÉE : fondu du panneau bleu vers le blanc (demande explicite,
            ajustée le 2026-09-18 d'après une capture de référence — zone large et très douce,
            pas de bande resserrée) === Le panneau parent porte un padding (`p-10 xl:p-14`) :
            un enfant `absolute right-0` s'arrête à la bordure INTÉRIEURE de ce padding (le
            "padding box", zone de référence des éléments absolus), pas au bord réel du
            panneau — sans correction cela laisse une fine bande de bleu non fondu juste avant
            la jonction. `-mr-10 xl:-mr-14` annule ce padding pour que le dégradé atteigne le
            bord réel du panneau. Courbe étalée sur une large zone (courbe très progressive,
            aucun stop avant 35 %) pour un rendu diffus, sans bande ni bord perceptible. */}
        <div
          className="absolute inset-y-0 right-0 w-3/5 -mr-10 xl:-mr-14 pointer-events-none"
          style={{
            background:
              'linear-gradient(to right, transparent 0%, rgba(255,255,255,0.06) 35%, rgba(255,255,255,0.22) 55%, rgba(255,255,255,0.5) 72%, rgba(255,255,255,0.8) 88%, #ffffff 100%)',
          }}
        />

        <div className="relative z-10 self-start bg-white rounded-lg px-3 py-2 shadow-sm">
          <img src={activaLogoOriginal} alt="Activa" className="h-12 w-auto" />
        </div>

        <div className="relative z-10">
          <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] tracking-tight login-anim-slide-left login-anim-delay-2">
            {t.auth.heroGreetingLine1}<br />ACTIVA HealthPass!
          </h1>
          <p className="mt-5 text-sm xl:text-[15px] text-[#EAF2FF]/90 font-medium leading-relaxed max-w-sm login-anim-slide-left login-anim-delay-3">
            {t.auth.heroDescription}
          </p>
        </div>

        <div className="relative z-10 text-xs text-white/60 font-medium login-anim-slide-left login-anim-delay-4">
          {t.auth.copyright}
        </div>
      </div>

      {/* RIGHT PANEL — sélection de l'espace de travail */}
      <div className="flex-1 bg-white relative flex flex-col">
        {/* === AMÉLIORATION AJOUTÉE : prolongement très discret du fondu bleu → blanc côté
            panneau blanc (demande explicite, ajustée le 2026-09-18) — pour que la transition
            soit réellement centrée SUR la jonction (et pas entièrement contenue côté bleu),
            une légère brume bleue s'estompe sur les tout premiers pourcents du bord gauche de
            ce panneau, avant de rejoindre le blanc pur. Ce panneau n'a pas de padding propre
            (le padding est sur le conteneur interne des cartes, plus loin), donc `left-0`
            atteint directement le bord réel du panneau, sans le bug de padding corrigé côté
            panneau bleu. N'affecte jamais les cartes (centrées, hors de cette bande). === */}
        <div
          className="hidden lg:block absolute inset-y-0 left-0 w-1/4 pointer-events-none"
          style={{
            background:
              'linear-gradient(to right, rgba(10,52,123,0.12) 0%, rgba(10,52,123,0.04) 40%, transparent 75%)',
          }}
        />
        <div className="hidden lg:block absolute top-6 right-6 xl:top-10 xl:right-10 z-10">
          <div className="relative">
            <Globe className="w-3.5 h-3.5 text-[#0A34A3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={lang || 'en'}
              onChange={(e) => onLanguageChange?.(e.target.value as Language)}
              className="appearance-none pl-8 pr-6 py-1.5 bg-white border border-[#E8EDF2] rounded-lg text-xs font-semibold text-[#0D2B63] shadow-2xs cursor-pointer focus:outline-none"
              aria-label="Select display language"
            >
              <option value="en">English (Default)</option>
              <option value="fr">Français</option>
            </select>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-10 xl:p-16 pt-16 lg:pt-6">
          {/* === AMÉLIORATION AJOUTÉE : écran légèrement dézoomé (demande explicite) — carte,
              titre et cartes d'espace réduits d'un cran pour ne plus paraître "en gros plan" ;
              aucun changement de comportement, uniquement des tailles/espacements resserrés. === */}
          <div className="w-full max-w-[380px]">
            {/* === AMÉLIORATION AJOUTÉE : logo retiré de cet écran (demande explicite) — reste
                affiché normalement sur la page de connexion (LoginView), inchangée.
                === AMÉLIORATION AJOUTÉE : mention "Sign in to access your account." retirée de
                cet écran (demande explicite) — ce texte n'a de sens que sur la page de
                connexion elle-même (LoginView, où il reste affiché), pas sur cet écran de
                sélection d'espace de travail qui la précède. === */}
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#0D2B63] text-center">
              {t.auth.workspaceSelectTitle}
            </h2>
            <p className="mt-1 text-xs text-[#5B7091] font-medium text-center">
              {t.auth.workspaceSelectSubtitle}
            </p>

            <div className="mt-6 space-y-2.5">
              {workspaces.map((ws) => (
                <button
                  key={ws.role}
                  type="button"
                  id={`workspace-select-${ws.role.toLowerCase()}`}
                  onClick={() => onSelectWorkspace(ws.role)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border border-[#E8EDF2] bg-white hover:shadow-md transition-all duration-200 text-left cursor-pointer group ${ws.hoverBorderClass}`}
                >
                  <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${ws.accentText} ${ws.accentBg}`}>
                    {ws.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-[#0D2B63]">{ws.title}</div>
                    <div className="text-xs text-[#5B7091] font-medium leading-snug">{ws.description}</div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-[#778FAF] group-hover:text-[#0A347B] shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:hidden text-center text-xs text-[#778FAF] font-medium py-4 border-t border-[#E8EDF2]">
          {t.auth.copyright}
        </div>
      </div>
    </div>
  );
};
