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
  await testEnv.clearFirestore();
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

  it('policyPayments : lecture cloisonnée par organizationId', async () => {
    await seedAccount('agentPayments', { profile: 'Agent', assignedOrganizations: ['OrgA'] });
    await seedDoc('policyPayments', 'p1', { organizationId: 'OrgB', amountDue: 100 });

    await assertFails(asUser('agentPayments').doc('policyPayments/p1').get());
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
