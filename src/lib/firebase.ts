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

