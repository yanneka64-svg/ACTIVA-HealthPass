import React, { useState, useEffect } from 'react';
import { Lock, User, LogIn, AlertCircle, Globe, Eye, EyeOff } from 'lucide-react';
import { Language } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { Logo } from '../Logo';
import { auth, functions, db } from '../../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getClientLocationInfo, parseUserAgent } from '../../utils/geoUtils';
import { FirestoreService } from '../../services/firestore';
import { AppRole } from '../../utils/authUtils';

interface LoginViewProps {
  onLoginSuccess: (user: any, accountData?: any) => void;
  lang: Language;
  onLanguageChange?: (lang: Language) => void;
  // === AMÉLIORATION AJOUTÉE : props optionnelles (demande explicite) reliant ce formulaire au
  // nouvel écran de sélection d'espace de travail (WorkspaceSelectionView, affiché avant cette
  // page). Purement informatif/navigation : aucun impact sur la validation, l'authentification
  // Firebase ou les messages d'erreur ci-dessous, strictement inchangés. Optionnelles pour ne
  // rien casser si ce composant est utilisé ailleurs sans cet écran en amont.
  selectedWorkspace?: AppRole | null;
  onBackToWorkspaceSelection?: () => void;
}

// === ADDED IMPROVEMENT (security): temporary client-side lockout after repeated failed
// login attempts, keyed by the username/email entered (stored in sessionStorage, cleared
// when the tab closes). This is additive — it does not replace — the rate limiting already
// enforced server-side by Firebase Auth itself ('auth/too-many-requests' error already
// handled below): an extra layer of defense in depth, surfaced earlier and not solely
// reliant on the server-side block.
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60_000;

