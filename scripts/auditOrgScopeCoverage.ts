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
 * NOT make that change. It reports which accounts would be affected, and (beyond accounts)
 * how many documents in each org-scoped business collection actually carry an organization
 * field, so a human with production Firestore access can evaluate the real-world impact
 * before anyone decides to flip the default.
 *
 * This script performs NO writes.
 *
 * === AMÉLIORATION AJOUTÉE (2026-09-06) : fusionné avec une version poussée en parallèle
 * directement sur `main`, qui ajoutait une couverture utile (audit multi-collections :
 * members/claims/enrollments/invoices/medicalForms/policyPayments/healthPolicies, registre des
 * organisations) mais réintroduisait la clé API Firebase ET un mot de passe réel EN DUR comme
 * valeur de repli — exactement le problème déjà corrigé une première fois dans ce fichier (voir
 * git log). Toute valeur sensible reste exclusivement lue depuis une variable d'environnement,
 * sans repli codé en dur, quelle que soit la version d'origine du code fusionné.
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

interface CollectionAuditResult {
  collectionName: string;
  totalDocs: number;
  scopedField: string;
  withOrgField: number;
  missingOrgField: number;
  uniqueOrgs: string[];
  orphanedDocIds: string[];
}

async function audit() {
  console.log('================================================================');
  console.log('AUDIT REPORT: SEC-FS-002 — Multi-Tenant Organization Scope Coverage (read-only)');
  console.log('Timestamp: ' + new Date().toISOString());
  console.log('================================================================\n');

  const app = initializeApp({
    apiKey: requireEnv('FIREBASE_API_KEY'),
    projectId: requireEnv('FIREBASE_PROJECT_ID'),
    authDomain: requireEnv('FIREBASE_AUTH_DOMAIN'),
  });
  const auth = getAuth(app);
  const db = getFirestore(app, requireEnv('FIRESTORE_DATABASE_ID'));

  await signInWithEmailAndPassword(auth, requireEnv('AUDIT_ADMIN_EMAIL'), requireEnv('AUDIT_ADMIN_PASSWORD'));

  // --- 1. Master organizations registry ---
  console.log('--- 1. MASTER ORGANIZATIONS REGISTRY ---');
  const orgsSnap = await getDocs(collection(db, 'organizations'));
  const knownOrgs = new Set<string>();
  orgsSnap.docs.forEach((d) => {
    const data = d.data();
    knownOrgs.add(data.name || d.id);
  });
  console.log(`Total Master Organizations defined: ${orgsSnap.size}`);
  console.log(`Known Organizations: [${Array.from(knownOrgs).join(', ')}]\n`);

  // --- 2. Accounts & assignedOrganizations coverage ---
  console.log('--- 2. ACCOUNTS & TENANT SCOPING AUDIT (SEC-FS-002 core question) ---');
  const accountsSnap = await getDocs(collection(db, 'accounts'));
  const unscoped: { id: string; username?: string; profile?: string; isActive?: boolean }[] = [];
  let scopedCount = 0;
  let adminOrOtherCount = 0;

  accountsSnap.docs.forEach((docSnap) => {
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

  console.log(`Total accounts found: ${accountsSnap.size}`);
  console.log(`Agent/Supervisor accounts WITH assignedOrganizations set: ${scopedCount}`);
  console.log(`Admin (or other/unrecognized profile) accounts, not affected by hasOrgAccess(): ${adminOrOtherCount}`);
  console.log(`Agent/Supervisor accounts WITHOUT assignedOrganizations (would lose unrestricted`);
  console.log(`org access if the hasOrgAccess() default were flipped to closed): ${unscoped.length}`);
  if (unscoped.length > 0) {
    console.log('\nAffected accounts:');
    unscoped.forEach((a) => {
      console.log(`  - ${a.id} | username=${a.username || 'unknown'} | profile=${a.profile} | isActive=${a.isActive}`);
    });
  }

  // --- 3. Business collections organization-field coverage ---
  console.log('\n--- 3. BUSINESS COLLECTIONS ORGANIZATION FIELD COVERAGE ---');
  const targetCollections: { name: string; field: string }[] = [
    { name: 'members', field: 'organization' },
    { name: 'claims', field: 'organization' },
    { name: 'enrollments', field: 'organization' },
    { name: 'invoices', field: 'organization' },
    { name: 'medicalForms', field: 'organization' },
    { name: 'policyPayments', field: 'organizationId' },
    { name: 'healthPolicies', field: 'organizationId' },
  ];

  const results: CollectionAuditResult[] = [];

  for (const target of targetCollections) {
    const snap = await getDocs(collection(db, target.name));
    let withOrg = 0;
    let missingOrg = 0;
    const orgsFound = new Set<string>();
    const orphaned: string[] = [];

    snap.docs.forEach((docSnap) => {
      const val = docSnap.data()[target.field];
      if (val && typeof val === 'string' && val.trim().length > 0) {
        withOrg++;
        orgsFound.add(val.trim());
      } else {
        missingOrg++;
        orphaned.push(docSnap.id);
      }
    });

    results.push({
      collectionName: target.name,
      totalDocs: snap.size,
      scopedField: target.field,
      withOrgField: withOrg,
      missingOrgField: missingOrg,
      uniqueOrgs: Array.from(orgsFound),
      orphanedDocIds: orphaned,
    });
  }

  console.log(
    'Collection'.padEnd(16) +
    'Total Docs'.padEnd(12) +
    'Scoped Field'.padEnd(16) +
    'With Org'.padEnd(12) +
    'Missing Org'.padEnd(14) +
    'Status'
  );
  console.log('-'.repeat(76));

  let totalDocsAudited = 0;
  let totalMissingOrg = 0;

  for (const res of results) {
    totalDocsAudited += res.totalDocs;
    totalMissingOrg += res.missingOrgField;
    const status = res.missingOrgField === 0 ? 'PASS' : res.totalDocs === 0 ? 'EMPTY' : 'WARN';
    console.log(
      res.collectionName.padEnd(16) +
      String(res.totalDocs).padEnd(12) +
      res.scopedField.padEnd(16) +
      String(res.withOrgField).padEnd(12) +
      String(res.missingOrgField).padEnd(14) +
      status
    );
    if (res.orphanedDocIds.length > 0) {
      console.log(`    -> Un-scoped document IDs: ${res.orphanedDocIds.slice(0, 5).join(', ')}${res.orphanedDocIds.length > 5 ? '...' : ''}`);
    }
  }

  console.log('\n--- 4. SUMMARY ---');
  console.log(`Total business documents inspected : ${totalDocsAudited}`);
  console.log(`Total documents properly scoped     : ${totalDocsAudited - totalMissingOrg}`);
  console.log(`Total documents un-scoped / missing : ${totalMissingOrg}`);
  console.log('\n--- Audit finished. No data was modified. ---');
  process.exit(0);
}

audit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
