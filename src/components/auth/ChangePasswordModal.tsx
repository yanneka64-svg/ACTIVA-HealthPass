import React, { useState } from 'react';
import { KeyRound, Check, X, ShieldAlert, Lock } from 'lucide-react';
import { Language } from '../../types';
import { useTranslation } from '../../i18n/translations';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose?: () => void;
  // === ADDED IMPROVEMENT (security): the user's CURRENT password is now forwarded to
  // onSuccess (2nd parameter, absent on a forced first login where the field doesn't
  // exist) so the caller can verify it via re-authentication before allowing the change —
  // see App.tsx.
  onSuccess: (newPassword: string, currentPassword?: string) => void;
  lang: Language;
  isForcedFirstLogin?: boolean;
  isExpiredPassword?: boolean;
  customTitle?: string;
  customSubtitle?: string;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  lang,
  isForcedFirstLogin = false,
  isExpiredPassword = false,
  customTitle,
  customSubtitle,
}) => {
  const t = useTranslation(lang);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isMandatory = isForcedFirstLogin || isExpiredPassword;

  const hasMinLength = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasNumber = /\d/.test(newPassword);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);
  const isMatching = newPassword.length > 0 && newPassword === confirmPassword;
  const isFormValid = hasMinLength && hasUpper && hasLower && hasNumber && hasSpecial && isMatching;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) {
      setError(
        'Please meet all password security requirements.'
      );
      return;
    }
    setError(null);
    // isForcedFirstLogin: no "current password" field (the user just signed in with their
    // temporary password) -> currentPassword stays undefined.
    onSuccess(newPassword, isForcedFirstLogin ? undefined : currentPassword);
  };

  const modalTitle = customTitle || (isExpiredPassword ? 'Periodic Password Renewal' : isForcedFirstLogin ? t.auth.changePasswordTitle : t.changePassword);
  const modalSubtitle = customSubtitle || (isExpiredPassword ? 'Your password has reached its 2-month validity limit. Please set a new password.' : isForcedFirstLogin ? t.auth.changePasswordSubtitle : 'Securing your account');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#0a2e6b] p-6 text-white text-center relative">
          <div className="w-12 h-12 rounded-2xl bg-white/10 mx-auto flex items-center justify-center text-emerald-300 mb-3 shadow-inner">
            <KeyRound className="w-6 h-6" />
          </div>
          <h3 className="font-extrabold text-lg tracking-tight">
            {modalTitle}
          </h3>
          <p className="text-xs text-blue-100 mt-1 max-w-xs mx-auto leading-relaxed">
            {modalSubtitle}
          </p>

          {!isMandatory && onClose && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl flex items-center gap-2 font-medium">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {!isForcedFirstLogin && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.auth.currentPassword}
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0a2e6b] focus:bg-white transition"
                  placeholder="••••••••"
                  required
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.auth.newPassword}
            </label>
            <div className="relative">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0a2e6b] focus:bg-white transition"
                placeholder="••••••••"
                required
              />
              <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.auth.confirmPassword}
            </label>
            <div className="relative">
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0a2e6b] focus:bg-white transition"
                placeholder="••••••••"
                required
              />
              <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            </div>
          </div>

          {/* Rules list */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-1.5">
            <p className="text-[11px] font-bold text-slate-600 mb-1">
              {'Security requirements:'}
            </p>
            <div className="grid grid-cols-1 gap-1 text-[11px]">
              <div className={`flex items-center gap-2 font-medium ${hasMinLength ? 'text-emerald-600' : 'text-slate-400'}`}>
                {hasMinLength ? <Check className="w-3.5 h-3.5 text-[#00A859]" /> : <span className="w-3.5 h-3.5 rounded-full border border-slate-300 inline-block"></span>}
                <span>Minimum 8 characters</span>
              </div>
              <div className={`flex items-center gap-2 font-medium ${hasUpper ? 'text-emerald-600' : 'text-slate-400'}`}>
                {hasUpper ? <Check className="w-3.5 h-3.5 text-[#00A859]" /> : <span className="w-3.5 h-3.5 rounded-full border border-slate-300 inline-block"></span>}
                <span>At least one uppercase letter</span>
              </div>
              <div className={`flex items-center gap-2 font-medium ${hasLower ? 'text-emerald-600' : 'text-slate-400'}`}>
                {hasLower ? <Check className="w-3.5 h-3.5 text-[#00A859]" /> : <span className="w-3.5 h-3.5 rounded-full border border-slate-300 inline-block"></span>}
                <span>At least one lowercase letter</span>
              </div>
              <div
                className={`flex items-center gap-2 font-medium ${
                  hasNumber ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                {hasNumber ? <Check className="w-3.5 h-3.5 text-[#00A859]" /> : <span className="w-3.5 h-3.5 rounded-full border border-slate-300 inline-block"></span>}
                <span>{t.auth.ruleNumber}</span>
              </div>
              <div
                className={`flex items-center gap-2 font-medium ${
                  hasSpecial ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                {hasSpecial ? <Check className="w-3.5 h-3.5 text-[#00A859]" /> : <span className="w-3.5 h-3.5 rounded-full border border-slate-300 inline-block"></span>}
                <span>{t.auth.ruleSpecial}</span>
              </div>
              <div
                className={`flex items-center gap-2 font-medium ${
                  isMatching ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                {isMatching ? <Check className="w-3.5 h-3.5 text-[#00A859]" /> : <span className="w-3.5 h-3.5 rounded-full border border-slate-300 inline-block"></span>}
                <span>{t.auth.ruleMatch}</span>
              </div>
            </div>
          </div>

          <div className="pt-2 flex gap-3">
            {!isForcedFirstLogin && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition"
              >
                {t.cancel}
              </button>
            )}
            <button
              type="submit"
              disabled={!isFormValid}
              className={`flex-1 py-2.5 px-4 rounded-xl text-white text-xs font-bold shadow-md transition flex items-center justify-center gap-2 ${
                isFormValid
                  ? 'bg-[#0a2e6b] hover:bg-[#07214f]'
                  : 'bg-slate-300 cursor-not-allowed text-slate-500'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>{t.auth.updatePasswordBtn}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
