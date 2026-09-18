import React, { useState } from 'react';
import {
  Globe,
  Shield,
  Users,
  Clock,
  HeartPulse,
  UserPlus,
  IdCard,
  FileText,
  Wallet,
  Building2,
  Briefcase,
  Stethoscope,
  ChevronDown,
  Search,
} from 'lucide-react';
import { Language } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { AppRole } from '../../utils/authUtils';
import { Logo } from '../Logo';
// === AMÉLIORATION AJOUTÉE : photo héro dédiée à la page d'accueil (demande explicite,
// 2026-09-18) — distincte de login-doctor.webp (toujours utilisée telle quelle par
// WorkspaceSelectionView.tsx, non modifiée).
import heroDoctorPhoto from '../../assets/home-hero-doctor.webp';

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
  title: string;
}

export const HomeView: React.FC<HomeViewProps> = ({ lang, onLanguageChange, onSelectWorkspace }) => {
  const t = useTranslation(lang || 'en');
  // === AMÉLIORATION AJOUTÉE : remplace l'ancien menu déroulant du bouton "Log in" (demande
  // explicite, 2026-09-18 — "supprime la liste déroulante sur login") par une unique liste
  // déroulante native + bouton "Go", intégrée au bloc héro (voir plus bas, id="workspace-select").
  // Le bouton "Log in" de la barre de navigation n'ouvre plus de menu : il fait défiler la page
  // jusqu'à ce même sélecteur, qui reste la seule façon de choisir un espace de travail.
  const [heroWorkspace, setHeroWorkspace] = useState<AppRole>('Agent');
  // === AMÉLIORATION AJOUTÉE : contenu réel des sections About / FAQ / Contact us (demande
  // explicite, 2026-09-18 — "Remplir la page about, FAQ, et Contact us"), qui ne faisaient
  // jusqu'ici que renvoyer par ancrage vers d'autres sections (Features / How it works / CTA).
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  // === AMÉLIORATION AJOUTÉE : barre de recherche sur la page d'accueil (demande explicite,
  // 2026-09-18 — "supprime contact us et ajoute une barre de recherche"). Même traitement que
  // celle du Topbar de l'application connectée (Topbar.tsx) : champ contrôlé, sans branchement
  // à une recherche métier pour l'instant.
  const [searchQuery, setSearchQuery] = useState('');

  const workspaceOptions: WorkspaceMenuOption[] = [
    { role: 'Agent', title: t.auth.workspaceAgentTitle },
    { role: 'Supervisor', title: t.auth.workspaceSupervisorTitle },
    { role: 'Admin', title: t.auth.workspaceAdminTitle },
  ];

  const navLinks = [
    { label: t.home.navHome, href: '#home' },
    { label: t.home.navAbout, href: '#about' },
    { label: t.home.navFaq, href: '#faq' },
  ];

  const features = [
    {
      icon: <Shield className="w-5 h-5" />,
      title: t.home.featureSecureTitle,
      desc: t.home.featureSecureDesc,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
    },
    {
      icon: <Users className="w-5 h-5" />,
      title: t.home.featureSimpleTitle,
      desc: t.home.featureSimpleDesc,
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
    },
    {
      icon: <Clock className="w-5 h-5" />,
      title: t.home.featureReliableTitle,
      desc: t.home.featureReliableDesc,
      iconBg: 'bg-pink-100',
      iconColor: 'text-pink-600',
    },
    {
      icon: <HeartPulse className="w-5 h-5" />,
      title: t.home.featureImpactfulTitle,
      desc: t.home.featureImpactfulDesc,
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600',
    },
  ];

  const steps = [
    { icon: <UserPlus className="w-5 h-5" />, title: t.home.step1Title, desc: t.home.step1Desc },
    { icon: <IdCard className="w-5 h-5" />, title: t.home.step2Title, desc: t.home.step2Desc },
    { icon: <FileText className="w-5 h-5" />, title: t.home.step3Title, desc: t.home.step3Desc },
    { icon: <Wallet className="w-5 h-5" />, title: t.home.step4Title, desc: t.home.step4Desc },
  ];

  const aboutAudience = [
    { icon: <Building2 className="w-5 h-5" />, label: t.home.aboutAudienceInsurers },
    { icon: <Briefcase className="w-5 h-5" />, label: t.home.aboutAudienceEmployers },
    { icon: <Users className="w-5 h-5" />, label: t.home.aboutAudienceMembers },
    { icon: <Stethoscope className="w-5 h-5" />, label: t.home.aboutAudienceProviders },
  ];

  const faqItems = [
    { q: t.home.faqQ1, a: t.home.faqA1 },
    { q: t.home.faqQ2, a: t.home.faqA2 },
    { q: t.home.faqQ3, a: t.home.faqA3 },
    { q: t.home.faqQ4, a: t.home.faqA4 },
    { q: t.home.faqQ5, a: t.home.faqA5 },
    { q: t.home.faqQ6, a: t.home.faqA6 },
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

          <div className="hidden lg:flex flex-1 justify-center px-4">
            <div className="relative w-full max-w-xs">
              <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.home.searchPlaceholder}
                aria-label={t.home.searchLabel}
                className="w-full pl-9 pr-4 py-2 bg-[#F8FAFC] border border-[#E8EDF2] rounded-full text-xs font-medium text-slate-700 placeholder:text-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#0A347B] focus:bg-white transition"
              />
            </div>
          </div>

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

            {/* Log in — fait défiler jusqu'au sélecteur d'espace de travail du bloc héro
                (id="workspace-select"), seul et unique endroit où choisir un espace (demande
                explicite, 2026-09-18 — "supprime la liste déroulante sur login"). */}
            <a
              href="#workspace-select"
              id="home-login-button"
              className="px-4 py-2 bg-[#0A347B] hover:bg-[#0D2B63] text-white text-sm font-bold rounded-lg transition-colors cursor-pointer"
            >
              {t.home.loginButton}
            </a>
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
          {/* === AMÉLIORATION AJOUTÉE : remplace le bouton "Get started" (demande explicite,
              2026-09-18) par le sélecteur d'espace de travail — liste déroulante native +
              bouton "Go" qui renvoie directement vers la page de connexion pour l'espace
              choisi. Une fois cette étape passée, il n'est plus possible de changer d'espace
              sans revenir ici (aucun autre point d'entrée vers la connexion sur cette page). */}
          <div id="workspace-select" className="mt-8 scroll-mt-24">
            <label
              htmlFor="hero-workspace-select"
              className="block text-xs font-bold text-[#5B7091] uppercase tracking-wide mb-2"
            >
              {t.home.loginDropdownHint}
            </label>
            <div className="flex flex-col sm:flex-row gap-3 max-w-md">
              <select
                id="hero-workspace-select"
                value={heroWorkspace}
                onChange={(e) => setHeroWorkspace(e.target.value as AppRole)}
                className="flex-1 px-4 py-3 bg-white border border-[#E8EDF2] rounded-lg text-sm font-semibold text-[#0D2B63] shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0A347B]/30"
              >
                {workspaceOptions.map((ws) => (
                  <option key={ws.role} value={ws.role}>
                    {ws.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                id="home-workspace-go-button"
                onClick={() => onSelectWorkspace(heroWorkspace)}
                className="shrink-0 px-6 py-3 bg-[#0A347B] hover:bg-[#0D2B63] text-white text-sm font-bold rounded-lg transition-colors cursor-pointer"
              >
                {t.home.goButton}
              </button>
            </div>
          </div>
        </div>

        {/* Photo — sans bandes/cartes superposées (retirées sur demande explicite) */}
        <div className="relative rounded-2xl overflow-hidden shadow-xl aspect-4/3 lg:aspect-square xl:aspect-4/3">
          <img
            src={heroDoctorPhoto}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        </div>
      </section>

      {/* FEATURES */}
      <section className="bg-[#F7FAFF] border-y border-[#E8EDF2]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-white rounded-2xl border border-[#E8EDF2] shadow-sm p-6 flex flex-col items-start gap-3"
            >
              <div className={`w-11 h-11 rounded-full ${f.iconBg} ${f.iconColor} flex items-center justify-center`}>
                {f.icon}
              </div>
              <div className="text-sm font-bold text-[#0D2B63]">{f.title}</div>
              <p className="text-xs text-[#5B7091] font-medium leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 scroll-mt-16 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-[#0D2B63]">{t.home.aboutTitle}</h2>
          <p className="mt-4 text-sm text-[#5B7091] font-medium leading-relaxed">{t.home.aboutParagraph1}</p>
          <p className="mt-4 text-sm text-[#5B7091] font-medium leading-relaxed">{t.home.aboutParagraph2}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {aboutAudience.map((a) => (
            <div
              key={a.label}
              className="bg-[#F7FAFF] border border-[#E8EDF2] rounded-2xl p-5 flex flex-col items-start gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-[#0A347B]/10 text-[#0A347B] flex items-center justify-center">
                {a.icon}
              </div>
              <div className="text-sm font-bold text-[#0D2B63]">{a.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW DOES IT WORK */}
      <section className="bg-[#F7FAFF] border-y border-[#E8EDF2]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
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
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 scroll-mt-16">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-[#0D2B63]">{t.home.faqTitle}</h2>
          <p className="mt-3 text-sm text-[#5B7091] font-medium">{t.home.faqSubtitle}</p>
        </div>

        <div className="mt-10 max-w-2xl mx-auto divide-y divide-[#E8EDF2] border-y border-[#E8EDF2]">
          {faqItems.map((item, i) => {
            const isOpen = openFaqIndex === i;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between gap-4 py-4 text-left cursor-pointer"
                >
                  <span className="text-sm font-bold text-[#0D2B63]">{item.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 text-[#5B7091] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {isOpen && (
                  <p className="pb-4 text-sm text-[#5B7091] font-medium leading-relaxed">{item.a}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA BANNER */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="rounded-2xl bg-[#0A347B] px-8 py-10 sm:px-14 sm:py-14 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left">
            <h3 className="text-xl sm:text-2xl font-black text-white">{t.home.ctaBannerTitle}</h3>
            <p className="mt-2 text-sm text-[#EAF2FF]/90 font-medium">{t.home.ctaBannerSubtitle}</p>
          </div>
          <a
            href="#workspace-select"
            className="shrink-0 px-6 py-3 bg-white hover:bg-[#EAF2FF] text-[#0A347B] text-sm font-bold rounded-lg transition-colors cursor-pointer"
          >
            {t.home.ctaBannerButton}
          </a>
        </div>
      </section>

      {/* FOOTER — reprend à l'identique le pied de page sombre déjà utilisé sur les écrans
          authentifiés (voir App.tsx) : une seule ligne, copyright + liens légaux en texte
          simple (pas de href factice, cohérent avec le correctif CodeRabbit de la PR #80). */}
      <footer className="bg-[#0F172A] text-slate-300 text-[11px]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-11 flex items-center justify-between">
          <span>{t.auth.copyright}</span>
          <div className="flex items-center gap-5">
            <span>Legal notice</span>
            <span>Privacy policy</span>
            <span>Contact</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
