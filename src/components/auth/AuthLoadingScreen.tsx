import React from 'react';
import { Logo } from '../Logo';
import { ShieldCheck, Loader2 } from 'lucide-react';

interface AuthLoadingScreenProps {
  message?: string;
  detail?: string;
}

export const AuthLoadingScreen: React.FC<AuthLoadingScreenProps> = ({
  message = 'Authenticating session...',
  detail = 'Resolving operational profile and access credentials...',
}) => {
  return (
    <div
      id="auth-loading-screen"
      className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between p-6 font-sans antialiased select-none"
    >
      {/* Top Header Bar */}
      <header className="w-full flex items-center justify-between py-2 px-2 sm:px-4">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E8EDF2] rounded-lg text-xs font-semibold text-[#0a2e6b] shadow-2xs">
          <ShieldCheck className="w-3.5 h-3.5 text-[#0a2e6b]" />
          <span>ACTIVA Cloud Secure Gateway</span>
        </div>
      </header>

      {/* Centered Loading Card */}
      <div className="my-auto flex flex-col items-center justify-center">
        <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-xl shadow-slate-300/30 border border-[#E8EDF2] p-8 text-center flex flex-col items-center animate-in fade-in duration-200">
          {/* Logo container */}
          <div className="mb-6 bg-white rounded-xl px-5 py-2.5 shadow-2xs border border-slate-200/90 flex items-center justify-center">
            <Logo size="md" showTagline={true} transparent={true} />
          </div>

          {/* Spinner indicator */}
          <div className="relative mb-5 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border-3 border-[#0a2e6b]/15 border-t-[#0a2e6b] animate-spin" />
            <Loader2 className="w-5 h-5 text-[#0a2e6b] absolute animate-pulse" />
          </div>

          {/* Title & Subtitle */}
          <h2 className="text-base sm:text-lg font-bold text-[#0a2e6b] tracking-tight">
            {message}
          </h2>
          <p className="text-xs sm:text-[13px] text-[#556987] font-medium mt-1.5 max-w-[280px] leading-relaxed">
            {detail}
          </p>

          {/* Security badge */}
          <div className="mt-6 pt-5 border-t border-[#E8EDF2] w-full flex items-center justify-center gap-2 text-[11px] font-semibold text-[#778FAF]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00A859] animate-pulse" />
            <span>Zero-Trust Role-Based Authentication</span>
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
