// === AMÉLIORATION AJOUTÉE : suite de tests Firestore Rules (émulateur), Phase 3 du brief de
// durcissement. Démarrée en Phase 1 pour apporter une preuve reproductible (échoue avant le
// correctif, réussit après) pour chaque règle modifiée, conformément à la règle absolue
// "Aucune tâche CRITICAL... sans une preuve reproductible". Complétée au fil des phases.
//
// Exécution : firebase emulators:exec --only firestore "npm run test:rules"
// (voir package.json / firebase.json — émulateur Firestore sur 127.0.0.1:8080)
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, runTransaction } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const PROJECT_ID = 'demo-activa-healthpass-rules-test';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterEach(async () => {
  // Sous forte contention (tests de concurrence Phase 1.6), l'émulateur peut encore terminer
  // de résoudre quelques verrous de transaction juste après le test : un court réessai évite
  // un échec de nettoyage sans rapport avec le test lui-même de faire échouer le suivant.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await testEnv.clearFirestore();
      return;
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
});

afterAll(async () => {
  await testEnv.cleanup();
});

// --- Fixtures helpers -------------------------------------------------------------------

async function seedAccount(uid: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`accounts/${uid}`).set({ isActive: true, ...data });
  });
}

async function seedDoc(collectionPath: string, id: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`${collectionPath}/${id}`).set(data);
  });
}

