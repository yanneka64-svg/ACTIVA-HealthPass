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
} from './types';
import { FirestoreService } from './services/firestore';
import { WorkflowService } from './services/workflowService';
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
        if (unsubLogs) unsubLogs();
      };
    }
  }, [authStatus, userRole]);

  const handleLoginSuccess = (user: any) => {
    // onAuthStateChanged will handle atomic role resolution
    FirestoreService.addLog({
      userEmail: user?.email || 'user@activa-assurance.com',
      ipAddress: 'Unknown',
      status: 'success',
      userAgent: navigator.userAgent,
      location: 'Unknown',
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
    await WorkflowService.approveClaim(claim, currentUser);
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

  const handleDeleteOrg = (id: string) => {
    FirestoreService.deleteOrganization(id);
  };

  const handleImportOrgs = (imported: Partial<Organization>[]) => {
    imported.forEach((i) => FirestoreService.addOrganization(i));
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

  const handleImportProviders = (imported: Partial<Provider>[]) => {
    imported.forEach(i => FirestoreService.addProvider(i));
    
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

  return (
    // === AMÉLIORATION AJOUTÉE : h-screen + overflow-hidden au lieu de min-h-screen — le
    // document lui-même ne défile plus. Voir plus bas : seule la zone de contenu (sous le
    // Topbar) devient scrollable, pour que la barre de défilement verticale ne remonte pas
    // au-dessus du bandeau blanc du haut (Topbar / bouton profil).
    <div className="h-screen overflow-hidden bg-[#F8FAFC] text-[#0D2B63] font-sans flex antialiased selection:bg-[#0A347B] selection:text-white">
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
        {toastMessage && (
          <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="bg-[#0D2B63] text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 border border-[#0A347B] text-xs font-semibold">
              <div className="w-2 h-2 rounded-full bg-[#00A878] animate-ping" />
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
              userRole={userRole || undefined}
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

        {/* Mobile & Tablet Miniature Bottom Navigation Bar - Role & Theme Harmonized */}
        <nav
          className={`lg:hidden fixed bottom-0 left-0 right-0 h-16 border-t border-white/10 z-30 flex items-center justify-around px-2 shadow-2xl backdrop-blur-md ${
            activeRole === 'Supervisor'
              ? 'bg-[#047857]'
              : activeRole === 'Agent'
              ? 'bg-[#0A347B]'
              : 'bg-slate-900'
          }`}
        >
          {activeRole === 'Agent' ? (
            <>
              <button
                onClick={() => handleSelectSection('identification')}
                className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition ${
                  effectiveSection === 'identification' ? 'text-white font-black' : 'text-white/70 hover:text-white'
                }`}
              >
                <Users className={`w-5 h-5 ${effectiveSection === 'identification' ? 'text-emerald-400' : ''}`} />
                <span className="text-[10px] mt-0.5">Identification</span>
              </button>

              <button
                onClick={() => handleSelectSection('medical_form')}
                className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition ${
                  effectiveSection === 'medical_form' ? 'text-white font-black' : 'text-white/70 hover:text-white'
                }`}
              >
                <FileCheck className={`w-5 h-5 ${effectiveSection === 'medical_form' ? 'text-emerald-400' : ''}`} />
                <span className="text-[10px] mt-0.5">Medical Form</span>
              </button>

              <button
                onClick={() => handleSelectSection('claims')}
                className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition ${
                  effectiveSection === 'claims' ? 'text-white font-black' : 'text-white/70 hover:text-white'
                }`}
              >
                <Receipt className={`w-5 h-5 ${effectiveSection === 'claims' ? 'text-emerald-400' : ''}`} />
                <span className="text-[10px] mt-0.5">Claims</span>
              </button>

              <button
                onClick={() => handleSelectSection('enrollments')}
                className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition ${
                  effectiveSection === 'enrollments' ? 'text-white font-black' : 'text-white/70 hover:text-white'
                }`}
              >
                <UserCheck className={`w-5 h-5 ${effectiveSection === 'enrollments' ? 'text-emerald-400' : ''}`} />
                <span className="text-[10px] mt-0.5">Enrollment</span>
              </button>
            </>
          ) : activeRole === 'Supervisor' ? (
            <>
              <button
                onClick={() => handleSelectSection('dashboard')}
                className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition ${
                  effectiveSection === 'dashboard' ? 'text-white font-black' : 'text-white/70 hover:text-white'
                }`}
              >
                <LayoutDashboard className={`w-5 h-5 ${effectiveSection === 'dashboard' ? 'text-emerald-300' : ''}`} />
                <span className="text-[10px] mt-0.5">Dashboard</span>
              </button>

              <button
                onClick={() => handleSelectSection('medical_form')}
                className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition ${
                  effectiveSection === 'medical_form' ? 'text-white font-black' : 'text-white/70 hover:text-white'
                }`}
              >
                <FileCheck className={`w-5 h-5 ${effectiveSection === 'medical_form' ? 'text-emerald-300' : ''}`} />
                <span className="text-[10px] mt-0.5">Med. Forms</span>
              </button>

              <button
                onClick={() => handleSelectSection('claims_validation')}
                className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition relative ${
                  effectiveSection === 'claims_validation' ? 'text-white font-black' : 'text-white/70 hover:text-white'
                }`}
              >
                <Receipt className={`w-5 h-5 ${effectiveSection === 'claims_validation' ? 'text-emerald-300' : ''}`} />
                <span className="text-[10px] mt-0.5">Val. Claims</span>
                {pendingClaimsCount > 0 && (
                  <span className="absolute top-1 right-2 w-4 h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                    {pendingClaimsCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => handleSelectSection('enrollments_validation')}
                className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition relative ${
                  effectiveSection === 'enrollments_validation' ? 'text-white font-black' : 'text-white/70 hover:text-white'
                }`}
              >
                <UserCheck className={`w-5 h-5 ${effectiveSection === 'enrollments_validation' ? 'text-emerald-300' : ''}`} />
                <span className="text-[10px] mt-0.5">Val. Enroll.</span>
                {pendingEnrollmentsCount > 0 && (
                  <span className="absolute top-1 right-2 w-4 h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                    {pendingEnrollmentsCount}
                  </span>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleSelectSection('dashboard')}
                className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition ${
                  effectiveSection === 'dashboard' ? 'text-white font-black' : 'text-white/70 hover:text-white'
                }`}
              >
                <LayoutDashboard className={`w-5 h-5 ${effectiveSection === 'dashboard' ? 'text-emerald-400' : ''}`} />
                <span className="text-[10px] mt-0.5">Dashboard</span>
              </button>

              <button
                onClick={() => handleSelectSection('claims')}
                className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition relative ${
                  effectiveSection === 'claims' ? 'text-white font-black' : 'text-white/70 hover:text-white'
                }`}
              >
                <Receipt className={`w-5 h-5 ${effectiveSection === 'claims' ? 'text-emerald-400' : ''}`} />
                <span className="text-[10px] mt-0.5">Claims</span>
                {pendingClaimsCount > 0 && (
                  <span className="absolute top-1 right-2 w-4 h-4 bg-emerald-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                    {pendingClaimsCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => handleSelectSection('receipts')}
                className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition ${
                  effectiveSection === 'receipts' ? 'text-white font-black' : 'text-white/70 hover:text-white'
                }`}
              >
                <FileText className={`w-5 h-5 ${effectiveSection === 'receipts' ? 'text-emerald-400' : ''}`} />
                <span className="text-[10px] mt-0.5">Invoices</span>
              </button>

              <button
                onClick={() => handleSelectSection('members')}
                className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition ${
                  effectiveSection === 'members' ? 'text-white font-black' : 'text-white/70 hover:text-white'
                }`}
              >
                <Users className={`w-5 h-5 ${effectiveSection === 'members' ? 'text-emerald-400' : ''}`} />
                <span className="text-[10px] mt-0.5">Members</span>
              </button>
            </>
          )}

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
        onSuccess={async (newPwd) => {
          if (auth.currentUser) {
            try {
              const { updatePassword } = await import('firebase/auth');
              await updatePassword(auth.currentUser, newPwd);
              
              const { doc, updateDoc } = await import('firebase/firestore');
              await updateDoc(doc(db, 'accounts', auth.currentUser.uid), {
                isTemporaryPassword: false,
                mustChangePassword: false,
                passwordChangedAt: new Date().toISOString()
              });
              
              setForcedFirstLogin(false);
              setForcedPasswordExpiry(false);
              setChangePasswordModalOpen(false);
              alert("Password updated successfully.");
            } catch (error: any) {
              alert("Error updating password: " + error.message);
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
