import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, getDocs, onSnapshot, setDoc, collection } from 'firebase/firestore';
import React, { useState, useEffect, useRef } from 'react';
import {
  Language,
  NavSection,
  Member,
  Organization,
  Provider,
  Claim,
  InvoiceItem,
  Enrollment,
  Ceiling,
  LoginLog,
  MedicalForm,
  AppNotification,
  HealthPolicy,
  PolicyPayment,
} from './types';
import { FirestoreService } from './services/firestore';
import { WorkflowService } from './services/workflowService';
import { migrateCardNumberCounters, migrateAllCardsToNewCardNumberFormat } from './services/cardNumberService';
import { seedInitialDemoDataIfEmpty, forceReloadDemoData, getFullDemoData } from './services/seedData';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { LoginView } from './components/auth/LoginView';
import { AuthLoadingScreen } from './components/auth/AuthLoadingScreen';
import { AuthBlockedScreen } from './components/auth/AuthBlockedScreen';
import { ChangePasswordModal } from './components/auth/ChangePasswordModal';
import {
  AppRole,
  normalizeRole,
  getDefaultSectionForRole,
  isSectionAllowedForRole,
} from './utils/authUtils';
import { getRoleTheme, getRoleCssVars } from './theme/roleTheme';
import { getClientLocationInfo, parseUserAgent } from './utils/geoUtils';

// Views
import { DashboardView } from './views/DashboardView';
import { ClaimsView } from './views/ClaimsView';
import { InvoicesView } from './views/InvoicesView';
import { EnrollmentsView } from './views/EnrollmentsView';
import { ReportsView } from './views/ReportsView';
import { MembersView } from './views/settings/MembersView';
import { OrganizationsView } from './views/settings/OrganizationsView';
import { ProvidersView } from './views/settings/ProvidersView';
import { CeilingsView } from './views/settings/CeilingsView';
import { AccountsView } from './views/settings/AccountsView';
import { LogsView } from './views/settings/LogsView';

import { AgentIdentificationView } from './views/agent/AgentIdentificationView';
import { AgentMedicalFormView } from './views/agent/AgentMedicalFormView';
import { AgentClaimsView } from './views/agent/AgentClaimsView';
import { AgentEnrollmentsView } from './views/agent/AgentEnrollmentsView';
import { InactivityWarningModal } from './components/InactivityWarningModal';
import { playSuccessSound, playNotificationSound } from './utils/sound'; // === AMÉLIORATION AJOUTÉE : sons de confirmation & notification ===
import { LayoutDashboard, Receipt, FileText, UserCheck, Menu as MenuIcon, Users, FileCheck } from 'lucide-react';

export type AuthStateStatus = 'loading' | 'unauthenticated' | 'authenticated' | 'inactive' | 'invalid_role';

// === AMÉLIORATION AJOUTÉE : reconnexion forcée après un nouveau déploiement. Firebase Auth
// garde une session ouverte indéfiniment par défaut (persistance locale standard, comme
// Gmail) — ce qui n'est pas un bug, mais signifiait qu'un redéploiement de l'app ne renvoyait
// jamais vers l'écran de connexion. `__APP_BUILD_ID__` est une empreinte unique générée à
// chaque exécution de `vite build` (voir vite.config.ts), donc à chaque déploiement en
// production. Au démarrage, on la compare à la dernière connue sur cet appareil : si elles
// diffèrent (et qu'une valeur précédente existait déjà, donc pas la toute première visite),
// la session en cours est fermée pour que l'utilisateur revoie l'écran de connexion au
// prochain chargement. Comme la vérification n'a lieu qu'au montage de l'application, un
// onglet déjà ouvert et en cours d'utilisation n'est jamais affecté par un déploiement
// pendant qu'il tourne — seul un rechargement/nouvel onglet récupère le nouveau build et
// déclenche la déconnexion si nécessaire.
const BUILD_ID_STORAGE_KEY = 'activa_app_build_id';

function signOutIfNewDeployment() {
  try {
    const lastKnownBuildId = localStorage.getItem(BUILD_ID_STORAGE_KEY);
    if (lastKnownBuildId && lastKnownBuildId !== __APP_BUILD_ID__) {
      sessionStorage.removeItem('activa_current_section');
      signOut(auth).catch(() => {
        // Ignore — if this fails, the user simply stays logged in on the new
        // version, which is the pre-existing (safe) behavior.
      });
    }
    localStorage.setItem(BUILD_ID_STORAGE_KEY, __APP_BUILD_ID__);
  } catch {
    // localStorage unavailable (private browsing, etc.) — skip silently, session
    // persistence just behaves as it did before this improvement.
  }
}