// === AMÉLIORATION AJOUTÉE : résilience réseau (audit UX, 2026-09-11 — bouton "Signing In..."
// resté bloqué indéfiniment lors d'un test avec coupure réseau) === `attemptLogin` enchaîne
// plusieurs appels réseau (Cloud Function `resolveLoginIdentifier`, jusqu'à 3 tentatives
// `signInWithEmailAndPassword`, éventuellement `createUserWithEmailAndPassword`) sans aucun
// délai maximum : si l'un d'eux ne répond JAMAIS (coupure brutale de connexion plutôt qu'une
// erreur HTTP propre — ce que le SDK Firebase ne convertit pas toujours en rejet de promesse),
// la fonction reste indéfiniment en attente et le bouton "Signing In..." ne se réactive jamais,
// sans aucun message pour l'utilisateur. Un scénario réel pour une app déployée dans 7 pays à
// connectivité mobile variable (voir docs/security) — pas un cas théorique. `LOGIN_TIMEOUT_MS`
// borne l'attente totale ; au-delà, l'utilisateur voit un message clair et peut réessayer,
// plutôt que de rester bloqué sans recours (voir handleSubmit ci-dessous).
const LOGIN_TIMEOUT_MS = 20_000;
const LOGIN_TIMEOUT_SENTINEL = Symbol('login-timeout');

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof LOGIN_TIMEOUT_SENTINEL> {
  return Promise.race([
    promise,
    new Promise<typeof LOGIN_TIMEOUT_SENTINEL>((resolve) => setTimeout(() => resolve(LOGIN_TIMEOUT_SENTINEL), ms)),
  ]);
}

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
  lang,
  onLanguageChange,
  selectedWorkspace,
  onBackToWorkspaceSelection,
}) => {
  // === AMÉLIORATION AJOUTÉE : cet écran ignorait totalement `lang`/`onLanguageChange`
  // jusqu'ici (props déclarées mais jamais utilisées) — voir aussi les deux pastilles de
  // langue plus bas, désormais réellement cliquables (2026-09-10, étape 2). ===
  const t = useTranslation(lang || 'en');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [lockoutRemainingSec, setLockoutRemainingSec] = useState(0);
  // === AMÉLIORATION AJOUTÉE : état/gestion de nouvelle tentative de l'ancien logo du panneau
  // bleu retirés (demande explicite, 2026-09-17) — ils ne servaient qu'à cette <img>, désormais
  // supprimée avec le panneau lui-même.

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
        setError(`${t.auth.rateLimitedPrefix}${remaining}${t.auth.rateLimitedSuffix}`);
        setIsLoggingIn(false);
        return false;
      }

      // Si le compte est désactivé côté Cloud Function
      if (resolveResult && resolveResult.isActive === false) {
        setError(t.auth.accountDeactivated);
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
          setError(t.auth.invalidUsernamePassword);
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
          setError(t.auth.accountDeactivated);
          setIsLoggingIn(false);
          return false;
        }

        onLoginSuccess(userCredential.user, accountData);
        return true;
      }

      // 5. En cas d'échec
      setError(t.auth.invalidUsernamePassword);
      setIsLoggingIn(false);
      return false;
    } catch (err: any) {
      console.error('Login error:', err);
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/user-not-found'
      ) {
        setError(t.auth.invalidUsernamePassword);
      } else if (err.code === 'auth/too-many-requests') {
        setError(t.auth.tooManyAttempts);
      } else if (err.code === 'auth/weak-password') {
        setError(t.auth.weakPassword);
      } else {
        setError(err.message || t.auth.authFailedFallback);
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
      setError(t.auth.fillRequiredFields);
      return;
    }

    const remainingMs = getLockoutRemainingMs(cleanUsername);
    if (remainingMs > 0) {
      setLockoutRemainingSec(Math.ceil(remainingMs / 1000));
      setError(`${t.auth.lockoutPrefix}${Math.ceil(remainingMs / 1000)}${t.auth.lockoutSuffix}`);
      return;
    }

    // === AMÉLIORATION AJOUTÉE : résilience réseau (audit UX, 2026-09-11) — voir
    // LOGIN_TIMEOUT_MS ci-dessus pour le contexte. `attemptLogin` continue de s'exécuter en
    // arrière-plan si elle finit par répondre après le délai (son propre `finally` réactivera
    // alors normalement le bouton) — ce simple garde-fou couvre le cas réel qui bloquait
    // l'utilisateur (aucune réponse du tout), sans avoir à annuler les appels Firebase en cours.
    const outcome = await withTimeout(attemptLogin(cleanUsername), LOGIN_TIMEOUT_MS);
    if (outcome === LOGIN_TIMEOUT_SENTINEL) {
      setError(t.auth.loginTimeoutError);
      setIsLoggingIn(false);
      return;
    }
    const success = outcome;
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
      // === AMÉLIORATION AJOUTÉE : sécurité/robustesse — .catch ajouté (retour utilisateur,
      // "Uncaught (in promise) FirebaseError" en console) : cette journalisation en tâche de
      // fond ne doit jamais faire remonter un rejet de promesse non intercepté, quelle qu'en
      // soit la cause. ===
      getClientLocationInfo().then(({ ipAddress, location }) => {
        FirestoreService.addLog({
          userEmail: cleanUsername,
          ipAddress,
          status: 'failed',
          userAgent: navigator.userAgent,
          browser: parseUserAgent(navigator.userAgent),
          location,
        }).catch((err) => console.warn('Failed-login audit log notice:', err));
      }).catch((err) => console.warn('Failed-login geo lookup notice:', err));
      const remaining = getLockoutRemainingMs(cleanUsername);
      if (remaining > 0) {
        setLockoutRemainingSec(Math.ceil(remaining / 1000));
        setError(`${t.auth.lockoutPrefix}${Math.ceil(remaining / 1000)}${t.auth.lockoutSuffix}`);
      }
    }
  };

  // === AMÉLIORATION AJOUTÉE : redesign complet de cet écran (demande explicite, 2026-09-17,
  // maquette de référence fournie par l'utilisateur) — remplace l'ancien écran divisé
  // (panneau bleu, déjà retiré) par une carte centrée unique sur fond neutre clair : badge
  // circulaire (emblème ACTIVA), accroche, liseré bleu, champs encadrés, bouton ardoise avec
  // icône de connexion. Comportement du formulaire (validation, authentification Firebase,
  // verrouillage après échecs répétés, messages d'erreur, sélecteur de langue) strictement
  // inchangé — seule la mise en page/l'habillage visuel a été retravaillé.
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#EEF2F7] font-sans antialiased select-none px-4 py-10 relative">
      {/* Sélecteur de langue — même comportement qu'avant (liste déroulante EN/FR), désormais
          toujours visible en haut à droite (un seul sélecteur, quelle que soit la largeur
          d'écran, puisqu'il n'y a plus de mise en page distincte mobile/desktop). */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10">
        <div className="relative">
          <Globe className="w-3.5 h-3.5 text-[#0A34A3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={lang || 'en'}
            onChange={(e) => onLanguageChange?.(e.target.value as Language)}
            className="appearance-none pl-8 pr-6 py-1.5 bg-white border border-[#E8EDF2] rounded-lg text-xs font-semibold text-[#0D2B63] shadow-2xs cursor-pointer focus:outline-none"
            aria-label="Select display language"
          >
            <option value="en">English (Default)</option>
            <option value="fr">Français</option>
          </select>
        </div>
      </div>

      <div className="w-full max-w-[420px]">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-[#E8EDF2] p-8 sm:p-10">
          {/* === AMÉLIORATION AJOUTÉE : logo complet ACTIVA HealthPass (emblème + wordmark),
              demande explicite, à la place du seul emblème dans un badge circulaire. === */}
          <div className="flex justify-center">
            <Logo size="lg" showTagline={true} transparent={true} />
          </div>

          {/* === AMÉLIORATION AJOUTÉE : accroche réduite en écriture normale (demande
              explicite) — n'est plus mise en avant comme un titre (gras, plus grand) mais
              reste lisible comme un sous-texte discret sous le logo. === */}
          <p className="mt-4 text-xs sm:text-sm font-normal text-[#5B7091] text-center">
            {t.auth.loginHeading}
          </p>
          <div className="mt-3 mx-auto w-10 h-1 rounded-full bg-[#0A34A3]" />

          {/* Rappel de l'espace de travail choisi sur l'écran précédent
              (WorkspaceSelectionView) + lien pour en changer sans passer par le bouton
              "retour" du navigateur. N'apparaît que si ces props optionnelles sont fournies —
              comportement du formulaire ci-dessous strictement inchangé. */}
          {selectedWorkspace && (
            <div className="mt-4 flex items-center justify-center gap-2 text-[11px] sm:text-xs">
              <span className="text-[#5B7091] font-medium">
                {t.auth.workspaceSelectedPrefix}
                <span className="font-bold text-[#0D2B63]">
                  {selectedWorkspace === 'Agent' && t.auth.workspaceAgentTitle}
                  {selectedWorkspace === 'Supervisor' && t.auth.workspaceSupervisorTitle}
                  {selectedWorkspace === 'Admin' && t.auth.workspaceAdminTitle}
                </span>
              </span>
              {onBackToWorkspaceSelection && (
                <button
                  type="button"
                  id="login-change-workspace"
                  onClick={onBackToWorkspaceSelection}
                  className="text-[#0A34A3] font-semibold hover:underline cursor-pointer"
                >
                  {t.auth.workspaceChangeLink}
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            {/* Error Alert Box */}
            {error && (
              <div className="bg-[#FEF2F2] border border-[#FECACA] text-[#DC4C4C] text-xs p-3.5 rounded-xl font-medium flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-[#DC4C4C] shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{error}</div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-[#0D2B63] uppercase tracking-wide mb-1.5">
                {t.auth.usernameLabel}
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder=""
                  className="w-full pl-10 pr-3 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-sm text-[#0D2B63] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0A34A3] focus:ring-2 focus:ring-[#0A34A3]/10 transition duration-150"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] font-bold text-[#0D2B63] uppercase tracking-wide mb-1.5">
                {t.auth.passwordLabel}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder=""
                  className="w-full pl-10 pr-10 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-sm text-[#0D2B63] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0A34A3] focus:ring-2 focus:ring-[#0A34A3]/10 transition duration-150"
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
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#94A3B8] hover:text-[#0D2B63] focus:outline-none transition rounded-lg hover:bg-slate-100 cursor-pointer select-none"
                  aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword}
                  title={showPassword ? t.auth.hidePassword : t.auth.showPassword}
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
            <button
              id="login-submit-button"
              type="submit"
              disabled={isLoggingIn || lockoutRemainingSec > 0}
              className="w-full py-2.5 px-4 rounded-xl bg-[#404E62] hover:bg-[#2C394C] active:bg-[#1E293B] text-white text-sm font-bold shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogIn className="w-4 h-4" />
              <span>{lockoutRemainingSec > 0 ? `${t.auth.tryAgainPrefix}${lockoutRemainingSec}${t.auth.tryAgainSuffix}` : isLoggingIn ? t.auth.signingIn : t.auth.signInBtn}</span>
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-[#94A3B8] font-medium">
          {t.auth.copyright}
        </p>
      </div>
    </div>
  );
};
