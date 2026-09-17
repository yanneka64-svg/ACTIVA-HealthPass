// === AMÉLIORATION AJOUTÉE : test (Réconciliation 2026-09-07, décision explicite sur le fallback
// client claims/enrollments) — preuve reproductible que assertStillPendingForClientFallback()
// empêche une double décision (double-clic, deux superviseurs concurrents) via le chemin de
// repli client de WorkflowService.approveClaim/rejectClaim/approveEnrollment/rejectEnrollment,
// exactement comme le garde-fou déjà prouvé côté serveur (finding A2, functions/src/
// claimsService.test.ts). firebase/firestore, firebase/functions et src/lib/firebase sont mockés
// pour ne dépendre d'aucun projet Firebase réel ni réseau.
import { describe, expect, it, vi, beforeEach } from 'vitest';

// === AMÉLIORATION AJOUTÉE : test (revue 2026-09-11 — revalidation serveur du rôle sur le
// fallback client) === `mockGetIdToken` permet de vérifier que assertStillPendingForClientFallback
// force bien un rafraîchissement du jeton d'authentification avant sa vérification de statut,
// pour que firestore.rules évalue le rôle/statut actif le plus récent (voir workflowService.ts).
const { mockGetIdToken } = vi.hoisted(() => ({ mockGetIdToken: vi.fn().mockResolvedValue('fresh-token') }));

vi.mock('../src/lib/firebase', () => ({
  db: {},
  auth: { currentUser: { getIdToken: mockGetIdToken } },
  storage: {},
  functions: {},
  secondaryApp: {},
  secondaryAuth: {},
  googleProvider: {},
}));

let firestoreDocData: Record<string, any> | null = null;

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
  runTransaction: vi.fn(async (_db: unknown, fn: (tx: any) => Promise<any>) => {
    const tx = {
      get: async (_ref: unknown) => ({
        exists: () => firestoreDocData !== null,
        data: () => firestoreDocData,
      }),
    };
    return fn(tx);
  }),
  // Autres exports utilisés transitivement par cardNumberService.ts/firestore.ts, non exercés
  // par ce test mais nécessaires pour que l'import du module ne lève pas d'exception.
  collection: vi.fn(),
  collectionGroup: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
  writeBatch: vi.fn(),
  deleteField: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

import { assertStillPendingForClientFallback } from '../src/services/workflowService';

describe('assertStillPendingForClientFallback — garde de statut sur le chemin de repli client', () => {
  beforeEach(() => {
    firestoreDocData = null;
    mockGetIdToken.mockClear();
  });

  it('force un rafraîchissement du jeton avant de vérifier le statut (revalidation serveur du rôle)', async () => {
    firestoreDocData = { status: 'pending' };
    await assertStillPendingForClientFallback('claims', 'c1');
    expect(mockGetIdToken).toHaveBeenCalledWith(true);
  });

  it("rafraîchit le jeton même quand la vérification de statut échoue ensuite (l'ordre garantit un rôle à jour dès l'entrée dans le chemin de repli)", async () => {
    firestoreDocData = { status: 'approved' };
    await expect(assertStillPendingForClientFallback('claims', 'c1')).rejects.toThrow(/already been decided/);
    expect(mockGetIdToken).toHaveBeenCalledWith(true);
  });

  it('ne lève rien pour un claim/enrollment "pending"', async () => {
    firestoreDocData = { status: 'pending' };
    await expect(assertStillPendingForClientFallback('claims', 'c1')).resolves.toBeUndefined();
  });

  it('ne lève rien pour un document sans champ "status" (legacy, traité comme pending)', async () => {
    firestoreDocData = {};
    await expect(assertStillPendingForClientFallback('claims', 'c1')).resolves.toBeUndefined();
  });

  it('refuse de décider à nouveau un claim déjà "approved" (empêche la double facturation via ce chemin)', async () => {
    firestoreDocData = { status: 'approved' };
    await expect(assertStillPendingForClientFallback('claims', 'c1')).rejects.toThrow(/already been decided/);
  });

  it('refuse de décider à nouveau un enrollment déjà "rejected"', async () => {
    firestoreDocData = { status: 'rejected' };
    await expect(assertStillPendingForClientFallback('enrollments', 'e1')).rejects.toThrow(/already been decided/);
  });

  it('refuse si le document n\'existe plus', async () => {
    firestoreDocData = null;
    await expect(assertStillPendingForClientFallback('claims', 'missing')).rejects.toThrow(/no longer exists/);
  });
});
