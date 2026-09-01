import React, { useState, useEffect } from 'react';
import { Lock, User, ArrowRight, AlertCircle, Globe, Shield } from 'lucide-react';
import { Language } from '../../types';
import { Logo } from '../Logo';
import { auth, db } from '../../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

interface LoginViewProps {
  onLoginSuccess: (user: any, accountData?: any) => void;
  lang: Language;
  onLanguageChange?: (lang: Language) => void;
}

// === AMÉLIORATION AJOUTÉE (sécurité) : verrouillage temporaire côté client après des
// tentatives de connexion échouées répétées, par nom d'utilisateur/email saisi (stocké dans
// sessionStorage, effacé à la fermeture de l'onglet). Ceci s'ajoute — sans le remplacer — au
// rate limiting déjà appliqué côté serveur par Firebase Auth lui-même (erreur
// 'auth/too-many-requests' déjà gérée plus bas) : une défense en profondeur supplémentaire,
// visible plus tôt et sans dépendre uniquement du blocage serveur.
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60_000;

function loginAttemptKey(identifier: string) {
  return `activa_login_attempts_${identifier.toLowerCase().trim()}`;
}
function loginLockoutKey(identifier: string) {
  return `activa_login_lockout_${identifier.toLowerCase().trim()}`;
}

function getLockoutRemainingMs(identifier: string): number {
  if (!identifier) return 0;
  try {
    const until = Number(sessionStorage.getItem(loginLockoutKey(identifier)) || 0);
    return Math.max(0, until - Date.now());
  } catch {
    return 0; // sessionStorage unavailable (e.g. private mode edge cases) -> fail open, no lockout
  }
}

function recordFailedLoginAttempt(identifier: string) {
  if (!identifier) return;
  try {
    const key = loginAttemptKey(identifier);
    const attempts = Number(sessionStorage.getItem(key) || 0) + 1;
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      sessionStorage.setItem(loginLockoutKey(identifier), String(Date.now() + LOCKOUT_DURATION_MS));
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, String(attempts));
    }
  } catch {
    // sessionStorage unavailable -> silently skip client-side tracking (server-side limit still applies)
  }
}

