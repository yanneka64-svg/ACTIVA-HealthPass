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

  // === AMÉLIORATION AJOUTÉE : diagnostic (retour utilisateur, 2026-09-07) — le message d'erreur
  // Firestore réel (ex. "Missing or insufficient permissions.") était déjà capturé
  // (systemStatus.ts, reportSyncIssue) mais jamais affiché : seul console.warn le montrait,
  // invisible pour quiconque n'ouvre pas les outils de développement. Affiché ici en toutes
  // lettres pour que la cause exacte soit immédiatement visible à l'écran.
  return (
    <div className="flex items-start gap-2 bg-amber-50 border-b border-amber-300 text-amber-900 text-xs font-semibold px-4 py-2 shrink-0">
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <div>
        <div>
          Data synchronization issue ({issues.map((i) => i.collectionName).join(', ')}) — some information may be
          temporarily incomplete. This is NOT demonstration data.
        </div>
        <div className="mt-0.5 font-normal text-amber-800">
          {issues.map((i) => (
            <div key={i.collectionName}>
              <span className="font-semibold">{i.collectionName}:</span> {i.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
