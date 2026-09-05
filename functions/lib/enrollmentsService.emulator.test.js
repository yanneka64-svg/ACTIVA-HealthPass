"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// === AMÉLIORATION AJOUTÉE : preuve reproductible (câblage "tout câbler") ===
// Vérifie le correctif trouvé en préparant le câblage de processEnrollmentDecision : un
// ayant droit (dépendant) approuvé doit être attaché au tableau `dependents[]` du document
// PRINCIPAL déjà existant — jamais créé comme un document `members` séparé. Nécessite
// l'émulateur Firestore : `npm run test:emulator` (functions/), qui lance
// `firebase emulators:exec --only firestore "vitest run src/enrollmentsService.emulator.test.ts"`.
const vitest_1 = require("vitest");
const admin = require("firebase-admin");
const enrollmentsService_1 = require("./enrollmentsService");
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-activa-healthpass-fn-test';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
let app;
let db;
(0, vitest_1.beforeAll)(() => {
    app = admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT }, 'enrollments-sync-test');
    db = app.firestore();
    // Même réglage que functions/src/index.ts (voir son commentaire) : sans lui, un champ
    // optionnel absent des deux côtés (`enrollment.x || existing.x` valant `undefined`) fait
    // échouer l'écriture entière avec une exception peu explicite, un cas normal et non une
    // erreur applicative.
    db.settings({ ignoreUndefinedProperties: true });
});
(0, vitest_1.afterAll)(async () => {
    await app.delete();
});
(0, vitest_1.describe)('syncApprovedEnrollmentToMembersServer', () => {
    (0, vitest_1.it)('attache un ayant droit approuvé au tableau dependents[] du principal existant (jamais un nouveau document members)', async () => {
        const principalRef = db.collection('members').doc();
        await principalRef.set({
            id: principalRef.id,
            cardNo: 'AMID-260101-00010',
            principalName: 'John Doe',
            organization: 'OrgA',
            relationship: 'Principal',
            status: 'Actif',
            children: [],
            dependents: [],
            createdAt: new Date().toISOString(),
        });
        const beforeCount = (await db.collection('members').get()).size;
        const memberId = await (0, enrollmentsService_1.syncApprovedEnrollmentToMembersServer)(db, {
            relationship: 'Child',
            mainInsuredCardNo: 'AMID-260101-00010',
            cardNo: 'AMID-260101-00011',
            fullName: 'Jane Doe',
            organization: 'OrgA',
        }, 'approverUid');
        const afterCount = (await db.collection('members').get()).size;
        // Aucun nouveau document `members` créé pour l'ayant droit.
        (0, vitest_1.expect)(afterCount).toBe(beforeCount);
        (0, vitest_1.expect)(memberId).toBe(principalRef.id);
        const updatedPrincipal = (await principalRef.get()).data();
        (0, vitest_1.expect)(updatedPrincipal?.dependents).toHaveLength(1);
        (0, vitest_1.expect)(updatedPrincipal?.dependents[0]).toMatchObject({
            fullName: 'Jane Doe',
            cardNo: 'AMID-260101-00011',
            relationship: 'child',
        });
        (0, vitest_1.expect)(updatedPrincipal?.children).toContain('Jane Doe');
    });
    (0, vitest_1.it)('crée un nouveau membre pour un principal introuvable (cas normal, aucun changement de comportement)', async () => {
        const memberId = await (0, enrollmentsService_1.syncApprovedEnrollmentToMembersServer)(db, {
            relationship: 'Principal',
            cardNo: 'AMID-260101-00020',
            fullName: 'New Principal',
            organization: 'OrgB',
        }, 'approverUid');
        const created = (await db.collection('members').doc(memberId).get()).data();
        (0, vitest_1.expect)(created?.principalName).toBe('New Principal');
        (0, vitest_1.expect)(created?.cardNo).toBe('AMID-260101-00020');
    });
    (0, vitest_1.it)('met à jour (jamais ne duplique) un principal déjà existant retrouvé par cardNo', async () => {
        const existingRef = db.collection('members').doc();
        await existingRef.set({
            id: existingRef.id,
            cardNo: 'AMID-260101-00030',
            principalName: 'Old Name',
            organization: 'OrgC',
            status: 'Actif',
            createdAt: new Date().toISOString(),
        });
        const beforeCount = (await db.collection('members').get()).size;
        const memberId = await (0, enrollmentsService_1.syncApprovedEnrollmentToMembersServer)(db, {
            relationship: 'Principal',
            cardNo: 'AMID-260101-00030',
            fullName: 'Updated Name',
            organization: 'OrgC',
        }, 'approverUid');
        const afterCount = (await db.collection('members').get()).size;
        (0, vitest_1.expect)(afterCount).toBe(beforeCount);
        (0, vitest_1.expect)(memberId).toBe(existingRef.id);
        const updated = (await existingRef.get()).data();
        (0, vitest_1.expect)(updated?.principalName).toBe('Updated Name');
    });
});
//# sourceMappingURL=enrollmentsService.emulator.test.js.map