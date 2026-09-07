import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { subscribeSyncIssues, SyncIssue } from '../utils/systemStatus';

// === AMÉLIORATION AJOUTÉE : sécurité (Revue complète 2026-09-06, finding #6 — CRITIQUE) ===
// Bannière visible affichée quand une collection Firestore est réellement en erreur (règles,
// réseau, service indisponible) alors que le repli vers des données de démonstration est
// désactivé (comportement par défaut en production — voir src/config/demoFallback.ts). Sans
// cette bannière, un incident de synchronisation serait invisible pour l'utilisateur : il verrait
// simplement un écran vide, indiscernable d'une absence légitime de données.
export function SyncIssueBanner() {
  const [issues, setIssues] = useState<SyncIssue[]>([]);

  useEffect(() => subscribeSyncIssues(setIssues), []);

  if (issues.length === 0) return null;

  return (
    <div className="flex items-center gap-2 bg-amber-50 border-b border-amber-300 text-amber-900 text-xs font-semibold px-4 py-2 shrink-0">
      <AlertTriangle size={14} className="shrink-0" />
      <span>
        Data synchronization issue ({issues.map((i) => i.collectionName).join(', ')}) — some information may be
        temporarily incomplete. This is NOT demonstration data.
      </span>
    </div>
  );
}
