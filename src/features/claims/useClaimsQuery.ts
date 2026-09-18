// === AMÉLIORATION AJOUTÉE : Phase 3 du plan de durcissement (2026-09-17) — première
// introduction de @tanstack/react-query dans ce dépôt, sur le module `claims`. L'abonnement
// Firestore temps réel existant (FirestoreService.subscribeToClaims, voir App.tsx) reste
// l'UNIQUE source de vérité : il continue d'alimenter `queryClient` via `setQueryData` à chaque
// mise à jour, exactement comme avant vers son `useState` local. Ce hook ne fait qu'exposer ce
// même cache en lecture via `useQuery` (voir src/lib/queryClient.ts pour les options qui
// désactivent tout refetch automatique). Aucun consommateur ne lit encore depuis ce hook à ce
// stade — introduction volontairement isolée, un composant sera migré séparément une fois ce
// socle validé.
import { useQuery, skipToken } from '@tanstack/react-query';
import { Claim } from '../../types';
import { getFullDemoData } from '../../services/seedData';

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
    // === AMÉLIORATION AJOUTÉE : correctif (retour de revue qodo sur la PR #62, 2026-09-17) ===
    // `skipToken` (pas un `queryFn` qui retourne `[]` avec `enabled: false`) : ce dernier
    // laissait le `refetch()` exposé par `useQuery` réellement exécutable manuellement, ce qui
    // aurait écrasé les vraies données mises en cache par l'abonnement Firestore avec un tableau
    // vide. `skipToken` désactive la requête au niveau du type même : aucune fonction à invoquer,
    // ni automatiquement ni via un `refetch()` manuel — le cache reste in fine uniquement piloté
    // par `queryClient.setQueryData` (App.tsx).
    queryFn: skipToken,
    // === AMÉLIORATION AJOUTÉE : migration du premier consommateur (AgentClaimsView, 2026-09-18)
    // === Même repli de démo que `useState(() => demoData.sampleClaims)` dans App.tsx : sans ce
    // repli, un composant lisant depuis ce cache verrait une liste vide pendant le court instant
    // avant que l'abonnement Firestore n'ait livré son premier instantané (App.tsx alimente
    // `claims` avec ce même repli dès le premier rendu) — comportement désormais identique.
    // Fonction (pas une valeur directe) : évaluée une seule fois par instance de requête, comme
    // le ferait `useState(() => ...)`.
    initialData: () => (getFullDemoData().sampleClaims || []) as Claim[],
  });
}
