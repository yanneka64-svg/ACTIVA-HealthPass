// === AMÉLIORATION AJOUTÉE : test (Revue complète 2026-09-06, finding B — collision d'ID sur
// l'import de masse) — preuve reproductible que les membres importés reçoivent des ID uniques,
// avec un faux Firestore minimal (aucune dépendance à l'émulateur).
import { describe, expect, it } from 'vitest';
import { processBulkMemberImportServer, ImportRowInput } from './importService';

function createFakeImportDb() {
  const store = new Map<string, any>();
  let autoIdCounter = 0;

  const makeRef = (path: string) => ({ path });

  const db = {
    doc: (path: string) => makeRef(path),
    collection: (name: string) => ({
      // Simule l'ID auto-généré Firestore : unique à chaque appel, indépendant de Date.now().
      doc: () => ({ id: `autoid-${name}-${autoIdCounter++}` }),
    }),
    runTransaction: async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        get: async (ref: { path: string }) => {
          const data = store.get(ref.path);
          return { exists: data !== undefined, data: () => data };
        },
        set: (ref: { path: string }, data: any, opts?: { merge?: boolean }) => {
          const existing = store.get(ref.path);
          store.set(ref.path, opts?.merge ? { ...existing, ...data } : data);
        },
      };
      return fn(tx);
    },
    batch: () => {
      const ops: { path: string; data: any }[] = [];
      return {
        set: (ref: { path: string }, data: any) => {
          ops.push({ path: ref.path, data });
        },
        commit: async () => {
          ops.forEach(({ path, data }) => store.set(path, data));
        },
      };
    },
  };

  return { db: db as unknown as FirebaseFirestore.Firestore, store };
}

function makeRow(i: number): ImportRowInput {
  return {
    principalName: `Member ${i}`,
    organization: 'ACTIVA Corporate',
  };
}

describe('processBulkMemberImportServer — finding B (collision d\'ID de membre)', () => {
  it('génère un ID de membre unique par ligne, même pour un import volumineux (aucune collision, aucun écrasement silencieux)', async () => {
    const { db, store } = createFakeImportDb();
    const rows = Array.from({ length: 500 }, (_, i) => makeRow(i));

    const result = await processBulkMemberImportServer(db, rows, {
      uid: 'importer1',
      name: 'Import Bot',
      role: 'Admin',
    });

    expect(result.successCount).toBe(500);

    const memberIds = result.report.filter((r) => r.status === 'SUCCESS').map((r) => r.cardNo);
    // Chaque numéro de carte doit être unique (pas de doublon de plage réservée).
    expect(new Set(memberIds).size).toBe(memberIds.length);

    // Chaque membre doit exister comme document DISTINCT dans le magasin (aucun écrasement
    // silencieux d'un membre par un autre suite à une collision d'ID).
    const memberDocs = Array.from(store.keys()).filter((k) => k.startsWith('members/'));
    expect(memberDocs.length).toBe(500);
    const memberIdsInStore = new Set(memberDocs.map((k) => k.split('/')[1]));
    expect(memberIdsInStore.size).toBe(500);

    // Preuve directe (déterministe, pas seulement probabiliste) que le code délègue bien la
    // génération d'ID à l'ID auto-généré Firestore (`db.collection('members').doc().id`) plutôt
    // qu'à l'ancien schéma `MEM-${Date.now()...}-${Math.random()...}` : le faux Firestore expose
    // ses ID auto-générés sous la forme `autoid-members-N` — un ID de membre qui NE correspond
    // PAS à ce motif prouverait un retour à l'ancien schéma faible.
    memberIdsInStore.forEach((id) => {
      expect(id).toMatch(/^autoid-members-\d+$/);
    });
  });
});
