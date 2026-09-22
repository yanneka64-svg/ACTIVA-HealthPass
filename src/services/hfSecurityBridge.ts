// === AMÉLIORATION AJOUTÉE : intégration du capteur d'empreinte physique HFSecurity FP08
// (demande explicite, 2026-09-18). Le FP08 est un terminal Android autonome (pas un simple
// lecteur USB) : il n'existe pas d'API web standard (WebUSB/WebHID/WebAuthn) permettant à un
// navigateur de piloter directement son capteur — l'intégration réelle nécessite une petite
// application Android ("coquille") qui embarque cette app web dans une WebView, utilise le SDK
// natif HFSecurity pour piloter le capteur, et expose un pont JavaScript (window.HFSecurityBridge)
// que cette page appelle. Ce fichier définit CE contrat côté web. Tant qu'aucun pont n'est
// détecté, BiometricFingerprintModal.tsx continue d'utiliser sa capture simulée existante —
// comportement strictement inchangé.
//
// === AMÉLIORATION AJOUTÉE : API native confirmée (2026-09-22) — l'utilisateur a fourni le
// projet source Android de référence du terminal ("MidX", com.hf.newmidx), qui embarque
// littéralement le SDK visé ici : `MidX/app/libs/libNewHFFingerSDK_v3.0.4_c9.aar`, utilisé par
// `MidX/app/src/main/java/com/hf/newmidx/fingerprint/FingerPrintWithDBActivity.java`. La classe
// `com.hfteco.finger.FingerSDK` de ce .aar a en outre été décompilée (javap) pour confirmer les
// signatures exactes au-delà de ce que ce seul écran de démo utilise. Contrat natif confirmé,
// qu'une future coquille Android devra brancher sur le pont JavaScript défini ci-dessous :
//   - Classe : `com.hfteco.finger.FingerSDK`.
//   - Init : `new FingerSDK(Activity, OnSdkInitListener)` — callback asynchrone
//     `initResult(int code, String message)` ; succès = `code == FingerSDK.RESULT_OK`.
//   - Cycle de vie : `fingerSDK.launch()` à la reprise de l'activité hôte, `fingerSDK.release()`
//     à sa mise en pause — à faire correspondre au cycle de vie de la WebView de la coquille.
//   - Capture : `fingerSDK.captureBytes(FingerSDK.TEMPLEATES type, OnCaptureBytesListener)` →
//     callback `capture(int code, byte[] bytes, Bitmap image, byte[] template)` (signature
//     confirmée par décompilation, `OnCaptureBytesListener.class`). `type` sélectionne le FORMAT
//     du template — valeurs confirmées de l'enum `FingerSDK.TEMPLEATES` : `GAT_1012_2019`,
//     `ISO_19794_2_2005`, `ISO_19794_2_2011`, `ANSI_378_2004`, `ANSI_378_2009`, `ISO_On_card` —
//     PAS quel doigt est scanné : le SDK natif n'a aucune notion de "doigt", c'est une convention
//     purement applicative (déjà comment ce fichier gère `finger` — voir plus bas).
//   - ⚠️ Score de qualité — PAS disponible directement : la signature confirmée de
//     `OnCaptureBytesListener.capture(int, byte[], Bitmap, byte[])` ne porte aucun paramètre de
//     score. `FingerSDK` a un champ privé `MIN_MINUTIAE_COUNT` et une méthode privée `capture()`
//     distincte (donc inaccessibles depuis la coquille), ce qui suggère qu'un score/nombre de
//     minuties existe en interne au SDK sans être exposé par cet appel public. Piste à explorer
//     avant de finaliser la coquille : le premier paramètre `byte[] bytes` du callback (distinct
//     du dernier `byte[] template`) encode peut-être une image brute porteuse d'une info de
//     qualité, à instrumenter/logguer sur un vrai capteur — sinon contacter le support HFSecurity.
//     `isValidCaptureResult` ci-dessous exige `score` 0-100 : la coquille devra soit dériver cette
//     valeur d'une source confirmée, soit ce champ devra être rendu optionnel côté contrat web.
//   - Vérification/correspondance : `fingerSDK.compareTemplateBytes(TEMPLEATES, byte[], byte[])`
//     → un score entier (usage différent de la capture : compare DEUX templates déjà capturés).
//     L'app de référence utilise un seuil `score > 80` pour déclarer une correspondance ; plage
//     exacte (0-100 ? 0-1000 ?) non confirmée par la décompilation seule — à vérifier sur un vrai
//     capteur. Il existe aussi `compareBitmap(Bitmap, Bitmap)`, une variante non explorée ici.
//   - Encodage du template : l'app de référence convertit `byte[] template` en `String` via
//     l'encodage ISO8859-1 pour le stocker dans sa propre base. Pour LE TRANSPORT JSON à travers
//     le pont JS (`resultJson` ci-dessous), préférer un encodage **base64** du même `byte[]` —
//     ISO8859-1 peut produire des caractères de contrôle non sûrs à embarquer tels quels dans une
//     chaîne JSON, alors que base64 est le choix standard pour transporter un blob binaire en JSON.
//   - Le SDK gère lui-même la communication avec le capteur physique interne (méthodes privées
//     `checkUsbDevices()`/`setupFingerDevice()`/`fingerprintPower(boolean)` observées par
//     décompilation) — cohérent avec le manifeste de l'app de référence qui déclare
//     `<uses-feature android:name="android.hardware.usb.host" android:required="true" />` : la
//     coquille Android devra probablement déclarer la même feature.
// Ce qui reste réellement à écrire : la coquille Android elle-même (projet séparé, hors de ce
// dépôt web — voir android-bridge/ à la racine du repo pour une ébauche non testée, qui documente
// aussi le point ouvert du score de qualité ci-dessus).