function asUser(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

// --- Phase 1.3 : isolation par organisation --------------------------------------------

describe('Phase 1.3 — isolation par organisation (accounts.assignedOrganizations)', () => {
  it('sans assignedOrganizations (comportement par défaut, non-régression) : un Agent peut lire un claim de N\'IMPORTE QUELLE organisation', async () => {
    await seedAccount('agentNoScope', { profile: 'Agent' });
    await seedDoc('claims', 'c1', { organization: 'OrgB', status: 'pending', createdBy: 'someoneElse' });

    await assertSucceeds(asUser('agentNoScope').doc('claims/c1').get());
  });

  it('avec assignedOrganizations=[OrgA] : un Agent PEUT lire un claim de OrgA', async () => {
    await seedAccount('agentOrgA', { profile: 'Agent', assignedOrganizations: ['OrgA'] });
    await seedDoc('claims', 'c1', { organization: 'OrgA', status: 'pending', createdBy: 'someoneElse' });

    await assertSucceeds(asUser('agentOrgA').doc('claims/c1').get());
  });

  it('avec assignedOrganizations=[OrgA] : un Agent NE PEUT PAS lire un claim de OrgB (REFUS)', async () => {
    await seedAccount('agentOrgA2', { profile: 'Agent', assignedOrganizations: ['OrgA'] });
    await seedDoc('claims', 'c2', { organization: 'OrgB', status: 'pending', createdBy: 'someoneElse' });

    await assertFails(asUser('agentOrgA2').doc('claims/c2').get());
  });

  it('avec assignedOrganizations=[OrgA] : un Agent NE PEUT PAS créer un claim pour OrgB (REFUS)', async () => {
    await seedAccount('agentOrgA3', { profile: 'Agent', assignedOrganizations: ['OrgA'] });

    await assertFails(
      asUser('agentOrgA3').doc('claims/newClaim').set({
        organization: 'OrgB',
        status: 'pending',
        createdBy: 'agentOrgA3',
      })
    );
  });

  it('avec assignedOrganizations=[OrgA] : un Agent PEUT créer un claim pour OrgA', async () => {
    await seedAccount('agentOrgA4', { profile: 'Agent', assignedOrganizations: ['OrgA'] });

    await assertSucceeds(
      asUser('agentOrgA4').doc('claims/newClaim2').set({
        organization: 'OrgA',
        status: 'pending',
        createdBy: 'agentOrgA4',
      })
    );
  });

  it('un Admin garde un accès total, même à une organisation absente de son assignedOrganizations', async () => {
    await seedAccount('adminScoped', { profile: 'Admin', assignedOrganizations: ['OrgZ'] });
    await seedDoc('claims', 'c3', { organization: 'OrgQ', status: 'pending', createdBy: 'x' });

    await assertSucceeds(asUser('adminScoped').doc('claims/c3').get());
  });

  it('un Agent scopé ne peut pas déplacer un claim existant vers une organisation hors périmètre (REFUS)', async () => {
    await seedAccount('agentOrgA5', { profile: 'Agent', assignedOrganizations: ['OrgA'] });
    await seedDoc('claims', 'c4', { organization: 'OrgA', status: 'pending', createdBy: 'other' });

    await assertFails(
      asUser('agentOrgA5').doc('claims/c4').set({ organization: 'OrgB', status: 'pending', createdBy: 'other' })
    );
  });

  it('auto-élévation de privilège : un utilisateur ne peut pas s\'auto-assigner assignedOrganizations via self-update (REFUS)', async () => {
    await seedAccount('selfElevate', { profile: 'Agent', permissions: [] });

    await assertFails(
      asUser('selfElevate')
        .doc('accounts/selfElevate')
        .set({ profile: 'Agent', isActive: true, permissions: [], assignedOrganizations: ['OrgA'] }, { merge: true })
    );
  });

  it('members : lecture cloisonnée comme claims', async () => {
    await seedAccount('agentMembers', { profile: 'Agent', assignedOrganizations: ['OrgA'] });
    await seedDoc('members', 'm1', { organization: 'OrgB', cardNo: 'AMID-260101-00001' });

    await assertFails(asUser('agentMembers').doc('members/m1').get());
  });

  it('medicalForms : lecture non autorisée hors périmètre = REFUS', async () => {
    await seedAccount('agentForms', { profile: 'Agent', assignedOrganizations: ['OrgA'] });
    await seedDoc('medicalForms', 'f1', { organization: 'OrgB', memberName: 'X' });

    await assertFails(asUser('agentForms').doc('medicalForms/f1').get());
  });

  it('enrollments : lecture non autorisée hors périmètre = REFUS', async () => {
    await seedAccount('agentEnr', { profile: 'Agent', assignedOrganizations: ['OrgA'] });
    await seedDoc('enrollments', 'e7', { organization: 'OrgB', fullName: 'X', status: 'pending' });

    await assertFails(asUser('agentEnr').doc('enrollments/e7').get());
  });

  it('invoices : lecture non autorisée hors périmètre = REFUS', async () => {
    await seedAccount('agentInv', { profile: 'Agent', assignedOrganizations: ['OrgA'] });
    await seedDoc('invoices', 'i1', { organization: 'OrgB', amount: 50 });

    await assertFails(asUser('agentInv').doc('invoices/i1').get());
  });

  it('policyPayments : lecture cloisonnée par organizationId', async () => {
    await seedAccount('agentPayments', { profile: 'Agent', assignedOrganizations: ['OrgA'] });
    await seedDoc('policyPayments', 'p1', { organizationId: 'OrgB', amountDue: 100 });

    await assertFails(asUser('agentPayments').doc('policyPayments/p1').get());
  });

  it('Superviseur → accéder à une autre organisation = REFUS (claims)', async () => {
    await seedAccount('supOrgA', { profile: 'Supervisor', assignedOrganizations: ['OrgA'] });
    await seedDoc('claims', 'cSupOrg', { organization: 'OrgB', status: 'pending', createdByUid: 'x' });

    await assertFails(asUser('supOrgA').doc('claims/cSupOrg').get());
  });

  it('auto-élévation de privilège : un utilisateur ne peut pas s\'auto-promouvoir Admin via self-update (REFUS)', async () => {
    await seedAccount('selfPromote', { profile: 'Agent', isActive: true, permissions: [] });

    await assertFails(
      asUser('selfPromote')
        .doc('accounts/selfPromote')
        .set({ profile: 'Admin', isActive: true, permissions: [] }, { merge: true })
    );
  });

  it('auto-élévation de privilège : un utilisateur ne peut pas se réactiver lui-même après désactivation par un Admin (REFUS)', async () => {
    await seedAccount('selfReactivate', { profile: 'Agent', isActive: false, permissions: [] });

    await assertFails(
      asUser('selfReactivate')
        .doc('accounts/selfReactivate')
        .set({ profile: 'Agent', isActive: true, permissions: [] }, { merge: true })
    );
  });
});

describe('Administration & paiements — contrôles non liés à l\'organisation', () => {
  it('Agent → modifier un paiement = REFUS', async () => {
    await seedAccount('agentPayWrite', { profile: 'Agent' });
    await seedDoc('policyPayments', 'p2', { organizationId: 'OrgA', amountDue: 100, status: 'Pending' });

    await assertFails(asUser('agentPayWrite').doc('policyPayments/p2').update({ status: 'Paid' }));
  });

  it('Supervisor → modifier un paiement = REFUS', async () => {
    await seedAccount('supPayWrite', { profile: 'Supervisor' });
    await seedDoc('policyPayments', 'p3', { organizationId: 'OrgA', amountDue: 100, status: 'Pending' });

    await assertFails(asUser('supPayWrite').doc('policyPayments/p3').update({ status: 'Paid' }));
  });

  it('Admin PEUT modifier un paiement', async () => {
    await seedAccount('adminPayWrite', { profile: 'Admin' });
    await seedDoc('policyPayments', 'p4', { organizationId: 'OrgA', amountDue: 100, status: 'Pending' });

    await assertSucceeds(asUser('adminPayWrite').doc('policyPayments/p4').update({ status: 'Paid' }));
  });

  it('Superviseur → modifier le rôle d\'un autre compte = REFUS', async () => {
    await seedAccount('supRoleWrite', { profile: 'Supervisor' });
    await seedAccount('targetAccount', { profile: 'Agent', permissions: [] });

    await assertFails(
      asUser('supRoleWrite').doc('accounts/targetAccount').update({ profile: 'Admin' })
    );
  });

  it('Admin PEUT modifier le rôle d\'un autre compte', async () => {
    await seedAccount('adminRoleWrite', { profile: 'Admin' });
    await seedAccount('targetAccount2', { profile: 'Agent', permissions: [] });

    await assertSucceeds(
      asUser('adminRoleWrite').doc('accounts/targetAccount2').update({ profile: 'Supervisor' })
    );
  });
});

// --- Baseline pré-existante (non-régression, périmètre restreint pour cette itération) --

describe('Séparation des tâches (SoD) — comportement pré-existant, non modifié ici', () => {
  it('un Agent ne peut jamais faire passer un claim à "approved" (REFUS)', async () => {
    await seedAccount('agentApprove', { profile: 'Agent' });
    await seedDoc('claims', 'c5', { organization: 'OrgA', status: 'pending', createdBy: 'agentApprove' });

    await assertFails(
      asUser('agentApprove').doc('claims/c5').update({ status: 'approved' })
    );
  });

  it('un Supervisor ne peut pas approuver un claim qu\'il a lui-même soumis (REFUS)', async () => {
    await seedAccount('supSelf', { profile: 'Supervisor' });
    await seedDoc('claims', 'c6', { organization: 'OrgA', status: 'pending', createdBy: 'supSelf' });

    await assertFails(
      asUser('supSelf').doc('claims/c6').update({ status: 'approved' })
    );
  });

  it('un Supervisor PEUT approuver un claim soumis par un autre utilisateur', async () => {
    await seedAccount('supOther', { profile: 'Supervisor' });
    await seedDoc('claims', 'c7', { organization: 'OrgA', status: 'pending', createdBy: 'someAgent' });

    await assertSucceeds(
      asUser('supOther').doc('claims/c7').update({ status: 'approved' })
    );
  });

  it('un auteur ne peut pas approuver son propre enrollment (REFUS)', async () => {
    await seedAccount('supSelfEnr', { profile: 'Supervisor' });
    await seedDoc('enrollments', 'e5', { organization: 'OrgA', status: 'pending', createdBy: 'supSelfEnr' });

    await assertFails(asUser('supSelfEnr').doc('enrollments/e5').update({ status: 'approved' }));
  });

  it('un Supervisor PEUT approuver un enrollment soumis par un autre utilisateur', async () => {
    await seedAccount('supOtherEnr', { profile: 'Supervisor' });
    await seedDoc('enrollments', 'e6', { organization: 'OrgA', status: 'pending', createdBy: 'someAgent' });

    await assertSucceeds(asUser('supOtherEnr').doc('enrollments/e6').update({ status: 'approved' }));
  });

  // NOTE : "un auteur approuve son propre formulaire médical = REFUS" (item explicitement
  // demandé) n'est PAS testable ici, et documenté comme tel plutôt que silencieusement omis :
  // `medicalForms` n'a ni champ createdBy/createdByUid dans son modèle de données réel
  // (src/types/index.ts) ni notion de transition d'approbation (son `status` — issued/used/
  // pending_return/completed — ne représente pas un cycle de validation par un tiers). Voir
  // docs/security/CODE_AUDIT_MAP.md section 11 et 1.4 pour le contexte de cette limitation
  // structurelle, distincte d'un oubli de test.
});

describe('Phase 1.4 — SoD via createdByUid déterminé serveur', () => {
  it('createdByUid ne peut pas usurper un autre uid à la création (REFUS)', async () => {
    await seedAccount('spoofer', { profile: 'Agent' });

    await assertFails(
      asUser('spoofer').doc('claims/spoofClaim').set({
        organization: 'OrgA',
        status: 'pending',
        createdByUid: 'someoneElseUid',
      })
    );
  });

  it('createdByUid == auth.uid est accepté à la création', async () => {
    await seedAccount('honest', { profile: 'Agent' });

    await assertSucceeds(
      asUser('honest').doc('claims/honestClaim').set({
        organization: 'OrgA',
        status: 'pending',
        createdByUid: 'honest',
      })
    );
  });

  it('un Supervisor ne peut pas approuver un claim dont il est l\'auteur via createdByUid, même si createdBy pointe vers quelqu\'un d\'autre (REFUS)', async () => {
    await seedAccount('supSpoof', { profile: 'Supervisor' });
    // createdBy (ancien champ, jamais vérifié) prétend que c'est quelqu'un d'autre ; mais
    // createdByUid (vérifié à la création, priorisé au test SoD) dit la vérité.
    await seedDoc('claims', 'c8', {
      organization: 'OrgA',
      status: 'pending',
      createdBy: 'someoneElse',
      createdByUid: 'supSpoof',
    });

    await assertFails(asUser('supSpoof').doc('claims/c8').update({ status: 'approved' }));
  });

  it('un document legacy sans createdByUid retombe sur le test createdBy existant (non-régression)', async () => {
    await seedAccount('supLegacy', { profile: 'Supervisor' });
    await seedDoc('claims', 'c9', { organization: 'OrgA', status: 'pending', createdBy: 'supLegacy' });

    await assertFails(asUser('supLegacy').doc('claims/c9').update({ status: 'approved' }));
  });
});

describe('Phase 1.5 — workflow d\'état serveur (statut immuable une fois "approved")', () => {
  it('un Supervisor ne peut pas faire revenir un claim approuvé à "pending" (REFUS)', async () => {
    await seedAccount('supRevert', { profile: 'Supervisor' });
    await seedDoc('claims', 'cApproved', { organization: 'OrgA', status: 'approved', createdByUid: 'someoneElse' });

    await assertFails(asUser('supRevert').doc('claims/cApproved').update({ status: 'pending' }));
  });

  it('un Admin ne peut pas non plus faire reculer un claim approuvé (REFUS)', async () => {
    await seedAccount('adminRevert', { profile: 'Admin' });
    await seedDoc('claims', 'cApproved2', { organization: 'OrgA', status: 'approved', createdByUid: 'someoneElse' });

    await assertFails(asUser('adminRevert').doc('claims/cApproved2').update({ status: 'rejected' }));
  });

  it('une mise à jour qui ne touche pas au statut reste possible sur un claim approuvé', async () => {
    await seedAccount('adminTouch', { profile: 'Admin' });
    await seedDoc('claims', 'cApproved3', { organization: 'OrgA', status: 'approved', createdByUid: 'someoneElse' });

    await assertSucceeds(asUser('adminTouch').doc('claims/cApproved3').update({ comments: 'note interne' }));
  });

  it('un enrollment approuvé ne peut pas non plus être ramené à "pending" (REFUS)', async () => {
    await seedAccount('supRevertEnr', { profile: 'Supervisor' });
    await seedDoc('enrollments', 'eApproved', { organization: 'OrgA', status: 'approved', createdByUid: 'someoneElse' });

    await assertFails(asUser('supRevertEnr').doc('enrollments/eApproved').update({ status: 'pending' }));
  });
});

describe('Cartes — immuabilité du registre (comportement pré-existant, non modifié ici)', () => {
  it('cardNumberRegistry est immuable : mise à jour refusée (REFUS)', async () => {
    await seedAccount('agentCard', { profile: 'Agent' });
    await seedDoc('cardNumberRegistry', 'AMID-260101-00001', { organization: 'OrgA' });

    await assertFails(
      asUser('agentCard').doc('cardNumberRegistry/AMID-260101-00001').set({ organization: 'OrgB' })
    );
  });

  it('cardNumberRegistry est immuable : suppression refusée (REFUS)', async () => {
    await seedAccount('agentCard2', { profile: 'Agent' });
    await seedDoc('cardNumberRegistry', 'AMID-260101-00002', { organization: 'OrgA' });

    await assertFails(asUser('agentCard2').doc('cardNumberRegistry/AMID-260101-00002').delete());
  });

  it('numéro dupliqué : re-créer un cardNumberRegistry déjà existant = REFUS (traité comme une update, if false)', async () => {
    await seedAccount('agentCard3', { profile: 'Agent' });
    await seedDoc('cardNumberRegistry', 'AMID-260101-00003', { organization: 'OrgA' });

    await assertFails(
      asUser('agentCard3').doc('cardNumberRegistry/AMID-260101-00003').set({ organization: 'OrgA' })
    );
  });

  it('réutilisation d\'un numéro : même un Admin ne peut pas supprimer une entrée du registre (REFUS)', async () => {
    await seedAccount('adminCard', { profile: 'Admin' });
    await seedDoc('cardNumberRegistry', 'AMID-260101-00004', { organization: 'OrgA' });

    await assertFails(asUser('adminCard').doc('cardNumberRegistry/AMID-260101-00004').delete());
  });
});

// === AMÉLIORATION AJOUTÉE : Phase 1.6 — preuve de non-duplication sous génération concurrente
// ===
// Rejoue exactement le patron transactionnel de src/services/cardNumberService.ts
// (generateNextCardNumber, repli client) : lire counters/cardNumbers dans une transaction,
// vérifier/poser cardNumberRegistry/{cardNumber} (l'existence du document EST la contrainte
// d'unicité — deux transactions concurrentes qui visent le même id ne peuvent jamais toutes
// les deux réussir), puis incrémenter le compteur dans la même transaction. N appels
// concurrents doivent produire N numéros strictement uniques, sans trou ni doublon —
// Firestore relit et réessaie automatiquement une transaction en cas de conflit d'écriture.
async function generateOneCardNumberTxAttempt(db: any): Promise<string> {
  const counterRef = doc(db, 'counters', 'cardNumbers');
  return runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const current = counterSnap.exists() ? (counterSnap.data().lastAssuredNumber as number) || 0 : 0;
    const next = current + 1;
    const cardNumber = `AMID-260101-${String(next).padStart(5, '0')}`;
    const registryRef = doc(db, 'cardNumberRegistry', cardNumber);
    const registrySnap = await tx.get(registryRef);
    if (registrySnap.exists()) {
      // A concurrent winner already took this exact number since our read: Firestore's
      // optimistic concurrency control should normally force a retry on the COUNTER read
      // before we ever get here, but a defensive check costs nothing and mirrors
      // cardNumberService.ts's own defense-in-depth.
      throw new Error(`Card number ${cardNumber} already exists — collision.`);
    }
    tx.set(registryRef, { organization: 'OrgA', assignedAt: new Date().toISOString() });
    tx.set(counterRef, { lastAssuredNumber: next }, { merge: true });
    return cardNumber;
  });
}

