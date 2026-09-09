// === AMÉLIORATION AJOUTÉE : HealthPass 2.0, Phase 3 — Digital Card & Server-Verifiable QR ===
// Même choix architectural que encryptionService.ts (voir ce fichier) : la clé de signature ne
// quitte JAMAIS le navigateur — elle n'existe que côté serveur (Cloud Functions), chargée depuis
// Secret Manager via `defineSecret`. Le client demande une signature (`generateDigitalCardSignature`,
// voir index.ts) et la vérifie plus tard (`verifyDigitalCardSignature`) sans jamais avoir accès à
// la clé elle-même — un QR copié ou modifié échoue donc la vérification même s'il "a l'air" valide.
//
// Déploiement requis (non fait ici, cette session n'a pas d'accès de déploiement) :
//   firebase functions:secrets:set CARD_SIGNING_KEY
// (générer une valeur aléatoire forte, ex. `openssl rand -base64 32`, à conserver en lieu sûr —
// sa perte invalide silencieusement toutes les cartes déjà émises : elles resteraient lisibles
// mais échoueraient la vérification tant qu'une nouvelle carte n'est pas régénérée).
import { defineSecret } from 'firebase-functions/params';
import * as crypto from 'crypto';

export const CARD_SIGNING_KEY = defineSecret('CARD_SIGNING_KEY');

function getKeyBuffer(): Buffer {
  const raw = CARD_SIGNING_KEY.value();
  if (!raw) {
    throw new Error(
      'CARD_SIGNING_KEY secret is not configured. Run: firebase functions:secrets:set CARD_SIGNING_KEY'
    );
  }
  // Même tolérance d'encodage que MEDICAL_FIELD_ENCRYPTION_KEY (encryptionService.ts) : une clé
  // de 32 octets encodée en base64 est utilisée telle quelle, sinon dérivée via SHA-256 à partir
  // de la chaîne fournie.
  try {
    const asBase64 = Buffer.from(raw, 'base64');
    if (asBase64.length === 32) return asBase64;
  } catch {
    // fall through to derivation below
  }
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

/** Normalise le numéro de carte de la même façon que src/services/cardNumberService.ts côté
 *  client (trim + majuscules), pour que signature et vérification portent toujours sur la même
 *  forme canonique quelle que soit la casse saisie/scannée. */
export function normalizeCardNo(cardNo: string): string {
  return (cardNo || '').trim().toUpperCase();
}

export function buildCardSigningPayload(cardNo: string, validThrough: string): string {
  return `${normalizeCardNo(cardNo)}::${validThrough.trim()}`;
}

/** Signe (cardNo, validThrough) avec la clé serveur. Ne renvoie jamais la clé elle-même. */
export function signCardPayload(cardNo: string, validThrough: string): string {
  const key = getKeyBuffer();
  const payload = buildCardSigningPayload(cardNo, validThrough);
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

/** Vérifie une signature en temps constant (crypto.timingSafeEqual) pour ne pas exposer
 *  d'information par canal auxiliaire sur le nombre d'octets corrects. */
export function verifyCardSignature(cardNo: string, validThrough: string, signature: string): boolean {
  let expectedBuf: Buffer;
  try {
    expectedBuf = Buffer.from(signCardPayload(cardNo, validThrough), 'hex');
  } catch {
    return false;
  }
  let givenBuf: Buffer;
  try {
    givenBuf = Buffer.from((signature || '').trim(), 'hex');
  } catch {
    return false;
  }
  if (expectedBuf.length !== givenBuf.length || expectedBuf.length === 0) return false;
  return crypto.timingSafeEqual(expectedBuf, givenBuf);
}

/** Date de validité par défaut d'une carte nouvellement signée : 3 ans à partir d'aujourd'hui,
 *  au format YYYY-MM-DD. Choix provisoire (comme le seuil de préautorisation) en attendant
 *  qu'ACTIVA confirme une durée de validité réelle par type de police. */
export function computeDefaultValidThrough(now: Date = new Date()): string {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() + 3);
  return d.toISOString().slice(0, 10);
}

export function isValidThroughExpired(validThrough: string, now: Date = new Date()): boolean {
  const expiry = new Date(validThrough + 'T23:59:59Z');
  if (Number.isNaN(expiry.getTime())) return true;
  return expiry.getTime() < now.getTime();
}
