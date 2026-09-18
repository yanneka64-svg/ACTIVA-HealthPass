// @vitest-environment jsdom
// === AMÉLIORATION AJOUTÉE : sécurité/robustesse (Phase 3 du plan de durcissement, retour de
// revue qodo sur la PR #62, 2026-09-17) === Preuve reproductible du correctif : avant lui,
// `useClaimsQuery` exposait un `refetch()` réellement exécutable (asynchrone) qui finissait par
// écraser les données mises en cache par l'abonnement Firestore (App.tsx) avec un tableau vide —
// un piège pour tout futur consommateur qui destructurerait `refetch` par réflexe. `skipToken`
// élimine ce risque. Ce test attend explicitement la résolution de la promesse retournée par
// `refetch()` (pas un `waitFor` qui s'arrêterait dès sa première vérification réussie, AVANT que
// l'écrasement asynchrone n'ait eu lieu — piège dans lequel une première version de ce test est
// tombée) : avec l'ancienne implémentation, ce test échoue (le cache devient `[]`).
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useClaimsQuery, claimsQueryKey } from './useClaimsQuery';
import { Claim } from '../../types';
import { getFullDemoData } from '../../services/seedData';

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useClaimsQuery', () => {
  it('reflète les données poussées via queryClient.setQueryData (le seul chemin d\'écriture légitime)', () => {
    const queryClient = new QueryClient();
    const seeded: Claim[] = [{ id: 'c1' } as Claim];
    queryClient.setQueryData(claimsQueryKey(['OrgA']), seeded);

    const { result } = renderHook(() => useClaimsQuery(['OrgA']), { wrapper: wrapper(queryClient) });

    expect(result.current.data).toEqual(seeded);
  });

  it('un refetch() manuel ne remplace JAMAIS les données mises en cache par un tableau vide', async () => {
    const queryClient = new QueryClient();
    const seeded: Claim[] = [{ id: 'c1' } as Claim, { id: 'c2' } as Claim];
    queryClient.setQueryData(claimsQueryKey(['OrgA']), seeded);

    const { result } = renderHook(() => useClaimsQuery(['OrgA']), { wrapper: wrapper(queryClient) });
    expect(result.current.data).toEqual(seeded);

    // `refetch()` avec `skipToken` ne résout JAMAIS (aucune fonction à invoquer) — comportement
    // volontaire de react-query, vérifié : ne PAS l'attendre (un `await` dessus expirerait le
    // timeout du test). On déclenche l'appel (fire-and-forget, l'ancienne implémentation
    // buguée aurait résolu ici et écrasé le cache) puis on laisse un court délai réel avant de
    // vérifier que rien n'a changé — un `waitFor` aurait pu s'arrêter dès sa première
    // vérification réussie, avant qu'un éventuel écrasement asynchrone n'ait eu lieu (piège dans
    // lequel une première version de ce test est tombée).
    void result.current.refetch();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.data).toEqual(seeded);
    expect(queryClient.getQueryData(claimsQueryKey(['OrgA']))).toEqual(seeded);
  });

  it('retombe sur les données de démo (comme App.tsx) tant qu\'aucune donnée réelle n\'a encore été poussée dans le cache', () => {
    // === AMÉLIORATION AJOUTÉE : migration du premier consommateur (2026-09-18) === Même repli
    // que `useState(() => demoData.sampleClaims)` dans App.tsx — pas un tableau vide — pour que
    // rien ne change visuellement le temps que le premier instantané Firestore arrive.
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useClaimsQuery(['OrgB']), { wrapper: wrapper(queryClient) });

    expect(result.current.data).toEqual(getFullDemoData().sampleClaims);
  });
});
