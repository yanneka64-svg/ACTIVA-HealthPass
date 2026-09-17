// === AMÉLIORATION AJOUTÉE : composant Timeline réutilisable (HealthPass 3.0, revue 2026-09-12
// — roadmap de modernisation) ===
// Lit `auditLogs` (déjà alimenté par FirestoreService.addLog à chaque décision de claim/
// enrollment, changement de compte, etc. — voir src/services/firestore.ts) et filtre côté
// client par `entityId`. Aucune nouvelle lecture Firestore, aucun nouveau champ : ce composant
// ne fait qu'afficher ce qui est déjà journalisé, jamais montré visuellement à l'utilisateur
// jusqu'ici. Utilisé par Claim360Panel ; réutilisable demain sur la fiche membre.
import React, { useMemo } from 'react';
import { Clock } from 'lucide-react';

// Les entrées de la collection `auditLogs` mélangent deux formes historiques (AuditLog et
// LoginLog — voir src/types/index.ts et FirestoreService.subscribeToLogs) ; ce composant ne lit
// que les champs communs aux entrées de type "audit" et ignore silencieusement le reste plutôt
// que d'imposer un type strict qui ne correspondrait pas aux données réelles en base.
interface TimelineLogEntry {
  id?: string;
  entityId?: string;
  entityType?: string;
  timestamp?: string;
  action?: string;
  details?: string;
  userName?: string;
  user?: string;
}

interface EntityTimelineProps {
  logs: TimelineLogEntry[];
  entityId: string;
  entityType?: string;
  title: string;
  emptyLabel: string;
}

/**
 * Filtre `logs` sur `entityId` (et `entityType` quand fourni des deux côtés) puis trie du plus
 * ancien au plus récent — extrait comme fonction pure exportée pour rester testable sans DOM
 * (ce projet n'a pas de dépendance jsdom, voir tests/excelExportGovernance.test.ts pour le même
 * choix).
 */
export function filterAndSortEntityLogs<T extends TimelineLogEntry>(logs: T[], entityId: string, entityType?: string): T[] {
  return logs
    .filter((l) => l.entityId === entityId && (!entityType || !l.entityType || l.entityType === entityType))
    .sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
}

export const EntityTimeline: React.FC<EntityTimelineProps> = ({ logs, entityId, entityType, title, emptyLabel }) => {
  const events = useMemo(
    () => filterAndSortEntityLogs(logs, entityId, entityType),
    [logs, entityId, entityType]
  );

  return (
    <div>
      <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
        <Clock className="w-3 h-3" />
        <span>{title}</span>
      </h4>
      {events.length === 0 ? (
        <p className="text-xs text-slate-400 italic">{emptyLabel}</p>
      ) : (
        <div className="space-y-0">
          {events.map((ev, idx) => (
            <div key={ev.id || idx} className="flex gap-3 relative pb-4 last:pb-0">
              {idx < events.length - 1 && (
                <span className="absolute left-[4.5px] top-[14px] bottom-0 w-px bg-slate-200" />
              )}
              <span className="w-2.5 h-2.5 rounded-full bg-[#0A347B] mt-1 flex-shrink-0 relative z-10" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800">{ev.action || ev.details}</p>
                {ev.action && ev.details && (
                  <p className="text-[11px] text-slate-500 mt-0.5">{ev.details}</p>
                )}
                <p className="text-[10.5px] text-slate-400 mt-0.5">
                  {ev.timestamp ? new Date(ev.timestamp).toLocaleString() : ''}
                  {ev.userName ? ` — ${ev.userName}` : ev.user ? ` — ${ev.user}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
