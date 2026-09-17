// === AMÉLIORATION AJOUTÉE : hook de données par domaine — voir useLogsData.ts pour le
// contexte général. `policyPayments` n'est écrit que par cette souscription (jamais par
// `handleResetDemoData` — vérifié), candidat sûr à encapsuler intégralement. `orgScope` reste
// un paramètre explicite (au lieu d'être figé) pour préserver le cloisonnement par
// organisation déjà en place (Phase 1.3, voir App.tsx `assignedOrgs`).
import { useEffect, useState } from 'react';
import { PolicyPayment } from '../types';
import { FirestoreService } from '../services/firestore';

export function usePolicyPaymentsData(enabled: boolean, orgScope: string[] | null): PolicyPayment[] {
  const [policyPayments, setPolicyPayments] = useState<PolicyPayment[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = FirestoreService.subscribeToPolicyPayments(setPolicyPayments, orgScope);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, orgScope ? orgScope.slice().sort().join(' ') : '']);

  return policyPayments;
}
