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
  console.log('--- Starting One-Shot Plaintext Password Migration ---');
  const app = initializeApp({
    apiKey: 'AIzaSyDfN_rZOwrcmVuJHzymswFpoNl6zBuaRXk',
    projectId: 'gen-lang-client-0957905786',
    authDomain: 'gen-lang-client-0957905786.firebaseapp.com'
  });
  const auth = getAuth(app);
  const db = getFirestore(app, 'ai-studio-activahealthpass-a71d742a-47a5-4343-b20f-a025fe51929b');

  // Authenticate as active admin/migration user to satisfy `isSignedIn()` rule
  const adminEmail = 'yannick.ekani_test@activa.local';
  const adminPass = 'ActivaJKC8Q@!2025';
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
  console.log(`- Migrated and purged: ${migratedCount}`);
  console.log(`- Already clean (no plaintext): ${alreadyCleanCount}`);
  console.log(`--- Migration Finished Successfully ---`);
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
