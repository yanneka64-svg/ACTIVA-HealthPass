import React, { useEffect, useRef, useState } from 'react';
import {
  Globe,
  ShieldCheck,
  Sparkles,
  Gauge,
  HeartHandshake,
  UserPlus,
  IdCard,
  FileText,
  Wallet,
  ChevronDown,
  Stethoscope,
  ClipboardCheck,
  Settings2,
} from 'lucide-react';
import { Language } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { AppRole } from '../../utils/authUtils';
import { Logo } from '../Logo';
import loginDoctorPhoto from '../../assets/login-doctor.webp';

// === AMÉLIORATION AJOUTÉE : nouvelle page d'accueil publique (demande explicite, 2026-09-18)
// — remplace l'ancien écran de sélection d'espace de travail (WorkspaceSelectionView, laissé
// intact dans le dépôt mais non utilisé par défaut) comme toute première page vue à l'arrivée
// sur l'application. Purement une vitrine marketing + un menu "Log in" qui, une fois un espace
// de travail choisi, redirige vers la page de connexion existante (LoginView, strictement
// inchangée) — aucune logique d'authentification ici. La vérification des habilitations reste
// entièrement gérée par le flux existant (LoginView + résolution du rôle côté serveur,
// AuthBlockedScreen pour les comptes inactifs/rôle invalide) : personne ne peut accéder à un
// espace sans les droits nécessaires, ce comportement n'est pas modifié par cet écran.

interface HomeViewProps {
  lang: Language;
  onLanguageChange?: (lang: Language) => void;
  onSelectWorkspace: (role: AppRole) => void;
}

interface WorkspaceMenuOption {
  role: AppRole;
  icon: React.ReactNode;
  title: string;
}