/** Référence exacte du capteur physique visé par cette intégration. */
export const HF_SECURITY_DEVICE_INFO = {
  deviceType: 'Fingerprint Handheld Terminal',
  brand: 'HFSecurity',
  model: 'FP08',
  serialNumber: 'HF20260303001123B62',
  manufacturer: 'Made in China (www.hfsecurity.cn)',
  // Caractéristiques capteur communiquées par l'utilisateur (fiche produit HFSecurity FP08) :
  sensor: 'Capacitive FAP10 TCS1 (optional FBI-certified sensor)',
  standards: 'ANSI 378/381, ISO 19794-2/-4',
  resolutionDpi: 508,
} as const;

export interface FingerprintCaptureResult {
  /**
   * Score de qualité 0-100 (équivalent NFIQ) attendu par ce contrat. Non confirmé disponible
   * directement depuis `FingerSDK.captureBytes(...)` — voir le commentaire d'API en tête de
   * fichier ("⚠️ Score de qualité") : sa source exacte côté SDK natif reste à déterminer.
   *
   * === AMÉLIORATION AJOUTÉE : revue automatisée (2026-09-22) — rendu optionnel plutôt que
   * fabriqué. Tant que la source native du score n'est pas confirmée (voir README.md
   * d'android-bridge/), une coquille honnête ne peut pas fournir cette valeur ; un champ
   * obligatoire aurait forcé soit une valeur inventée soit un rejet systématique de toute
   * capture réelle par `isValidCaptureResult` ci-dessous (ni l'un ni l'autre n'est acceptable).
   * L'appelant (BiometricFingerprintModal.tsx) applique déjà son propre repli d'affichage.
   */
  score?: number;
  /**
   * Template biométrique encodé — format exact (ANSI 378 vs ISO 19794-2/-4) déterminé par le
   * `FingerSDK.TEMPLEATES` choisi côté natif au moment de `captureBytes(...)` (voir le
   * commentaire d'API en tête de fichier). Encodage texte recommandé pour ce champ : **base64**
   * du `byte[] template` renvoyé par le SDK, pas l'ISO8859-1 utilisé en interne par l'app de
   * référence HFSecurity (non garanti JSON-safe).
   */
  template: string;
  finger: string;
}

/**
 * Poignée d'une capture en cours : `promise` se règle sur le résultat (ou une erreur), `cancel`
 * abandonne la requête (le composant appelant n'attend plus la réponse — voir `cancel` plus bas
 * pour ce que cela signifie côté module).
 */
export interface CaptureHandle {
  requestId: string;
  promise: Promise<FingerprintCaptureResult>;
  cancel: () => void;
}

// === AMÉLIORATION AJOUTÉE : revue automatisée (2026-09-18) — sans délai, une requête dont la
// coquille native ne répond jamais restait "capturing" indéfiniment ; sans validation, une
// réponse JSON syntaxiquement valide mais incomplète (score hors bornes, template vide...)
// était acceptée comme une capture réussie.
const CAPTURE_TIMEOUT_MS = 30_000;

function isValidCaptureResult(value: unknown): value is FingerprintCaptureResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  // === AMÉLIORATION AJOUTÉE : revue automatisée (2026-09-22) — `score` est optionnel (voir
  // FingerprintCaptureResult.score ci-dessus) : absent/null accepté, mais s'il est présent il
  // doit rester dans les bornes 0-100 comme avant.
  return (
    (v.score === undefined || v.score === null ||
      (typeof v.score === 'number' && Number.isFinite(v.score) && v.score >= 0 && v.score <= 100)) &&
    typeof v.template === 'string' &&
    v.template.length > 0 &&
    typeof v.finger === 'string' &&
    v.finger.length > 0
  );
}

