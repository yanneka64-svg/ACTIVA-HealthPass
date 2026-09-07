// === AMÉLIORATION AJOUTÉE : test (Revue complète 2026-09-06, finding B — race condition sur le
// rate-limiting anti-brute-force) — preuve reproductible que checkAndApplyRateLimit() reste
// correct sous concurrence réelle, avec un faux Firestore qui introduit un délai artificiel
// entre lecture et écriture (pour forcer l'entrelacement que provoquerait un vrai aller-retour
// réseau) et sérialise réellement les transactions comme le ferait Firestore sur un document
// contesté.
import { describe, expect, it } from 'vitest';
import { checkAndApplyRateLimit } from './index';

/**
 * Faux Firestore minimal : `get`/`set`/`update` directs ont un délai artificiel (pour révéler une
 * éventuelle interférence entre appels concurrents non protégés), tandis que `runTransaction`
 * sérialise réellement les callbacks en cours sur l'ensemble du faux magasin — comme le fait
 * Firestore pour des transactions concurrentes sur le même document.
 */
function createFakeRateLimitFirestore(delayMs = 5) {
  const store = new Map<string, any>();
  let txChain: Promise<any> = Promise.resolve();

  const delay = () => new Promise((r) => setTimeout(r, delayMs));

  const makeRef = (path: string) => ({
    path,
    get: async () => {
      await delay();
      const data = store.get(path);
      return { exists: data !== undefined, data: () => data };
    },
  });

  return {
    collection: (name: string) => ({
      doc: (id: string) => makeRef(`${name}/${id}`),
    }),
    runTransaction: (fn: (tx: any) => Promise<any>) => {
      const run = async () => {
        const tx = {
          get: async (ref: { path: string }) => {
            await delay();
            const data = store.get(ref.path);
            return { exists: data !== undefined, data: () => data };
          },
          set: (ref: { path: string }, data: any) => {
            store.set(ref.path, data);
          },
          update: (ref: { path: string }, data: any) => {
            const existing = store.get(ref.path) || {};
            store.set(ref.path, { ...existing, ...data });
          },
        };
        return fn(tx);
      };
      // Sérialise : chaque transaction attend que la précédente ait fini de s'exécuter,
      // exactement le comportement que Firestore garantit sur un document contesté.
      const result = txChain.then(run);
      txChain = result.catch(() => undefined);
      return result;
    },
  } as unknown as FirebaseFirestore.Firestore;
}

describe('checkAndApplyRateLimit — finding B (race condition)', () => {
  it('sous 10 tentatives concurrentes sur le même identifiant, exactement 4 sont autorisées avant verrouillage (aucun incrément perdu)', async () => {
    // MAX_ATTEMPTS = 5 : les tentatives 1 à 4 sont autorisées (attempts passe de 1 à 4), la 5e
    // fait passer attempts à 5 et déclenche le verrouillage (retournée comme refusée elle-même),
    // les suivantes sont refusées par le verrou déjà posé. Un total de 4 autorisées prouve
    // qu'aucun incrément n'a été perdu malgré la concurrence (sans la transaction, plusieurs
    // appels concurrents auraient pu lire "attempts: 0" simultanément et être TOUS autorisés).
    const db = createFakeRateLimitFirestore(5);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => checkAndApplyRateLimit(db, 'attacker@example.com', '10.0.0.1'))
    );

    const allowedCount = results.filter((r) => r.allowed).length;
    const deniedCount = results.filter((r) => !r.allowed).length;

    expect(allowedCount).toBe(4);
    expect(deniedCount).toBe(6);
  });

  it('non-régression : des tentatives séquentielles sous le seuil restent toutes autorisées', async () => {
    const db = createFakeRateLimitFirestore(1);

    const r1 = await checkAndApplyRateLimit(db, 'user@example.com', '10.0.0.2');
    const r2 = await checkAndApplyRateLimit(db, 'user@example.com', '10.0.0.2');
    const r3 = await checkAndApplyRateLimit(db, 'user@example.com', '10.0.0.2');

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
  });

  it('non-régression : la 6e tentative séquentielle sur la même fenêtre est verrouillée', async () => {
    const db = createFakeRateLimitFirestore(1);

    let last;
    for (let i = 0; i < 6; i++) {
      last = await checkAndApplyRateLimit(db, 'user2@example.com', '10.0.0.3');
    }

    expect(last!.allowed).toBe(false);
    expect(last!.retryAfterSec).toBeGreaterThan(0);
  });
});
