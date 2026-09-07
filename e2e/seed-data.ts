// === AMÉLIORATION AJOUTÉE : tests end-to-end (préparation Go-Live, 2026-09-07) ===
// Seed de données pour les tests E2E, exécuté UNIQUEMENT contre les émulateurs Firestore/Auth
// locaux (jamais contre un projet Firebase réel — voir e2e/global-setup.ts, qui définit
// FIRESTORE_EMULATOR_HOST/FIREBASE_AUTH_EMULATOR_HOST avant tout appel Admin SDK). Deux comptes
// de test : un Agent (crée dossiers/cartes) et un Supervisor (les approuve) — la séparation des
// tâches (SoD) exige un compte différent du créateur pour approuver, exactement comme en
// production (voir firestore.rules isSelfCreated()).
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { E2E_PROJECT_ID, E2E_DATABASE_ID, E2E_ORG, E2E_AGENT, E2E_SUPERVISOR } from './e2e-constants';

export async function seedE2EData(): Promise<void> {
  const app = getApps().length ? getApps()[0] : initializeApp({ projectId: E2E_PROJECT_ID });
  const auth = getAuth(app);
  const db = getFirestore(app, E2E_DATABASE_ID);

  async function ensureUser(spec: { email: string; password: string; fullName: string }): Promise<string> {
    try {
      const existing = await auth.getUserByEmail(spec.email);
      await auth.updateUser(existing.uid, { password: spec.password });
      return existing.uid;
    } catch {
      const created = await auth.createUser({
        email: spec.email,
        password: spec.password,
        displayName: spec.fullName,
      });
      return created.uid;
    }
  }

  const agentUid = await ensureUser(E2E_AGENT);
  const supervisorUid = await ensureUser(E2E_SUPERVISOR);

  await db.doc(`accounts/${agentUid}`).set({
    id: agentUid,
    username: E2E_AGENT.username,
    email: E2E_AGENT.email,
    authEmail: E2E_AGENT.email,
    fullName: E2E_AGENT.fullName,
    profile: 'Agent',
    permissions: [],
    isActive: true,
    entity: 'ACTIVA Liberia',
    country: 'Liberia',
    createdAt: new Date().toISOString().split('T')[0],
  });

  await db.doc(`accounts/${supervisorUid}`).set({
    id: supervisorUid,
    username: E2E_SUPERVISOR.username,
    email: E2E_SUPERVISOR.email,
    authEmail: E2E_SUPERVISOR.email,
    fullName: E2E_SUPERVISOR.fullName,
    profile: 'Supervisor',
    permissions: [],
    isActive: true,
    entity: 'ACTIVA Liberia',
    country: 'Liberia',
    createdAt: new Date().toISOString().split('T')[0],
  });

  await db.doc(`organizations/${E2E_ORG.replace(/\s+/g, '_')}`).set({
    id: E2E_ORG.replace(/\s+/g, '_'),
    name: E2E_ORG,
    status: 'Active',
    coverageRate: 80,
    policyNumber: 'E2E-POL-001',
  });

  await db.doc('ceilings/e2e-ceiling').set({
    id: 'e2e-ceiling',
    organization: E2E_ORG,
    careType: 'General',
    maxAgePrincipal: 65,
    maxAgeSpouse: 65,
    maxAgeChild: 21,
  });

  await db.doc('counters/cardNumbers').set({ lastAssuredNumber: 0, formatVersion: 'v2' });

  // === AMÉLIORATION AJOUTÉE : tests end-to-end — provider requis pour le formulaire de
  // déclaration de sinistre (Claims Processing) ; sans lui la liste déroulante "Approved
  // Healthcare Provider" est vide et bloque la soumission (champ required).
  await db.doc('providers/e2e-provider').set({
    id: 'e2e-provider',
    name: 'E2E Test Clinic',
    type: 'Clinic',
    location: 'Monrovia',
    conventionNumber: 'E2E-CONV-001',
    kypStatus: 'validated',
    contactPhone: '+231770000099',
    status: 'Contracted',
  });
}
