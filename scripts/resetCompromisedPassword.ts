/**
 * Emergency script to reset the compromised password of yannick.ekani_test@activa.local
 * in Firebase Authentication and ensure it is updated securely.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, updatePassword, signOut } from 'firebase/auth';
import { randomBytes } from 'crypto';

async function run() {
  console.log('--- EMERGENCY PASSWORD ROTATION ---');
  const app = initializeApp({
    apiKey: 'AIzaSyDfN_rZOwrcmVuJHzymswFpoNl6zBuaRXk',
    projectId: 'gen-lang-client-0957905786',
    authDomain: 'gen-lang-client-0957905786.firebaseapp.com'
  });
  const auth = getAuth(app);

  const targetEmail = 'yannick.ekani_test@activa.local';
  const compromisedPassword = process.env.OLD_COMPROMISED_PASSWORD || 'ActivaJKC8Q@!2025';

  // Generate a cryptographically secure 28-character password
  const randomSuffix = randomBytes(12).toString('base64url');
  const newPassword = process.env.NEW_ADMIN_PASSWORD || `Activa#P@ss2026_${randomSuffix}!`;

  console.log(`Step 1: Authenticating as ${targetEmail} with current credentials...`);
  let userCred;
  try {
    userCred = await signInWithEmailAndPassword(auth, targetEmail, compromisedPassword);
    console.log(`✓ Authentication succeeded for UID: ${userCred.user.uid}`);
  } catch (err: any) {
    console.error(`✗ Authentication failed with current password: ${err.message}`);
    // Check if it was already rotated
    try {
      console.log('Checking if password was already rotated...');
      await signInWithEmailAndPassword(auth, targetEmail, newPassword);
      console.log('✓ Account is already secured with new credentials.');
      process.exit(0);
    } catch {
      console.error('Could not authenticate with either old or new password.');
      process.exit(1);
    }
  }

  console.log(`Step 2: Updating password in Firebase Authentication...`);
  await updatePassword(userCred.user, newPassword);
  console.log(`✓ Password updated successfully in Firebase Authentication.`);

  await signOut(auth);

  console.log(`Step 3: Verification gate - verifying compromised password is REVOKED...`);
  try {
    await signInWithEmailAndPassword(auth, targetEmail, compromisedPassword);
    console.error(`✗ CRITICAL FAILURE: Compromised password is still accepted!`);
    process.exit(1);
  } catch (err: any) {
    console.log(`✓ CONFIRMED: Compromised password is rejected (${err.code || err.message}).`);
  }

  console.log(`Step 4: Verification gate - verifying new password is ACTIVE...`);
  const verifyCred = await signInWithEmailAndPassword(auth, targetEmail, newPassword);
  console.log(`✓ CONFIRMED: New credentials successfully authenticated for UID: ${verifyCred.user.uid}`);

  await signOut(auth);

  console.log('\n======================================================');
  console.log('ROTATION COMPLETED SUCCESSFULLY');
  console.log(`User       : ${targetEmail}`);
  console.log(`UID        : ${verifyCred.user.uid}`);
  console.log(`New Pass   : ${newPassword}`);
  console.log('======================================================\n');
  process.exit(0);
}

run().catch((err) => {
  console.error('Rotation script failed:', err);
  process.exit(1);
});
