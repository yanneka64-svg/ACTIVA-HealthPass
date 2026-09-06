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
