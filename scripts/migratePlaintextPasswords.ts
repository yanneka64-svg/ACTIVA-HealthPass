/**
 * One-shot migration script to purge remaining plaintext passwords and temp passwords
 * from Firestore `accounts` collection in the named database.
 *
 * Hashes passwords using PBKDF2-HMAC-SHA256 (150,000 iterations),
 * writes passwordHash + passwordSalt, and deletes the plaintext fields.
 *
 * === AMÉLIORATION AJOUTÉE : sécurité (revue backend 2026-09-06, finding SEC-AUTH-003) ===
 * Ce script contenait auparavant, EN CLAIR ET COMMIS DANS L'HISTORIQUE GIT, une clé API
 * Firebase ainsi qu'un e-mail et un mot de passe réels de compte de migration
 * (`yannick.ekani_test@activa.local`). Ce commit retire ces secrets du fichier — MAIS le
 * mot de passe qui y figurait doit être considéré comme compromis (l'historique git a déjà
 * été poussé sur GitHub) : il doit être changé manuellement dans Firebase Auth dès que
 * possible ; retirer le secret du fichier ne le retire pas de l'historique du dépôt.
 *
 * Toutes les valeurs sensibles sont désormais lues depuis des variables d'environnement
 * (jamais de valeur par défaut en dur) : voir la liste sous USAGE ci-dessous. Un mode
 * `--dry-run` a aussi été ajouté : il journalise chaque compte qui SERAIT migré, sans
 * écrire quoi que ce soit dans Firestore — à utiliser systématiquement en premier pour
 * vérifier la portée réelle de la migration avant toute écriture.
 *
 * USAGE :
 *   FIREBASE_API_KEY=... FIREBASE_PROJECT_ID=... FIREBASE_AUTH_DOMAIN=... \
 *   FIRESTORE_DATABASE_ID=... MIGRATION_ADMIN_EMAIL=... MIGRATION_ADMIN_PASSWORD=... \
 *   npx tsx scripts/migratePlaintextPasswords.ts --dry-run
 *
 *   (puis, une fois la portée validée, relancer SANS --dry-run pour appliquer la migration)
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, setDoc, deleteField } from 'firebase/firestore';
import { hashPassword } from '../src/utils/passwordUtils';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. See the USAGE comment at the top of this script.`);
  }
  return value;
}

async function migrate() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`--- Starting One-Shot Plaintext Password Migration${isDryRun ? ' (DRY RUN — no writes will be made)' : ''} ---`);

  const app = initializeApp({
    apiKey: requireEnv('FIREBASE_API_KEY'),
    projectId: requireEnv('FIREBASE_PROJECT_ID'),
    authDomain: requireEnv('FIREBASE_AUTH_DOMAIN'),
  });
  const auth = getAuth(app);
  const db = getFirestore(app, requireEnv('FIRESTORE_DATABASE_ID'));

  // Authenticate as active admin/migration user to satisfy `isSignedIn()` rule
  const adminEmail = requireEnv('MIGRATION_ADMIN_EMAIL');
  const adminPass = requireEnv('MIGRATION_ADMIN_PASSWORD');
  try {
    await signInWithEmailAndPassword(auth, adminEmail, adminPass);
    console.log(`Authenticated for migration with ${adminEmail}`);
  } catch {
    try {
      await createUserWithEmailAndPassword(auth, adminEmail, adminPass);
      console.log(`Created migration auth user ${adminEmail}`);
    } catch (e: any) {
      console.log(`Auth note: ${e.message}`);
    }
  }

  const snap = await getDocs(collection(db, 'accounts'));
  console.log(`Total accounts found: ${snap.size}`);

  let migratedCount = 0;
  let alreadyCleanCount = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const hasPlaintextPassword = !!data.password;
    const hasTempPassword = !!data.tempPassword;

    if (hasPlaintextPassword || hasTempPassword) {
      const plaintext = data.password || data.tempPassword;

      if (isDryRun) {
        console.log(`[DRY RUN] Would migrate account ${docSnap.id} (username: ${data.username || 'unknown'}) — no write performed.`);
        migratedCount++;
        continue;
      }

      console.log(`Migrating account ${docSnap.id} (username: ${data.username || 'unknown'})...`);

      const { passwordHash, passwordSalt } = await hashPassword(plaintext);

      // Perform update: write hash/salt and permanently delete plaintext fields
      await setDoc(
        doc(db, 'accounts', docSnap.id),
        {
          passwordHash,
          passwordSalt,
          password: deleteField(),
          tempPassword: deleteField(),
          migratedFromPlaintextAt: new Date().toISOString()
        },
        { merge: true }
      );

      migratedCount++;
      console.log(`Account ${docSnap.id} migrated successfully (plaintext fields permanently deleted).`);
    } else {
      alreadyCleanCount++;
    }
  }

  console.log(`\nMigration Summary:`);
  console.log(`- ${isDryRun ? 'Would be migrated' : 'Migrated and purged'}: ${migratedCount}`);
  console.log(`- Already clean (no plaintext): ${alreadyCleanCount}`);
  console.log(`--- Migration ${isDryRun ? 'Dry Run' : ''} Finished Successfully ---`);
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
