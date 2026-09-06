// === ADDED IMPROVEMENT: upload captured photos to Firebase Storage =================
// Before this file, photos captured via WebcamCaptureModal/BiometricCameraModal
// (members, enrollments) were stored as-is — a base64 string
// "data:image/jpeg;base64,..." that can weigh 50 to 200+ KB — DIRECTLY in the
// `photoUrl` field of the Firestore document. Firebase Storage is initialized in
// lib/firebase.ts (export const storage = getStorage(app)) but was used NOWHERE in the app.
//
// Concrete risk: a Firestore document is limited to ~1 MiB. A member record that
// accumulates several photos (principal + dependents) and grows with history
// (dependents[], linked claims) can approach that limit; the write would then fail
// silently (Firestore rejects the document without the UI explaining it clearly). It's
// also heavier and slower to load than necessary (every read of the member list carries
// every photo as base64, even when only a table with no photo is displayed).
//
// This module sends the photo to Firebase Storage and only stores the download URL
// (short, stable) in Firestore.
//
// === AMÉLIORATION AJOUTÉE : sécurité (Revue complète 2026-09-06, finding #7 — HIGH) ===
// Le repli silencieux vers le stockage base64 dans Firestore, décrit ci-dessus dans la version
// initiale de ce commentaire, a été RETIRÉ (fail-closed par défaut) : il réintroduisait
// exactement les risques (dépassement de la limite ~1 MiB, données biométriques hors
// cloisonnement par organisation) que ce module visait à éliminer. Voir
// `uploadPhotoOrFallback` ci-dessous et `src/config/storageFallback.ts` pour le détail et
// l'interrupteur de secours explicite (désactivé par défaut).
//
// IMPORTANT (deployment): comme firestore.rules, le fichier storage.rules à la racine du dépôt
// doit être déployé sur le projet Firebase (`firebase deploy --only storage`) pour que l'upload
// réussisse. Sans ce déploiement, la capture de photo échoue désormais explicitement (voir
// storageFallback.ts) au lieu de dégrader silencieusement le stockage.

import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { isBase64PhotoFallbackAllowed } from '../config/storageFallback';

/**
 * Uploads a base64 "data:...;base64,..." image URL to Firebase Storage under `path` and
 * returns its public download URL. Throws on any failure (network, permission-denied,
 * quota) — callers should use `uploadPhotoOrFallback` unless they need to handle the
 * failure themselves.
 */
export async function uploadDataUrlToStorage(dataUrl: string, path: string): Promise<string> {
  const storageRef = ref(storage, path);
  await uploadString(storageRef, dataUrl, 'data_url');
  return await getDownloadURL(storageRef);
}

/**
 * Safe wrapper: tries to upload the captured photo to Firebase Storage and return its
 * download URL.
 *
 * `pathPrefix` groups uploads by context (e.g. 'member-photos', 'enrollment-photos') so
 * files are easy to find/administer in the Storage console; `identifier` should be a
 * stable-ish id (card number, temp id) to avoid collisions.
 *
 * === AMÉLIORATION AJOUTÉE : sécurité (audit 2026-09-05, SEC-04 — CRITIQUE) ===
 * Nouveau paramètre optionnel `organization` : quand il est fourni, le fichier est déposé sous
 * `{pathPrefix}/{organization}/{identifier}-{timestamp}.jpg` plutôt que directement sous
 * `{pathPrefix}/...`. Ce segment supplémentaire permet à `storage.rules` de restreindre
 * l'accès par organisation (comme `hasOrgAccess()` le fait déjà pour Firestore), corrigeant
 * l'absence totale de cloisonnement documentée dans l'audit de sécurité. Rétrocompatible :
 * si `organization` est omis ou vide, le comportement (et le chemin produit) reste EXACTEMENT
 * celui d'avant ce correctif — les fichiers déjà déposés sous l'ancien format plat restent
 * accessibles (voir la règle `legacy` dans storage.rules).
 *
 * === AMÉLIORATION AJOUTÉE : sécurité (Revue complète 2026-09-06, finding #7 — HIGH) ===
 * FAIL-CLOSED PAR DÉFAUT : cette fonction ne retombe plus silencieusement sur le stockage en
 * base64 dans Firestore si l'upload Storage échoue — elle relance l'erreur, à charge de
 * l'appelant de bloquer la sauvegarde et d'afficher un message clair (voir MembersView.tsx,
 * AgentEnrollmentsView.tsx, EnrollmentsView.tsx). Voir src/config/storageFallback.ts pour
 * l'interrupteur de secours explicite (désactivé par défaut) si Storage s'avère non opérationnel
 * en production après ce correctif.
 */
export async function uploadPhotoOrFallback(
  dataUrl: string,
  pathPrefix: string,
  identifier: string,
  organization?: string
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    // Already a real URL (e.g. re-saving an existing member without recapturing the photo,
    // or Storage already handled it in a previous save) — nothing to upload.
    return dataUrl;
  }
  const safeIdentifier = (identifier || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeOrg = organization ? organization.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
  const path = safeOrg
    ? `${pathPrefix}/${safeOrg}/${safeIdentifier}-${Date.now()}.jpg`
    : `${pathPrefix}/${safeIdentifier}-${Date.now()}.jpg`;
  try {
    return await uploadDataUrlToStorage(dataUrl, path);
  } catch (err) {
    if (isBase64PhotoFallbackAllowed()) {
      console.warn(
        `Firebase Storage upload failed for "${path}" — VITE_ALLOW_STORAGE_BASE64_FALLBACK is ` +
          `enabled, falling back to inline base64 storage in Firestore (legacy behavior).`,
        err
      );
      return dataUrl;
    }
    console.error(`Firebase Storage upload failed for "${path}" — failing closed (no base64 fallback).`, err);
    throw new Error(
      'Photo could not be saved securely to Firebase Storage. Please check your connection and try again, or contact your administrator if the problem persists.'
    );
  }
}
