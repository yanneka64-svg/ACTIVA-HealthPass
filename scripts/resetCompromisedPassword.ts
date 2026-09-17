/**
 * Emergency script to reset the compromised password of a Firebase Authentication account
 * and ensure the old, compromised password is verifiably revoked.
 *
 * === AMÉLIORATION AJOUTÉE : sécurité (revue backend 2026-09-06) ===
 * Ce script contenait auparavant, EN CLAIR, la clé API Firebase et un repli codé en dur sur
 * L'ANCIEN mot de passe déjà compromis (`ActivaJKC8Q@!2025`) — exactement le type d'erreur que
 * ce script a pour but de corriger. Il n'existe plus aucune valeur sensible en dur : tout doit
 * être fourni par variable d'environnement. Le nouveau mot de passe généré est affiché UNE
 * SEULE FOIS sur la sortie standard (jamais écrit dans un fichier ni committé) pour que
 * l'opérateur puisse le noter dans un gestionnaire de secrets ; il ne doit ensuite JAMAIS être
 * recopié en dur dans un autre script (c'est précisément ce qui a compromis le mot de passe
 * précédent une seconde fois — voir docs/security/BACKEND_AUDIT_2026-09-06_REMEDIATION.md).
 *
 * USAGE :
 *   FIREBASE_API_KEY=... FIREBASE_PROJECT_ID=... FIREBASE_AUTH_DOMAIN=... \
 *   TARGET_ACCOUNT_EMAIL=... OLD_COMPROMISED_PASSWORD=... [NEW_ADMIN_PASSWORD=...] \
 *   npx tsx scripts/resetCompromisedPassword.ts
 *
 *   (NEW_ADMIN_PASSWORD est optionnel : si absent, un mot de passe aléatoire cryptographique
 *   est généré et affiché une seule fois à la fin de l'exécution.)
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, updatePassword, signOut } from 'firebase/auth';
import { randomBytes } from 'crypto';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. See the USAGE comment at the top of this script.`);
  }
  return value;
}

async function run() {
  console.log('--- EMERGENCY PASSWORD ROTATION ---');
  const app = initializeApp({
    apiKey: requireEnv('FIREBASE_API_KEY'),
    projectId: requireEnv('FIREBASE_PROJECT_ID'),
    authDomain: requireEnv('FIREBASE_AUTH_DOMAIN'),
  });
  const auth = getAuth(app);

  const targetEmail = requireEnv('TARGET_ACCOUNT_EMAIL');
  const compromisedPassword = requireEnv('OLD_COMPROMISED_PASSWORD');

  // Generate a cryptographically secure random password unless one was explicitly provided.
  const randomSuffix = randomBytes(18).toString('base64url');
  const newPassword = process.env.NEW_ADMIN_PASSWORD || `Activa#${randomSuffix}!`;

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
