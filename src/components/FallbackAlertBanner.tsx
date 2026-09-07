import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { subscribeFallbackEvents, FallbackEvent } from '../utils/systemStatus';

// === AMÉLIORATION AJOUTÉE : sécurité (Réconciliation 2026-09-07, décision explicite) ===
// Le filet de sécurité client sur l'approbation/rejet des claims/enrollments (voir
// workflowService.ts) reste en place tant que le déploiement des Cloud Functions n'est pas
// confirmé en production — le supprimer bloquerait totalement les approbations si les fonctions
// ne tournaient pas réellement. Mais son déclenchement doit désormais être VISIBLE à l'écran :
// cette bannière affiche chaque repli récent (Cloud Function indisponible, décision traitée
// côté client) pour qu'un incident ne passe plus inaperçu de l'utilisateur qui approuve/rejette
// un dossier — jusqu'ici seulement journalisé dans `auditLogs`, invisible à l'écran.
export function FallbackAlertBanner() {
  const [events, setEvents] = useState<FallbackEvent[]>([]);

  useEffect(() => subscribeFallbackEvents(setEvents), []);

  const recent = events.filter((e) => Date.now() - new Date(e.timestamp).getTime() < 5 * 60 * 1000);
  if (recent.length === 0) return null;

  return (
    <div className="flex items-center gap-2 bg-blue-50 border-b border-blue-300 text-blue-900 text-xs font-semibold px-4 py-2 shrink-0">
      <Info size={14} className="shrink-0" />
      <span>
        A server function ({recent.map((e) => e.fallbackName).join(', ')}) was unavailable — this action was
        processed via a client fallback instead. Please verify the result.
      </span>
    </div>
  );
}