interface HFSecurityBridgeApi {
  /**
   * Déclenche une capture côté natif. Le résultat n'est PAS retourné directement (limite du pont
   * JavaScript Android `addJavascriptInterface`, purement asynchrone) : la coquille Android doit
   * rappeler `window.__hfSecurityCaptureCallback(requestId, resultJson)` en cas de succès, ou
   * `window.__hfSecurityErrorCallback(requestId, message)` en cas d'échec.
   */
  captureFingerprint: (requestId: string, finger: string) => void;
}

declare global {
  interface Window {
    HFSecurityBridge?: HFSecurityBridgeApi;
    __hfSecurityCaptureCallback?: (requestId: string, resultJson: string) => void;
    __hfSecurityErrorCallback?: (requestId: string, message: string) => void;
  }
}

let requestCounter = 0;

interface PendingCapture {
  resolve: (r: FingerprintCaptureResult) => void;
  reject: (e: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

const pendingCaptures = new Map<string, PendingCapture>();

function settlePending(requestId: string): PendingCapture | undefined {
  const pending = pendingCaptures.get(requestId);
  if (!pending) return undefined;
  clearTimeout(pending.timeoutHandle);
  pendingCaptures.delete(requestId);
  return pending;
}

function ensureCallbacksRegistered(): void {
  if (typeof window === 'undefined' || window.__hfSecurityCaptureCallback) return;

  window.__hfSecurityCaptureCallback = (requestId, resultJson) => {
    const pending = settlePending(requestId);
    if (!pending) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(resultJson);
    } catch {
      pending.reject(new Error('Réponse invalide du pont HFSecurity (JSON attendu).'));
      return;
    }
    if (!isValidCaptureResult(parsed)) {
      pending.reject(new Error('Réponse invalide du pont HFSecurity (champs manquants ou hors limites).'));
      return;
    }
    pending.resolve(parsed);
  };

  window.__hfSecurityErrorCallback = (requestId, message) => {
    const pending = settlePending(requestId);
    if (!pending) return;
    pending.reject(new Error(message));
  };
}

/** true si l'app tourne dans la coquille Android HFSecurity (pont natif présent). */
export function isHFSecurityBridgeAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.HFSecurityBridge;
}

/**
 * Déclenche une capture d'empreinte via le capteur physique HFSecurity FP08. Retourne une
 * poignée dont `promise` se règle sur le résultat (validé) ou une erreur — délai dépassé,
 * échec natif, réponse malformée — et dont `cancel()` abandonne la requête (l'appelant doit
 * l'invoquer à la fermeture/au démontage de la modale, ou avant une nouvelle capture, pour
 * qu'une réponse tardive de la coquille native n'écrase jamais un état plus récent).
 */
export function captureViaHFSecurityBridge(finger: string): CaptureHandle {
  const requestId = `hf-${Date.now()}-${requestCounter++}`;

  if (!isHFSecurityBridgeAvailable()) {
    return {
      requestId,
      cancel: () => {},
      promise: Promise.reject(new Error('Pont HFSecurity indisponible (capteur physique non détecté).')),
    };
  }
  ensureCallbacksRegistered();

  const promise = new Promise<FingerprintCaptureResult>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      pendingCaptures.delete(requestId);
      reject(new Error('Délai de capture dépassé (le capteur HFSecurity FP08 n\'a pas répondu).'));
    }, CAPTURE_TIMEOUT_MS);

    pendingCaptures.set(requestId, { resolve, reject, timeoutHandle });

    try {
      window.HFSecurityBridge!.captureFingerprint(requestId, finger);
    } catch (err) {
      clearTimeout(timeoutHandle);
      pendingCaptures.delete(requestId);
      reject(err instanceof Error ? err : new Error('Échec du déclenchement de la capture HFSecurity.'));
    }
  });

  const cancel = () => {
    const pending = pendingCaptures.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timeoutHandle);
    pendingCaptures.delete(requestId);
    // La promesse elle-même reste non résolue : l'appelant l'a abandonnée (voir
    // BiometricFingerprintModal.tsx, qui compare sa propre référence avant d'agir sur le
    // résultat) — la retenir ainsi évite un rejet non intercepté si plus personne n'écoute.
  };

  return { requestId, promise, cancel };
}
