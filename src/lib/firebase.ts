import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  setLogLevel,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
} from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import firebaseConfig from "../../firebase-applet-config.json";

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

// === AMÉLIORATION AJOUTÉE : correctif LOW (revue de code du 3e3bea9) — l'appel
// testConnection() ci-avant ciblait `test/connection`, une collection sans aucune règle dédiée
// dans firestore.rules (donc refusée par défaut, "permission-denied", pour tout le monde, tout
// le temps — y compris un Admin connecté). Il n'accomplissait donc jamais ce pour quoi il était
// prévu (détecter un état hors-ligne) et générait un appel réseau et une entrée d'erreur
// Firestore inutiles à chaque chargement de page. Retiré plutôt que de créer une règle
// supplémentaire pour une collection qui n'a aucun autre usage réel dans l'application.

