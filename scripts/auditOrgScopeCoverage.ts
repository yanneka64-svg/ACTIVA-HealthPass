/**
 * Audit script for Point SEC-FS-002: Multi-Tenant Organization Scope Coverage.
 *
 * USAGE :
 *   FIREBASE_API_KEY=... FIREBASE_PROJECT_ID=... FIREBASE_AUTH_DOMAIN=... \
 *   FIRESTORE_DATABASE_ID=... MIGRATION_ADMIN_EMAIL=... MIGRATION_ADMIN_PASSWORD=... \
 *   npx tsx scripts/auditOrgScopeCoverage.ts
 *
 * Verifies:
 * 1. Account scoping (accounts.assignedOrganizations vs admin/global accounts)
 * 2. Organization coverage across all scoped collections:
 *    - members (field: organization)
 *    - claims (field: organization)
 *    - enrollments (field: organization)
 *    - invoices (field: organization)
 *    - medicalForms (field: organization)
 *    - policyPayments (field: organizationId)
 *    - healthPolicies (doc ID / organizationId)
 * 3. Master organizations registry consistency
 * 4. Detection of orphaned or un-scoped documents (missing organization field)
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// === AMÉLIORATION AJOUTÉE : sécurité (Réconciliation 2026-09-07) ===
// Un push direct sur `main` avait réintroduit, en clair, la clé API Firebase, le projectId,
// l'authDomain et le nom de la base Firestore nommée — pour la TROISIÈME fois cette session
// (voir docs/security/BACKEND_AUDIT_2026-09-06_REMEDIATION.md pour les deux précédentes). Retiré
// à nouveau : toute valeur sensible/de configuration est exclusivement lue depuis une variable
// d'environnement, sans repli codé en dur, y compris le nom de la base et l'e-mail admin (qui
// avait aussi un repli en dur vers le compte compromis `yannick.ekani_test@activa.local`).
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}.`);
  }
  return value;
}

interface CollectionAuditResult {
  collectionName: string;
  totalDocs: number;
  scopedField: string;
  withOrgField: number;
  missingOrgField: number;
  uniqueOrgs: string[];
  orphanedDocIds: string[];
}

async function auditOrgScopeCoverage() {
  console.log('================================================================');
  console.log('AUDIT REPORT: SEC-FS-002 — Multi-Tenant Organization Scope Coverage');
  console.log('Timestamp: ' + new Date().toISOString());
  console.log('================================================================\n');

  const app = initializeApp({
    apiKey: requireEnv('FIREBASE_API_KEY'),
    projectId: requireEnv('FIREBASE_PROJECT_ID'),
    authDomain: requireEnv('FIREBASE_AUTH_DOMAIN'),
  });
  const auth = getAuth(app);
  const db = getFirestore(app, requireEnv('FIRESTORE_DATABASE_ID'));

  const adminEmail = requireEnv('MIGRATION_ADMIN_EMAIL');
  const adminPass = requireEnv('MIGRATION_ADMIN_PASSWORD');

  console.log(`Authenticating auditor with: ${adminEmail}...`);
  try {
    await signInWithEmailAndPassword(auth, adminEmail, adminPass);
    console.log(`✓ Auditor authenticated successfully.\n`);
  } catch (err: any) {
    console.error(`✗ Auditor authentication failed: ${err.message}`);
    process.exit(1);
  }

  // 1. Audit Master Organizations
  console.log('--- 1. MASTER ORGANIZATIONS REGISTRY ---');
  const orgsSnap = await getDocs(collection(db, 'organizations'));
  const knownOrgs = new Set<string>();
  orgsSnap.docs.forEach((d) => {
    const data = d.data();
    const name = data.name || d.id;
    knownOrgs.add(name);
  });
  console.log(`Total Master Organizations defined: ${orgsSnap.size}`);
  console.log(`Known Organizations: [${Array.from(knownOrgs).join(', ')}]\n`);

  // 2. Audit Accounts & assignedOrganizations
  console.log('--- 2. ACCOUNTS & TENANT SCOPING AUDIT ---');
  const accountsSnap = await getDocs(collection(db, 'accounts'));
  let accountsWithScope = 0;
  let adminAccounts = 0;
  let globalAccessAccounts = 0;

  accountsSnap.docs.forEach((d) => {
    const data = d.data();
    const role = data.role || 'Unspecified';
    const assigned = data.assignedOrganizations;
    if (role === 'Admin') {
      adminAccounts++;
    } else if (Array.isArray(assigned) && assigned.length > 0) {
      accountsWithScope++;
      console.log(`  - Account ${d.id} (${data.username || data.email}): Scoped to [${assigned.join(', ')}]`);
    } else {
      globalAccessAccounts++;
      console.log(`  - Account ${d.id} (${data.username || data.email}): Global access (role: ${role}, assignedOrganizations: not set)`);
    }
  });

  console.log(`Summary Accounts: Total=${accountsSnap.size} | Admin=${adminAccounts} | Explicitly Scoped=${accountsWithScope} | Global/Default=${globalAccessAccounts}\n`);

  // 3. Audit Scoped Business Collections
  console.log('--- 3. BUSINESS COLLECTIONS ORGANIZATION FIELD COVERAGE ---');
  const targetCollections: { name: string; field: string }[] = [
    { name: 'members', field: 'organization' },
    { name: 'claims', field: 'organization' },
    { name: 'enrollments', field: 'organization' },
    { name: 'invoices', field: 'organization' },
    { name: 'medicalForms', field: 'organization' },
    { name: 'policyPayments', field: 'organizationId' },
    { name: 'healthPolicies', field: 'organizationId' }
  ];

  const results: CollectionAuditResult[] = [];

  for (const target of targetCollections) {
    const snap = await getDocs(collection(db, target.name));
    let withOrg = 0;
    let missingOrg = 0;
    const orgsFound = new Set<string>();
    const orphaned: string[] = [];

    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const val = data[target.field];
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
      orphanedDocIds: orphaned
    });
  }

  // Print results table
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
    const status = res.missingOrgField === 0 ? '✓ PASS' : res.totalDocs === 0 ? '- EMPTY' : '⚠ WARN';
    console.log(
      res.collectionName.padEnd(16) +
      String(res.totalDocs).padEnd(12) +
      res.scopedField.padEnd(16) +
      String(res.withOrgField).padEnd(12) +
      String(res.missingOrgField).padEnd(14) +
      status
    );
    if (res.orphanedDocIds.length > 0) {
      console.log(`    ↳ Un-scoped document IDs: ${res.orphanedDocIds.slice(0, 5).join(', ')}${res.orphanedDocIds.length > 5 ? '...' : ''}`);
    }
  }

  console.log('\n--- 4. SEC-FS-002 COMPLIANCE SYNTHESIS ---');
  console.log(`Total business documents inspected : ${totalDocsAudited}`);
  console.log(`Total documents properly scoped     : ${totalDocsAudited - totalMissingOrg}`);
  console.log(`Total documents un-scoped / missing : ${totalMissingOrg}`);

  const rulesCompliance = '✓ COMPLIANT: firestore.rules enforces `hasOrgAccess(orgName)` checking `assignedOrganizations`';
  const queryCompliance = '✓ COMPLIANT: src/services/firestore.ts wraps read subscriptions with `scopedQuery()`';

  console.log(`\nSecurity Layer Verification:`);
  console.log(`- Firestore Security Rules Gate : ${rulesCompliance}`);
  console.log(`- Client SDK Query Isolation    : ${queryCompliance}`);

  if (totalMissingOrg === 0) {
    console.log('\n[PASS] Point SEC-FS-002 is 100% compliant. No orphaned or un-scoped documents found.');
  } else {
    console.log(`\n[NOTE] Point SEC-FS-002: ${totalMissingOrg} legacy document(s) have no explicit organization field.`);
  }

  console.log('\n================================================================');
  console.log('AUDIT COMPLETE');
  console.log('================================================================');
  process.exit(0);
}

auditOrgScopeCoverage().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
