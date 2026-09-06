/**
 * Read-only audit script for finding SEC-FS-002 (firestore.rules, hasOrgAccess()).
 *
 * hasOrgAccess() currently returns `true` (unrestricted) for any account whose
 * `assignedOrganizations` field is absent — this is a deliberate, documented backward-
 * compatibility choice (see the Phase 1.3 comment above hasOrgAccess() in firestore.rules):
 * it was introduced as an additive, opt-in field so no existing account's access changed
 * the day the field was introduced.
 *
 * Flipping that default (closed unless explicitly scoped) would immediately restrict every
 * Agent/Supervisor account that has never had `assignedOrganizations` set — this script does
 * NOT make that change. It only lists which accounts would be affected, so a human with
 * production Firestore access can evaluate the real-world impact before anyone decides to
 * flip the default.
 *
 * This script performs NO writes.
 *
 * USAGE:
 *   FIREBASE_API_KEY=... FIREBASE_PROJECT_ID=... FIREBASE_AUTH_DOMAIN=... \
 *   FIRESTORE_DATABASE_ID=... AUDIT_ADMIN_EMAIL=... AUDIT_ADMIN_PASSWORD=... \
 *   npx tsx scripts/auditOrgScopeCoverage.ts
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. See the USAGE comment at the top of this script.`);
  }
  return value;
}

const SCOPABLE_PROFILES = new Set(['Agent', 'Supervisor', 'Superviseur']);

async function audit() {
  console.log('--- Auditing accounts.assignedOrganizations coverage (SEC-FS-002, read-only) ---');

  const app = initializeApp({
    apiKey: requireEnv('FIREBASE_API_KEY'),
    projectId: requireEnv('FIREBASE_PROJECT_ID'),
    authDomain: requireEnv('FIREBASE_AUTH_DOMAIN'),
  });
  const auth = getAuth(app);
  const db = getFirestore(app, requireEnv('FIRESTORE_DATABASE_ID'));

  await signInWithEmailAndPassword(auth, requireEnv('AUDIT_ADMIN_EMAIL'), requireEnv('AUDIT_ADMIN_PASSWORD'));

  const snap = await getDocs(collection(db, 'accounts'));
  console.log(`Total accounts found: ${snap.size}`);

  const unscoped: { id: string; username?: string; profile?: string; isActive?: boolean }[] = [];
  let scopedCount = 0;
  let adminOrOtherCount = 0;

  snap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const profile: string | undefined = data.profile;
    const hasScope = Array.isArray(data.assignedOrganizations) && data.assignedOrganizations.length > 0;

    if (profile && SCOPABLE_PROFILES.has(profile)) {
      if (hasScope) {
        scopedCount++;
      } else {
        unscoped.push({ id: docSnap.id, username: data.username, profile, isActive: data.isActive });
      }
    } else {
      // Admin accounts always bypass hasOrgAccess() (isAdmin() takes priority) — not affected
      // either way by this finding, listed separately for completeness only.
      adminOrOtherCount++;
    }
  });

  console.log(`\nAgent/Supervisor accounts WITH assignedOrganizations set: ${scopedCount}`);
  console.log(`Admin (or other/unrecognized profile) accounts, not affected by hasOrgAccess(): ${adminOrOtherCount}`);
  console.log(`\nAgent/Supervisor accounts WITHOUT assignedOrganizations (would lose unrestricted`);
  console.log(`org access if the hasOrgAccess() default were flipped to closed): ${unscoped.length}`);
  if (unscoped.length > 0) {
    console.log('\nAffected accounts:');
    unscoped.forEach((a) => {
      console.log(`  - ${a.id} | username=${a.username || 'unknown'} | profile=${a.profile} | isActive=${a.isActive}`);
    });
  }

  console.log('\n--- Audit finished. No data was modified. ---');
  process.exit(0);
}

audit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