function clearLoginAttempts(identifier: string) {
  if (!identifier) return;
  try {
    sessionStorage.removeItem(loginAttemptKey(identifier));
    sessionStorage.removeItem(loginLockoutKey(identifier));
  } catch {
    // ignore
  }
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [lockoutRemainingSec, setLockoutRemainingSec] = useState(0);

  // Live countdown while locked out, so the user sees when they can retry.
  useEffect(() => {
    if (lockoutRemainingSec <= 0) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil(getLockoutRemainingMs(username.trim()) / 1000);
      setLockoutRemainingSec(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutRemainingSec, username]);

  const attemptLogin = async (cleanUsername: string): Promise<boolean> => {
    setIsLoggingIn(true);
    setError(null);

    const inputLower = cleanUsername.toLowerCase();
    const inputSanitized = inputLower.replace(/[^a-z0-9_.]/g, '');

    try {
      // 1. Search Firestore accounts collection to find the registered account
      let matchingAccountDoc: any = null;
      let matchingAccountId: string | null = null;

      try {
        const accountsSnap = await getDocs(collection(db, 'accounts'));
        for (const docSnap of accountsSnap.docs) {
          const data = docSnap.data();
          const docEmail = (data.email || '').toLowerCase().trim();
          const docUsername = (data.username || '').toLowerCase().trim();
          const docAuthEmail = (data.authEmail || '').toLowerCase().trim();

          if (
            docEmail === inputLower ||
            docUsername === inputLower ||
            docUsername === inputSanitized ||
            docAuthEmail === inputLower ||
            (docEmail && inputLower.includes('@') && docEmail === inputLower) ||
            (docEmail.split('@')[0] && docEmail.split('@')[0] === inputLower) ||
            (docAuthEmail.split('@')[0] && docAuthEmail.split('@')[0] === inputLower)
          ) {
            matchingAccountDoc = data;
            matchingAccountId = docSnap.id;
            break;
          }
        }
      } catch (e) {
        console.warn('Could not query accounts collection ahead of auth:', e);
      }

      // Check if matched account is deactivated
      if (matchingAccountDoc && matchingAccountDoc.isActive === false) {
        setError('Ce compte est désactivé par l’administrateur. / This account has been deactivated. Please contact your administrator.');
        setIsLoggingIn(false);
        return false;
      }

      // Build candidate emails to try with Firebase Auth
      const candidateEmails: string[] = [];
      if (matchingAccountDoc) {
        if (matchingAccountDoc.authEmail) candidateEmails.push(matchingAccountDoc.authEmail.toLowerCase().trim());
        if (matchingAccountDoc.email && matchingAccountDoc.email.includes('@')) {
          candidateEmails.push(matchingAccountDoc.email.toLowerCase().trim());
        }
        if (matchingAccountDoc.username) {
          candidateEmails.push(`${matchingAccountDoc.username.toLowerCase()}@activa.local`);
          candidateEmails.push(`${matchingAccountDoc.username.toLowerCase()}@activa-assurance.com`);
        }
      }

      if (cleanUsername.includes('@')) {
        candidateEmails.push(inputLower);
        const userPart = inputLower.split('@')[0].replace(/[^a-z0-9_.]/g, '');
        candidateEmails.push(`${userPart}@activa.local`);
        candidateEmails.push(`${userPart}@activa-assurance.com`);
      } else {
        candidateEmails.push(`${inputSanitized}@activa.local`);
        candidateEmails.push(`${inputSanitized}@activa-assurance.com`);
        candidateEmails.push(`${inputSanitized}@group-activa.com`);
      }

      const uniqueCandidateEmails = Array.from(new Set(candidateEmails.filter(Boolean)));

      let userCredential: any = null;
      let lastSignInErr: any = null;

      // 2. Try signing in with candidate emails in Firebase Auth
      for (const email of uniqueCandidateEmails) {
        try {
          userCredential = await signInWithEmailAndPassword(auth, email, password);
          if (userCredential?.user) break;
        } catch (err: any) {
          lastSignInErr = err;
          if (err.code === 'auth/wrong-password' || err.code === 'auth/too-many-requests') {
            break;
          }
        }
      }

      // 3. If standard sign-in succeeded:
      if (userCredential?.user) {
        const userDocRef = doc(db, 'accounts', userCredential.user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists() && matchingAccountDoc) {
          // Associate the existing account record with the authenticated UID
          await setDoc(userDocRef, { ...matchingAccountDoc, id: userCredential.user.uid }, { merge: true });
        }

        onLoginSuccess(userCredential.user);
        return true;
      }

      // 4. If sign in did not find user in Firebase Auth, but matching account was created by Admin in Firestore:
      if (matchingAccountDoc) {
        const storedPwd = matchingAccountDoc.password || matchingAccountDoc.tempPassword;
        if (storedPwd && storedPwd !== password) {
          setError('Mot de passe incorrect. Veuillez vérifier les identifiants fournis par l’administrateur. / Incorrect password. Please verify the credentials provided by your administrator.');
          setIsLoggingIn(false);
          return false;
        }

        // Auto-provision Firebase Auth credential for this registered corporate account
        const primaryAuthEmail = uniqueCandidateEmails[0] || `${matchingAccountDoc.username || inputSanitized}@activa.local`;
        try {
          userCredential = await createUserWithEmailAndPassword(auth, primaryAuthEmail, password);
        } catch (createErr: any) {
          if (createErr.code === 'auth/email-already-in-use') {
            const fallbackEmail = `${(matchingAccountDoc.username || inputSanitized).toLowerCase()}_${Date.now()}@activa.local`;
            try {
              userCredential = await createUserWithEmailAndPassword(auth, fallbackEmail, password);
            } catch {
              throw lastSignInErr || createErr;
            }
          } else {
            throw lastSignInErr || createErr;
          }
        }

        if (userCredential?.user) {
          const userDocRef = doc(db, 'accounts', userCredential.user.uid);
          await setDoc(userDocRef, { ...matchingAccountDoc, id: userCredential.user.uid }, { merge: true });
          onLoginSuccess(userCredential.user);
          return true;
        }
      }

      // 5. If no account matches in Firestore and no Firebase Auth user exists:
      setError('Identifiant ou mot de passe incorrect. Veuillez vérifier vos identifiants. / Invalid username or password.');
      setIsLoggingIn(false);
      return false;
    } catch (err: any) {
      console.error('Login error:', err);
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/user-not-found'
      ) {
        setError('Identifiant ou mot de passe incorrect. Veuillez vérifier vos identifiants fournis par l’administrateur. / Invalid username or password. Please verify your credentials.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Trop de tentatives infructueuses. Veuillez patienter un instant. / Too many attempts. Please try again shortly.');
      } else if (err.code === 'auth/weak-password') {
        setError('Le mot de passe doit comporter au moins 6 caractères.');
      } else {
        setError(err.message || 'Authentication failed. Please check your credentials.');
      }
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setError('Please enter your Corporate Email / Username and Password.');
      return;
    }

    const remainingMs = getLockoutRemainingMs(cleanUsername);
    if (remainingMs > 0) {
      setLockoutRemainingSec(Math.ceil(remainingMs / 1000));
      setError(`Too many failed attempts. Please try again in ${Math.ceil(remainingMs / 1000)}s. / Trop de tentatives échouées, veuillez réessayer dans ${Math.ceil(remainingMs / 1000)}s.`);
      return;
    }

    const success = await attemptLogin(cleanUsername);
    if (success) {
      clearLoginAttempts(cleanUsername);
    } else {
      recordFailedLoginAttempt(cleanUsername);
      const remaining = getLockoutRemainingMs(cleanUsername);
      if (remaining > 0) {
        setLockoutRemainingSec(Math.ceil(remaining / 1000));
        setError(`Too many failed attempts. Please try again in ${Math.ceil(remaining / 1000)}s. / Trop de tentatives échouées, veuillez réessayer dans ${Math.ceil(remaining / 1000)}s.`);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans antialiased select-none">
      {/* Top Header Bar */}
      <header className="w-full flex items-center justify-between py-2 px-2 sm:px-4">
        {/* Left: ACTIVA Cloud Secure Portal */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E8EDF2] rounded-lg text-xs font-semibold text-[#0a2e6b] shadow-2xs">
          <Shield className="w-3.5 h-3.5 text-[#0a2e6b]" />
          <span>ACTIVA Cloud Secure Portal</span>
        </div>

        {/* Right: English (Default) */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E8EDF2] rounded-lg text-xs font-semibold text-[#0a2e6b] shadow-2xs">
          <Globe className="w-3.5 h-3.5 text-[#0a2e6b]" />
          <span>English (Default)</span>
        </div>
      </header>

      {/* Centered Login Card Container */}
      <div className="my-auto flex flex-col items-center justify-center">
        <div className="w-full max-w-[460px] bg-white rounded-[26px] shadow-xl shadow-slate-300/30 border border-[#E8EDF2] overflow-hidden flex flex-col transition-all duration-300">
          
          {/* CARD NAVY HEADER (#0a2e6b) */}
          <div className="bg-[#0a2e6b] pt-8 pb-7 px-6 text-white text-center flex flex-col items-center">
            {/* Logo container with white background and moderate rounded corners */}
            <div className="mb-4 bg-white rounded-xl px-4 py-2 shadow-sm border border-slate-200/90 flex items-center justify-center">
              <Logo size="md" showTagline={true} transparent={true} />
            </div>

            {/* Header Title & Subtitle */}
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-tight">
              Production Portal Login
            </h1>
            <p className="text-xs sm:text-[13px] text-[#EAF2FF] font-medium mt-1.5 opacity-90 leading-snug">
              Health Insurance & Claims Management Platform
            </p>
          </div>

          {/* LOGIN FORM */}
          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5 bg-white">
            {/* Error Alert Box */}
            {error && (
              <div className="bg-[#FEF2F2] border border-[#FECACA] text-[#DC4C4C] text-xs p-3.5 rounded-xl font-medium flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-[#DC4C4C] shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{error}</div>
              </div>
            )}

            {/* Corporate Email or Username */}
            <div>
              <label className="block text-[13px] font-semibold text-[#0a2e6b] mb-1.5">
                Corporate Email or Username
              </label>
              <div className="relative">
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. by.ekani@group-activa.com"
                  className="w-full pl-10 pr-4 py-3 bg-[#F8FAFC] border border-[#E8EDF2] rounded-xl text-xs sm:text-[13px] text-[#0a2e6b] placeholder:text-[#778FAF] focus:outline-none focus:border-[#0a2e6b] focus:ring-2 focus:ring-[#0a2e6b]/20 focus:bg-white transition duration-150"
                  autoComplete="username"
                  required
                />
                <User className="w-4 h-4 text-[#778FAF] absolute left-3.5 top-3.5 pointer-events-none" />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[13px] font-semibold text-[#0a2e6b] mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 bg-[#F8FAFC] border border-[#E8EDF2] rounded-xl text-xs sm:text-[13px] text-[#0a2e6b] placeholder:text-[#778FAF] focus:outline-none focus:border-[#0a2e6b] focus:ring-2 focus:ring-[#0a2e6b]/20 focus:bg-white transition duration-150"
                  autoComplete="current-password"
                  required
                />
                <Lock className="w-4 h-4 text-[#778FAF] absolute left-3.5 top-3.5 pointer-events-none" />
              </div>
            </div>

            {/* Sign In Button */}
            <div className="pt-2">
              <button
                id="login-submit-button"
                type="submit"
                disabled={isLoggingIn || lockoutRemainingSec > 0}
                className="w-full py-3.5 px-4 rounded-xl bg-[#0a2e6b] hover:bg-[#07214f] active:bg-[#07214f] text-white text-xs sm:text-[13px] font-bold shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{lockoutRemainingSec > 0 ? `Try again in ${lockoutRemainingSec}s` : isLoggingIn ? 'Signing In...' : 'Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* CARD FOOTER */}
          <div className="px-6 py-4 bg-[#F8FAFC] border-t border-[#E8EDF2] text-center text-xs text-[#778FAF] font-medium">
            <span>© 2026 ACTIVA Insurance Group. All rights reserved.</span>
          </div>
        </div>

        {/* Version underneath on background */}
        <div className="mt-3 text-center text-xs font-mono font-bold text-[#0a2e6b]">
          v2.4.0
        </div>
      </div>

      {/* Bottom spacer for balance */}
      <div className="h-6"></div>
    </div>
  );
};
