// === AMÉLIORATION AJOUTÉE : tests unitaires (Revue complète 2026-09-06, finding A2) pour
// processClaimDecisionServer() — preuve reproductible que la garde de statut fonctionne, avec
// un faux Firestore minimal (aucune dépendance à l'émulateur, exécutable via `npm test`).
import { describe, expect, it } from 'vitest';
import { processClaimDecisionServer, ClaimDecisionPayload } from './claimsService';

function createFakeDb(claimData: Record<string, any>) {
  const sets: { collection: string; data: any }[] = [];
  const updates: { path: string; data: any }[] = [];
  let autoIdCounter = 0;

  const tx = {
    get: async (_ref: any) => ({
      exists: true,
      data: () => claimData,
    }),
    update: (ref: any, data: any) => {
      updates.push({ path: ref.path, data });
    },
    set: (ref: any, data: any) => {
      sets.push({ collection: ref._collection, data });
    },
  };

  const db = {
    doc: (path: string) => ({ path }),
    collection: (name: string) => ({
      doc: () => ({ id: `generated-${name}-${autoIdCounter++}`, _collection: name }),
    }),
    runTransaction: async (fn: any) => fn(tx),
  };

  return { db: db as any, sets, updates };
}

const basePayload: ClaimDecisionPayload = {
  claimId: 'claim1',
  decision: 'approved',
  approverId: 'supervisor1',
  approverName: 'Jane Supervisor',
  approverRole: 'Supervisor',
};

describe('processClaimDecisionServer — finding A2 (garde de statut)', () => {
  it('refuse de décider à nouveau un claim déjà "approved" (empêche la double facturation)', async () => {
    const { db, sets } = createFakeDb({
      status: 'approved',
      createdBy: 'agent1',
      amountUSD: 100,
    });

    await expect(
      processClaimDecisionServer(db, { ...basePayload, decision: 'rejected' })
    ).rejects.toThrow(/already been decided/);

    // Aucune facture ne doit avoir été générée par cette tentative refusée.
    expect(sets.filter((s) => s.collection === 'invoices')).toHaveLength(0);
  });

  it('refuse de décider à nouveau un claim déjà "rejected"', async () => {
    const { db } = createFakeDb({ status: 'rejected', createdBy: 'agent1' });

    await expect(
      processClaimDecisionServer(db, { ...basePayload, decision: 'approved' })
    ).rejects.toThrow(/already been decided/);
  });

  it('non-régression : un claim "pending" peut toujours être approuvé normalement (facture générée)', async () => {
    const { db, sets, updates } = createFakeDb({
      status: 'pending',
      createdBy: 'agent1',
      amountUSD: 100,
    });

    const result = await processClaimDecisionServer(db, basePayload);

    expect(result.success).toBe(true);
    expect(result.invoiceId).toBeDefined();
    expect(sets.filter((s) => s.collection === 'invoices')).toHaveLength(1);
    expect(updates[0].data.status).toBe('approved');
  });

  it('non-régression : un claim sans champ "status" (document legacy) est traité comme "pending"', async () => {
    const { db } = createFakeDb({ createdBy: 'agent1', amountUSD: 50 });

    const result = await processClaimDecisionServer(db, basePayload);

    expect(result.success).toBe(true);
  });

  it('non-régression : la garde SoD existante reste appliquée avant celle du statut', async () => {
    const { db } = createFakeDb({ status: 'pending', createdBy: 'supervisor1' });

    await expect(
      processClaimDecisionServer(db, basePayload)
    ).rejects.toThrow(/Separation of Duties/);
  });
});
