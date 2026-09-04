import React, { useState, useEffect } from 'react';
import { Lock, User, ArrowRight, AlertCircle, Globe, Shield } from 'lucide-react';
import { Language } from '../../types';
import { Logo } from '../Logo';
import { auth, db } from '../../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs, deleteField } from 'firebase/firestore';
import { verifyPassword, hashPassword } from '../../utils/passwordUtils';
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
      // === AMÉLIORATION AJOUTÉE : robustesse/diagnostic — cette recherche échouait
      // auparavant de façon totalement silencieuse (un simple console.warn). Or si cette
      // requête pré-authentification échoue (règles Firestore non déployées/différentes de
      // celles du dépôt, hors-ligne, quota...), le code retombait sur les mêmes suppositions
      // de domaine d'email par défaut ET affichait EXACTEMENT le même message que pour un
      // "compte inexistant" ("Invalid username or password"), rendant ce cas impossible à
      // distinguer d'un véritable mauvais identifiant. On garde le même comportement de repli
      // (aucune régression), mais on retient l'échec pour affiner le message d'erreur final si
      // aucune tentative de connexion Firebase Auth n'aboutit non plus (voir étape 5 plus bas).
      let accountsLookupFailed = false;

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
        accountsLookupFailed = true;
        console.warn('Could not query accounts collection ahead of auth:', e);
      }

      // Check if matched account is deactivated
      if (matchingAccountDoc && matchingAccountDoc.isActive === false) {
        setError('This account has been deactivated. Please contact your administrator.');
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

        // === AMÉLIORATION AJOUTÉE : sécurité (audit) — nettoyage paresseux. Cet utilisateur
        // vient de s'authentifier via Firebase Auth (le chemin normal, désormais utilisé à
        // chaque connexion) : le mot de passe en clair encore présent depuis la création du
        // compte (avant ce correctif) n'a donc plus aucune utilité — Firebase Auth fait
        // désormais foi. Effacé silencieusement, sans jamais bloquer la connexion en cours.
        const existingData = userDocSnap.exists() ? userDocSnap.data() : matchingAccountDoc;
        if (existingData && (existingData.password || existingData.tempPassword)) {
          setDoc(userDocRef, { password: deleteField(), tempPassword: deleteField() }, { merge: true }).catch(() => {
            // Best-effort only — never block a successful login on this cleanup.
          });
        }

        onLoginSuccess(userCredential.user);
        return true;
      }

      // 4. If sign in did not find user in Firebase Auth, but matching account was created by Admin in Firestore:
      if (matchingAccountDoc) {
        // === AMÉLIORATION AJOUTÉE : sécurité (audit) — le mot de passe n'est plus jamais
        // comparé ni stocké en clair. Les comptes créés/réinitialisés après ce correctif
        // portent passwordHash/passwordSalt (voir src/utils/passwordUtils.ts), vérifiés ici.
        // Les comptes plus anciens (créés avant ce correctif) n'ont encore que
        // password/tempPassword en clair : la comparaison historique reste acceptée pour ne
        // jamais bloquer un utilisateur légitime, mais dès que la connexion réussit ainsi, le
        // compte est immédiatement converti en hash et le mot de passe en clair est effacé
        // (migration paresseuse, transparente, sans action requise de l'utilisateur).
        let migratedHash: { passwordHash: string; passwordSalt: string } | null = null;
        if (matchingAccountDoc.passwordHash && matchingAccountDoc.passwordSalt) {
          const ok = await verifyPassword(password, matchingAccountDoc.passwordHash, matchingAccountDoc.passwordSalt);
          if (!ok) {
            setError('Incorrect password. Please verify the credentials provided by your administrator.');
            setIsLoggingIn(false);
            return false;
          }
        } else {
          const storedPwd = matchingAccountDoc.password || matchingAccountDoc.tempPassword;
          if (storedPwd && storedPwd !== password) {
            setError('Incorrect password. Please verify the credentials provided by your administrator.');
            setIsLoggingIn(false);
            return false;
          }
          if (storedPwd) {
            migratedHash = await hashPassword(password);
          }
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
          const mergedData: any = { ...matchingAccountDoc, id: userCredential.user.uid };
          if (migratedHash) {
            // === AMÉLIORATION AJOUTÉE : sécurité (audit) — voir commentaire plus haut : ce
            // compte vient de passer la vérification par mot de passe en clair (ancien
            // format) ; converti en hash et le clair effacé, dans cette même écriture.
            mergedData.passwordHash = migratedHash.passwordHash;
            mergedData.passwordSalt = migratedHash.passwordSalt;
            mergedData.password = deleteField();
            mergedData.tempPassword = deleteField();
          }
          await setDoc(userDocRef, mergedData, { merge: true });
          onLoginSuccess(userCredential.user);
          return true;
        }
      }

      // 5. If no account matches in Firestore and no Firebase Auth user exists:
      // === AMÉLIORATION AJOUTÉE : diagnostic — voir le commentaire à l'étape 1. Si la
      // recherche du compte a elle-même échoué (plutôt que de simplement ne rien trouver), on
      // le signale distinctement au lieu du message générique, pour ne plus confondre "mauvais
      // identifiants" et "impossible de vérifier le compte" lors du diagnostic d'un incident.
      if (accountsLookupFailed) {
        console.error(
          'Login failed: could not verify account against Firestore (accounts lookup errored) and no Firebase Auth credential matched any candidate email for "' +
            cleanUsername +
            '".'
        );
        setError('Unable to verify your account right now. Please check your connection and try again, or contact your administrator.');
        setIsLoggingIn(false);
        return false;
      }
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
              {/* === AMÉLIORATION AJOUTÉE : l'icône de cadenas ("illustration") a été retirée de
                  l'intérieur du champ mot de passe, sur demande explicite — le champ conserve
                  exactement le même comportement, seul le padding gauche est réajusté (pl-10 ->
                  pl-4) puisqu'il n'y a plus d'icône à laisser de la place. === */}
              <div>
                <label className="block text-[13px] font-semibold text-[#0D2B63] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder=""
                    className="w-full pl-4 pr-4 py-3 bg-[#F8FAFC] border border-[#E8EDF2] rounded-xl text-xs sm:text-[13px] text-[#0D2B63] placeholder:text-[#778FAF] focus:outline-none focus:border-[#0A34A3] focus:ring-2 focus:ring-[#0A34A3]/20 focus:bg-white transition duration-150"
                    autoComplete="current-password"
                    required
                  />
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
