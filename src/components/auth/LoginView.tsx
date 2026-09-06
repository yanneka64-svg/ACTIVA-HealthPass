import React, { useState, useEffect } from 'react';
import { Lock, User, ArrowRight, AlertCircle, Globe, Shield, Eye, EyeOff } from 'lucide-react';
import { Language } from '../../types';
import { Logo } from '../Logo';
import { auth, functions, db } from '../../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getClientLocationInfo, parseUserAgent } from '../../utils/geoUtils';
import { FirestoreService } from '../../services/firestore';

interface LoginViewProps {
  onLoginSuccess: (user: any, accountData?: any) => void;
  lang: Language;
  onLanguageChange?: (lang: Language) => void;
}

// === ADDED IMPROVEMENT (security): temporary client-side lockout after repeated failed
// login attempts, keyed by the username/email entered (stored in sessionStorage, cleared
// when the tab closes). This is additive — it does not replace — the rate limiting already
// enforced server-side by Firebase Auth itself ('auth/too-many-requests' error already
// handled below): an extra layer of defense in depth, surfaced earlier and not solely
// reliant on the server-side block.
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
  const [showPassword, setShowPassword] = useState(false);
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

    // === AMÉLIORATION AJOUTÉE : sécurité (audit 2026-09-05, SEC-01/SEC-02 — CRITIQUE) ===
    // Avant ce correctif, cette fonction lisait l'INTÉGRALITÉ de la collection Firestore
    // `accounts` directement depuis le navigateur (`getDocs(collection(db,'accounts'))`),
    // puis comparait le mot de passe saisi au hash/sel — voire au mot de passe en clair pour
    // les comptes legacy — lus dans ce même document, EN CLAIR CÔTÉ CLIENT. Combiné à la règle
    // Firestore `accounts: allow read: if true` (désormais retirée, voir firestore.rules),
    // n'importe qui pouvait télécharger tous les comptes (y compris Admin) sans jamais se
    // connecter, et l'intégrité de la vérification de mot de passe reposait entièrement sur un
    // environnement contrôlé par l'attaquant (le navigateur).
    // Correctif : la résolution d'identifiant ET la vérification de mot de passe legacy sont
    // désormais EXCLUSIVEMENT effectuées côté serveur par la Cloud Function `resolveLoginIdentifier`
    // (SDK Admin, ignore les règles Firestore, ne renvoie jamais hash/sel/mot de passe). Le seul
    // accès direct restant à `accounts` se fait APRÈS authentification Firebase réussie, sur le
    // document `accounts/{uid}` du PROPRE utilisateur connecté — explicitement autorisé par
    // `firestore.rules` (`request.auth.uid == userId`) — jamais sur la collection entière.
    try {
      // 1. Résolution de l'identifiant ET vérification legacy du mot de passe via la Cloud
      // Function sécurisée `resolveLoginIdentifier` (rate limiting serveur persistant dans
      // Firestore, SDK Admin, jamais de secret renvoyé au client).
      let resolveResult: {
        found: boolean;
        isActive?: boolean;
        authEmail?: string | null;
        candidateEmails?: string[];
        username?: string;
        legacyVerification?: {
          checked: boolean;
          valid: boolean;
        };
        rateLimited?: boolean;
        retryAfterSec?: number;
        error?: string;
      } | null = null;
      let fnError: any = null;

      try {
        const resolveFn = httpsCallable<
          { identifier: string; password?: string },
          any
        >(functions, 'resolveLoginIdentifier');
        const res = await resolveFn({ identifier: cleanUsername, password });
        resolveResult = res.data;
      } catch (err: any) {
        fnError = err;
        console.warn('resolveLoginIdentifier warning:', err);
      }

      // Si le rate limiting serveur (Cloud Function) s'est déclenché
      if (resolveResult?.rateLimited || fnError?.code === 'resource-exhausted') {
        const remaining = resolveResult?.retryAfterSec || 60;
        setError(`Too many login attempts. Please wait ${remaining} seconds.`);
        setIsLoggingIn(false);
        return false;
      }

      // Si le compte est désactivé côté Cloud Function
      if (resolveResult && resolveResult.isActive === false) {
        setError('This account has been deactivated. Please contact your administrator.');
        setIsLoggingIn(false);
        return false;
      }

      // Construire la liste des emails candidats pour Firebase Auth : d'abord ceux retournés
      // par la Cloud Function (déjà dérivés du compte réel, sans jamais exposer son contenu),
      // puis les domaines institutionnels ACTIVA conventionnels en repli.
      const candidateEmails: string[] = [];

      if (resolveResult?.authEmail) {
        candidateEmails.push(resolveResult.authEmail.toLowerCase().trim());
      }
      if (resolveResult?.candidateEmails && resolveResult.candidateEmails.length > 0) {
        candidateEmails.push(...resolveResult.candidateEmails.map((e) => e.toLowerCase().trim()));
      }

      // Domaines institutionnels ACTIVA conventionnels, en repli si la Cloud Function n'a rien
      // trouvé ou n'est momentanément pas joignable.
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

      // 2. Tentative de connexion standard via Firebase Auth sur chaque e-mail candidat
      for (const email of uniqueCandidateEmails) {
        try {
          userCredential = await signInWithEmailAndPassword(auth, email, password);
          if (userCredential?.user) break;
        } catch (err: any) {
          lastSignInErr = err;
          // Si trop de tentatives consécutives sur Firebase Auth
          if (err.code === 'auth/too-many-requests') {
            break;
          }
        }
      }

      // 3. Si aucun e-mail candidat n'a permis de se connecter via Firebase Auth, mais que la
      // Cloud Function a validé un mot de passe legacy (hash PBKDF2, ou mot de passe en clair
      // non encore migré — la migration est effectuée automatiquement côté serveur), provisionne
      // l'identifiant Firebase Auth pour ce compte désormais vérifié.
      if (!userCredential?.user && resolveResult?.found && resolveResult?.legacyVerification) {
        if (resolveResult.legacyVerification.checked && !resolveResult.legacyVerification.valid) {
          setError('Invalid username or password. Please verify your credentials.');
          setIsLoggingIn(false);
          return false;
        }

        if (resolveResult.legacyVerification.valid) {
          const primaryEmail =
            resolveResult.authEmail ||
            uniqueCandidateEmails[0] ||
            `${resolveResult.username || inputSanitized}@activa.local`;

          try {
            userCredential = await createUserWithEmailAndPassword(auth, primaryEmail, password);
          } catch (createErr: any) {
            if (createErr.code === 'auth/email-already-in-use') {
              try {
                userCredential = await signInWithEmailAndPassword(auth, primaryEmail, password);
              } catch {
                const fallbackEmail = `${(resolveResult.username || inputSanitized).toLowerCase()}_${Date.now()}@activa.local`;
                try {
                  userCredential = await createUserWithEmailAndPassword(auth, fallbackEmail, password);
                } catch {
                  throw lastSignInErr || createErr;
                }
              }
            } else {
              throw lastSignInErr || createErr;
            }
          }
        }
      }

      // 4. Connexion réussie (standard ou provisionnement legacy) : récupère le document de
      // compte du PROPRE utilisateur désormais authentifié — lecture single-doc explicitement
      // autorisée par firestore.rules (jamais la collection entière). Si ce document n'existe
      // pas encore sous cet uid (compte pré-provisionné sous un identifiant différent), la
      // Cloud Function `ensureUserAccount` (SDK Admin) le relie de façon sécurisée.
      if (userCredential?.user) {
        const uid = userCredential.user.uid;
        let accountData: any = null;
        try {
          const accSnap = await getDoc(doc(db, 'accounts', uid));
          accountData = accSnap.exists() ? { id: uid, ...accSnap.data() } : null;
        } catch (readErr) {
          console.warn('Account read notice after login:', readErr);
        }

        if (!accountData) {
          try {
            const ensureFn = httpsCallable<{ identifier?: string }, { success: boolean; linked: boolean; profile?: string }>(
              functions,
              'ensureUserAccount'
            );
            const ensureRes = await ensureFn({ identifier: cleanUsername });
            if (ensureRes.data?.success) {
              const accSnap = await getDoc(doc(db, 'accounts', uid));
              accountData = accSnap.exists() ? { id: uid, ...accSnap.data() } : null;
            }
          } catch (ensureErr) {
            console.warn('ensureUserAccount notice:', ensureErr);
          }
        }

        if (accountData && accountData.isActive === false) {
          setError('This account has been deactivated. Please contact your administrator.');
          setIsLoggingIn(false);
          return false;
        }

        onLoginSuccess(userCredential.user, accountData);
        return true;
      }

      // 5. En cas d'échec
      setError('Invalid username or password. Please verify your credentials.');
      setIsLoggingIn(false);
      return false;
    } catch (err: any) {
      console.error('Login error:', err);
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/user-not-found'
      ) {
        setError('Invalid username or password. Please verify your credentials.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please wait a moment and try again.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password must be at least 6 characters long.');
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
      setError(`Too many failed attempts. Please try again in ${Math.ceil(remainingMs / 1000)}s.`);
      return;
    }

    const success = await attemptLogin(cleanUsername);
    if (success) {
      clearLoginAttempts(cleanUsername);
    } else {
      recordFailedLoginAttempt(cleanUsername);
      // === AMÉLIORATION AJOUTÉE : sécurité (audit) — aucune tentative de connexion échouée
      // n'était auparavant journalisée (seuls les succès l'étaient, depuis App.tsx) : la page
      // Audit & Access Logs ne pouvait donc jamais servir à repérer une attaque par force
      // brute ou des tentatives d'accès non autorisées, alors qu'elle prétend justement en
      // assurer le suivi ("Immutable security tracking"). Journalisée ici en tâche de fond
      // (jamais bloquant pour l'utilisateur), avec la même résolution IP/localisation que les
      // connexions réussies.
      getClientLocationInfo().then(({ ipAddress, location }) => {
        FirestoreService.addLog({
          userEmail: cleanUsername,
          ipAddress,
          status: 'failed',
          userAgent: navigator.userAgent,
          browser: parseUserAgent(navigator.userAgent),
          location,
        });
      });
      const remaining = getLockoutRemainingMs(cleanUsername);
      if (remaining > 0) {
        setLockoutRemainingSec(Math.ceil(remaining / 1000));
        setError(`Too many failed attempts. Please try again in ${Math.ceil(remaining / 1000)}s.`);
      }
    }
  };

  // === AMÉLIORATION AJOUTÉE : page de connexion refaite en écran divisé (split-screen),
  // sur demande explicite. Le panneau gauche reprend EXACTEMENT le dégradé bleu et le motif
  // de courbes décoratif de la sidebar de l'interface Agent (voir src/theme/roleTheme.ts —
  // AGENT_THEME.palette.sidebarGradient — et src/components/Sidebar.tsx pour le motif SVG).
  // Le logo est désormais uniquement sur la partie blanche, agrandi et centré au-dessus de
  // "Welcome Back!" pour être mieux mis en valeur. Le comportement du formulaire (validation,
  // authentification Firebase, messages d'erreur) est strictement inchangé — seule la mise en
  // page a été retravaillée. Sur mobile (le panneau bleu est masqué en dessous de lg), une
  // barre compacte reprend les mêmes informations (portail sécurisé, langue, copyright) pour
  // ne rien perdre de ce qui existait avant.
  return (
    <div className="min-h-screen w-full flex font-sans antialiased select-none">
      {/* Mobile-only top bar — repris du header existant, visible uniquement quand le panneau
          bleu (masqué en dessous de lg) n'est pas affiché. */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-20 flex items-center justify-between gap-2 px-4 py-3 bg-white border-b border-[#E8EDF2]">
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#F8FAFC] border border-[#E8EDF2] rounded-lg text-[11px] font-semibold text-[#0D2B63]">
          <Shield className="w-3.5 h-3.5 text-[#0A347B]" />
          <span>ACTIVA Secure Portal</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#F8FAFC] border border-[#E8EDF2] rounded-lg text-[11px] font-semibold text-[#0D2B63]">
          <Globe className="w-3.5 h-3.5 text-[#0A34A3]" />
          <span>EN</span>
        </div>
      </div>

      {/* LEFT PANEL — dégradé bleu + motif de courbes, identiques à la sidebar Agent */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-[44%] bg-gradient-to-b from-[#072659] via-[#0A347B] to-[#0D2B63] relative overflow-hidden flex-col justify-between p-10 xl:p-14">
        {/* Halo lumineux — identique à Sidebar.tsx (accentGlow Agent: bg-blue-400/20) */}
        <div className="absolute -bottom-16 -left-16 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />

        {/* Motif de courbes — copié tel quel de Sidebar.tsx. === AMÉLIORATION AJOUTÉE :
            dérive lente et continue (login-motif-drift), sur demande explicite. === */}
        <div className="absolute inset-0 pointer-events-none opacity-50 overflow-hidden z-0 login-motif-drift">
          <svg className="absolute bottom-0 left-0 w-full h-full" viewBox="0 0 250 320" fill="none" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M-40 320 C 30 240, 110 220, 270 250" stroke="rgba(255,255,255,0.55)" strokeWidth="1.8" />
            <path d="M-40 280 C 50 210, 130 190, 270 220" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
            <path d="M-40 240 C 70 180, 150 160, 270 190" stroke="rgba(255,255,255,0.38)" strokeWidth="1.3" />
            <path d="M-40 200 C 90 150, 170 130, 270 160" stroke="rgba(255,255,255,0.30)" strokeWidth="1.2" />
          </svg>
        </div>

        {/* === AMÉLIORATION AJOUTÉE : entrée en fondu/glissement, en cascade, du badge, du
            titre, du texte et du copyright — sur demande explicite ("je veux que ces données
            soient animées"). Contenu, couleurs et mise en page strictement inchangés. === */}
        <div className="relative z-10 flex items-center gap-1.5 self-start px-3 py-1.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg text-xs font-semibold text-white login-anim-fade-up login-anim-delay-1">
          <Shield className="w-3.5 h-3.5" />
          <span>ACTIVA Cloud Secure Portal</span>
        </div>

        <div className="relative z-10">
          <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] tracking-tight login-anim-fade-up login-anim-delay-2">
            Hello,<br />ACTIVA HealthPass!
          </h1>
          <p className="mt-5 text-sm xl:text-[15px] text-[#EAF2FF]/90 font-medium leading-relaxed max-w-sm login-anim-fade-up login-anim-delay-3">
            Manage enrollments, claims and coverage in one secure place. Fast, reliable, and built for your team.
          </p>
        </div>

        <div className="relative z-10 text-xs text-white/60 font-medium login-anim-fade-up login-anim-delay-4">
          © 2026 ACTIVA Insurance Group. All rights reserved.
        </div>
      </div>

      {/* RIGHT PANEL — blanc, logo + formulaire */}
      <div className="flex-1 bg-white relative flex flex-col">
        {/* Language badge, desktop only (position reprise de l'ancien header) */}
        <div className="hidden lg:flex absolute top-6 right-6 xl:top-10 xl:right-10 items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E8EDF2] rounded-lg text-xs font-semibold text-[#0D2B63] shadow-2xs">
          <Globe className="w-3.5 h-3.5 text-[#0A34A3]" />
          <span>English (Default)</span>
        </div>

        <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-10 xl:p-16 pt-20 lg:pt-10">
          <div className="w-full max-w-[400px]">
            {/* Logo agrandi et centré, mieux mis en valeur qu'avant. === AMÉLIORATION
                AJOUTÉE : espace réduit entre le logo et "Welcome Back!" (mb-8 -> mb-5), sur
                demande explicite. === */}
            <div className="flex justify-center mb-5">
              <Logo size="2xl" showTagline={true} transparent={true} />
            </div>

            <h2 className="text-2xl sm:text-[28px] font-black text-[#0D2B63] tracking-tight text-center">
              Welcome Back!
            </h2>
            <p className="mt-1.5 text-xs sm:text-[13px] text-[#5B7091] font-medium text-center">
              Sign in to access your ACTIVA HealthPass account.
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              {/* Error Alert Box */}
              {error && (
                <div className="bg-[#FEF2F2] border border-[#FECACA] text-[#DC4C4C] text-xs p-3.5 rounded-xl font-medium flex items-start gap-2.5 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-[#DC4C4C] shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">{error}</div>
                </div>
              )}

              {/* === AMÉLIORATION AJOUTÉE : libellé simplifié en "Username" et exemple d'adresse
                  e-mail retiré du placeholder (champ vide) — le champ accepte toujours email OU
                  nom d'utilisateur exactement comme avant, seul l'affichage change. === */}
              <div>
                <label className="block text-[13px] font-semibold text-[#0D2B63] mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <input
                    id="login-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder=""
                    className="w-full pl-10 pr-4 py-3 bg-[#F8FAFC] border border-[#E8EDF2] rounded-xl text-xs sm:text-[13px] text-[#0D2B63] placeholder:text-[#778FAF] focus:outline-none focus:border-[#0A34A3] focus:ring-2 focus:ring-[#0A34A3]/20 focus:bg-white transition duration-150"
                    autoComplete="username"
                    required
                  />
                  <User className="w-4 h-4 text-[#778FAF] absolute left-3.5 top-3.5 pointer-events-none" />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-[13px] font-semibold text-[#0D2B63] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder=""
                    className="w-full pl-4 pr-12 py-3 bg-[#F8FAFC] border border-[#E8EDF2] rounded-xl text-xs sm:text-[13px] text-[#0D2B63] placeholder:text-[#778FAF] focus:outline-none focus:border-[#0A34A3] focus:ring-2 focus:ring-[#0A34A3]/20 focus:bg-white transition duration-150"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    id="login-toggle-password"
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.preventDefault();
                      setShowPassword((prev) => !prev);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#778FAF] hover:text-[#0D2B63] focus:outline-none transition rounded-lg hover:bg-slate-200/50 cursor-pointer select-none"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Sign In Button */}
              <div className="pt-1">
                <button
                  id="login-submit-button"
                  type="submit"
                  disabled={isLoggingIn || lockoutRemainingSec > 0}
                  className="w-full py-3 px-4 rounded-xl bg-[#0A347B] hover:bg-[#072659] active:bg-[#051D45] text-white text-xs sm:text-[13px] font-bold shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>{lockoutRemainingSec > 0 ? `Try again in ${lockoutRemainingSec}s` : isLoggingIn ? 'Signing In...' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Mobile-only footer copyright — repris de l'ancien pied de carte */}
        <div className="lg:hidden text-center text-xs text-[#778FAF] font-medium py-4 border-t border-[#E8EDF2]">
          © 2026 ACTIVA Insurance Group. All rights reserved.
        </div>
      </div>
    </div>
  );
};
