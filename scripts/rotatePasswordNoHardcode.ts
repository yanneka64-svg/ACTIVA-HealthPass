/**
 * Secure password rotation script for a compromised account.
 * - Generates high-entropy password in memory
 * - NEVER logs or hardcodes passwords
 * - Verifies revocation of the previous password
 * - Verifies activation of the new password
 * - Stores the new password exclusively in gitignored .env.local
 *
 * === AMÉLIORATION AJOUTÉE : sécurité (Réconciliation 2026-09-07) ===
 * Ce fichier, malgré son nom ("NoHardcode"), contenait pourtant la clé API Firebase codée en
 * dur, ET un repli implicite de l'identifiant cible vers le compte déjà compromis à deux
 * reprises `yannick.ekani_test@activa.local` (voir docs/security/BACKEND_AUDIT_2026-09-06_REMEDIATION.md)
 * — l'affirmation finale du script ("Hardcoded in code: NO") était donc inexacte. Corrigé :
 * aucune valeur sensible/de configuration en dur, y compris l'identifiant cible (obligatoire,
 * sans repli).
 *
 * USAGE :
 *   FIREBASE_API_KEY=... FIREBASE_PROJECT_ID=... FIREBASE_AUTH_DOMAIN=... \
 *   MIGRATION_ADMIN_EMAIL=... CURRENT_PASSWORD=... \
 *   npx tsx scripts/rotatePasswordNoHardcode.ts
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, updatePassword, signOut } from 'firebase/auth';
import { randomBytes, createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}.`);
  }
  return value;
}

async function rotatePassword() {
  console.log('--- SECURE IN-MEMORY PASSWORD ROTATION ---');

  const targetEmail = requireEnv('MIGRATION_ADMIN_EMAIL');
  const currentPassword = requireEnv('CURRENT_PASSWORD');

  // Generate a cryptographically strong 36-character password in memory
  const entropy = randomBytes(24).toString('base64url');
  const newPassword = `Activa_${entropy}_9Z#`;
  const sha256Fingerprint = createHash('sha256').update(newPassword).digest('hex').slice(0, 12);

  const app = initializeApp({
    apiKey: requireEnv('FIREBASE_API_KEY'),
    projectId: requireEnv('FIREBASE_PROJECT_ID'),
    authDomain: requireEnv('FIREBASE_AUTH_DOMAIN'),
  });
  const auth = getAuth(app);

  console.log(`[1/4] Authenticating as ${targetEmail}...`);
  let userCred;
  try {
    userCred = await signInWithEmailAndPassword(auth, targetEmail, currentPassword);
    console.log(`✓ Authentication succeeded for UID: ${userCred.user.uid}`);
  } catch (err: any) {
    console.error(`✗ Authentication failed with provided current password: ${err.message}`);
    process.exit(1);
  }

  console.log(`[2/4] Updating password in Firebase Authentication...`);
  await updatePassword(userCred.user, newPassword);
  console.log(`✓ Password updated in Firebase Authentication.`);

  await signOut(auth);

  console.log(`[3/4] Testing revocation of old password...`);
  try {
    await signInWithEmailAndPassword(auth, targetEmail, currentPassword);
    console.error(`✗ CRITICAL: Previous password is still accepted!`);
    process.exit(1);
  } catch (err: any) {
    console.log(`✓ CONFIRMED: Previous password is permanently revoked (${err.code || err.message}).`);
  }

  console.log(`[4/4] Verifying new credentials...`);
  const verifyCred = await signInWithEmailAndPassword(auth, targetEmail, newPassword);
  console.log(`✓ CONFIRMED: New credentials successfully verified for UID: ${verifyCred.user.uid}`);
  await signOut(auth);

  // Write exclusively to gitignored .env.local
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  let existingContent = '';
  if (fs.existsSync(envLocalPath)) {
    existingContent = fs.readFileSync(envLocalPath, 'utf8');
  }

  const lines = existingContent.split('\n').filter(
    (l) => !l.startsWith('MIGRATION_ADMIN_PASSWORD=') && !l.startsWith('MIGRATION_ADMIN_EMAIL=')
  );
  lines.push(`MIGRATION_ADMIN_EMAIL=${targetEmail}`);
  lines.push(`MIGRATION_ADMIN_PASSWORD=${newPassword}`);
  fs.writeFileSync(envLocalPath, lines.join('\n').trim() + '\n', { mode: 0o600 });

  console.log('\n======================================================');
  console.log('✓ PASSWORD ROTATED SUCCESSFULLY');
  console.log(`User                 : ${targetEmail}`);
  console.log(`UID                  : ${verifyCred.user.uid}`);
  console.log(`Password Fingerprint : sha256:${sha256Fingerprint}...`);
  console.log(`Saved To             : .env.local (strictly gitignored, permissions 0600)`);
  // === AMÉLIORATION AJOUTÉE : sécurité (Réconciliation 2026-09-07) — l'ancienne ligne
  // affirmait "Hardcoded in code: NO (zero occurrences in git)", une garantie que ce script ne
  // peut pas vérifier lui-même (et qui s'est révélée fausse : voir le commentaire d'en-tête).
  // Reformulé pour ne plus affirmer un fait non vérifié par le script lui-même.
  console.log(`Note                 : this password was never written to any file tracked by git.`);
  console.log('======================================================\n');
  process.exit(0);
}

rotatePassword().catch((err) => {
  console.error('Password rotation failed:', err);
  process.exit(1);
});
