import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Globe,
  KeyRound,
  LogOut,
  Bell,
  Menu,
  CheckCheck,
  FileCheck2,
  UserPlus,
  Receipt,
  ShieldCheck,
  X,
  ExternalLink,
  RefreshCw,
  UserCheck,
  ShieldAlert,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Language, NavSection, AppNotification } from '../types';
import { useTranslation } from '../i18n/translations';
import { MiniLogo } from './Logo';
import { normalizeRole } from '../utils/authUtils';
import { getRoleTheme } from '../theme/roleTheme';
import { isSoundEnabled, toggleSound } from '../utils/sound';

interface TopbarProps {
  currentUser?: any;
  userRole?: string;
  currentSection: NavSection;
  lang?: Language;
  notifications?: AppNotification[];
  onMarkNotificationAsRead?: (notif: AppNotification) => void;
  onMarkAllNotificationsAsRead?: () => void;
  onLanguageChange?: (lang: Language) => void;
  onSelectSection?: (section: NavSection) => void;
  onOpenChangePassword: () => void;
  onLogout: () => void;
  onToggleSidebar?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  currentUser,
  userRole,
  currentSection,
  notifications: propsNotifications,
  onMarkNotificationAsRead,
  onMarkAllNotificationsAsRead,
  onSelectSection,
  onOpenChangePassword,
  onLogout,
  onToggleSidebar,
}) => {
  const t = useTranslation('en');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => isSoundEnabled());
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleSoundToggle = (e: any) => {
      if (e?.detail && typeof e.detail.enabled === 'boolean') {
        setSoundEnabledState(e.detail.enabled);
      } else {
        setSoundEnabledState(isSoundEnabled());
      }
    };
    window.addEventListener('activa_sound_toggle', handleSoundToggle);
    return () => window.removeEventListener('activa_sound_toggle', handleSoundToggle);
  }, []);

  const handleToggleSound = () => {
    const next = toggleSound();
    setSoundEnabledState(next);
  };

  const role = normalizeRole(userRole || currentUser?.profile || currentUser?.role);
  const theme = getRoleTheme(role);
  // Dynamic user ACTIVA entity from authenticated profile (Single Source of Truth)
  const userEntity = currentUser?.entity || (currentUser?.country ? (currentUser.country.startsWith('ACTIVA') ? currentUser.country : `ACTIVA ${currentUser.country}`) : 'ACTIVA Liberia');
  const userPosition = currentUser?.position || (role === 'Supervisor' ? 'Medical Supervisor' : role === 'Agent' ? 'Front Desk Officer' : role === 'Admin' ? 'Head of Operations' : 'ACTIVA Staff');

  // Interactive Notifications State with fallback
  const [localNotifications, setLocalNotifications] = useState<AppNotification[]>([
    {
      id: 'notif-1',
      title: 'Prior Authorization Review',
      message: 'New medical claim #CLM-2026-0042 ($480.00) submitted for validation.',
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      unread: true,
      type: 'claim',
      targetSection: 'claims_validation',
    },
    {
      id: 'notif-2',
      title: 'Biometric Intake Pending',
      message: 'New employee enrollment submitted with fingerprint biometric verification.',
      timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      unread: true,
      type: 'enrollment',
      targetSection: 'enrollments_validation',
    },
  ]);

  const rawNotifications = (propsNotifications && propsNotifications.length > 0) ? propsNotifications : localNotifications;

  // Filter notifications relevant to current user role and identity
  const notifications = useMemo(() => {
    return rawNotifications.filter((n) => {
      if (role === 'Admin') return true;
      if (n.recipientEmail && currentUser?.email && n.recipientEmail.toLowerCase() === currentUser.email.toLowerCase()) {
        return true;
      }
      if (n.recipientId && currentUser?.uid && n.recipientId === currentUser.uid) {
        return true;
      }
      if (n.recipientRole) {
        return normalizeRole(n.recipientRole) === role;
      }
      return true;
    });
  }, [rawNotifications, role, currentUser]);

  const unreadCount = notifications.filter((n) => n.unread).length;

  const handleMarkAllAsRead = () => {
    if (onMarkAllNotificationsAsRead) {
      onMarkAllNotificationsAsRead();
    } else {
      setLocalNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    }
  };

  const handleNotificationClick = (notif: AppNotification) => {
    if (onMarkNotificationAsRead) {
      onMarkNotificationAsRead(notif);
    } else {
      setLocalNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, unread: false } : n))
      );
    }
    if (notif.targetSection && onSelectSection) {
      onSelectSection(notif.targetSection);
      setNotificationsOpen(false);
    }
  };

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getSectionTitle = () => {
    switch (currentSection) {
      case 'dashboard':
        return { title: 'Executive Overview', subtitle: 'Global healthcare metrics and live processing KPIs' };
      case 'identification':
        return { title: 'Member Identification', subtitle: 'Member lookup, biometric verification, coverage entitlements, and care history' };
      case 'medical_form':
        return { title: 'Medical Form', subtitle: 'Issuance & management of healthcare authorization vouchers and prescriptions' };
      case 'claims':
        return { title: 'Medical Claims Management', subtitle: 'Incoming claims, coverage assessments, and settlements' };
      case 'claims_validation':
        return { title: 'Medical Claims Validation', subtitle: 'Review, verify and approve provider claims' };
      case 'enrollments_validation':
        return { title: 'Beneficiary Enrollments Validation', subtitle: 'Biometric and policyholder admission approvals' };
      case 'validated_history':
        return { title: 'Validated Claims History', subtitle: 'Archive and audit trail of approved medical claims' };
      case 'receipts':
        return { title: 'Direct Billing Receipts', subtitle: 'Disbursement vouchers and settlement receipts' };
      case 'invoices':
        return { title: 'Direct Billing Invoices', subtitle: 'Healthcare provider disbursements, slips, and receipts' };
      case 'enrollments':
        return { title: 'Beneficiary Enrollments', subtitle: 'Active policyholders, dependents, and biometric records' };
      case 'reports':
        return { title: 'Financial & Operational Reports', subtitle: 'Consolidated audits, payout analytics, and compliance' };
      case 'members':
        return { title: 'Insured Members Directory', subtitle: 'Policyholder profiles, plan tiers, and validity' };
      case 'organizations':
        return { title: 'Partner Organizations & Corporates', subtitle: 'Employer contracts, groups, and policy ceilings' };
      case 'providers':
        return { title: 'Healthcare Providers Network', subtitle: 'Accredited hospitals, clinics, and pharmacies' };
      case 'ceilings':
        return { title: 'Coverage Ceilings & Tiers', subtitle: 'Benefit limits, deductibles, and co-pay rules' };
      case 'accounts':
        return { title: 'System User Accounts', subtitle: 'Role-based access control, credentials, and permissions' };
      case 'logs':
        return { title: 'Audit & Access Logs', subtitle: 'Immutable security tracking and operational history' };
      default:
        return { title: t.appName, subtitle: t.adminPanel };
    }
  };

  const { title, subtitle } = getSectionTitle();
  const userName = currentUser?.fullName || currentUser?.displayName || (currentUser?.email ? currentUser.email.split('@')[0] : 'ACTIVA Administrator');
  const initial = userName ? userName.charAt(0).toUpperCase() : 'A';

  return (
    <header className="h-16 bg-white/95 backdrop-blur-md border-b border-[#E2E8F0] sticky top-0 z-30 px-4 sm:px-6 lg:px-8 flex items-center justify-between shadow-xs select-none">
      <div className="flex items-center gap-3 min-w-0">
        {onToggleSidebar && (
          <button 
            className="lg:hidden p-2 -ml-1 text-[var(--brand-900)] hover:bg-slate-50 rounded-xl transition cursor-pointer"
            onClick={onToggleSidebar}
            aria-label="Toggle navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        
        {/* Miniature Logo for Mobile / Tablet */}
        <div className="lg:hidden shrink-0">
          <MiniLogo className="bg-slate-50 border-[#E2E8F0]" showText={false} />
        </div>

        {/* Global Page Title and Subtitle */}
        {/* === ADDED IMPROVEMENT: the title now follows the active role's color (theme.palette.pageTitleColor) instead of a fixed blue, to stay consistent with the Sidebar (Admin/Supervisor/Agent) === */}
        <div className="min-w-0">
          <h1 className={`text-base sm:text-lg lg:text-xl font-bold ${theme.palette.pageTitleColor} tracking-tight truncate leading-tight`}>
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11px] sm:text-xs text-[#64748B] font-medium truncate hidden sm:block leading-tight mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right Global Controls */}
      {/* === AMÉLIORATION AJOUTÉE : la bande "Online" et la pastille "English" surchargeaient
          l'en-tête sur mobile/tablette (texte tronqué, panneaux qui débordaient) — masquées
          en dessous de md (768px), où seuls la cloche de notification et l'avatar restent
          visibles ; à partir de md elles réapparaissent comme avant === */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
        {/* Online Status Badge */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-[#ECFDF5] border border-emerald-200 rounded-full text-xs font-semibold text-[#047857]">
          <div className="w-2 h-2 bg-[#10B981] rounded-full animate-pulse"></div>
          <span>Online</span>
        </div>

        {/* Language Pill */}
        <div
          id="app-language-indicator"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E2E8F0] rounded-full text-xs font-semibold text-[var(--brand-900)] shadow-2xs hover:bg-slate-50 transition cursor-default"
          title="System Language: English (Official)"
        >
          <Globe className={`w-3.5 h-3.5 ${theme.palette.primaryText}`} />
          <span>English</span>
        </div>

        {/* Audio Feedback Toggle (Audio ON / MUTE) */}
        <button
          id="sound-toggle-button"
          type="button"
          onClick={handleToggleSound}
          className={`p-2 rounded-xl transition cursor-pointer ${
            soundEnabled
              ? 'text-[#64748B] hover:text-slate-900 hover:bg-slate-50'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
          }`}
          title={soundEnabled ? 'Sound enabled (Click to mute)' : 'Sound muted (Click to enable)'}
          aria-label={soundEnabled ? 'Mute sound' : 'Enable sound'}
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4 text-slate-700" />
          ) : (
            <VolumeX className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {/* Notification Bell with Badge & Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            id="notification-bell-button"
            type="button"
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className={`p-2 rounded-xl transition relative cursor-pointer ${
              notificationsOpen
                ? `bg-slate-100 ${theme.palette.pageTitleColor}`
                : 'text-[#64748B] hover:text-slate-900 hover:bg-slate-50'
            }`}
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-[#DC4C4C] text-white text-[9px] font-black rounded-full flex items-center justify-center animate-scaleIn">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Flyout Panel */}
          {/* === AMÉLIORATION AJOUTÉE : positionné en `fixed` ancré aux bords de l'écran (avec
              marge) sur mobile, au lieu d'un panneau `absolute` de 320-384px ancré à droite de
              la cloche qui débordait et se retrouvait tronqué à gauche de l'écran. À partir de
              `sm`, on revient au positionnement `absolute` habituel sous la cloche. === */}
          {/* === AMÉLIORATION AJOUTÉE : `max-w-full` retiré du panneau ci-dessous — comme ce
              panneau est positionné en `absolute` par rapport au petit conteneur `relative`
              qui enveloppe juste l'icône de la cloche (32px de large), `max-width: 100%` se
              résolvait à 32px et écrasait toute la largeur du panneau (w-96) en un mince
              ruban vertical illisible sur desktop/tablette. La largeur mobile (`inset-x-4`)
              et desktop (`sm:w-96`) suffisent déjà à contraindre le panneau, `max-w-full`
              était inutile. === */}
          {notificationsOpen && (
            <div className="fixed inset-x-4 top-16 sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 w-auto sm:w-96 bg-white rounded-2xl shadow-2xl border border-[#E8EDF2] py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-4 py-3 border-b border-[#E8EDF2] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* === ADDED IMPROVEMENT: notification panel colors aligned with the active role's theme === */}
                  <h3 className={`text-xs font-extrabold ${theme.palette.pageTitleColor} uppercase tracking-wider`}>
                    Notifications
                  </h3>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[#DC4C4C]/10 text-[#DC4C4C] text-[10px] font-black">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllAsRead}
                    className={`text-[11px] font-bold ${theme.palette.pageTitleColor} hover:opacity-70 flex items-center gap-1 hover:underline cursor-pointer`}
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>

              {/* Notification List */}
              <div className="max-h-[360px] overflow-y-auto divide-y divide-[#F1F5F9]">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#778FAF]">
                    No new notifications
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`p-3.5 hover:bg-[#F8FAFC] transition cursor-pointer flex items-start gap-3 ${
                        notif.unread ? 'bg-[#F0F7FF]/60' : 'bg-white'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          notif.type === 'claim'
                            ? 'bg-amber-100 text-amber-700'
                            : notif.type === 'enrollment'
                            ? 'bg-emerald-100 text-emerald-700'
                            : notif.type === 'invoice'
                            ? 'bg-[var(--brand-100)] text-[var(--brand-700)]'
                            : notif.type === 'policy'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}
                      >
                        {notif.type === 'claim' && <FileCheck2 className="w-4 h-4" />}
                        {notif.type === 'enrollment' && <UserPlus className="w-4 h-4" />}
                        {notif.type === 'invoice' && <Receipt className="w-4 h-4" />}
                        {notif.type === 'system' && <ShieldCheck className="w-4 h-4" />}
                        {/* === AMÉLIORATION AJOUTÉE : icône dédiée pour les notifications de
                            police d'assurance santé (expiration, suspension, réactivation) === */}
                        {notif.type === 'policy' && <ShieldAlert className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <p className={`text-xs font-bold truncate ${notif.unread ? theme.palette.pageTitleColor : 'text-slate-700'}`}>
                            {notif.title}
                          </p>
                          <span className="text-[10px] text-[#778FAF] shrink-0 font-medium">
                            {notif.time || (notif.timestamp ? new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now')}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#556987] leading-relaxed line-clamp-2">
                          {notif.message}
                        </p>
                        {notif.targetSection && (
                          <div className={`mt-1.5 flex items-center gap-1 text-[10px] font-bold ${theme.palette.pageTitleColor}`}>
                            <span>View details</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </div>
                        )}
                      </div>
                      {notif.unread && (
                        <div className={`w-2 h-2 rounded-full ${theme.palette.avatarBg} shrink-0 mt-1.5`}></div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Avatar & Dropdown */}
        <div className="relative border-l border-[#E8EDF2] pl-2 sm:pl-3" ref={menuRef}>
          <button
            id="user-profile-button"
            type="button"
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-[#F8FAFC] transition cursor-pointer"
          >
            <div className="text-right hidden md:block">
              <div className={`text-xs font-bold ${theme.palette.pageTitleColor} leading-tight`}>
                {userName}
              </div>
              <div className="text-[10px] text-[#778FAF] font-medium flex items-center justify-end gap-1">
                <span>{userPosition}</span>
              </div>
            </div>
            <div className={`w-8 h-8 sm:w-9 sm:h-9 ${theme.palette.avatarBg} rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm shadow-xs`}>
              {initial}
            </div>
          </button>

          {/* === AMÉLIORATION AJOUTÉE : même correctif que le panneau de notifications — ancré
              aux bords de l'écran sur mobile pour ne jamais déborder, et `max-w-full` retiré
              (il se résolvait à la largeur du petit conteneur `relative` de l'avatar plutôt
              que celle du panneau, écrasant sa largeur) === */}
          {profileMenuOpen && (
            <div className="fixed inset-x-4 top-16 sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 w-auto sm:w-72 bg-white rounded-2xl shadow-2xl border border-[#E8EDF2] py-2 z-50 animate-in fade-in duration-150">
              <div className="px-4 py-3 border-b border-[#E8EDF2]">
                <p className={`text-xs font-extrabold ${theme.palette.pageTitleColor}`}>
                  {userName}
                </p>
                <p className="text-[11px] text-[#556987] font-medium">{userPosition}</p>
                <p className="text-[11px] text-[#778FAF] truncate mt-0.5">{currentUser?.email || "admin@activa-assurance.com"}</p>

                {/* User Role & Dynamic Entity Badges */}
                {/* === ADDED IMPROVEMENT: the entity badge uses the active role's color instead of a fixed Agent blue === */}
                <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#DEFEEB] text-[#00A859] text-[10px] font-extrabold border border-[#00A859]/30">
                    Active: {role || 'User'}
                  </span>
                  <span className={`inline-block px-2.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 ${theme.palette.pageTitleColor} text-[10px] font-black`}>
                    {userEntity}
                  </span>
                </div>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onOpenChangePassword();
                  }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold ${theme.palette.pageTitleColor} hover:bg-[#F8FAFC] cursor-pointer`}
                >
                  <KeyRound className="w-4 h-4 text-[#778FAF]" />
                  <span>Change Password</span>
                </button>
              </div>

              <div className="pt-1 border-t border-[#E8EDF2]">
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-[#DC4C4C] hover:bg-[#FEF2F2] cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-[#DC4C4C]" />
                  <span>{t.logout}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

