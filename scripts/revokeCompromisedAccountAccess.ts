/**
 * Emergency script to REVOKE Firebase Auth-level access for a compromised account: disables
 * sign-in outright AND invalidates every already-issued ID/refresh token immediately.
 *
 * === AMÉLIORATION AJOUTÉE : sécurité (revue 2026-09-07 — "Secrets dans l'historique Git") ===
 * Gap identifié : scripts/deactivateCompromisedAccount.ts (isActive: false côté Firestore) et
 * scripts/resetCompromisedPassword.ts (rotation du mot de passe) utilisent tous deux le SDK
 * CLIENT (`firebase/auth`), qui ne peut agir que sur la session de l'utilisateur courant. Aucun
 * des deux ne peut :
 *   1. Empêcher le compte de se réauthentifier directement contre l'API Firebase Auth (hors app),
 *      même une fois isActive=false (ce champ n'existe que dans Firestore, pas dans Auth — le
 *      login Auth lui-même réussirait toujours, seules les opérations Firestore seraient
 *      ensuite bloquées par isActiveUser() dans firestore.rules).
 *   2. Invalider un ID token ou refresh token DÉJÀ émis avant la rotation — changer le mot de
 *      passe ne révoque rien rétroactivement ; un refresh token volé reste valide indéfiniment
 *      tant qu'il n'est pas explicitement révoqué.
 * Ce script comble ce gap via le SDK ADMIN (`firebase-admin`), qui seul expose
 * `updateUser({disabled: true})` et `revokeRefreshTokens()`. Combiné aux deux scripts existants
 * (déjà exécutés pour yannick.ekani_test@activa.local, voir
 * docs/security/BACKEND_AUDIT_2026-09-06_REMEDIATION.md), cela ferme le compte au niveau
 * identité, pas seulement au niveau application.
 *
 * Authentification : Application Default Credentials (ADC) — PAS de clé de service JSON, PAS de
 * ADMIN_EMAIL/ADMIN_PASSWORD (cohérent avec functions/src/index.ts et server.ts, qui
 * s'authentifient déjà de la même façon). Nécessite soit :
 *   - `gcloud auth application-default login` (poste d'un opérateur autorisé), soit
 *   - une exécution sur une infrastructure GCP (Cloud Shell, Cloud Run...) avec un compte de
 *     service disposant du rôle `roles/firebaseauth.admin` (ou `Firebase Authentication Admin`).
 *
 * USAGE :
 *   FIREBASE_PROJECT_ID=... TARGET_ACCOUNT_EMAIL=yannick.ekani_test@activa.local \
 *   npx tsx scripts/revokeCompromisedAccountAccess.ts --dry-run
 *
 *   (relancer sans --dry-run une fois le compte cible confirmé par la sortie du dry-run ;
 *   TARGET_ACCOUNT_UID peut être fourni à la place de TARGET_ACCOUNT_EMAIL si l'UID est déjà
 *   connu)
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. See the USAGE comment at the top of this script.`);
  }
  return value;
}

async function run() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`--- Emergency Auth-Level Access Revocation ${isDryRun ? '[DRY-RUN — no write will be made]' : '[LIVE EXECUTION]'} ---`);

  const projectId = requireEnv('FIREBASE_PROJECT_ID');
  const targetUid = process.env.TARGET_ACCOUNT_UID;
  const targetEmail = process.env.TARGET_ACCOUNT_EMAIL;

  if (!targetUid && !targetEmail) {
    throw new Error('Provide either TARGET_ACCOUNT_UID or TARGET_ACCOUNT_EMAIL.');
  }

  const app = getApps().length ? getApps()[0] : initializeApp({ projectId });
  const auth = getAuth(app);

  const user = targetUid ? await auth.getUser(targetUid) : await auth.getUserByEmail(targetEmail as string);

  console.log('\nTarget Firebase Auth user:');
  console.log(`  uid          : ${user.uid}`);
  console.log(`  email        : ${user.email}`);
  console.log(`  disabled     : ${user.disabled}`);
  console.log(`  tokensValidAfterTime : ${user.tokensValidAfterTime || '(never revoked)'}`);

  if (isDryRun) {
    console.log('\n[DRY-RUN] Would set disabled=true and revoke all refresh tokens issued before now. No write performed.');
    process.exit(0);
  }

  await auth.updateUser(user.uid, { disabled: true });
  await auth.revokeRefreshTokens(user.uid);
  console.log(`\n✓ Firebase Auth user ${user.uid} disabled and all existing refresh tokens revoked.`);
  console.log('Any ID token issued before this moment is now rejected by Firebase on next verification;');
  console.log('sign-in with this account will fail outright until re-enabled (auth.updateUser(uid, {disabled: false})).');
  process.exit(0);
}

run().catch((err) => {
  console.error('Revocation script failed:', err);
  process.exit(1);
});
