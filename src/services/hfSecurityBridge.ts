// === AMÉLIORATION AJOUTÉE : intégration du capteur d'empreinte physique HFSecurity FP08
// (demande explicite, 2026-09-18). Le FP08 est un terminal Android autonome (pas un simple
// lecteur USB) : il n'existe pas d'API web standard (WebUSB/WebHID/WebAuthn) permettant à un
// navigateur de piloter directement son capteur — l'intégration réelle nécessite une petite
// application Android ("coquille") qui embarque cette app web dans une WebView, utilise le SDK
// natif HFSecurity pour piloter le capteur, et expose un pont JavaScript (window.HFSecurityBridge)
// que cette page appelle. Ce fichier définit CE contrat côté web, prêt à être branché dès que la
// documentation du SDK HFSecurity (non disponible à ce jour) permettra d'écrire la coquille
// Android correspondante. Tant qu'aucun pont n'est détecté, BiometricFingerprintModal.tsx
// continue d'utiliser sa capture simulée existante — comportement strictement inchangé.

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
  /** Score de qualité 0-100 (équivalent NFIQ) renvoyé par le SDK HFSecurity. */
  score: number;
  /** Template biométrique encodé (format exact à confirmer avec la doc SDK — ANSI 378 attendu). */
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
  return (
    typeof v.score === 'number' &&
    Number.isFinite(v.score) &&
    v.score >= 0 &&
    v.score <= 100 &&
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