// L'émulateur Firestore de ce conteneur (ressources limitées) peut légitimement épuiser les
// tentatives internes de la transaction sous une contention extrême et purement synthétique
// (des dizaines d'écritures strictement simultanées sur UN seul petit document compteur,
// un scénario plus sévère qu'un usage réel où les agents ne cliquent jamais littéralement à
// la même microseconde). La propriété de sécurité qui compte n'est pas "chaque tentative
// réussit instantanément", c'est "aucune tentative RÉUSSIE n'entre jamais en collision avec
// une autre" — vérifié ci-dessous en réessayant les échecs de contention (jamais un doublon)
// jusqu'à obtenir N résultats, chacun unique.
async function generateOneCardNumberTx(dbForUser: () => any): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await generateOneCardNumberTxAttempt(dbForUser());
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 25 + Math.random() * 75));
    }
  }
  throw lastErr;
}

describe('Phase 1.6 — génération de numéro de carte : sécurité sous concurrence', () => {
  it('2 générations concurrentes produisent 2 numéros uniques, sans doublon', async () => {
    await seedAccount('cardGen2', { profile: 'Agent' });
    const ctx = () => asUser('cardGen2');

    const results = await Promise.all([generateOneCardNumberTx(ctx), generateOneCardNumberTx(ctx)]);
    expect(new Set(results).size).toBe(2);
  });

  it('10 générations concurrentes produisent 10 numéros uniques, sans doublon', async () => {
    await seedAccount('cardGen10', { profile: 'Agent' });
    const db = asUser('cardGen10');

    const results = await Promise.all(Array.from({ length: 10 }, () => generateOneCardNumberTx(() => db)));
    expect(results.length).toBe(10);
    expect(new Set(results).size).toBe(10);
  }, 20_000);

  it('100 générations concurrentes produisent 100 numéros uniques, sans doublon', async () => {
    await seedAccount('cardGen100', { profile: 'Agent' });
    const db = asUser('cardGen100');

    // Léger étalement du déclenchement (0-20ms) : un pic de 100 écritures strictement
    // simultanées sur un document unique est un cas pire-que-réel pour un émulateur à
    // ressources limitées ; la propriété testée (aucun doublon) reste valable quel que soit
    // l'étalement, réel comme synthétique.
    const results = await Promise.all(
      Array.from({ length: 100 }, () => {
        const jitter = Math.random() * 20;
        return new Promise<string>((resolve, reject) => {
          setTimeout(() => generateOneCardNumberTx(() => db).then(resolve, reject), jitter);
        });
      })
    );
    expect(results.length).toBe(100);
    expect(new Set(results).size).toBe(100);
  }, 60_000);
});

