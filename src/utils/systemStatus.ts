// === AMÉLIORATION AJOUTÉE : sécurité (Revue complète 2026-09-06, finding #6 — CRITIQUE) ===
// Petit bus d'état minimal (aucune dépendance) permettant à src/services/firestore.ts de
// signaler un incident de synchronisation Firestore (collection en erreur, sans repli vers des
// données de démonstration — voir src/config/demoFallback.ts) à un composant d'affichage
// global (bannière), sans coupler firestore.ts à React ni à un composant UI précis.
export interface SyncIssue {
  collectionName: string;
  message: string;
  timestamp: string;
}

type Listener = (issues: SyncIssue[]) => void;

let issues: SyncIssue[] = [];
let listeners: Listener[] = [];

function notify() {
  listeners.forEach((l) => l(issues));
}

/** Appelé quand un `subscribeToX` reçoit une erreur Firestore ET que le repli vers des données
 *  de démonstration est désactivé (comportement par défaut en production). */
export function reportSyncIssue(collectionName: string, error?: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  issues = [
    ...issues.filter((i) => i.collectionName !== collectionName),
    { collectionName, message, timestamp: new Date().toISOString() },
  ];
  notify();
}

/** Appelé quand une collection en erreur se resynchronise correctement (retire son entrée). */
export function clearSyncIssue(collectionName: string) {
  if (!issues.some((i) => i.collectionName === collectionName)) return;
  issues = issues.filter((i) => i.collectionName !== collectionName);
  notify();
}

export function getSyncIssues(): SyncIssue[] {
  return issues;
}

export function subscribeSyncIssues(listener: Listener): () => void {
  listeners.push(listener);
  listener(issues);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

// === AMÉLIORATION AJOUTÉE : sécurité (Réconciliation 2026-09-07, décision explicite sur le
// fallback client claims/enrollments) === Décision retenue : le filet de sécurité client sur
// l'approbation/rejet des claims/enrollments (voir src/services/workflowService.ts) reste en
// place tant que le déploiement des Cloud Functions n'est pas confirmé en production — le
// supprimer bloquerait totalement les approbations si les fonctions ne tournaient pas
// réellement. Mais son déclenchement doit désormais être VISIBLE à l'écran (pas seulement
// journalisé dans `auditLogs`, voir fallbackTelemetry.ts), pour qu'un incident Cloud Function ne
// passe plus inaperçu de l'utilisateur qui approuve/rejette un dossier.
export interface FallbackEvent {
  fallbackName: string;
  detail?: string;
  timestamp: string;
}

type FallbackListener = (events: FallbackEvent[]) => void;

let fallbackEvents: FallbackEvent[] = [];
let fallbackListeners: FallbackListener[] = [];

function notifyFallback() {
  fallbackListeners.forEach((l) => l(fallbackEvents));
}

/** Appelé quand un appel Cloud Function retombe sur la logique client (voir
 *  src/utils/fallbackTelemetry.ts, appelé depuis workflowService.ts/policyEngine.ts/
 *  cardNumberService.ts). Best-effort, purement informatif pour l'affichage. */
export function reportFallbackEvent(fallbackName: string, detail?: string) {
  fallbackEvents = [...fallbackEvents, { fallbackName, detail, timestamp: new Date().toISOString() }].slice(-20);
  notifyFallback();
}

export function getFallbackEvents(): FallbackEvent[] {
  return fallbackEvents;
}

export function subscribeFallbackEvents(listener: FallbackListener): () => void {
  fallbackListeners.push(listener);
  listener(fallbackEvents);
  return () => {
    fallbackListeners = fallbackListeners.filter((l) => l !== listener);
  };
}

/** Réservé aux tests : vide la liste des événements de repli entre deux scénarios. */
export function clearAllFallbackEvents() {
  fallbackEvents = [];
  notifyFallback();
}
