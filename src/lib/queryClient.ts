// === AMÉLIORATION AJOUTÉE : Phase 3 du plan de durcissement (consolidation architecture,
// 2026-09-17) — introduction de @tanstack/react-query, module par module, en commençant par
// `claims` (voir src/features/claims/useClaimsQuery.ts). Ce client est un cache PARTAGÉ que les
// abonnements Firestore temps réel existants alimentent explicitement (queryClient.setQueryData),
// sans jamais déclencher de fetch propre à react-query : `staleTime`/`gcTime` infinis et tous les
// refetch automatiques désactivés, pour que ce cache reste un pur miroir de ce que les listeners
// onSnapshot déjà en place écrivent — aucun changement de comportement des flux existants.
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
    },
  },
});
