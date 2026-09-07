import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  setLogLevel,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import firebaseConfig from "../../firebase-applet-config.json";

// === AMÉLIORATION AJOUTÉE : tests end-to-end (préparation Go-Live, 2026-09-07) ===
// Connexion aux émulateurs Firestore/Auth, STRICTEMENT gardée par VITE_USE_FIREBASE_EMULATOR —
// même modèle que VITE_ALLOW_DEMO_FALLBACK/VITE_ALLOW_STORAGE_BASE64_FALLBACK (src/config/) :
// n'a d'effet QUE si la valeur est exactement "true", jamais activée par défaut. Sans cette
// variable (comportement de tout build existant, dev comme production), ce fichier se comporte
// EXACTEMENT comme avant — aucun appel supplémentaire, aucune branche de code exécutée. Ajoutée
// uniquement pour permettre aux tests E2E (voir e2e/) de s'exécuter contre des émulateurs
// locaux sans jamais risquer de pointer un build réel vers eux par accident.
const useEmulator = typeof import.meta !== "undefined" && import.meta.env?.VITE_USE_FIREBASE_EMULATOR === "true";

// Silence non-fatal Firestore network transition warnings in development iframe
try {
  setLogLevel("silent");
} catch {
  // Ignore if setLogLevel not supported
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let firestoreDb;
try {
  firestoreDb = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
      experimentalForceLongPolling: true,
      ignoreUndefinedProperties: true,
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch (e1) {
  try {
    firestoreDb = initializeFirestore(
      app,
      {
        localCache: memoryLocalCache(),
        experimentalForceLongPolling: true,
        ignoreUndefinedProperties: true,
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch (e2) {
    firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = firestoreDb;
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// === AMÉLIORATION AJOUTÉE : tests end-to-end (préparation Go-Live, 2026-09-07) ===
// `(globalThis as any)` évite d'exiger un émulateur unique par onglet en cas de HMR (Firebase
// lève une exception si connectXEmulator est appelé deux fois sur la même instance) — inoffensif
// puisque cette branche n'existe que sous useEmulator, jamais atteinte en production.
if (useEmulator) {
  const g = globalThis as unknown as { __ACTIVA_EMULATORS_CONNECTED__?: boolean };
  if (!g.__ACTIVA_EMULATORS_CONNECTED__) {
    g.__ACTIVA_EMULATORS_CONNECTED__ = true;
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    // eslint-disable-next-line no-console
    console.warn("[firebase.ts] VITE_USE_FIREBASE_EMULATOR=true — connected to LOCAL emulators (Firestore:8080, Auth:9099). Never set this in production.");
  }
}

// === AMÉLIORATION AJOUTÉE : protection des données (revue 2026-09-05, section 3.4) ===
// Constat : `firebase-applet-config.json.recaptchaSiteKey` est vide — Firebase App Check n'est
// pas configuré. Pour une application de santé exposée publiquement (écran de connexion
// accessible sans authentification préalable), App Check est la protection standard contre les
// clients non légitimes (scripts automatisés, clones de l'API) — en complément, jamais en
// remplacement, du rate limiting déjà en place côté Cloud Function (resolveLoginIdentifier).
// Initialisation conditionnelle : n'a aucun effet tant qu'une clé de site reCAPTCHA v3 n'est
// pas renseignée dans firebase-applet-config.json (déploiement requis, hors accès de cette
// session — voir Firebase Console > App Check > enregistrer l'app avec reCAPTCHA v3, PUIS
// activer l'application des règles pour Firestore/Storage/Functions, sans quoi ce jeton n'est
// jamais vérifié côté serveur). Câblage sans risque de régression : si la clé est absente,
// aucun appel Firebase n'est modifié par rapport au comportement actuel.
if (firebaseConfig.recaptchaSiteKey) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(firebaseConfig.recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.warn("Firebase App Check initialization notice:", err);
  }
}

// === AMÉLIORATION AJOUTÉE : câblage des Cloud Functions (Phase 3/5) — sur demande explicite,
// avec repli automatique. Chaque appelant (cardNumberService.ts, workflowService.ts) essaie
// d'abord la Cloud Function correspondante puis, en cas d'échec pour QUELQUE RAISON QUE CE
// SOIT (fonction non déployée, hors-ligne, erreur serveur...), retombe silencieusement sur la
// logique cliente existante, inchangée — voir le commentaire dans chaque fonction concernée.
// Aucune fonction n'étant encore réellement déployée dans ce projet à ce jour, ce câblage n'a
// aujourd'hui aucun effet observable : chaque appel échoue et retombe systématiquement sur le
// chemin client, exactement comme avant.
export const functions = getFunctions(app);

// Secondary app for admin to create users without being logged out
export const secondaryApp = getApps().some((a) => a.name === "Secondary")
  ? getApp("Secondary")
  : initializeApp(firebaseConfig, "Secondary");
export const secondaryAuth = getAuth(secondaryApp);
if (useEmulator) {
  const g = globalThis as unknown as { __ACTIVA_SECONDARY_EMULATOR_CONNECTED__?: boolean };
  if (!g.__ACTIVA_SECONDARY_EMULATOR_CONNECTED__) {
    g.__ACTIVA_SECONDARY_EMULATOR_CONNECTED__ = true;
    connectAuthEmulator(secondaryAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
}

// === AMÉLIORATION AJOUTÉE : correctif LOW (revue de code du 3e3bea9) — l'appel
// testConnection() ci-avant ciblait `test/connection`, une collection sans aucune règle dédiée
// dans firestore.rules (donc refusée par défaut, "permission-denied", pour tout le monde, tout
// le temps — y compris un Admin connecté). Il n'accomplissait donc jamais ce pour quoi il était
// prévu (détecter un état hors-ligne) et générait un appel réseau et une entrée d'erreur
// Firestore inutiles à chaque chargement de page. Retiré plutôt que de créer une règle
// supplémentaire pour une collection qui n'a aucun autre usage réel dans l'application.