export const HomeView: React.FC<HomeViewProps> = ({ lang, onLanguageChange, onSelectWorkspace }) => {
  const t = useTranslation(lang || 'en');
  const [loginMenuOpen, setLoginMenuOpen] = useState(false);
  const loginMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (loginMenuRef.current && !loginMenuRef.current.contains(e.target as Node)) {
        setLoginMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const workspaceOptions: WorkspaceMenuOption[] = [
    { role: 'Agent', icon: <Stethoscope className="w-4 h-4" />, title: t.auth.workspaceAgentTitle },
    { role: 'Supervisor', icon: <ClipboardCheck className="w-4 h-4" />, title: t.auth.workspaceSupervisorTitle },
    { role: 'Admin', icon: <Settings2 className="w-4 h-4" />, title: t.auth.workspaceAdminTitle },
  ];

  const handleChooseWorkspace = (role: AppRole) => {
    setLoginMenuOpen(false);
    onSelectWorkspace(role);
  };

  const navLinks = [
    { label: t.home.navHome, href: '#home' },
    { label: t.home.navAbout, href: '#about' },
    { label: t.home.navFaq, href: '#faq' },
    { label: t.home.navContact, href: '#contact' },
  ];

  const features = [
    { icon: <ShieldCheck className="w-5 h-5" />, title: t.home.featureSecureTitle, desc: t.home.featureSecureDesc },
    { icon: <Sparkles className="w-5 h-5" />, title: t.home.featureSimpleTitle, desc: t.home.featureSimpleDesc },
    { icon: <Gauge className="w-5 h-5" />, title: t.home.featureReliableTitle, desc: t.home.featureReliableDesc },
    { icon: <HeartHandshake className="w-5 h-5" />, title: t.home.featureImpactfulTitle, desc: t.home.featureImpactfulDesc },
  ];

  const steps = [
    { icon: <UserPlus className="w-5 h-5" />, title: t.home.step1Title, desc: t.home.step1Desc },
    { icon: <IdCard className="w-5 h-5" />, title: t.home.step2Title, desc: t.home.step2Desc },
    { icon: <FileText className="w-5 h-5" />, title: t.home.step3Title, desc: t.home.step3Desc },
    { icon: <Wallet className="w-5 h-5" />, title: t.home.step4Title, desc: t.home.step4Desc },
  ];

  return (
    <div id="home" className="min-h-screen w-full bg-white font-sans antialiased">
      {/* TOP NAV */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#E8EDF2]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Logo variant="responsive" size="sm" showTagline={false} transparent />

          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-semibold text-[#334155] hover:text-[#0A347B] transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block">
              <Globe className="w-3.5 h-3.5 text-[#0A34A3] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={lang || 'en'}
                onChange={(e) => onLanguageChange?.(e.target.value as Language)}
                className="appearance-none pl-7 pr-5 py-1.5 bg-[#F8FAFC] border border-[#E8EDF2] rounded-lg text-xs font-semibold text-[#0D2B63] cursor-pointer focus:outline-none"
                aria-label="Select display language"
              >
                <option value="en">EN</option>
                <option value="fr">FR</option>
              </select>
            </div>

            {/* Log in — ouvre un menu déroulant de sélection d'espace de travail plutôt que
                de naviguer directement, per demande explicite : "dans log in une liste
                déroulante te permet de selectionner ton espace de travail. une fois l'espace
                de travail selectionné on vous renvoi sur la page de connexion." */}
            <div className="relative" ref={loginMenuRef}>
              <button
                type="button"
                id="home-login-button"
                onClick={() => setLoginMenuOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={loginMenuOpen}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#0A347B] hover:bg-[#0D2B63] text-white text-sm font-bold rounded-lg transition-colors cursor-pointer"
              >
                {t.home.loginButton}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${loginMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {loginMenuOpen && (
                <div
                  role="listbox"
                  className="absolute right-0 mt-2 w-64 bg-white border border-[#E8EDF2] rounded-xl shadow-lg overflow-hidden z-40"
                >
                  <div className="px-3.5 pt-3 pb-2 text-[11px] font-semibold text-[#5B7091] uppercase tracking-wide">
                    {t.home.loginDropdownHint}
                  </div>
                  {workspaceOptions.map((ws) => (
                    <button
                      key={ws.role}
                      type="button"
                      id={`home-login-workspace-${ws.role.toLowerCase()}`}
                      role="option"
                      aria-selected={false}
                      onClick={() => handleChooseWorkspace(ws.role)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold text-[#0D2B63] hover:bg-[#F0F5FF] transition-colors text-left cursor-pointer"
                    >
                      <span className="text-[#0A347B]">{ws.icon}</span>
                      {ws.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-16 lg:pt-20 lg:pb-24 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <h1 className="text-4xl sm:text-5xl font-black text-[#0D2B63] leading-[1.08] tracking-tight">
            {t.home.heroTitle}
          </h1>
          <p className="mt-5 text-base text-[#5B7091] font-medium leading-relaxed max-w-lg">
            {t.home.heroSubtitle}
          </p>
          <div className="mt-8">
            <button
              type="button"
              onClick={() => setLoginMenuOpen(true)}
              className="px-6 py-3 bg-[#0A347B] hover:bg-[#0D2B63] text-white text-sm font-bold rounded-lg transition-colors cursor-pointer"
            >
              {t.home.heroCta}
            </button>
          </div>
        </div>

        {/* Photo — sans bandes/cartes superposées (retirées sur demande explicite) */}
        <div className="relative rounded-2xl overflow-hidden shadow-xl aspect-4/3 lg:aspect-square xl:aspect-4/3">
          <img
            src={loginDoctorPhoto}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        </div>
      </section>

      {/* FEATURES */}
      <section id="about" className="bg-[#F7FAFF] border-y border-[#E8EDF2]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((f) => (
            <div key={f.title} className="flex flex-col items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#0A347B]/10 text-[#0A347B] flex items-center justify-center">
                {f.icon}
              </div>
              <div className="text-sm font-bold text-[#0D2B63]">{f.title}</div>
              <p className="text-xs text-[#5B7091] font-medium leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW DOES IT WORK */}
      <section id="faq" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-[#0D2B63]">{t.home.howItWorksTitle}</h2>
          <p className="mt-3 text-sm text-[#5B7091] font-medium">{t.home.howItWorksSubtitle}</p>
        </div>

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((s, i) => (
            <div key={s.title} className="relative text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#0A347B] text-white flex items-center justify-center font-black text-sm">
                {i + 1}
              </div>
              <div className="text-[#0A347B]">{s.icon}</div>
              <div className="text-sm font-bold text-[#0D2B63]">{s.title}</div>
              <p className="text-xs text-[#5B7091] font-medium leading-relaxed max-w-[200px]">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA BANNER */}
      <section id="contact" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="rounded-2xl bg-[#0A347B] px-8 py-10 sm:px-14 sm:py-14 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left">
            <h3 className="text-xl sm:text-2xl font-black text-white">{t.home.ctaBannerTitle}</h3>
            <p className="mt-2 text-sm text-[#EAF2FF]/90 font-medium">{t.home.ctaBannerSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setLoginMenuOpen(true)}
            className="shrink-0 px-6 py-3 bg-white hover:bg-[#EAF2FF] text-[#0A347B] text-sm font-bold rounded-lg transition-colors cursor-pointer"
          >
            {t.home.ctaBannerButton}
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#0F172A] text-slate-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid sm:grid-cols-3 gap-8">
          <div>
            <Logo variant="responsive" size="sm" showTagline={false} />
            <p className="mt-3 text-xs text-slate-400 font-medium">{t.home.footerTagline}</p>
          </div>
          <div>
            <div className="text-xs font-bold text-white uppercase tracking-wide mb-3">{t.home.footerLinksTitle}</div>
            <div className="flex flex-col gap-2 text-xs text-slate-400 font-medium">
              <span>{t.home.navAbout}</span>
              <span>{t.home.navFaq}</span>
            </div>
          </div>
          <div>
            <div className="text-xs font-bold text-white uppercase tracking-wide mb-3">{t.home.footerContactTitle}</div>
            <div className="flex flex-col gap-2 text-xs text-slate-400 font-medium">
              <span>{t.home.navContact}</span>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-11 flex items-center text-[11px] text-slate-400">
            {t.auth.copyright}
          </div>
        </div>
      </footer>
    </div>
  );
};