describe('Polices — blocage de couverture asymétrique (comportement pré-existant, non modifié ici)', () => {
  it('un Agent peut BLOQUER une police (coverageBlocked false -> true)', async () => {
    await seedAccount('agentPolicy', { profile: 'Agent' });
    await seedDoc('healthPolicies', 'OrgA', { coverageBlocked: false, status: 'Active' });

    await assertSucceeds(
      asUser('agentPolicy').doc('healthPolicies/OrgA').update({ coverageBlocked: true, status: 'Suspended' })
    );
  });

  it('un Agent NE PEUT PAS débloquer une police (coverageBlocked true -> false) (REFUS)', async () => {
    await seedAccount('agentPolicy2', { profile: 'Agent' });
    await seedDoc('healthPolicies', 'OrgB', { coverageBlocked: true, status: 'Suspended' });

    await assertFails(
      asUser('agentPolicy2').doc('healthPolicies/OrgB').update({ coverageBlocked: false, status: 'Active' })
    );
  });

  it('un Supervisor PEUT débloquer une police', async () => {
    await seedAccount('supPolicy', { profile: 'Supervisor' });
    await seedDoc('healthPolicies', 'OrgC', { coverageBlocked: true, status: 'Suspended' });

    await assertSucceeds(
      asUser('supPolicy').doc('healthPolicies/OrgC').update({ coverageBlocked: false, status: 'Active' })
    );
  });
});

