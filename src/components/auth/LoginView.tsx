import React, { useState, useEffect } from 'react';
import { Lock, User, ArrowRight, AlertCircle, Globe, Shield, Eye, EyeOff } from 'lucide-react';
import { Language } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { Logo } from '../Logo';
import activaLogoOriginal from '../../assets/logos/logo-activa.png';
// === AMÉLIORATION AJOUTÉE : photo fournie par l'utilisateur pour remplacer le fond bleu uni
// du panneau gauche de la page de connexion (retour utilisateur explicite, 2026-09-11).
import loginDoctorPhoto from '../../assets/login-doctor.webp';
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
  // === AMÉLIORATION AJOUTÉE : correctif logo (retour utilisateur, 2026-09-11 — "le logo sur
  // la bande bleue" affiche parfois une icône d'image cassée à la déconnexion) — un échec de
  // chargement réseau ponctuel (asset local pourtant déjà mis en cache par le navigateur, mais
  // parfois manqué juste après le remontage de cet écran à la déconnexion) ne se corrigeait
  // jamais tout seul : une <img> standard n'a aucune logique de nouvelle tentative après une
  // erreur. Jusqu'à 3 nouvelles tentatives, avec un court délai croissant ; `key` forcé à
  // changer pour que React recrée bien un nouveau nœud <img> (remettre `src` à l'identique ne
  // relance pas toujours une requête réseau dans tous les navigateurs).
  const [logoRetryCount, setLogoRetryCount] = useState(0);
  const handleLogoLoadError = () => {
    if (logoRetryCount < 3) {
      setTimeout(() => setLogoRetryCount((c) => c + 1), 350 * (logoRetryCount + 1));
    }
  };

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
          <span>{t.auth.securePortal}</span>
        </div>
        {/* === AMÉLIORATION AJOUTÉE : véritable liste déroulante (2026-09-10, retour utilisateur
            explicite — "je préfère la sélection") au lieu d'un bouton à cliquer pour basculer. === */}
        <div className="relative">
          <Globe className="w-3.5 h-3.5 text-[#0A34A3] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={lang || 'en'}
            onChange={(e) => onLanguageChange?.(e.target.value as Language)}
            className="appearance-none pl-7 pr-5 py-1 bg-[#F8FAFC] border border-[#E8EDF2] rounded-lg text-[11px] font-semibold text-[#0D2B63] cursor-pointer focus:outline-none"
            aria-label="Select display language"
          >
            <option value="en">EN</option>
            <option value="fr">FR</option>
          </select>
        </div>
      </div>

      {/* LEFT PANEL — dégradé bleu + motif de courbes, identiques à la sidebar Agent.
          === AMÉLIORATION AJOUTÉE : élargi (46%/44% -> 56%/54%) pour réduire d'autant la
          largeur du panneau blanc du formulaire (retour utilisateur explicite). ===
          === AMÉLIORATION AJOUTÉE : photo (docteur avec tablette) posée en fond du panneau,
          à la place du bleu uni (retour utilisateur explicite, 2026-09-11 — "remplace le bleu
          par la photo"). Le dégradé bleu d'origine est conservé en surcouche semi-transparente
          au-dessus de la photo afin que le logo et les textes blancs restent parfaitement
          lisibles, comme avant. === */}
      <div
        className="hidden lg:flex lg:w-[56%] xl:w-[54%] relative overflow-hidden flex-col justify-between p-10 xl:p-14 bg-cover bg-center"
        style={{ backgroundImage: `url(${loginDoctorPhoto})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#072659]/90 via-[#0A347B]/85 to-[#0D2B63]/92 pointer-events-none" />
        {/* Halo lumineux — identique à Sidebar.tsx (accentGlow Agent: bg-blue-400/20) */}
        <div className="absolute -bottom-16 -left-16 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />

        {/* === AMÉLIORATION AJOUTÉE : entrée en fondu/glissement, en cascade, du badge, du
            titre, du texte et du copyright — sur demande explicite ("je veux que ces données
            soient animées"). Contenu, couleurs et mise en page strictement inchangés.
            === AMÉLIORATION AJOUTÉE : animation changée pour un glissement LATÉRAL plus lent
            (2026-09-10, retour utilisateur — proposition "B" choisie parmi 5 alternatives
            présentées via un aperçu, avec la consigne explicite "plus lent") — voir
            src/index.css (.login-anim-slide-left, .login-anim-delay-1..4).
            === AMÉLIORATION AJOUTÉE : le badge "ACTIVA Cloud Secure Portal" est remplacé par
            le logo Activa exact (asset src/assets/logos/logo-activa.png), uniquement sur
            cette page. Après plusieurs essais de recolorisation en blanc (retouches
            successives pour la taille et la netteté), retour à la version la plus simple sur
            demande explicite ("faisons simple, adopte plutôt le logo activa original sous
            fond blanc, conserve la taille du logo telle qu'il existe actuellement") :
            couleurs d'origine du logo (jamais retouchées, donc jamais floues), posées sur une
            plaque blanche pour rester lisibles sur le fond bleu marine du panneau. Taille de
            l'image inchangée (h-12).
            === AMÉLIORATION AJOUTÉE : logo figé, non animé (retour utilisateur, 2026-09-11 —
            "je ne veux pas que le logo de ACTIVA soit animé, il doit être figé") — classes
            login-anim-slide-left/login-anim-delay-1 retirées de ce seul badge (visible
            immédiatement, sans glissement ni délai). Le titre, le texte et le copyright
            juste en dessous restent animés comme avant — seul le logo est concerné. === */}
        <div className="relative z-10 self-start bg-white rounded-lg px-3 py-2 shadow-sm">
          <img
            key={logoRetryCount}
            src={activaLogoOriginal}
            alt="Activa"
            className="h-12 w-auto"
            onError={handleLogoLoadError}
          />
        </div>

        <div className="relative z-10">
          <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] tracking-tight login-anim-slide-left login-anim-delay-2">
            {t.auth.heroGreetingLine1}<br />ACTIVA HealthPass!
          </h1>
          <p className="mt-5 text-sm xl:text-[15px] text-[#EAF2FF]/90 font-medium leading-relaxed max-w-sm login-anim-slide-left login-anim-delay-3">
            {t.auth.heroDescription}
          </p>
        </div>

        <div className="relative z-10 text-xs text-white/60 font-medium login-anim-slide-left login-anim-delay-4">
          {t.auth.copyright}
        </div>
      </div>

      {/* RIGHT PANEL — blanc, logo + formulaire */}
      <div className="flex-1 bg-white relative flex flex-col">
        {/* Language selector, desktop only (position reprise de l'ancien header) — ===
            AMÉLIORATION AJOUTÉE : véritable liste déroulante (2026-09-10, retour utilisateur
            explicite — "je préfère la sélection") au lieu d'un bouton à cliquer pour basculer,
            même sélecteur que la pastille mobile ci-dessus et que le Topbar une fois connecté. === */}
        <div className="hidden lg:block absolute top-6 right-6 xl:top-10 xl:right-10 z-10">
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

        {/* === AMÉLIORATION AJOUTÉE : contenu remonté légèrement (retour utilisateur, 2026-09-07)
            — le padding-haut réduit (par rapport au padding des autres côtés) fait remonter le
            bloc logo+formulaire dans son conteneur centré, sans autre changement de mise en
            page. === */}
        <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-10 xl:p-16 pt-16 lg:pt-6">
          {/* === AMÉLIORATION AJOUTÉE : largeur légèrement réduite (retour utilisateur, 2026-09-07
              — max-w-[400px] -> max-w-[360px]), cohérent avec le resserrement des champs
              ci-dessous ("Compact & fin"). === */}
          <div className="w-full max-w-[360px]">
            {/* Logo agrandi et centré, mieux mis en valeur qu'avant. === AMÉLIORATION
                AJOUTÉE : espace réduit entre le logo et "Welcome Back!" (mb-8 -> mb-5, puis
                mb-5 -> mb-4, puis mb-4 -> mb-3 sur nouvelle demande explicite : "faire remonter
                Welcome Back et sign in to access... pour avoir un peu d'espace entre la mention
                username et sign in to access") — le bloc titre/sous-titre remonte pour libérer
                de l'espace en dessous, avant le formulaire (voir mt-4 -> mt-6 plus bas). === */}
            <div className="flex justify-center mb-3">
              <Logo size="2xl" showTagline={true} transparent={true} />
            </div>

            {/* === AMÉLIORATION AJOUTÉE : titre "Welcome Back!" retiré (retour utilisateur
                explicite) — le sous-titre seul introduit désormais le formulaire.
                === AMÉLIORATION AJOUTÉE : mention "ACTIVA HealthPass" retirée du sous-titre
                (retour utilisateur explicite). === */}
            <p className="mt-1.5 text-xs sm:text-[13px] text-[#5B7091] font-medium text-center">
              {t.auth.signInSubtitle}
            </p>

            {/* === AMÉLIORATION AJOUTÉE : espace réduit davantage (retour utilisateur, 2026-09-07
                — un premier resserrement mt-7/space-y-4/py-3 -> mt-5/space-y-3/py-2.5 était trop
                léger pour être perceptible) : au-dessus du formulaire (mt-5 -> mt-4), et
                champs/bouton plus compacts (py-2.5 -> py-2) ; aucun champ ni comportement retiré.
                === AMÉLIORATION AJOUTÉE : style "Compact & fin" (retenu sur la maquette mobile,
                appliqué ici au desktop) — les champs Username/Password passent d'un cadre rempli
                (fond #F8FAFC, bordure pleine, angles arrondis) à un simple soulignement fin, sur
                fond transparent, plus étroit et plus discret.
                === AMÉLIORATION AJOUTÉE : espace entre les champs Username/Password/Sign In élargi
                (space-y-2 -> space-y-6, retour utilisateur avec modèle de référence à l'appui)
                pour reprendre le même espacement entre interlignes que ce modèle — largeur,
                style et couleurs des champs strictement inchangés.
                === AMÉLIORATION AJOUTÉE : espace au-dessus du formulaire élargi (mt-4 -> mt-6,
                puis mt-6 -> mt-7 sur nouvelle demande explicite : "plus d'espace mais pas trop"),
                retour utilisateur : "avoir un peu d'espace entre la mention username et sign in
                to access...") pour dégager le champ Username du sous-titre. === */}
            <form onSubmit={handleSubmit} className="mt-7 space-y-6">
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
              {/* === AMÉLIORATION AJOUTÉE : interligne légèrement augmenté (retour utilisateur) —
                  espace label -> champ (mb-1 -> mb-1.5) et hauteur interne du champ (py-1.5 ->
                  py-2), pour Username comme pour Password ci-dessous ; largeur, style "fin" et
                  couleurs strictement inchangés. === */}
              <div>
                <label className="block text-[13px] font-semibold text-[#0D2B63] mb-1.5">
                  {t.auth.usernameLabel}
                </label>
                <div className="relative">
                  <input
                    id="login-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder=""
                    className="w-full pl-6 pr-2 py-2 bg-transparent border-0 border-b border-[#E8EDF2] rounded-none text-xs sm:text-[13px] text-[#0D2B63] placeholder:text-[#778FAF] focus:outline-none focus:border-b-[#0A34A3] transition duration-150"
                    autoComplete="username"
                    required
                  />
                  <User className="w-3.5 h-3.5 text-[#778FAF] absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-[13px] font-semibold text-[#0D2B63] mb-1.5">
                  {t.auth.passwordLabel}
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder=""
                    className="w-full pl-6 pr-8 py-2 bg-transparent border-0 border-b border-[#E8EDF2] rounded-none text-xs sm:text-[13px] text-[#0D2B63] placeholder:text-[#778FAF] focus:outline-none focus:border-b-[#0A34A3] transition duration-150"
                    autoComplete="current-password"
                    required
                  />
                  <Lock className="w-3.5 h-3.5 text-[#778FAF] absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <button
                    id="login-toggle-password"
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.preventDefault();
                      setShowPassword((prev) => !prev);
                    }}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-[#778FAF] hover:text-[#0D2B63] focus:outline-none transition rounded-lg hover:bg-slate-200/50 cursor-pointer select-none"
                    aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword}
                    title={showPassword ? t.auth.hidePassword : t.auth.showPassword}
                  >
                    {showPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Sign In Button */}
              <div>
                <button
                  id="login-submit-button"
                  type="submit"
                  disabled={isLoggingIn || lockoutRemainingSec > 0}
                  className="w-full py-2 px-4 rounded-lg bg-[#0A347B] hover:bg-[#072659] active:bg-[#051D45] text-white text-xs sm:text-[13px] font-bold shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>{lockoutRemainingSec > 0 ? `${t.auth.tryAgainPrefix}${lockoutRemainingSec}${t.auth.tryAgainSuffix}` : isLoggingIn ? t.auth.signingIn : t.auth.signInBtn}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Mobile-only footer copyright — repris de l'ancien pied de carte */}
        <div className="lg:hidden text-center text-xs text-[#778FAF] font-medium py-4 border-t border-[#E8EDF2]">
          {t.auth.copyright}
        </div>
      </div>
    </div>
  );
};
