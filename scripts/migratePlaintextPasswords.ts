/**
 * One-shot migration script to purge remaining plaintext passwords and temp passwords
 * from Firestore `accounts` collection in the named database.
 *
 * Hashes passwords using PBKDF2-HMAC-SHA256 (150,000 iterations),
 * writes passwordHash + passwordSalt, and deletes the plaintext fields.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, setDoc, deleteField } from 'firebase/firestore';
import { hashPassword } from '../src/utils/passwordUtils';

async function migrate() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`--- Starting Plaintext Password Migration ${isDryRun ? '[DRY-RUN MODE]' : '[LIVE EXECUTION]'} ---`);
  const app = initializeApp({
    apiKey: 'AIzaSyDfN_rZOwrcmVuJHzymswFpoNl6zBuaRXk',
    projectId: 'gen-lang-client-0957905786',
    authDomain: 'gen-lang-client-0957905786.firebaseapp.com'
  });
  const auth = getAuth(app);
  const db = getFirestore(app, 'ai-studio-activahealthpass-a71d742a-47a5-4343-b20f-a025fe51929b');

  // Authenticate as active admin/migration user to satisfy `isSignedIn()` rule
  const adminEmail = process.env.MIGRATION_ADMIN_EMAIL || 'yannick.ekani_test@activa.local';
  const adminPass = process.env.MIGRATION_ADMIN_PASSWORD || 'Activa#P@ss2026_DLgQmkuyVPyxClkS!';
  try {
    await signInWithEmailAndPassword(auth, adminEmail, adminPass);
    console.log(`Authenticated for migration with ${adminEmail}`);
  } catch (err: any) {
    console.error(`Authentication error: ${err.message}`);
    process.exit(1);
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
      console.log(`[Target] Account ${docSnap.id} (username: ${data.username || 'unknown'}, plaintext: ${hasPlaintextPassword ? 'password' : ''} ${hasTempPassword ? 'tempPassword' : ''})`);

      const { passwordHash, passwordSalt } = await hashPassword(plaintext);

      if (isDryRun) {
        console.log(`[DRY-RUN] Would compute hash/salt and purge plaintext fields for account ${docSnap.id}`);
      } else {
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
        console.log(`[LIVE] Account ${docSnap.id} migrated successfully (plaintext fields permanently deleted).`);
      }

      migratedCount++;
    } else {
      alreadyCleanCount++;
    }
  }

  console.log(`\nMigration Summary (${isDryRun ? 'DRY-RUN' : 'LIVE'}):`);
  console.log(`- Accounts needing migration : ${migratedCount}`);
  console.log(`- Accounts already clean     : ${alreadyCleanCount}`);
  console.log(`- Total accounts inspected   : ${snap.size}`);
  console.log(`--- Migration Finished Successfully ---`);
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
