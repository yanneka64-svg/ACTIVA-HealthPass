// === AMÉLIORATION AJOUTÉE : sécurité/robustesse (Phase 2 du plan de durcissement, 2026-09-17) ===
// Complète tests/storage.rules.test.ts (qui ne vérifie que le TEXTE de storage.rules, voir son
// en-tête et docs/ci-cd/TEST_STRATEGY.md §5) par un vrai test COMPORTEMENTAL contre l'émulateur
// Firebase Storage — même approche que tests/firestore.rules.test.ts pour firestore.rules.
// N'existait pas avant cette session (gap explicitement documenté dans TEST_STRATEGY.md).
//
// Exécution : firebase emulators:exec --only storage "npm run test:storage-rules"
// (voir package.json / firebase.json — émulateur Storage sur 127.0.0.1:9199)
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestContext,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import fs from 'fs';
import path from 'path';

// === AMÉLIORATION AJOUTÉE : robustesse CI (retour de revue coderabbitai sur la PR #59,
// 2026-09-17) === Aligné sur le project ID passé par `--project` à `firebase emulators:exec`
// dans ci.yml (`demo-activa-ci`), pour éviter tout risque de conflit sous `singleProjectMode`
// (voir firebase.json) si un futur changement de CI venait à démarrer plusieurs émulateurs en
// une seule invocation partageant le hub. Sans effet observé en pratique avec `--only storage`
// seul (validé deux fois localement avant ce correctif), mais coûte zéro pour l'éliminer.
const PROJECT_ID = 'demo-activa-ci';

type StorageInstance = ReturnType<RulesTestContext['storage']>;
type StorageRef = ReturnType<StorageInstance['ref']>;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      rules: fs.readFileSync(path.resolve(__dirname, '../storage.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

afterEach(async () => {
  await testEnv.clearStorage();
});

afterAll(async () => {
  await testEnv.cleanup();
});

// Petit contenu binaire factice, en dessous/au-dessus des limites de taille testées.
function bytes(sizeInMb: number): Uint8Array {
  return new Uint8Array(Math.max(1, Math.round(sizeInMb * 1024 * 1024)));
}

// firebase.storage.Reference#put() (SDK compat) retourne un UploadTask "thenable" mais pas un
// vrai Promise au sens du typage TypeScript — assertSucceeds/assertFails exigent un Promise<T>.
// Promise.resolve(...) fait la conversion sans changer le comportement runtime (déjà validé
// manuellement contre l'émulateur avant ce correctif de typage).
function put(ref: StorageRef, data: Uint8Array, metadata: { contentType: string }): Promise<unknown> {
  return Promise.resolve(ref.put(data, metadata));
}

async function seedFile(path: string, contentType: string, sizeInMb = 0.001) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await put(ctx.storage().ref(path), bytes(sizeInMb), { contentType });
  });
}

function asUser(uid: string, claims: Record<string, unknown> = {}) {
  return testEnv.authenticatedContext(uid, claims).storage();
}

function anonymous() {
  return testEnv.unauthenticatedContext().storage();
}

