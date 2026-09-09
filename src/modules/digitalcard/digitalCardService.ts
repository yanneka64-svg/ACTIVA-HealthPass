// === AMÉLIORATION AJOUTÉE : HealthPass 2.0, Phase 3 — Digital Card & Server-Verifiable QR ===
// Enveloppe cliente des deux Cloud Functions callable (functions/src/index.ts :
// generateDigitalCardSignature / verifyDigitalCardSignature) — la clé de signature ne quitte
// jamais le serveur, voir functions/src/digitalCardSigningService.ts pour le choix
// architectural complet (même principe que encryptSensitiveFields/decryptSensitiveFields déjà
// en place pour les champs cliniques).
//
// ⚠️ Déploiement requis avant toute utilisation réelle (non fait par cette session, qui n'a pas
// d'accès de déploiement) :
//   1. firebase functions:secrets:set CARD_SIGNING_KEY   (valeur aléatoire forte)
//   2. firebase deploy --only functions:generateDigitalCardSignature,functions:verifyDigitalCardSignature
// Tant que ce n'est pas fait, ces appels échoueront avec une erreur Cloud Functions — le module
// reste entièrement derrière le flag `hp2_provider_digital_card` (désactivé par défaut) pour ne
// jamais exposer cet état incomplet à un utilisateur de production.
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

export interface DigitalCardSignature {
  cardNo: string;
  validThrough: string;
  signature: string;
}

export async function generateDigitalCardSignature(cardNo: string): Promise<DigitalCardSignature> {
  const fn = httpsCallable<{ cardNo: string }, DigitalCardSignature>(functions, 'generateDigitalCardSignature');
  const result = await fn({ cardNo });
  return result.data;
}

export interface DigitalCardVerification {
  valid: boolean;
  expired?: boolean;
  cardNo?: string;
  validThrough?: string;
  member?: { name: string; organization: string; status: string } | null;
}

export async function verifyDigitalCardSignature(payload: DigitalCardSignature): Promise<DigitalCardVerification> {
  const fn = httpsCallable<DigitalCardSignature, DigitalCardVerification>(functions, 'verifyDigitalCardSignature');
  const result = await fn(payload);
  return result.data;
}

/** Encode le contenu signé dans le format compact stocké/lu depuis le QR — un objet JSON minimal
 *  en base64, jamais les données personnelles de l'assuré (nom, organisation) : celles-ci sont
 *  toujours relues fraîches côté serveur à la vérification (voir verifyDigitalCardSignature côté
 *  Cloud Function), jamais fait confiance depuis le contenu du QR lui-même. */
export function encodeCardQrPayload(sig: DigitalCardSignature): string {
  return btoa(JSON.stringify({ c: sig.cardNo, v: sig.validThrough, s: sig.signature }));
}

export function decodeCardQrPayload(encoded: string): DigitalCardSignature | null {
  try {
    const obj = JSON.parse(atob(encoded.trim()));
    if (!obj.c || !obj.v || !obj.s) return null;
    return { cardNo: String(obj.c), validThrough: String(obj.v), signature: String(obj.s) };
  } catch {
    return null;
  }
}
