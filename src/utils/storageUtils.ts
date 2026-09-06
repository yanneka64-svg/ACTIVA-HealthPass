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
// (short, stable) in Firestore. Automatic, silent fallback to the previous behavior
// (storing the base64 string as-is) if the upload fails for any reason (Storage rules
// not yet deployed on the Firebase project, offline, quota...) — so there is NO possible
// regression versus the existing behavior: at worst, it's identical to before.
//
// IMPORTANT (deployment): like firestore.rules, the storage.rules file at the repo root
// must be deployed to the Firebase project (`firebase deploy --only storage`) for the
// upload to succeed. Until that's done, the fallback below guarantees that photo capture
// keeps working exactly as it does today.

import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';

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
 * download URL; if that fails for ANY reason, silently falls back to returning the
 * original base64 data URL unchanged (today's behavior). This means enabling Storage is
 * purely additive — it can never make photo capture worse than it already is.
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
    console.warn(
      `Firebase Storage upload failed for "${path}" — falling back to inline base64 storage in Firestore. ` +
        `This still works, but see storage.rules deployment note in storageUtils.ts.`,
      err
    );
    return dataUrl;
  }
}