describe('Storage Rules (émulateur) — chemins cloisonnés par organisation (member-photos/{orgId})', () => {
  it('un utilisateur non authentifié ne peut ni lire ni écrire', async () => {
    await seedFile('member-photos/orgA/photo.jpg', 'image/jpeg');
    await assertFails(anonymous().ref('member-photos/orgA/photo.jpg').getDownloadURL());
    await assertFails(put(anonymous().ref('member-photos/orgA/photo.jpg'), bytes(0.001), { contentType: 'image/jpeg' }));
  });

  it('un utilisateur actif SANS claim "orgs" a accès à toute organisation (comportement documenté par hasOrgAccess, non-régression)', async () => {
    await seedFile('member-photos/orgA/photo.jpg', 'image/jpeg');
    await assertSucceeds(asUser('u1').ref('member-photos/orgA/photo.jpg').getDownloadURL());
  });

  it('un utilisateur avec claim "orgs" incluant orgA peut lire un fichier de orgA', async () => {
    await seedFile('member-photos/orgA/photo.jpg', 'image/jpeg');
    await assertSucceeds(asUser('u2', { orgs: { orgA: true } }).ref('member-photos/orgA/photo.jpg').getDownloadURL());
  });

  it('un utilisateur avec claim "orgs" NE contenant PAS orgB ne peut pas lire un fichier de orgB (isolation)', async () => {
    await seedFile('member-photos/orgB/photo.jpg', 'image/jpeg');
    await assertFails(asUser('u3', { orgs: { orgA: true } }).ref('member-photos/orgB/photo.jpg').getDownloadURL());
  });

  it('un Admin a accès à toute organisation même avec une claim "orgs" restreinte', async () => {
    await seedFile('member-photos/orgB/photo.jpg', 'image/jpeg');
    await assertSucceeds(asUser('admin1', { role: 'Admin', orgs: { orgA: true } }).ref('member-photos/orgB/photo.jpg').getDownloadURL());
  });

  it('un utilisateur désactivé (isActive: false) ne peut pas lire, même dans son organisation', async () => {
    await seedFile('member-photos/orgA/photo.jpg', 'image/jpeg');
    await assertFails(asUser('inactive1', { isActive: false, orgs: { orgA: true } }).ref('member-photos/orgA/photo.jpg').getDownloadURL());
  });

  it('accepte une image valide (jpeg, <= 5 Mo) en écriture', async () => {
    await assertSucceeds(put(asUser('u4', { orgs: { orgA: true } }).ref('member-photos/orgA/new.jpg'), bytes(1), { contentType: 'image/jpeg' }));
  });

  it('rejette un type MIME non autorisé (ex. text/html) en écriture', async () => {
    await assertFails(put(asUser('u5', { orgs: { orgA: true } }).ref('member-photos/orgA/new.html'), bytes(0.001), { contentType: 'text/html' }));
  });

  it('rejette un fichier dépassant la limite de 5 Mo pour une photo', async () => {
    await assertFails(put(asUser('u6', { orgs: { orgA: true } }).ref('member-photos/orgA/toobig.jpg'), bytes(6), { contentType: 'image/jpeg' }));
  });

  it('rejette la suppression par un non-Admin', async () => {
    await seedFile('member-photos/orgA/photo.jpg', 'image/jpeg');
    await assertFails(asUser('u7', { orgs: { orgA: true } }).ref('member-photos/orgA/photo.jpg').delete());
  });

  it('autorise la suppression par un Admin', async () => {
    await seedFile('member-photos/orgA/photo.jpg', 'image/jpeg');
    await assertSucceeds(asUser('admin2', { role: 'Admin' }).ref('member-photos/orgA/photo.jpg').delete());
  });
});

describe('Storage Rules (émulateur) — nouveaux chemins justificatifs (claims/receipts/documents)', () => {
  it('accepte un PDF valide (<= 15 Mo) sur claims/{orgId}/{claimId}/...', async () => {
    await assertSucceeds(
      put(asUser('u8', { orgs: { orgA: true } }).ref('claims/orgA/claim1/justificatif.pdf'), bytes(1), { contentType: 'application/pdf' })
    );
  });

  it('rejette un fichier au format non autorisé sur receipts/{orgId}/{receiptId}/...', async () => {
    await assertFails(
      put(asUser('u9', { orgs: { orgA: true } }).ref('receipts/orgA/r1/script.sh'), bytes(0.001), { contentType: 'application/x-sh' })
    );
  });

  it('isole documents/{orgId}/... par organisation comme les autres chemins', async () => {
    await seedFile('documents/orgA/d1/doc.pdf', 'application/pdf');
    await assertFails(asUser('u10', { orgs: { orgB: true } }).ref('documents/orgA/d1/doc.pdf').getDownloadURL());
  });
});

describe('Storage Rules (émulateur) — chemins plats historiques (non cloisonnés, fermés)', () => {
  it('refuse la lecture sur l\'ancien chemin plat member-photos/{fileName}, même pour un utilisateur actif de la bonne organisation', async () => {
    await seedFile('member-photos/legacy.jpg', 'image/jpeg');
    await assertFails(asUser('u11', { orgs: { orgA: true } }).ref('member-photos/legacy.jpg').getDownloadURL());
  });

  it('refuse toute nouvelle écriture sur l\'ancien chemin plat enrollment-photos/{fileName}', async () => {
    await assertFails(put(asUser('u12').ref('enrollment-photos/legacy.jpg'), bytes(0.001), { contentType: 'image/jpeg' }));
  });

  it('autorise malgré tout la suppression par un Admin sur l\'ancien chemin plat (purge)', async () => {
    await seedFile('member-photos/legacy.jpg', 'image/jpeg');
    await assertSucceeds(asUser('admin3', { role: 'Admin' }).ref('member-photos/legacy.jpg').delete());
  });
});

describe('Storage Rules (émulateur) — fermeture par défaut', () => {
  it('refuse la lecture et l\'écriture sur un chemin arbitraire non déclaré', async () => {
    await assertFails(put(asUser('u13').ref('some/random/path.txt'), bytes(0.001), { contentType: 'text/plain' }));
    await assertFails(asUser('u13').ref('some/random/path.txt').getDownloadURL());
  });
});