export default function App() {
  // Authentication & Role Resolution State Machine
  const [authStatus, setAuthStatus] = useState<AuthStateStatus>('loading');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [forcedFirstLogin, setForcedFirstLogin] = useState(false);
  const [forcedPasswordExpiry, setForcedPasswordExpiry] = useState(false);

  // Inactivity Auto-Logout
  // === AMÉLIORATION AJOUTÉE : délai réduit à 5 minutes (300s) d'inactivité, avertissement
  // à 60s restantes, sur demande explicite (auparavant 15 minutes / avertissement à 2 min) ===
  const INACTIVITY_TIMEOUT_SECONDS = 300;
  const WARNING_BEFORE_SECONDS = 60;
  const [inactivityRemainingSeconds, setInactivityRemainingSeconds] = useState(INACTIVITY_TIMEOUT_SECONDS);
  const [showInactivityModal, setShowInactivityModal] = useState(false);

  // Navigation Section & Preselected Member
  const [currentSection, setCurrentSection] = useState<NavSection>('dashboard');
  const [selectedMemberForMedicalForm, setSelectedMemberForMedicalForm] = useState<Member | null>(null);
  // === AMÉLIORATION AJOUTÉE : assuré présélectionné lors du clic sur "New Claim" depuis la
  // fiche d'identification de l'agent, pour préremplir le formulaire de réclamation.
  const [selectedMemberForClaim, setSelectedMemberForClaim] = useState<Member | null>(null);

  const handleSelectSection = (sec: NavSection) => {
    setCurrentSection(sec);
    sessionStorage.setItem('activa_current_section', sec);
  };

  // === AMÉLIORATION AJOUTÉE : carte du membre identifié à pré-remplir automatiquement en
  // arrivant sur l'onglet Medical Form, déclenché par le bouton "Medical Form" de
  // AgentIdentificationView — évite à l'agent de re-sélectionner le même assuré.
  const [medicalFormPrefillCardNo, setMedicalFormPrefillCardNo] = useState<string | null>(null);
  const handleGenerateMedicalFormFromIdentification = (member: Member) => {
    setMedicalFormPrefillCardNo(member.cardNo);
    handleSelectSection('medical_form');
  };

  useEffect(() => {
    signOutIfNewDeployment();

    let unsubAccountListener: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clean up previous Firestore account listener if any
      if (unsubAccountListener) {
        unsubAccountListener();
        unsubAccountListener = null;
      }

      // 1. If no Firebase User is signed in:
      if (!firebaseUser) {
        setAuthStatus('unauthenticated');
        setCurrentUser(null);
        setUserRole(null);
        setForcedFirstLogin(false);
        setForcedPasswordExpiry(false);
        sessionStorage.removeItem('activa_current_section');
        return;
      }

      // 2. User is signed in with Firebase Auth -> Keep status 'loading' while resolving profile & role
      setAuthStatus('loading');

      try {
        // Listen directly to the single source of truth: accounts/{uid}
        unsubAccountListener = onSnapshot(
          doc(db, 'accounts', firebaseUser.uid),
          async (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();

              // Check if account has been marked inactive by Administrator
              if (data.isActive === false || data.active === false) {
                setCurrentUser({ ...firebaseUser, ...data });
                setUserRole(null);
                setAuthStatus('inactive');
                return;
              }

              // Strict role resolution without guessing or hardcoding
              const resolvedRole = normalizeRole(data.profile || data.role);
              if (!resolvedRole) {
                console.warn('Account does not have a valid operational role:', data);
                setCurrentUser({ ...firebaseUser, ...data });
                setUserRole(null);
                setAuthStatus('invalid_role');
                return;
              }

              // Dynamic entity & metadata from single source of truth
              const userEntity =
                data.entity ||
                (data.country
                  ? data.country.startsWith('ACTIVA')
                    ? data.country
                    : `ACTIVA ${data.country}`
                  : 'ACTIVA Liberia');
              const userCountry = data.country || userEntity.replace(/^ACTIVA\s+/i, '');
              const userPosition =
                data.position ||
                (resolvedRole === 'Admin'
                  ? 'Head of Health Operations'
                  : resolvedRole === 'Supervisor'
                  ? 'Medical Advisor / Supervisor'
                  : 'Front Desk & Enrollment Agent');

              // Security & Password expiration checks
              if (data.isTemporaryPassword || data.mustChangePassword) {
                setForcedFirstLogin(true);
              } else {
                setForcedFirstLogin(false);
              }

              const changedAt = data.passwordChangedAt || data.createdAt;
              if (changedAt) {
                const daysDiff = (Date.now() - new Date(changedAt).getTime()) / (1000 * 60 * 60 * 24);
                setForcedPasswordExpiry(daysDiff > 60);
              } else {
                setForcedPasswordExpiry(false);
              }

              // Resolve allowed section for this exact role
              const savedSec = sessionStorage.getItem('activa_current_section') as NavSection | null;
              const isSavedAllowed = savedSec ? isSectionAllowedForRole(resolvedRole, savedSec) : false;
              const targetSection = isSavedAllowed && savedSec ? savedSec : getDefaultSectionForRole(resolvedRole);

              // Atomically update state
              setCurrentSection(targetSection);
              sessionStorage.setItem('activa_current_section', targetSection);

              setCurrentUser({
                ...firebaseUser,
                ...data,
                displayName: data.fullName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'ACTIVA Staff',
                fullName: data.fullName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'ACTIVA Staff',
                position: userPosition,
                entity: userEntity,
                country: userCountry,
                profile: resolvedRole,
              });

              setUserRole(resolvedRole);
              setAuthStatus('authenticated');
            } else {
              // Document accounts/{uid} does not exist yet. Check if an account was pre-seeded or created by email
              try {
                const accountsSnap = await getDocs(collection(db, 'accounts'));
                const userEmail = (firebaseUser.email || '').toLowerCase().trim();
                let matchedAccount: any = null;

                for (const aDoc of accountsSnap.docs) {
                  const aData = aDoc.data();
                  const aEmail = (aData.email || '').toLowerCase().trim();
                  const aAuthEmail = (aData.authEmail || '').toLowerCase().trim();
                  const aUsername = (aData.username || '').toLowerCase().trim();

                  if (
                    aEmail === userEmail ||
                    aAuthEmail === userEmail ||
                    (userEmail.includes('@') && aUsername && userEmail.startsWith(aUsername + '@'))
                  ) {
                    matchedAccount = { ...aData, id: firebaseUser.uid };
                    break;
                  }
                }

                if (matchedAccount) {
                  // Link account to the UID
                  await setDoc(doc(db, 'accounts', firebaseUser.uid), matchedAccount, { merge: true });
                  // The onSnapshot will automatically fire with the updated document
                  return;
                }

                // Check fallback users/{uid} document
                const usersDocSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
                if (usersDocSnap.exists()) {
                  const uData = usersDocSnap.data();
                  await setDoc(doc(db, 'accounts', firebaseUser.uid), { ...uData, id: firebaseUser.uid }, { merge: true });
                  return;
                }

                // If genuinely no matching account profile exists:
                setCurrentUser(firebaseUser);
                setUserRole(null);
                setAuthStatus('invalid_role');
              } catch (e) {
                console.error('Error checking accounts for authenticated user:', e);
                setCurrentUser(firebaseUser);
                setUserRole(null);
                setAuthStatus('invalid_role');
              }
            }
          },
          (error) => {
            console.error('Firestore account profile subscription error:', error);
            setCurrentUser(firebaseUser);
            setUserRole(null);
            setAuthStatus('invalid_role');
          }
        );
      } catch (err) {
        console.error('Error resolving user account:', err);
        setCurrentUser(firebaseUser);
        setUserRole(null);
        setAuthStatus('invalid_role');
      }
    });

    return () => {
      if (unsubAccountListener) unsubAccountListener();
      unsubscribeAuth();
    };
  }, []);

  // Language State (Pure English system)
  const [lang] = useState<Language>('en');

  // Change Password Modal Triggered from Topbar
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);

  // Entities Data State with initial fallbacks for offline resilience
  const demoData = React.useMemo(() => getFullDemoData(), []);
  const [members, setMembers] = useState<Member[]>(() => (demoData.membersList || []) as Member[]);
  const [organizations, setOrganizations] = useState<Organization[]>(() => (demoData.orgs || []) as Organization[]);
  const [providers, setProviders] = useState<Provider[]>(() => (demoData.providers || []) as Provider[]);
  const [claims, setClaims] = useState<Claim[]>(() => (demoData.sampleClaims || []) as Claim[]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>(() => (demoData.sampleInvoices || []) as InvoiceItem[]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [ceilings, setCeilings] = useState<Ceiling[]>(() => (demoData.sampleCeilings || []) as Ceiling[]);
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [medicalForms, setMedicalForms] = useState<MedicalForm[]>(() => (demoData.forms || []) as MedicalForm[]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  // === AMÉLIORATION AJOUTÉE : Health Insurance Policy Management & Premium Monitoring ===
  const [healthPolicies, setHealthPolicies] = useState<HealthPolicy[]>([]);
  const [policyPayments, setPolicyPayments] = useState<PolicyPayment[]>([]);

  useEffect(() => {
    localStorage.setItem('activa_lang', 'en');

    if (authStatus === 'authenticated' && userRole) {
      seedInitialDemoDataIfEmpty();
      // Set up Firestore data listeners
      const unsubMembers = FirestoreService.subscribeToMembers(setMembers);
      const unsubOrgs = FirestoreService.subscribeToOrganizations(setOrganizations);
      const unsubProviders = FirestoreService.subscribeToProviders(setProviders);
      const unsubClaims = FirestoreService.subscribeToClaims(setClaims);
      const unsubInvoices = FirestoreService.subscribeToInvoices(setInvoices);
      const unsubEnrollments = FirestoreService.subscribeToEnrollments(setEnrollments);
      const unsubCeilings = FirestoreService.subscribeToCeilings(setCeilings);
      const unsubMedicalForms = FirestoreService.subscribeToMedicalForms(setMedicalForms);
      const unsubNotifications = FirestoreService.subscribeToNotifications(setNotifications);
      const unsubHealthPolicies = FirestoreService.subscribeToHealthPolicies(setHealthPolicies);
      const unsubPolicyPayments = FirestoreService.subscribeToPolicyPayments(setPolicyPayments);

      let unsubLogs: (() => void) | undefined;
      if (userRole === 'Admin') {
        unsubLogs = FirestoreService.subscribeToLogs(setLogs);
      }

      return () => {
        unsubMembers();
        unsubOrgs();
        unsubProviders();
        unsubClaims();
        unsubInvoices();
        unsubEnrollments();
        unsubCeilings();
        unsubMedicalForms();
        unsubNotifications();
        unsubHealthPolicies();
        unsubPolicyPayments();
        if (unsubLogs) unsubLogs();
      };
    }
  }, [authStatus, userRole]);

  // === AMÉLIORATION AJOUTÉE : Health Insurance Policy Management & Premium Monitoring —
  // recalcul automatique du statut de chaque police (expiration, dépassement du délai de
  // grâce, réactivation) à chaque changement des données ET sur un intervalle périodique
  // (aucune Cloud Function planifiée disponible dans ce projet pour détecter les transitions
  // basées uniquement sur la date, sans écriture déclenchante). Voir
  // WorkflowService.syncPolicyStatuses pour la logique — idempotente, ne réécrit/ne notifie
  // que les polices dont le statut calculé diverge réellement du dernier statut persisté.
  useEffect(() => {
    if (authStatus !== 'authenticated' || healthPolicies.length === 0) return;
    WorkflowService.syncPolicyStatuses(healthPolicies, members);
    const interval = setInterval(() => {
      WorkflowService.syncPolicyStatuses(healthPolicies, members);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [authStatus, healthPolicies, members]);

  // === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — sur demande
  // explicite. Bootstrap automatique, une seule fois par session, des deux compteurs de
  // numéros de carte (sections 3/18) : relevés au maximum réellement présent dans TOUTE la
  // base (jamais seulement le dernier enregistrement créé — voir
  // cardNumberService.migrateCardNumberCounters), avec backfill du registre d'unicité pour
  // les cartes créées avant ce système. Idempotent — peut aussi être relancé à tout moment
  // depuis Admin > Organizations > Cards > "Validate Card Number Sequence".
  const cardNumberMigrationRanRef = useRef(false);
  useEffect(() => {
    if (authStatus !== 'authenticated' || cardNumberMigrationRanRef.current || members.length === 0) return;
    cardNumberMigrationRanRef.current = true;
    migrateCardNumberCounters(members).catch((err) => {
      console.warn('Card number sequence bootstrap failed:', err);
      cardNumberMigrationRanRef.current = false; // allow a retry on the next members update
    });
  }, [authStatus, members]);

  const handleLoginSuccess = (user: any) => {
    // onAuthStateChanged will handle atomic role resolution
    // === AMÉLIORATION AJOUTÉE : sécurité (audit) — ipAddress/location étaient auparavant
    // TOUJOURS 'Unknown' (valeurs codées en dur), rendant la page Audit & Access Logs
    // incapable de repérer une connexion depuis un lieu inhabituel. Résolues maintenant via
    // un service public de géolocalisation IP interrogé depuis le navigateur (voir
    // geoUtils.ts) ; repli sur 'Unknown' en cas d'échec, sans jamais bloquer la connexion
    // déjà réussie (l'appel est fait après coup, en tâche de fond).
    getClientLocationInfo().then(({ ipAddress, location }) => {
      FirestoreService.addLog({
        userEmail: user?.email || 'user@activa-assurance.com',
        ipAddress,
        status: 'success',
        userAgent: navigator.userAgent,
        browser: parseUserAgent(navigator.userAgent),
        location,
      });
    });
  };

  const handleLogout = async () => {
    setAuthStatus('loading');
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('SignOut error:', e);
    } finally {
      localStorage.removeItem('activa_auth_session');
      sessionStorage.clear();
      setCurrentUser(null);
      setUserRole(null);
      setCurrentSection('dashboard');
      setShowInactivityModal(false);
      setInactivityRemainingSeconds(INACTIVITY_TIMEOUT_SECONDS);
      setAuthStatus('unauthenticated');
    }
  };

  // === AMÉLIORATION AJOUTÉE (correction de bug) : l'ancienne version de cet effet dépendait
  // de `showInactivityModal` — chaque fois que ce state changeait (précisément à l'ouverture
  // de l'avertissement), l'effet se nettoyait et se relançait, détruisant/recréant
  // `setInterval` et les écouteurs d'événements. Combiné à un décompte basé sur des
  // incréments d'état plutôt que sur une horloge réelle, ce cycle laissait le minuteur dans
  // un état incohérent et la déconnexion automatique ne se déclenchait plus de façon fiable.
  // Réécrit ci-dessous avec un horodatage de dernière activité (ref, indépendant du cycle de
  // rendu React) comparé à Date.now() à chaque tick : le décompte reste exact quel que soit
  // le nombre de re-rendus, et l'effet ne dépend plus que de `authStatus`.
  const inactivityLastActivityRef = useRef<number>(Date.now());

  // Inactivity Auto-Logout Effect (5m inactivity threshold, warning at 1m left)
  useEffect(() => {
    if (authStatus !== 'authenticated') {
      setShowInactivityModal(false);
      return;
    }

    inactivityLastActivityRef.current = Date.now();
    setInactivityRemainingSeconds(INACTIVITY_TIMEOUT_SECONDS);

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll', 'wheel', 'click'];
    const handleUserActivity = () => {
      inactivityLastActivityRef.current = Date.now();
    };
    events.forEach((ev) => window.addEventListener(ev, handleUserActivity, { passive: true }));

    let loggedOut = false;
    const interval = setInterval(() => {
      if (loggedOut) return;
      const elapsedSeconds = Math.floor((Date.now() - inactivityLastActivityRef.current) / 1000);
      const remaining = Math.max(0, INACTIVITY_TIMEOUT_SECONDS - elapsedSeconds);
      setInactivityRemainingSeconds(remaining);
      setShowInactivityModal(remaining > 0 && remaining <= WARNING_BEFORE_SECONDS);
      if (remaining <= 0) {
        loggedOut = true;
        setShowInactivityModal(false);
        handleLogout();
      }
    }, 1000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleUserActivity));
      clearInterval(interval);
    };
  }, [authStatus]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isReloadingDemo, setIsReloadingDemo] = useState<boolean>(false);

  // === NOTE DE FUSION : une déconnexion automatique après inactivité existe déjà plus bas
  // dans ce fichier (showInactivityModal / INACTIVITY_TIMEOUT_SECONDS / InactivityWarningModal
  // — fenêtre dédiée avec compte à rebours visible et bouton "Stay Connected"). Cette branche
  // avait développé indépendamment un second mécanisme équivalent mais plus simple
  // (hooks/useIdleLogout.ts, un simple toast). Les deux ne doivent jamais tourner en même
  // temps (deux minuteries indépendantes déclenchant chacune une déconnexion créeraient un
  // comportement imprévisible) : le mécanisme déjà en place ci-dessous (plus complet) est
  // conservé ; useIdleLogout() n'est plus appelé ici, mais le hook reste disponible dans le
  // code (hooks/useIdleLogout.ts) si besoin.

  // === AMÉLIORATION AJOUTÉE : jouer un son de confirmation à chaque opération validée
  // (approbation, sauvegarde, soumission, import, etc.), matérialisée ici par l'apparition
  // d'un toast de succès. Les toasts d'erreur (message contenant "Error"/"error") sont
  // exclus pour ne pas jouer un son de succès sur un échec.
  useEffect(() => {
    if (toastMessage && !/error/i.test(toastMessage)) {
      playSuccessSound();
    }
  }, [toastMessage]);

  // === AMÉLIORATION AJOUTÉE : jouer un son dès qu'une nouvelle notification arrive
  // (écoute temps réel Firestore). La première synchronisation (chargement initial /
  // connexion) ne déclenche jamais de son — seules les notifications réellement NOUVELLES
  // qui arrivent après coup en déclenchent un.
  const prevNotificationIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const currentIds = new Set(notifications.map((n) => n.id));
    if (prevNotificationIdsRef.current !== null) {
      const hasNewNotification = notifications.some((n) => !prevNotificationIdsRef.current!.has(n.id));
      if (hasNewNotification) {
        playNotificationSound();
      }
    }
    prevNotificationIdsRef.current = currentIds;
  }, [notifications]);

  const handleResetDemoData = async () => {
    setIsReloadingDemo(true);
    try {
      const data = getFullDemoData();
      setMembers((data.membersList || []) as Member[]);
      setOrganizations((data.orgs || []) as Organization[]);
      setProviders((data.providers || []) as Provider[]);
      setClaims((data.sampleClaims || []) as Claim[]);
      setInvoices((data.sampleInvoices || []) as InvoiceItem[]);
      setCeilings((data.sampleCeilings || []) as Ceiling[]);
      setMedicalForms((data.forms || []) as MedicalForm[]);

      await forceReloadDemoData();
      setToastMessage("All application demo records reloaded successfully!");
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      console.error(err);
      setToastMessage("Error during reload: " + (err.message || 'Unknown error'));
      setTimeout(() => setToastMessage(null), 5000);
    } finally {
      setIsReloadingDemo(false);
    }
  };

  const handleResetBlankData = () => {
    setToastMessage("Blank mode activated.");
    setTimeout(() => setToastMessage(null), 3000);
  };

  // CLAIMS HANDLERS WITH MULTI-ROLE NOTIFICATIONS & AUDIT
  const handleApproveClaim = async (claimId: string) => {
    const claim = claims.find((c) => c.id === claimId);
    if (!claim) return;
    await WorkflowService.approveClaim(claim, currentUser, members, organizations);
    setToastMessage(`Claim #${claim.reference} approved successfully.`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleRejectClaim = async (claim: Claim, reason: string, comments: string) => {
    await WorkflowService.rejectClaim(claim, reason, comments, currentUser);
    setToastMessage(`Claim #${claim.reference} rejected.`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleReturnClaim = (claim: Claim, reason: string) => {
    const updated: Claim = {
      ...claim,
      status: 'returned',
      returnReason: reason,
      decisionDate: new Date().toISOString().split('T')[0],
      comments: `File returned for correction: ${reason}`,
    };
    FirestoreService.updateClaim(updated);
  };

  const handleAssignClaim = (claim: Claim, agentName: string) => {
    const updated: Claim = {
      ...claim,
      assignedAgentName: agentName,
      comments: (claim.comments ? claim.comments + ' | ' : '') + `Assigned to ${agentName}`,
    };
    FirestoreService.updateClaim(updated);
  };

  const handleDeleteClaim = (claimId: string) => {
    FirestoreService.deleteClaim(claimId);
  };

  // FIX: InvoicesView's delete-confirmation button called onDeleteInvoice(id), but this
  // prop was never passed at either of InvoicesView's two call sites below ('invoices' for
  // Admin, 'receipts' for Supervisor) — so confirming a deletion silently did nothing.
  // FirestoreService.deleteInvoice already existed and works; it just needed wiring here,
  // matching the same pattern already used for claims/members.
  const handleDeleteInvoice = (invoiceId: string) => {
    return FirestoreService.deleteInvoice(invoiceId);
  };

  const handleCreateClaim = async (newClaim: Partial<Claim>) => {
    await WorkflowService.submitClaim(newClaim, currentUser);
    setToastMessage("Claim submitted for review.");
    setTimeout(() => setToastMessage(null), 3000);
  };

  // ENROLLMENTS HANDLERS WITH POPULATION UPON APPROVAL
  const handleApproveEnrollment = async (enrId: string) => {
    const enr = enrollments.find((e) => e.id === enrId);
    if (!enr) return;
    await WorkflowService.approveEnrollment(enr, members, currentUser);
    setToastMessage(`Enrollment for ${enr.fullName} approved and added to Insured Members.`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleRejectEnrollment = async (enr: Enrollment, reason: string) => {
    await WorkflowService.rejectEnrollment(enr, reason, currentUser);
    setToastMessage(`Enrollment for ${enr.fullName} rejected.`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleReturnEnrollment = (enr: Enrollment, reason: string) => {
    const updated: Enrollment = {
      ...enr,
      status: 'returned',
      returnReason: reason,
      decisionDate: new Date().toISOString().split('T')[0],
    };
    FirestoreService.updateEnrollment(updated);
  };

  const handleAssignEnrollment = (enr: Enrollment, agentName: string) => {
    const updated: Enrollment = {
      ...enr,
      assignedAgentName: agentName,
    };
    FirestoreService.updateEnrollment(updated);
  };

  const handleDeleteEnrollment = (enrId: string) => {
    FirestoreService.deleteEnrollment(enrId);
  };

  const handleCreateEnrollment = async (newEnr: Partial<Enrollment>) => {
    // Submit enrollment to validation queue WITHOUT registering into members until approved
    await WorkflowService.submitEnrollment(newEnr, currentUser);
    setToastMessage("Enrollment submitted for supervisor validation.");
    setTimeout(() => setToastMessage(null), 3000);
  };

  // MEMBERS HANDLERS WITH CASCADING LOGIC
  const handleAddMember = (m: Partial<Member>) => {
    FirestoreService.addMember(m);
  };

  const handleUpdateMember = (m: Member) => {
    FirestoreService.updateMember(m);
  };

  const handleSuspendMember = async (m: Member) => {
    // 1. Suspend principal
    const updatedPrincipal: Member = {
      ...m,
      status: 'Suspendu',
    };
    await FirestoreService.updateMember(updatedPrincipal);

    // 2. Log workflow notification & audit
    await WorkflowService.logAction(
      'MEMBER_SUSPENDED',
      'member',
      m.id,
      `Insured Member ${m.principalName} (Card #${m.cardNo}) and all associated dependants were SUSPENDED.`,
      currentUser
    );

    setToastMessage(`Member ${m.principalName} and all linked dependants are now SUSPENDED.`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleReactivateMember = async (m: Member) => {
    const updatedPrincipal: Member = {
      ...m,
      status: 'Actif',
    };
    await FirestoreService.updateMember(updatedPrincipal);

    await WorkflowService.logAction(
      'MEMBER_REACTIVATED',
      'member',
      m.id,
      `Insured Member ${m.principalName} (Card #${m.cardNo}) and dependants have been REACTIVATED.`,
      currentUser
    );

    setToastMessage(`Member ${m.principalName} is now REACTIVATED.`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleDeleteMember = (id: string) => {
    FirestoreService.deleteMember(id);
  };

  // FIX: this used sequential `for` loops with a bare `await` per Firestore write and no
  // per-item error handling — if ANY single write threw (e.g. updateMember() on a record
  // whose id didn't correspond to a real server-side document — see the self-healing fix
  // in FirestoreService.updateMember), the exception propagated out of the loop and every
  // record queued AFTER the failing one was silently never written, while the toast below
  // still reported success (its message only reflects `imported.length`, computed from
  // parsing alone — before any write happens). Reported: importing a 149-row file showed
  // "1 created, 148 updated" but the Insured Members Directory only ever showed 1 record
  // afterward. Both loops now use Promise.allSettled so one failing write can never take
  // down the rest, and the toast reports what ACTUALLY got saved, not just what was parsed.
  const handleImportMembers = async (imported: Partial<Member>[]) => {
    // 1. Automatically create any organization referenced by the import that doesn't exist yet
    const currentOrgNames = new Set(organizations.map((o) => (o.name || '').toLowerCase().trim()));
    const newOrgsToCreate: string[] = [];

    imported.forEach((item) => {
      if (item.organization && item.organization.trim()) {
        const orgTrimmed = item.organization.trim();
        if (!currentOrgNames.has(orgTrimmed.toLowerCase())) {
          currentOrgNames.add(orgTrimmed.toLowerCase());
          newOrgsToCreate.push(orgTrimmed);
        }
      }
    });

    const orgResults = await Promise.allSettled(
      newOrgsToCreate.map((newOrgName) => {
        const newOrg: Organization = {
          id: `org-auto-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: newOrgName,
          policyNumber: `POL-${newOrgName.substring(0, 3).toUpperCase()}-2026`,
          declaredMembers: 10,
          coverageRate: 80,
          status: 'Actif',
          effectiveDate: '2026-01-01',
          expirationDate: '2026-12-31',
          contactPhone: '+231 770 00 11 22',
          contactEmail: `contact@${newOrgName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
        };
        return FirestoreService.addOrganization(newOrg);
      })
    );
    const orgFailures = orgResults.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    // 2. Add or update members in Firestore — every record attempted independently
    const memberResults = await Promise.allSettled(
      imported.map((i) => {
        if (i.id && members.some((m) => m.id === i.id)) {
          return FirestoreService.updateMember(i as Member);
        }
        return FirestoreService.addMember(i);
      })
    );
    const memberFailures = memberResults.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    const memberSuccessCount = memberResults.length - memberFailures.length;

    if (memberFailures.length > 0) {
      console.error(
        `handleImportMembers: ${memberFailures.length} of ${imported.length} member record(s) failed to save.`,
        memberFailures.map((f) => f.reason)
      );
    }
    if (orgFailures.length > 0) {
      console.error(
        `handleImportMembers: ${orgFailures.length} of ${newOrgsToCreate.length} auto-created organization(s) failed to save.`,
        orgFailures.map((f) => f.reason)
      );
    }

    if (memberFailures.length > 0 || orgFailures.length > 0) {
      setToastMessage(
        `Saved ${memberSuccessCount} of ${imported.length} insured records.` +
          (memberFailures.length > 0 ? ` ⚠️ ${memberFailures.length} record(s) FAILED to save — check your connection and try importing again.` : '') +
          (newOrgsToCreate.length > 0 ? ` ${newOrgsToCreate.length - orgFailures.length}/${newOrgsToCreate.length} new organization(s) added.` : '')
      );
      setTimeout(() => setToastMessage(null), 8000);
    } else if (newOrgsToCreate.length > 0) {
      setToastMessage(
        `Imported ${imported.length} insured records. ${newOrgsToCreate.length} new organization(s) automatically added.`
      );
      setTimeout(() => setToastMessage(null), 4000);
    } else {
      setToastMessage(`Imported ${imported.length} insured records successfully.`);
      setTimeout(() => setToastMessage(null), 4000);
    }

    // Surface real persistence failures to ExcelImportModal so it stops reporting a false
    // "success" summary based only on parsing — see the matching fix in that component.
    if (memberFailures.length > 0) {
      const firstReason = memberFailures[0]?.reason;
      const firstMsg = firstReason instanceof Error ? firstReason.message : String(firstReason);
      throw new Error(`${memberFailures.length} of ${imported.length} insured record(s) failed to save (${firstMsg}). ${memberSuccessCount} were saved successfully — you can safely re-import the same file, already-saved records will just be updated, not duplicated.`);
    }
  };

  // ORGANIZATIONS HANDLERS WITH CASCADING MEMBER SUSPENSION
  const handleAddOrg = (org: Partial<Organization>) => {
    FirestoreService.addOrganization(org);
  };

  const handleUpdateOrg = (org: Organization) => {
    FirestoreService.updateOrganization(org);
  };

  const handleSuspendOrg = async (org: Organization) => {
    // 1. Update Organization status in Firestore
    const updatedOrg: Organization = {
      ...org,
      status: 'Suspendu',
    };
    await FirestoreService.updateOrganization(updatedOrg);

    // 2. Cascade: Suspend all members belonging to this organization
    const orgMembers = members.filter(
      (m) => m.organization?.toLowerCase().trim() === org.name.toLowerCase().trim()
    );

    for (const m of orgMembers) {
      if (m.status !== 'Suspendu') {
        await FirestoreService.updateMember({
          ...m,
          status: 'Suspendu',
        });
      }
    }

    // 3. Log Audit & Notifications
    await WorkflowService.logAction(
      'ORGANIZATION_SUSPENDED',
      'organization',
      org.id,
      `Organization ${org.name} (Policy #${org.policyNumber}) SUSPENDED. Cascaded suspension to ${orgMembers.length} member policyholders and their dependants.`,
      currentUser
    );

    setToastMessage(`Organization "${org.name}" suspended. All ${orgMembers.length} linked members & dependants blocked.`);
    setTimeout(() => setToastMessage(null), 5000);
  };

  const handleReactivateOrg = async (org: Organization) => {
    // 1. Reactivate Organization in Firestore
    const updatedOrg: Organization = {
      ...org,
      status: 'Actif',
    };
    await FirestoreService.updateOrganization(updatedOrg);

    // 2. Cascade Reactivation: Reactivate members belonging to this organization
    const orgMembers = members.filter(
      (m) => m.organization?.toLowerCase().trim() === org.name.toLowerCase().trim()
    );

    for (const m of orgMembers) {
      if (m.status === 'Suspendu') {
        await FirestoreService.updateMember({
          ...m,
          status: 'Actif',
        });
      }
    }

    await WorkflowService.logAction(
      'ORGANIZATION_REACTIVATED',
      'organization',
      org.id,
      `Organization ${org.name} (Policy #${org.policyNumber}) REACTIVATED. Restored coverage access for ${orgMembers.length} enrolled members.`,
      currentUser
    );

    setToastMessage(`Organization "${org.name}" reactivated. Restored coverage for ${orgMembers.length} members.`);
    setTimeout(() => setToastMessage(null), 5000);
  };

  // === AMÉLIORATION AJOUTÉE : suppression en cascade — sur demande explicite ("supprimer
  // toutes les données de X dans Firestore et sur l'application"). Auparavant, cette fonction
  // ne supprimait que la fiche organisations/{id}, laissant orphelins tous les membres,
  // sinistres, inscriptions, factures, formulaires médicaux, plafonds et la police santé (+
  // historique de paiements) liés à cette organisation. La signature (id: string) et l'appel
  // depuis OrganizationsView restent strictement inchangés — le nom de l'organisation est
  // retrouvé depuis l'état `organizations` déjà chargé en mémoire.
  const handleDeleteOrg = async (id: string) => {
    const org = organizations.find((o) => o.id === id);
    if (org) {
      await FirestoreService.cascadeDeleteOrganizationData(org.name);
      await WorkflowService.logAction(
        'ORGANIZATION_DELETED',
        'organization',
        org.id,
        `Organization ${org.name} (Policy #${org.policyNumber}) and ALL linked data (members, claims, enrollments, invoices, medical forms, ceilings, health policy & payments) permanently deleted.`,
        currentUser
      );
    }
    await FirestoreService.deleteOrganization(id);
  };

  // === FIX (same bug as handleImportMembers, see comment above) ===
  const handleImportOrgs = (imported: Partial<Organization>[]) => {
    imported.forEach((i) => {
      if (i.id && !i.id.startsWith('org-imp-')) {
        FirestoreService.updateOrganization(i as Organization);
      } else {
        const { id, ...rest } = i;
        FirestoreService.addOrganization(rest);
      }
    });
  };

  // === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System (v2) — migration
  // ponctuelle de toutes les cartes déjà existantes vers la structure AMID-YYMMDD-NNNNN, sur
  // demande explicite. Orchestrée ici (et non dans cardNumberService.ts directement) car
  // c'est le seul endroit disposant déjà en mémoire de toutes les collections impactées
  // (membres, sinistres, factures, fiches médicales, inscriptions).
  const handleMigrateAllCards = async () => {
    const summary = await migrateAllCardsToNewCardNumberFormat(
      members,
      claims,
      invoices,
      medicalForms,
      enrollments,
      { uid: currentUser?.uid, name: currentUser?.fullName || currentUser?.displayName || currentUser?.email }
    );
    await WorkflowService.logAction(
      'CARD_NUMBER_FORMAT_MIGRATED',
      'system',
      'card-number-format-v2',
      `Card number format migration to AMID-YYMMDD-NNNNN completed: ${summary.migratedMembers} members and ${summary.migratedDependents} dependents renumbered; ${summary.claimsUpdated} claims, ${summary.invoicesUpdated} invoices, ${summary.medicalFormsUpdated} medical forms and ${summary.enrollmentsUpdated} enrollments updated to match.`,
      currentUser
    );
    return summary;
  };

  // === AMÉLIORATION AJOUTÉE : Health Insurance Policy Management & Premium Monitoring ===
  const handleSaveHealthPolicy = (organizationName: string, data: Partial<HealthPolicy>) => {
    FirestoreService.upsertHealthPolicy(organizationName, data);
  };
  const handleAddPolicyPayment = (data: Partial<PolicyPayment>) => {
    FirestoreService.addPolicyPayment(data);
  };
  const handleDeletePolicyPayment = (id: string) => {
    FirestoreService.deletePolicyPayment(id);
  };

  // PROVIDERS HANDLERS
  const handleAddProvider = (prv: Partial<Provider>) => {
    FirestoreService.addProvider(prv);
    
  };

  const handleUpdateProvider = (prv: Provider) => {
    FirestoreService.updateProvider(prv);
    
  };

  const handleDeleteProvider = (id: string) => {
    FirestoreService.deleteProvider(id);
    
  };

  // === FIX (same bug as handleImportMembers, see comment above) ===
  const handleImportProviders = (imported: Partial<Provider>[]) => {
    imported.forEach((i) => {
      if (i.id && !i.id.startsWith('prv-imp-')) {
        FirestoreService.updateProvider(i as Provider);
      } else {
        const { id, ...rest } = i;
        FirestoreService.addProvider(rest);
      }
    });
  };

  // CEILINGS HANDLERS
  const handleAddCeiling = (c: Partial<Ceiling>) => {
    FirestoreService.addCeiling(c);
    
  };

  const handleUpdateCeiling = (c: Ceiling) => {
    FirestoreService.updateCeiling(c);
    
  };

  const handleDeleteCeiling = (id: string) => {
    FirestoreService.deleteCeiling(id);
    
  };

  // Badges Calculation for Sidebar
  const pendingClaimsCount = claims.filter((c) => c.status === 'pending').length;
  const pendingEnrollmentsCount = enrollments.filter((e) => e.status === 'pending').length;

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 1. Loading screen: absolutely NO dashboard is rendered while resolving session & role
  if (authStatus === 'loading') {
    return <AuthLoadingScreen />;
  }

  // 2. Unauthenticated screen: render clean, secured Login view
  if (authStatus === 'unauthenticated') {
    return (
      <LoginView
        onLoginSuccess={handleLoginSuccess}
        lang={lang}
      />
    );
  }

  // 3. Deactivated account screen: display inactive notice with clean logout button
  if (authStatus === 'inactive') {
    return (
      <AuthBlockedScreen
        reason="inactive"
        userEmail={currentUser?.email}
        onLogout={handleLogout}
      />
    );
  }

  // 4. Invalid or missing operational role screen
  if (authStatus === 'invalid_role' || !userRole) {
    return (
      <AuthBlockedScreen
        reason="invalid_role"
        userEmail={currentUser?.email}
        onLogout={handleLogout}
      />
    );
  }

  // 5. Authenticated state: ensure the active role is permitted to access currentSection
  const activeRole = userRole;
  const isCurrentSectionPermitted = isSectionAllowedForRole(activeRole, currentSection);
  const effectiveSection: NavSection = isCurrentSectionPermitted ? currentSection : getDefaultSectionForRole(activeRole);
  // === ADDED IMPROVEMENT: theme derived from the active role, used to keep the mobile
  // navigation bar and the global toast consistent with the Sidebar (Admin = slate, Supervisor = teal, Agent = blue)
  const activeRoleTheme = getRoleTheme(activeRole);
  // === AMÉLIORATION AJOUTÉE : variables CSS --brand-50..900 dérivées du rôle actif, posées
  // sur le conteneur racine ci-dessous. Toutes les vues/fenêtres/boutons qui utilisaient la
  // couleur Activa Navy codée en dur (#0a2e6b / blue-NN Tailwind) ont été convertis pour
  // référencer ces variables (`bg-[var(--brand-900)]` etc.) — voir roleTheme.ts. Résultat :
  // chaque interface (Admin/Superviseur/Agent) porte désormais la même couleur partout
  // (bandeaux, boutons, fenêtres modales) que sa barre latérale, au lieu du bleu fixe d'origine.
  const roleCssVars = getRoleCssVars(activeRole);

  // === AMÉLIORATION AJOUTÉE : la barre de navigation mobile (bottom nav) affichait
  // auparavant TOUJOURS les 4 mêmes icônes (Dashboard/Claims/Invoices/Enrollments), qui ne
  // correspondent pas aux sections réellement autorisées pour Agent et Superviseur (voir
  // ROLE_ALLOWED_SECTIONS dans authUtils.ts) — un Agent tapant "Dashboard" ou "Invoices",
  // ou un Superviseur tapant "Claims"/"Invoices"/"Enroll", était silencieusement renvoyé
  // vers la section par défaut de son rôle (via effectiveSection), rendant ces boutons
  // inopérants. Cette liste reprend, par rôle, les mêmes sections/icônes déjà utilisées
  // dans la Sidebar desktop (filteredOverviewItems) pour rester 100% cohérent, en ne
  // gardant que les 4 accès les plus utilisés au quotidien pour un accès rapide — le
  // bouton "Menu" (inchangé) donne toujours accès à l'intégralité des sections du rôle.
  type MobileNavItem = {
    section: NavSection;
    label: string;
    Icon: typeof LayoutDashboard;
    badge?: number;
  };
  const mobileNavItems: MobileNavItem[] =
    activeRole === 'Agent'
      ? [
          { section: 'identification', label: 'ID Check', Icon: Users },
          { section: 'medical_form', label: 'Med. Form', Icon: FileCheck },
          { section: 'claims', label: 'Claims', Icon: Receipt, badge: pendingClaimsCount },
          { section: 'enrollments', label: 'Enroll', Icon: UserCheck, badge: pendingEnrollmentsCount },
        ]
      : activeRole === 'Supervisor'
      ? [
          { section: 'dashboard', label: 'Overview', Icon: LayoutDashboard },
          { section: 'medical_form', label: 'Med. Form', Icon: FileCheck },
          { section: 'claims_validation', label: 'Claims', Icon: FileCheck, badge: pendingClaimsCount },
          { section: 'enrollments_validation', label: 'Enroll', Icon: UserCheck, badge: pendingEnrollmentsCount },
        ]
      : [
          // Admin (and any fallback): unchanged from the original 4-icon set.
          { section: 'dashboard', label: 'Overview', Icon: LayoutDashboard },
          { section: 'claims', label: 'Claims', Icon: Receipt, badge: pendingClaimsCount },
          { section: 'invoices', label: 'Invoices', Icon: FileText },
          { section: 'enrollments', label: 'Enroll', Icon: UserCheck, badge: pendingEnrollmentsCount },
        ];

  return (
    // === AMÉLIORATION AJOUTÉE : h-screen + overflow-hidden au lieu de min-h-screen — le
    // document lui-même ne défile plus. Voir plus bas : seule la zone de contenu (sous le
    // Topbar) devient scrollable, pour que la barre de défilement verticale ne remonte pas
    // au-dessus du bandeau blanc du haut (Topbar / bouton profil).
    <div
      className="h-screen overflow-hidden bg-[#F8FAFC] text-[var(--brand-900)] font-sans flex antialiased selection:bg-[var(--brand-900)] selection:text-white"
      style={roleCssVars}
    >
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden animate-in fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Fixed Sidebar */}
      <div className={`fixed top-0 left-0 h-full z-50 transform transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar
          currentSection={effectiveSection}
          currentUser={currentUser}
          userRole={activeRole}
          onSelectSection={(section) => {
            handleSelectSection(section);
            setSidebarOpen(false); // Close on mobile after selection
          }}
          lang={lang}
          pendingClaimsCount={pendingClaimsCount}
          pendingEnrollmentsCount={pendingEnrollmentsCount}
          onCloseMobile={() => setSidebarOpen(false)}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 lg:ml-[240px] flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Topbar (outside the scroll container below — stays fixed at the top, un-scrolled) */}
        <Topbar
          currentSection={effectiveSection}
          currentUser={currentUser}
          userRole={activeRole}
          lang={lang}
          notifications={notifications}
          onMarkNotificationAsRead={(n) => FirestoreService.markNotificationRead(n.id)}
          onMarkAllNotificationsAsRead={() => FirestoreService.markAllNotificationsRead(notifications)}
          onSelectSection={(sec) => handleSelectSection(sec)}
          onOpenChangePassword={() => setChangePasswordModalOpen(true)}
          onLogout={handleLogout}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />

        {/* Global Toast Notification */}
        {/* === ADDED IMPROVEMENT: the toast now uses the active role's color (theme.palette.modalHeaderBg) instead of a fixed Agent blue === */}
        {toastMessage && (
          <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className={`${activeRoleTheme.palette.modalHeaderBg} text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 border border-white/10 text-xs font-semibold`}>
              <div className="w-2 h-2 rounded-full bg-[#00A859] animate-ping" />
              <span>{toastMessage}</span>
            </div>
          </div>
        )}

        {/* === AMÉLIORATION AJOUTÉE : conteneur de défilement dédié au contenu, sous le Topbar.
            Le Topbar (bandeau blanc avec le bouton profil) reste désormais hors de cette zone
            scrollable : la barre de défilement verticale ne part donc plus du tout en haut de
            la page, mais juste sous le Topbar, comme demandé. === */}
        <div className="flex-1 overflow-y-auto">
        {/* Section Router Content */}
        <main className="p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-7xl w-full mx-auto animate-in fade-in duration-200">
          {effectiveSection === 'dashboard' && (
            <DashboardView
              lang={lang}
              userRole={activeRole}
              currentUser={currentUser}
              claims={claims}
              enrollments={enrollments}
              members={members}
              organizations={organizations}
              providers={providers}
              onNavigate={handleSelectSection}
              onApproveClaim={handleApproveClaim}
              onRejectClaim={(c) => handleRejectClaim(c, 'Medical rejection', '')}
              onApproveEnrollment={handleApproveEnrollment}
              onRejectEnrollment={(e) => handleRejectEnrollment(e, 'Non-compliant photo')}
            />
          )}

          {effectiveSection === 'claims' && (
            activeRole === 'Agent' ? (
              <AgentClaimsView
                claims={claims}
                members={members}
                providers={providers}
                organizations={organizations}
                ceilings={ceilings}
                lang={lang}
                preselectedMember={selectedMemberForClaim}
                onCreateClaim={handleCreateClaim}
              />
            ) : (
              <ClaimsView currentSection={effectiveSection} userRole={activeRole}
                currentUser={currentUser}
                lang={lang}
                claims={claims}
                organizations={organizations}
                providers={providers}
                members={members}
                onApprove={handleApproveClaim}
                onReject={handleRejectClaim}
                onReturn={handleReturnClaim}
                onAssign={handleAssignClaim}
                onDelete={handleDeleteClaim}
                onCreateClaim={handleCreateClaim}
              />
            )
          )}

          {effectiveSection === 'invoices' && (
            <InvoicesView
              lang={lang}
              invoices={invoices}
              userRole={activeRole}
              onDeleteInvoice={handleDeleteInvoice}
            />
          )}

          {effectiveSection === 'enrollments' && (
            activeRole === 'Agent' ? (
              <AgentEnrollmentsView
                organizations={organizations}
                enrollments={enrollments}
                members={members}
                currentUser={currentUser}
                userRole={activeRole}
                lang={lang}
                onCreateEnrollment={handleCreateEnrollment}
              />
            ) : (
              <EnrollmentsView userRole={activeRole}
                currentUser={currentUser}
                lang={lang}
                enrollments={enrollments}
                organizations={organizations}
                onApprove={handleApproveEnrollment}
                onReject={handleRejectEnrollment}
                onReturn={handleReturnEnrollment}
                onAssign={handleAssignEnrollment}
                onDelete={handleDeleteEnrollment}
                onCreateEnrollment={handleCreateEnrollment}
              />
            )
          )}

          {effectiveSection === 'identification' && (
            <AgentIdentificationView
              members={members}
              claims={claims}
              lang={lang}
              organizations={organizations}
              healthPolicies={healthPolicies}
              onGenerateMedicalForm={(member) => {
                setSelectedMemberForMedicalForm(member);
                handleSelectSection('medical_form');
              }}
              onNewEnrollment={() => handleSelectSection('enrollments')}
              onNewClaim={(member) => {
                setSelectedMemberForClaim(member);
                handleSelectSection('claims');
              }}
            />
          )}

          {effectiveSection === 'medical_form' && (
            <AgentMedicalFormView
              providers={providers}
              members={members}
              organizations={organizations}
              medicalForms={medicalForms}
              userRole={activeRole}
              lang={lang}
              preselectedMember={selectedMemberForMedicalForm}
              onCreateMedicalForm={(form) => FirestoreService.addMedicalForm(form)}
              onUpdateMedicalForm={(form) => FirestoreService.updateMedicalForm(form)}
              initialMemberCardNo={medicalFormPrefillCardNo}
              onConsumedInitialMember={() => setMedicalFormPrefillCardNo(null)}
            />
          )}

          {effectiveSection === 'claims_validation' && (
            <ClaimsView currentSection={effectiveSection} userRole={activeRole}
              currentUser={currentUser}
              lang={lang}
              claims={claims}
              organizations={organizations}
              providers={providers}
              members={members}
              onApprove={handleApproveClaim}
              onReject={handleRejectClaim}
              onReturn={handleReturnClaim}
              onAssign={handleAssignClaim}
              onDelete={handleDeleteClaim}
              onCreateClaim={handleCreateClaim}
            />
          )}

          {effectiveSection === 'enrollments_validation' && (
            <EnrollmentsView userRole={activeRole}
              currentUser={currentUser}
              lang={lang}
              enrollments={enrollments}
              organizations={organizations}
              onApprove={handleApproveEnrollment}
              onReject={handleRejectEnrollment}
              onReturn={handleReturnEnrollment}
              onAssign={handleAssignEnrollment}
              onDelete={handleDeleteEnrollment}
              onCreateEnrollment={handleCreateEnrollment}
            />
          )}

          {effectiveSection === 'receipts' && (
            <InvoicesView
              lang={lang}
              invoices={invoices}
              userRole={activeRole}
              onDeleteInvoice={handleDeleteInvoice}
            />
          )}

          {effectiveSection === 'reports' && (
            <ReportsView
              lang={lang}
              claims={claims}
              invoices={invoices}
              organizations={organizations}
              providers={providers}
              userRole={activeRole}
              healthPolicies={healthPolicies}
              policyPayments={policyPayments}
              members={members}
            />
          )}

          {effectiveSection === 'members' && (
            <MembersView userRole={activeRole}
              lang={lang}
              members={members}
              organizations={organizations}
              ceilings={ceilings}
              onAddMember={handleAddMember}
              onUpdateMember={handleUpdateMember}
              onDeleteMember={handleDeleteMember}
              onImportMembers={handleImportMembers}
              onSuspendMember={handleSuspendMember}
              onReactivateMember={handleReactivateMember}
              currentUser={currentUser}
            />
          )}

          {effectiveSection === 'organizations' && (
            <OrganizationsView
              lang={lang}
              organizations={organizations}
              members={members}
              onAddOrganization={handleAddOrg}
              onUpdateOrganization={handleUpdateOrg}
              onDeleteOrganization={handleDeleteOrg}
              onImportOrganizations={handleImportOrgs}
              onSuspendOrganization={handleSuspendOrg}
              onReactivateOrganization={handleReactivateOrg}
              healthPolicies={healthPolicies}
              policyPayments={policyPayments}
              onSaveHealthPolicy={handleSaveHealthPolicy}
              onAddPolicyPayment={handleAddPolicyPayment}
              onDeletePolicyPayment={handleDeletePolicyPayment}
              currentUser={currentUser}
              onMigrateAllCards={handleMigrateAllCards}
            />
          )}

          {effectiveSection === 'providers' && (
            <ProvidersView
              lang={lang}
              providers={providers}
              onAddProvider={handleAddProvider}
              onUpdateProvider={handleUpdateProvider}
              onDeleteProvider={handleDeleteProvider}
              onImportProviders={handleImportProviders}
            />
          )}

          {effectiveSection === 'ceilings' && (
            <CeilingsView
              lang={lang}
              ceilings={ceilings}
              organizations={organizations}
              onAddCeiling={handleAddCeiling}
              onUpdateCeiling={handleUpdateCeiling}
              onDeleteCeiling={handleDeleteCeiling}
            />
          )}

          {effectiveSection === 'accounts' && <AccountsView lang={lang} />}

          {effectiveSection === 'logs' && <LogsView lang={lang} logs={logs} />}
        </main>
        </div>

        {/* Mobile & Tablet Miniature Bottom Navigation Bar */}
        {/* === ADDED IMPROVEMENT: the mobile bar now uses the active role's color (theme.palette.avatarBg)
            instead of always being blue, to stay consistent with the desktop Sidebar of the same role === */}
        <nav className={`lg:hidden fixed bottom-0 left-0 right-0 h-16 ${activeRoleTheme.palette.avatarBg} border-t border-white/10 z-30 flex items-center justify-around px-2 shadow-lg backdrop-blur-md`}>
          {mobileNavItems.map((item) => {
            const isActive = effectiveSection === item.section;
            const { Icon } = item;
            return (
              <button
                key={item.section}
                onClick={() => handleSelectSection(item.section)}
                className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition relative ${
                  isActive ? 'text-white font-bold' : 'text-white/70 hover:text-white'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? activeRoleTheme.palette.activeIconColor : ''}`} />
                <span className="text-[10px] mt-0.5">{item.label}</span>
                {!!item.badge && item.badge > 0 && (
                  <span className="absolute top-1 right-2 w-4 h-4 bg-[#10B981] text-white text-[9px] font-black rounded-full flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          <button
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center justify-center py-1 px-2 rounded-xl text-white/70 hover:text-white transition cursor-pointer"
          >
            <MenuIcon className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Menu</span>
          </button>
        </nav>
      </div>

      {/* Inactivity Warning Modal */}
      <InactivityWarningModal
        isOpen={showInactivityModal}
        remainingSeconds={inactivityRemainingSeconds}
        onStayConnected={() => {
          inactivityLastActivityRef.current = Date.now();
          setInactivityRemainingSeconds(INACTIVITY_TIMEOUT_SECONDS);
          setShowInactivityModal(false);
        }}
        onLogout={handleLogout}
        lang={lang}
        userRole={userRole || undefined}
      />

      {/* Global Change Password Modal from Topbar or Security Enforcement */}
      <ChangePasswordModal
        isOpen={changePasswordModalOpen || forcedFirstLogin || forcedPasswordExpiry}
        onClose={() => {
          if (!forcedFirstLogin && !forcedPasswordExpiry) {
            setChangePasswordModalOpen(false);
          }
        }}
        onSuccess={async (newPwd, currentPwd) => {
          if (auth.currentUser) {
            try {
              const { updatePassword, EmailAuthProvider, reauthenticateWithCredential } = await import('firebase/auth');

              // === ADDED IMPROVEMENT (security): verify the CURRENT password before
              // allowing the change. Before this fix, the form's "current password" field was
              // never actually verified: anyone with an already-authenticated session (an
              // unlocked workstation, a stolen session) could change the account's password
              // without knowing it, locking the legitimate owner out of their own account. Not
              // applicable on a forced first login (currentPwd absent): the sign-in with the
              // temporary password just happened.
              if (currentPwd && auth.currentUser.email) {
                const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPwd);
                await reauthenticateWithCredential(auth.currentUser, credential);
              }

              await updatePassword(auth.currentUser, newPwd);

              const { doc, updateDoc, deleteField: deleteFieldFn } = await import('firebase/firestore');
              // === AMÉLIORATION AJOUTÉE : sécurité (audit) — l'utilisateur vient de définir
              // son vrai mot de passe Firebase Auth ; tout mot de passe (en clair ou haché)
              // encore stocké sur ce compte pour l'ancien mécanisme de secours n'a plus lieu
              // d'être conservé — Firebase Auth fait désormais foi à chaque connexion.
              await updateDoc(doc(db, 'accounts', auth.currentUser.uid), {
                isTemporaryPassword: false,
                mustChangePassword: false,
                passwordChangedAt: new Date().toISOString(),
                password: deleteFieldFn(),
                tempPassword: deleteFieldFn(),
                passwordHash: deleteFieldFn(),
                passwordSalt: deleteFieldFn(),
              });

              setForcedFirstLogin(false);
              setForcedPasswordExpiry(false);
              setChangePasswordModalOpen(false);
              alert("Password updated successfully.");
            } catch (error: any) {
              if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                alert("The current password you entered is incorrect.");
              } else {
                alert("Error updating password: " + error.message);
              }
            }
          }
        }}
        lang={lang}
        isForcedFirstLogin={forcedFirstLogin}
        isExpiredPassword={forcedPasswordExpiry}
        userRole={userRole || undefined}
      />
    </div>
  );
}
