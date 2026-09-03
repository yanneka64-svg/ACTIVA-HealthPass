// === AMÉLIORATION AJOUTÉE : sécurité (audit) ===
// Auparavant, chaque mot de passe (initial ou réinitialisé) était écrit EN CLAIR dans
// `accounts/{uid}.password` / `.tempPassword` — et ce champ n'était jamais effacé, même
// après que l'utilisateur ait changé son mot de passe via Firebase Auth. Combiné à la lecture
// publique nécessaire de `accounts` (voir firestore.rules), n'importe qui pouvait lire le
// mot de passe de n'importe quel compte, y compris Admin, sans jamais se connecter.
//
// HealthPass n'a pas de backend (pas de Cloud Functions) : le hachage doit donc se faire
// côté client, avec l'API Web Crypto native du navigateur (SubtleCrypto), sans dépendance
// supplémentaire. PBKDF2-HMAC-SHA256 avec un sel aléatoire propre à chaque utilisateur et un
// nombre d'itérations élevé (ralentit fortement une attaque par force brute même si la base
// est lue) — bien au-delà d'un simple SHA-256 sans sel.
//
// Compatibilité : les comptes déjà existants (créés avant ce correctif) n'ont que
// `password`/`tempPassword` en clair, pas encore `passwordHash`/`passwordSalt`. La logique de
// connexion (LoginView.tsx) accepte les deux : elle vérifie le hash s'il existe, sinon
// retombe sur l'ancienne comparaison en clair — et upgrade alors silencieusement ce compte
// vers un hash, sans jamais bloquer un utilisateur légitime.
const PBKDF2_ITERATIONS = 150_000;
const HASH_ALGO = 'SHA-256';
const KEY_LENGTH_BITS = 256;

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomSaltHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return bufferToHex(arr.buffer);
}

async function deriveHashHex(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const saltBytes = new Uint8Array((saltHex.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16)));
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: HASH_ALGO },
    keyMaterial,
    KEY_LENGTH_BITS
  );
  return bufferToHex(derivedBits);
}

/** Hashes a new/reset password, generating a fresh random salt. Store BOTH returned fields —
 *  never the plaintext password itself — on the account document. */
export async function hashPassword(password: string): Promise<{ passwordHash: string; passwordSalt: string }> {
  const passwordSalt = randomSaltHex();
  const passwordHash = await deriveHashHex(password, passwordSalt);
  return { passwordHash, passwordSalt };
}

/** Verifies a plaintext password attempt against a stored hash+salt pair. */
export async function verifyPassword(password: string, passwordHash: string, passwordSalt: string): Promise<boolean> {
  if (!passwordHash || !passwordSalt) return false;
  try {
    const computed = await deriveHashHex(password, passwordSalt);
    return computed === passwordHash;
  } catch {
    return false;
  }
}