describe('Phase 2.3 — audit trail : create pré-authentification restreint à la forme "login"', () => {
  function anon() {
    return testEnv.unauthenticatedContext().firestore();
  }

  it('un utilisateur non authentifié PEUT journaliser un échec de connexion (forme attendue)', async () => {
    await assertSucceeds(
      addDoc(collection(anon(), 'auditLogs'), {
        userEmail: 'someone@example.com',
        ipAddress: '203.0.113.5',
        status: 'failed',
        userAgent: 'Mozilla/5.0',
        browser: 'Chrome',
        location: 'Unknown',
      })
    );
  });

  it('un utilisateur non authentifié NE PEUT PAS forger une action métier privilégiée (REFUS)', async () => {
    await assertFails(
      addDoc(collection(anon(), 'auditLogs'), {
        userId: 'attacker',
        userName: 'Attacker',
        userRole: 'Admin',
        action: 'CLAIM_APPROVED',
        category: 'Claims Management',
        entityId: 'c1',
        entityType: 'claim',
        details: 'Forged entry',
      })
    );
  });

  it('un utilisateur non authentifié NE PEUT PAS ajouter un champ hors de la forme "login" (REFUS)', async () => {
    await assertFails(
      addDoc(collection(anon(), 'auditLogs'), {
        status: 'failed',
        userEmail: 'someone@example.com',
        extraField: 'not allowed',
      })
    );
  });

  it('un utilisateur authentifié garde l\'écriture libre pour une action métier (non-régression)', async () => {
    await seedAccount('supAudit', { profile: 'Supervisor' });
    await assertSucceeds(
      addDoc(collection(asUser('supAudit'), 'auditLogs'), {
        userId: 'supAudit',
        userName: 'Supervisor Name',
        userRole: 'Supervisor',
        action: 'CLAIM_APPROVED',
        category: 'Claims Management',
        entityId: 'c1',
        entityType: 'claim',
        details: 'Claim approved.',
      })
    );
  });
});

