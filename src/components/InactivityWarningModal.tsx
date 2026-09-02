import React from 'react';
import { ShieldAlert, Clock, LogOut, CheckCircle2 } from 'lucide-react';

interface InactivityWarningModalProps {
  isOpen: boolean;
  remainingSeconds: number;
  onStayConnected: () => void;
  onLogout: () => void;
  lang?: string;
  userRole?: string;
}

export const InactivityWarningModal: React.FC<InactivityWarningModalProps> = ({
  isOpen,
  remainingSeconds,
  onStayConnected,
  onLogout,
  lang = 'fr',
  userRole = 'Admin',
}) => {
  if (!isOpen) return null;

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  // === AMÉLIORATION AJOUTÉE : accent gris pour Admin (au lieu du bleu marine Agent
  // #0A347B affiché auparavant peu importe le rôle connecté) ===
  const isAdmin = userRole.toLowerCase() === 'admin' || userRole.toLowerCase() === 'administrateur';
  const isSupervisor = userRole.toLowerCase() === 'supervisor' || userRole.toLowerCase() === 'superviseur';
  const accentTextClass = isAdmin ? 'text-slate-800' : isSupervisor ? 'text-[#0F766E]' : 'text-[#0A347B]';
  const accentBtnClass = isAdmin ? 'bg-slate-700 hover:bg-slate-800' : isSupervisor ? 'bg-[#0F766E] hover:bg-[#115E59]' : 'bg-[#0A347B] hover:bg-[#08285e]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden text-center p-6 space-y-5 animate-in zoom-in-95">
        <div className="w-16 h-16 bg-amber-50 rounded-2xl border-2 border-amber-200 flex items-center justify-center mx-auto text-amber-600 shadow-xs">
          <Clock className="w-8 h-8 animate-pulse" />
        </div>

        <div>
          <h3 className="text-base font-extrabold text-slate-900">
            Inactivity Warning
          </h3>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            For security and insurance compliance reasons, your session will expire in:
          </p>
        </div>

        <div className={`py-3 px-6 bg-slate-50 rounded-2xl border border-slate-200 inline-block font-mono text-3xl font-black ${accentTextClass} tracking-wider`}>
          {formattedTime}
        </div>

        <p className="text-[11px] text-slate-400">
          Would you like to extend your working session?
        </p>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={onLogout}
            className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out</span>
          </button>

          <button
            type="button"
            onClick={onStayConnected}
            className={`py-2.5 px-4 ${accentBtnClass} text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-98`}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Stay Connected</span>
          </button>
        </div>
      </div>
    </div>
  );
};
