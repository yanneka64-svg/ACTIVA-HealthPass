// === AMÉLIORATION AJOUTÉE : hook de données par domaine — voir useLogsData.ts pour le
// contexte général. `healthPolicies` n'est écrit que par cette souscription (jamais par
// `handleResetDemoData` — vérifié), candidat sûr à encapsuler intégralement.
import { useEffect, useState } from 'react';
import { HealthPolicy } from '../types';
import { FirestoreService } from '../services/firestore';

export function useHealthPoliciesData(enabled: boolean): HealthPolicy[] {
  const [healthPolicies, setHealthPolicies] = useState<HealthPolicy[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = FirestoreService.subscribeToHealthPolicies(setHealthPolicies);
    return unsubscribe;
  }, [enabled]);

  return healthPolicies;
}
