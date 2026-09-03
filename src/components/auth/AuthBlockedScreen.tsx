import React from 'react';
import { Logo } from '../Logo';
import { ShieldAlert, LogOut, UserX, AlertTriangle } from 'lucide-react';

interface AuthBlockedScreenProps {
  reason: 'inactive' | 'invalid_role' | 'not_found';
  userEmail?: string;
  onLogout: () => void;
}

export const AuthBlockedScreen: React.FC<AuthBlockedScreenProps> = ({
  reason,
  userEmail,
  onLogout,
}) => {
  const getTitleAndMessage = () => {
    switch (reason) {
      case 'inactive':
        return {
          title: 'Account Deactivated',
          subtitle: 'Deactivated by the administrator',
          detail:
            'This user account is currently marked as inactive. Please contact the Head of Operations or your system administrator to reactivate your access.',
          icon: UserX,
          badgeColor: 'bg-red-50 text-red-700 border-red-200',
        };
      case 'invalid_role':
        return {
          title: 'Invalid Role Configuration',
          subtitle: 'No valid role assigned to this user',
          detail:
            'Your account is authenticated, but no valid operational role (Admin, Supervisor, or Agent) was assigned. An administrator must assign a valid role before access can be granted.',
          icon: AlertTriangle,
          badgeColor: 'bg-amber-50 text-amber-800 border-amber-200',
        };
      case 'not_found':
      default:
        return {
          title: 'Account Profile Not Found',
          subtitle: 'No matching user profile found',
          detail:
            'No matching operational profile was found in the system for this account. Please verify with your ACTIVA administrator.',
          icon: ShieldAlert,
          badgeColor: 'bg-red-50 text-red-700 border-red-200',
        };
    }
  };

  const { title, subtitle, detail, icon: IconComponent, badgeColor } = getTitleAndMessage();

  return (
    <div
      id="auth-blocked-screen"
      className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between p-6 font-sans antialiased select-none"
    >
      {/* Top Header Bar */}
      <header className="w-full flex items-center justify-between py-2 px-2 sm:px-4">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E8EDF2] rounded-lg text-xs font-semibold text-[#0a2e6b] shadow-2xs">
          <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
          <span>ACTIVA Security Enforcement</span>
        </div>
      </header>

      {/* Centered Card */}
      <div className="my-auto flex flex-col items-center justify-center">
        <div className="w-full max-w-[460px] bg-white rounded-2xl shadow-xl shadow-slate-300/30 border border-[#E8EDF2] p-8 text-center flex flex-col items-center animate-in fade-in duration-200">
          {/* Logo container */}
          <div className="mb-6 bg-white rounded-xl px-5 py-2.5 shadow-2xs border border-slate-200/90 flex items-center justify-center">
            <Logo size="md" showTagline={true} transparent={true} />
          </div>

          {/* Alert Icon */}
          <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 mb-4 shadow-2xs">
            <IconComponent className="w-7 h-7" />
          </div>

          {/* Titles */}
          <h2 className="text-lg font-bold text-[#0a2e6b] tracking-tight">{title}</h2>
          <p className="text-xs text-[#778FAF] font-semibold mt-0.5">{subtitle}</p>

          {/* User Email Pill */}
          {userEmail && (
            <div className={`mt-3 px-3 py-1 rounded-full text-xs font-mono font-medium border ${badgeColor}`}>
              {userEmail}
            </div>
          )}

          {/* Detailed Message */}
          <p className="text-xs sm:text-[13px] text-[#556987] font-medium mt-4 leading-relaxed bg-[#F8FAFC] p-4 rounded-xl border border-[#E8EDF2] text-left">
            {detail}
          </p>

          {/* Sign Out Button */}
          <div className="mt-6 w-full pt-4 border-t border-[#E8EDF2]">
            <button
              id="blocked-logout-button"
              type="button"
              onClick={onLogout}
              className="w-full py-3 px-4 rounded-xl bg-[#0a2e6b] hover:bg-[#07214f] active:bg-[#07214f] text-white text-xs sm:text-[13px] font-bold shadow-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Return to Login</span>
            </button>
          </div>
        </div>

        {/* Footnote */}
        <div className="mt-4 text-center text-xs text-[#778FAF] font-medium">
          © 2026 ACTIVA Insurance Group. All rights reserved.
        </div>
      </div>

      {/* Bottom spacer */}
      <div className="h-4" />
    </div>
  );
};
