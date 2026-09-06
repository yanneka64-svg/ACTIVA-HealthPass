/**
 * Emergency script to DEACTIVATE (isActive: false) the Firestore `accounts` document of an
 * account that has been compromised, WITHOUT deleting it.
 *
 * Contexte (revue backend 2026-09-06) : `yannick.ekani_test@activa.local` a vu son mot de passe
 * compromis à deux reprises (voir docs/security/BACKEND_AUDIT_2026-09-06_REMEDIATION.md). Une
 * rotation de mot de passe (scripts/resetCompromisedPassword.ts) empêche la réutilisation de
 * l'ancien secret, mais ne suffit pas seule si le compte doit être neutralisé immédiatement en
 * attendant une décision définitive (le supprimer ou le garder actif) : ce script coupe l'accès
 * fonctionnel du compte SANS perdre l'historique/audit trail qui référence son UID.
 *
 * Pourquoi désactiver plutôt que supprimer :
 *   - `isActive: false` est vérifié à la fois côté client (src/components/auth/LoginView.tsx)
 *     ET côté règles Firestore (`isActiveUser()` dans firestore.rules) : le compte ne peut plus
 *     se connecter dans l'app ni effectuer une seule écriture, même si le mot de passe compromis
 *     est réutilisé directement contre l'API Firebase Auth (hors SPA).
 *   - Contrairement à une suppression, aucun document historique (claims, enrollments, logs
 *     d'audit) référençant l'UID de ce compte comme auteur/acteur ne devient orphelin : le nom
 *     reste résolvable, la suppression peut être décidée séparément et reste réversible ici
 *     (repasser isActive à true), ce qu'une suppression ne permet pas.
 *
 * Ce script NE modifie PAS le mot de passe Firebase Auth : lancer séparément
 * scripts/resetCompromisedPassword.ts si le mot de passe compromis n'a pas déjà été changé.
 *
 * IMPORTANT : la désactivation d'un compte (isActive) est un champ figé par les règles de
 * self-update (voir firestore.rules) — ce script doit obligatoirement s'authentifier avec un
 * AUTRE compte disposant du profil Admin, jamais avec le compte cible lui-même.
 *
 * USAGE :
 *   FIREBASE_API_KEY=... FIREBASE_PROJECT_ID=... FIREBASE_AUTH_DOMAIN=... \
 *   FIRESTORE_DATABASE_ID=... ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *   TARGET_ACCOUNT_EMAIL=yannick.ekani_test@activa.local \
 *   npx tsx scripts/deactivateCompromisedAccount.ts --dry-run
 *
 *   (relancer sans --dry-run une fois le compte cible confirmé par la sortie du dry-run ;
 *   TARGET_ACCOUNT_ID peut être fourni à la place de TARGET_ACCOUNT_EMAIL si l'UID est déjà
 *   connu, pour éviter toute ambiguïté de correspondance par e-mail)
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, query, where } from 'firebase/firestore';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. See the USAGE comment at the top of this script.`);
  }
  return value;
}

async function run() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`--- Emergency Account Deactivation ${isDryRun ? '[DRY-RUN — no write will be made]' : '[LIVE EXECUTION]'} ---`);

  const app = initializeApp({
    apiKey: requireEnv('FIREBASE_API_KEY'),
    projectId: requireEnv('FIREBASE_PROJECT_ID'),
    authDomain: requireEnv('FIREBASE_AUTH_DOMAIN'),
  });
  const auth = getAuth(app);
  const db = getFirestore(app, requireEnv('FIRESTORE_DATABASE_ID'));

  const adminEmail = requireEnv('ADMIN_EMAIL');
  const adminPassword = requireEnv('ADMIN_PASSWORD');
  const targetId = process.env.TARGET_ACCOUNT_ID;
  const targetEmail = process.env.TARGET_ACCOUNT_EMAIL;

  if (!targetId && !targetEmail) {
    throw new Error('Provide either TARGET_ACCOUNT_ID or TARGET_ACCOUNT_EMAIL.');
  }
  if (targetEmail && adminEmail.toLowerCase() === targetEmail.toLowerCase()) {
    throw new Error('Refusing to run: ADMIN_EMAIL and TARGET_ACCOUNT_EMAIL must not be the same account (self-update of isActive is blocked by firestore.rules anyway).');
  }

  console.log(`Authenticating as admin ${adminEmail}...`);
  await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
  console.log('✓ Admin authentication succeeded.');

  let targetDocId = targetId;
  let targetData: Record<string, any> | undefined;

  if (!targetDocId) {
    console.log(`Looking up account by email/authEmail: ${targetEmail}...`);
    const accountsRef = collection(db, 'accounts');
    const [byEmail, byAuthEmail] = await Promise.all([
      getDocs(query(accountsRef, where('email', '==', targetEmail))),
      getDocs(query(accountsRef, where('authEmail', '==', targetEmail))),
    ]);
    const matches = new Map<string, Record<string, any>>();
    byEmail.docs.forEach((d) => matches.set(d.id, d.data()));
    byAuthEmail.docs.forEach((d) => matches.set(d.id, d.data()));

    if (matches.size === 0) {
      console.error(`✗ No account found matching email/authEmail = ${targetEmail}.`);
      process.exit(1);
    }
    if (matches.size > 1) {
      console.error(`✗ Ambiguous match: ${matches.size} accounts share this email. Re-run with TARGET_ACCOUNT_ID instead:`);
      matches.forEach((data, id) => console.error(`  - ${id} | username=${data.username} | profile=${data.profile}`));
      process.exit(1);
    }
    [[targetDocId, targetData]] = Array.from(matches.entries());
  } else {
    const snap = await getDoc(doc(db, 'accounts', targetDocId));
    if (!snap.exists()) {
      console.error(`✗ No account document found with id ${targetDocId}.`);
      process.exit(1);
    }
    targetData = snap.data();
  }

  console.log('\nTarget account:');
  console.log(`  id       : ${targetDocId}`);
  console.log(`  username : ${targetData?.username || 'unknown'}`);
  console.log(`  email    : ${targetData?.email || targetData?.authEmail || 'unknown'}`);
  console.log(`  profile  : ${targetData?.profile || 'unknown'}`);
  console.log(`  isActive : ${targetData?.isActive}`);

  if (targetData?.isActive === false) {
    console.log('\n✓ Account is already deactivated (isActive: false). Nothing to do.');
    process.exit(0);
  }

  if (isDryRun) {
    console.log(`\n[DRY-RUN] Would set isActive: false on accounts/${targetDocId}. No write performed.`);
    process.exit(0);
  }

  await updateDoc(doc(db, 'accounts', targetDocId as string), { isActive: false });
  console.log(`\n✓ Account accounts/${targetDocId} deactivated (isActive: false).`);
  console.log('Reminder: this does NOT rotate the Firebase Auth password. Run scripts/resetCompromisedPassword.ts');
  console.log('separately if the compromised password has not already been changed.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Deactivation script failed:', err);
  process.exit(1);
});
