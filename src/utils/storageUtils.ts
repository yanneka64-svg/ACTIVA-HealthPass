// === AMÉLIORATION AJOUTÉE : upload des photos capturées vers Firebase Storage =================
// Avant ce fichier, les photos capturées via WebcamCaptureModal/BiometricCameraModal
// (assurés, enrôlements) étaient stockées telles quelles — une chaîne base64
// "data:image/jpeg;base64,..." pouvant peser 50 à 200+ Ko — DIRECTEMENT dans le champ
// `photoUrl` du document Firestore. Firebase Storage est initialisé dans lib/firebase.ts
// (export const storage = getStorage(app)) mais n'était utilisé NULLE PART dans l'application.
//
// Risque concret : un document Firestore est limité à ~1 Mo. Une fiche assuré qui accumule
// plusieurs photos (principal + ayants droit) et grandit avec l'historique (dependents[],
// claims liées) peut s'approcher de cette limite ; l'écriture échouerait alors silencieusement
// (Firestore refuse le document sans que l'UI ne l'explique clairement). C'est aussi plus lourd
// et plus lent à charger que nécessaire (chaque lecture de la liste des assurés transporte
// toutes les photos en base64, même quand on n'affiche qu'un tableau sans photo).
//
// Ce module envoie la photo vers Firebase Storage et ne stocke dans Firestore que l'URL de
// téléchargement (courte, stable). Repli automatique et silencieux vers l'ancien comportement
// (stocker la chaîne base64 telle quelle) si l'upload échoue pour une raison quelconque
// (règles Storage pas encore déployées sur le projet Firebase, hors-ligne, quota...) — donc
// AUCUNE régression possible par rapport à l'existant : au pire, c'est identique à avant.
//
// IMPORTANT (déploiement) : comme pour firestore.rules, le fichier storage.rules à la racine
// du dépôt doit être déployé sur le projet Firebase (`firebase deploy --only storage`) pour
// que l'upload réussisse. Tant que ce n'est pas fait, le repli ci-dessous garantit que la
// capture photo continue de fonctionner exactement comme aujourd'hui.

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
 */
export async function uploadPhotoOrFallback(
  dataUrl: string,
  pathPrefix: string,
  identifier: string
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    // Already a real URL (e.g. re-saving an existing member without recapturing the photo,
    // or Storage already handled it in a previous save) — nothing to upload.
    return dataUrl;
  }
  const safeIdentifier = (identifier || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = `${pathPrefix}/${safeIdentifier}-${Date.now()}.jpg`;
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
