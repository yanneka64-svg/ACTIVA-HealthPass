// === AMÉLIORATION AJOUTÉE : Phase 3 du plan de durcissement (2026-09-17) — première
// introduction de @tanstack/react-query dans ce dépôt, sur le module `claims`. L'abonnement
// Firestore temps réel existant (FirestoreService.subscribeToClaims, voir App.tsx) reste
// l'UNIQUE source de vérité : il continue d'alimenter `queryClient` via `setQueryData` à chaque
// mise à jour, exactement comme avant vers son `useState` local. Ce hook ne fait qu'exposer ce
// même cache en lecture via `useQuery` — `enabled: false` et un `queryFn` qui ne devrait jamais
// s'exécuter, puisque aucune donnée n'est censée être absente du cache une fois l'abonnement
// actif (voir src/lib/queryClient.ts pour les options qui désactivent tout refetch automatique).
// Aucun consommateur ne lit encore depuis ce hook à ce stade — introduction volontairement
// isolée, un composant sera migré séparément une fois ce socle validé.
import { useQuery } from '@tanstack/react-query';
import { Claim } from '../../types';

export function claimsQueryKey(orgScopeKey: string): readonly [string, string] {
  return ['claims', orgScopeKey] as const;
}

export function useClaimsQuery(orgScopeKey: string) {
  return useQuery<Claim[]>({
    queryKey: claimsQueryKey(orgScopeKey),
    // Ne doit normalement jamais s'exécuter : le cache est alimenté exclusivement par
    // l'abonnement onSnapshot existant (App.tsx). Un tableau vide en repli documente ce
    // qu'affiche l'UI si jamais interrogé avant la première mise à jour du listener.
    queryFn: () => [] as Claim[],
    enabled: false,
    initialData: [] as Claim[],
  });
}
