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
const pendingCaptures = new Map<
  string,
  { resolve: (r: FingerprintCaptureResult) => void; reject: (e: Error) => void }
>();

function ensureCallbacksRegistered(): void {
  if (typeof window === 'undefined' || window.__hfSecurityCaptureCallback) return;

  window.__hfSecurityCaptureCallback = (requestId, resultJson) => {
    const pending = pendingCaptures.get(requestId);
    if (!pending) return;
    pendingCaptures.delete(requestId);
    try {
      const parsed = JSON.parse(resultJson) as FingerprintCaptureResult;
      pending.resolve(parsed);
    } catch {
      pending.reject(new Error('Réponse invalide du pont HFSecurity (JSON attendu).'));
    }
  };

  window.__hfSecurityErrorCallback = (requestId, message) => {
    const pending = pendingCaptures.get(requestId);
    if (!pending) return;
    pendingCaptures.delete(requestId);
    pending.reject(new Error(message));
  };
}

/** true si l'app tourne dans la coquille Android HFSecurity (pont natif présent). */
export function isHFSecurityBridgeAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.HFSecurityBridge;
}

/**
 * Déclenche une capture d'empreinte via le capteur physique HFSecurity FP08.
 * Rejette immédiatement si le pont natif n'est pas disponible (navigateur classique) —
 * à l'appelant de retomber sur la capture simulée dans ce cas.
 */
export function captureViaHFSecurityBridge(finger: string): Promise<FingerprintCaptureResult> {
  if (!isHFSecurityBridgeAvailable()) {
    return Promise.reject(new Error('Pont HFSecurity indisponible (capteur physique non détecté).'));
  }
  ensureCallbacksRegistered();

  const requestId = `hf-${Date.now()}-${requestCounter++}`;
  return new Promise((resolve, reject) => {
    pendingCaptures.set(requestId, { resolve, reject });
    window.HFSecurityBridge!.captureFingerprint(requestId, finger);
  });
}
