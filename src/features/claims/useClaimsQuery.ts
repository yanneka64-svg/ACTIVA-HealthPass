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

// === AMÉLIORATION AJOUTÉE : sécurité/robustesse (retour de revue qodo sur la PR #62,
// 2026-09-17) === Clé structurée (tableau trié, pas une chaîne pré-concaténée par espace) :
// évite toute ambiguïté théorique entre, par ex., une organisation nommée "A B" et les
// organisations "A" et "B" combinées, qui produiraient la même chaîne avec un simple `join(' ')`.
export function claimsQueryKey(assignedOrgs: string[] | null): readonly [string, string[] | null] {
  return ['claims', assignedOrgs ? [...assignedOrgs].sort() : null] as const;
}

export function useClaimsQuery(assignedOrgs: string[] | null) {
  return useQuery<Claim[]>({
    queryKey: claimsQueryKey(assignedOrgs),
    // Ne doit normalement jamais s'exécuter : le cache est alimenté exclusivement par
    // l'abonnement onSnapshot existant (App.tsx). Un tableau vide en repli documente ce
    // qu'affiche l'UI si jamais interrogé avant la première mise à jour du listener.
    queryFn: () => [] as Claim[],
    enabled: false,
    initialData: [] as Claim[],
  });
}
