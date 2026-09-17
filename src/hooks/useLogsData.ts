// === AMÉLIORATION AJOUTÉE : hook de données par domaine — voir FRONTEND_CRITICAL_ANALYSIS.md
// §2 ("App.tsx... détenteur de tout l'état métier... abonnement Firestore pour ces 12
// collections"). Extrait la souscription `logs` (`LoginLog[]`) hors de App.tsx, sans changer
// son comportement : ce state n'était déjà écrit QUE par cette souscription (jamais par
// `handleResetDemoData` ni ailleurs dans App.tsx — vérifié), c'est donc un candidat sûr à
// encapsuler intégralement (contrairement à `providers`/`ceilings`, qui restent dans App.tsx
// car `handleResetDemoData` les réécrit directement).
import { useEffect, useState } from 'react';
import { LoginLog } from '../types';
import { FirestoreService } from '../services/firestore';

/** `enabled` mirrors the existing gate in App.tsx: only Admin subscribes to `logs`. */
export function useLogsData(enabled: boolean): LoginLog[] {
  const [logs, setLogs] = useState<LoginLog[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = FirestoreService.subscribeToLogs(setLogs);
    return unsubscribe;
  }, [enabled]);

  return logs;
}