// === AMÉLIORATION AJOUTÉE : Phase 3, revue de gouvernance des données de santé (2026-09-05,
// section 2.1) — séparation identité/contenu clinique. Le contenu clinique des NOUVEAUX
// formulaires médicaux vit désormais dans le document séparé
// `medicalForms/{formId}/clinical/content` (voir FirestoreService.addMedicalForm et
// firestore.rules) plutôt que dans le document `medicalForms/{formId}` lui-même. Ces tests
// prouvent que : (a) le cloisonnement par organisation s'applique aussi à cette sous-collection
// (héritée du document parent, puisque le sous-document lui-même n'a pas de champ
// `organization`), (b) seul un Admin peut la supprimer, et (c) les formulaires legacy
// (contenu clinique intégré au document parent, jamais migré de force) continuent de
// fonctionner sans aucune régression.
describe('Phase 3 / 2.1 — medicalForms/{formId}/clinical/{clinicalId} : cloisonnement hérité du parent', () => {
  it('un Agent avec accès à l\'organisation du formulaire parent PEUT lire le sous-document clinique', async () => {
    await seedAccount('agentClinicalRead', { profile: 'Agent', assignedOrganizations: ['OrgA'] });
    await seedDoc('medicalForms', 'formA', { organization: 'OrgA', memberName: 'X' });
    await seedDoc('medicalForms/formA/clinical', 'content', { presumedDiagnosis: 'encv1:abc' });

    await assertSucceeds(asUser('agentClinicalRead').doc('medicalForms/formA/clinical/content').get());
  });

  it('un Agent SANS accès à l\'organisation du formulaire parent NE PEUT PAS lire le sous-document clinique (REFUS)', async () => {
    await seedAccount('agentClinicalNoAccess', { profile: 'Agent', assignedOrganizations: ['OrgA'] });
    await seedDoc('medicalForms', 'formB', { organization: 'OrgB', memberName: 'Y' });
    await seedDoc('medicalForms/formB/clinical', 'content', { presumedDiagnosis: 'encv1:abc' });

    await assertFails(asUser('agentClinicalNoAccess').doc('medicalForms/formB/clinical/content').get());
  });

  it('un Agent avec accès à l\'organisation PEUT créer le sous-document clinique', async () => {
    await seedAccount('agentClinicalCreate', { profile: 'Agent', assignedOrganizations: ['OrgA'] });
    await seedDoc('medicalForms', 'formC', { organization: 'OrgA', memberName: 'Z' });

    await assertSucceeds(
      asUser('agentClinicalCreate')
        .doc('medicalForms/formC/clinical/content')
        .set({ presumedDiagnosis: 'encv1:xyz', updatedAt: new Date().toISOString() })
    );
  });

  it('un Agent SANS accès à l\'organisation NE PEUT PAS créer le sous-document clinique (REFUS)', async () => {
    await seedAccount('agentClinicalCreateNoAccess', { profile: 'Agent', assignedOrganizations: ['OrgA'] });
    await seedDoc('medicalForms', 'formD', { organization: 'OrgB', memberName: 'W' });

    await assertFails(
      asUser('agentClinicalCreateNoAccess')
        .doc('medicalForms/formD/clinical/content')
        .set({ presumedDiagnosis: 'encv1:xyz', updatedAt: new Date().toISOString() })
    );
  });

  it('un Agent avec accès PEUT mettre à jour le sous-document clinique', async () => {
    await seedAccount('agentClinicalUpdate', { profile: 'Agent', assignedOrganizations: ['OrgA'] });
    await seedDoc('medicalForms', 'formE', { organization: 'OrgA', memberName: 'V' });
    await seedDoc('medicalForms/formE/clinical', 'content', { presumedDiagnosis: 'encv1:old' });

    await assertSucceeds(
      asUser('agentClinicalUpdate')
        .doc('medicalForms/formE/clinical/content')
        .set({ presumedDiagnosis: 'encv1:new', updatedAt: new Date().toISOString() })
    );
  });

  it('un Agent (non-Admin) NE PEUT PAS supprimer le sous-document clinique, même avec accès à l\'organisation (REFUS)', async () => {
    await seedAccount('agentClinicalDelete', { profile: 'Agent', assignedOrganizations: ['OrgA'] });
    await seedDoc('medicalForms', 'formF', { organization: 'OrgA', memberName: 'U' });
    await seedDoc('medicalForms/formF/clinical', 'content', { presumedDiagnosis: 'encv1:abc' });

    await assertFails(asUser('agentClinicalDelete').doc('medicalForms/formF/clinical/content').delete());
  });

  it('un Admin PEUT supprimer le sous-document clinique', async () => {
    await seedAccount('adminClinicalDelete', { profile: 'Admin' });
    await seedDoc('medicalForms', 'formG', { organization: 'OrgA', memberName: 'T' });
    await seedDoc('medicalForms/formG/clinical', 'content', { presumedDiagnosis: 'encv1:abc' });

    await assertSucceeds(asUser('adminClinicalDelete').doc('medicalForms/formG/clinical/content').delete());
  });

  it('un Admin garde un accès total au sous-document clinique, même hors de son assignedOrganizations', async () => {
    await seedAccount('adminClinicalRead', { profile: 'Admin', assignedOrganizations: ['OrgZ'] });
    await seedDoc('medicalForms', 'formH', { organization: 'OrgQ', memberName: 'S' });
    await seedDoc('medicalForms/formH/clinical', 'content', { presumedDiagnosis: 'encv1:abc' });

    await assertSucceeds(asUser('adminClinicalRead').doc('medicalForms/formH/clinical/content').get());
  });

  it('non-régression : un formulaire legacy (contenu clinique intégré au document parent) reste lisible normalement', async () => {
    await seedAccount('agentLegacyForm', { profile: 'Agent', assignedOrganizations: ['OrgA'] });
    await seedDoc('medicalForms', 'formLegacy', {
      organization: 'OrgA',
      memberName: 'Legacy',
      doctorPrescription: { presumedDiagnosis: 'encv1:legacy' },
    });

    await assertSucceeds(asUser('agentLegacyForm').doc('medicalForms/formLegacy').get());
  });
});
