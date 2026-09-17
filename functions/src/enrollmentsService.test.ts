// === AMÉLIORATION AJOUTÉE : tests unitaires (Revue complète 2026-09-06, finding A2) pour
// processEnrollmentDecisionServer() — même garde de statut que claimsService.test.ts, appliquée
// ici pour empêcher la création d'un membre en double.
import { describe, expect, it } from 'vitest';
import { processEnrollmentDecisionServer, EnrollmentDecisionPayload } from './enrollmentsService';

function createFakeDb(enrollmentData: Record<string, any>) {
  const sets: { collection: string; data: any }[] = [];
  const updates: { path: string; data: any }[] = [];
  let autoIdCounter = 0;

  const tx = {
    get: async (_ref: any) => ({
      exists: true,
      data: () => enrollmentData,
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
      doc: (id?: string) => ({ id: id || `generated-${name}-${autoIdCounter++}`, _collection: name }),
    }),
    runTransaction: async (fn: any) => fn(tx),
  };

  return { db: db as any, sets, updates };
}

const basePayload: EnrollmentDecisionPayload = {
  enrollmentId: 'enr1',
  decision: 'approved',
  approverId: 'supervisor1',
  approverName: 'Jane Supervisor',
  approverRole: 'Supervisor',
};

describe('processEnrollmentDecisionServer — finding A2 (garde de statut)', () => {
  it('refuse de décider à nouveau un enrollment déjà "approved" (empêche le membre en double)', async () => {
    const { db, sets } = createFakeDb({
      status: 'approved',
      createdBy: 'agent1',
      relationship: 'Principal',
      cardNo: 'AMID-000001',
      fullName: 'John Doe',
    });

    await expect(
      processEnrollmentDecisionServer(db, { ...basePayload, decision: 'rejected' })
    ).rejects.toThrow(/already been decided/);

    expect(sets.filter((s) => s.collection === 'members')).toHaveLength(0);
  });

  it('non-régression : un enrollment "pending" peut toujours être approuvé normalement (membre créé)', async () => {
    const { db, sets } = createFakeDb({
      status: 'pending',
      createdBy: 'agent1',
      relationship: 'Principal',
      cardNo: 'AMID-000001',
      fullName: 'John Doe',
    });

    const result = await processEnrollmentDecisionServer(db, basePayload);

    expect(result.success).toBe(true);
    expect(sets.filter((s) => s.collection === 'members')).toHaveLength(1);
  });

  it('non-régression : un enrollment sans champ "status" (document legacy) est traité comme "pending"', async () => {
    const { db } = createFakeDb({
      createdBy: 'agent1',
      relationship: 'Principal',
      cardNo: 'AMID-000002',
      fullName: 'Jane Roe',
    });

    const result = await processEnrollmentDecisionServer(db, basePayload);

    expect(result.success).toBe(true);
  });
});
