// === AMÉLIORATION AJOUTÉE : HealthPass 2.0, Phase 3 — tests unitaires purs pour la signature/
// vérification des cartes numériques, sans dépendance à l'émulateur ni au SDK Admin (comme
// encryptionService.test.ts).
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  // Voir encryptionService.test.ts : valeur de test uniquement, sans rapport avec la clé réelle.
  process.env.CARD_SIGNING_KEY = 'unit-test-key-not-used-in-production';
});

describe('signCardPayload / verifyCardSignature', () => {
  it('produces a signature that verifies successfully for the same inputs', async () => {
    const { signCardPayload, verifyCardSignature } = await import('./digitalCardSigningService');
    const signature = signCardPayload('CMR-7734829A1', '2029-12-31');
    expect(verifyCardSignature('CMR-7734829A1', '2029-12-31', signature)).toBe(true);
  });

  it('is case-insensitive on the card number, like cardNumberService normalization', async () => {
    const { signCardPayload, verifyCardSignature } = await import('./digitalCardSigningService');
    const signature = signCardPayload('cmr-7734829a1', '2029-12-31');
    expect(verifyCardSignature('CMR-7734829A1', '2029-12-31', signature)).toBe(true);
  });

  it('rejects a signature if the card number was changed', async () => {
    const { signCardPayload, verifyCardSignature } = await import('./digitalCardSigningService');
    const signature = signCardPayload('CMR-7734829A1', '2029-12-31');
    expect(verifyCardSignature('CMR-0000000A1', '2029-12-31', signature)).toBe(false);
  });

  it('rejects a signature if the expiry date was changed', async () => {
    const { signCardPayload, verifyCardSignature } = await import('./digitalCardSigningService');
    const signature = signCardPayload('CMR-7734829A1', '2029-12-31');
    expect(verifyCardSignature('CMR-7734829A1', '2099-01-01', signature)).toBe(false);
  });

  it('rejects a tampered/garbage signature', async () => {
    const { verifyCardSignature } = await import('./digitalCardSigningService');
    expect(verifyCardSignature('CMR-7734829A1', '2029-12-31', 'not-a-real-signature')).toBe(false);
    expect(verifyCardSignature('CMR-7734829A1', '2029-12-31', '')).toBe(false);
  });

  it('produces a different signature under a different signing key', async () => {
    const { signCardPayload } = await import('./digitalCardSigningService');
    const a = signCardPayload('CMR-7734829A1', '2029-12-31');
    process.env.CARD_SIGNING_KEY = 'a-different-unit-test-key';
    const b = signCardPayload('CMR-7734829A1', '2029-12-31');
    expect(a).not.toBe(b);
    process.env.CARD_SIGNING_KEY = 'unit-test-key-not-used-in-production';
  });
});

describe('computeDefaultValidThrough / isValidThroughExpired', () => {
  it('computes a date 3 years in the future', async () => {
    const { computeDefaultValidThrough } = await import('./digitalCardSigningService');
    const now = new Date('2026-09-09T00:00:00Z');
    expect(computeDefaultValidThrough(now)).toBe('2029-09-09');
  });

  it('treats a past date as expired and a future date as not expired', async () => {
    const { isValidThroughExpired } = await import('./digitalCardSigningService');
    const now = new Date('2026-09-09T00:00:00Z');
    expect(isValidThroughExpired('2020-01-01', now)).toBe(true);
    expect(isValidThroughExpired('2030-01-01', now)).toBe(false);
  });

  it('treats an unparseable date as expired (fail closed)', async () => {
    const { isValidThroughExpired } = await import('./digitalCardSigningService');
    expect(isValidThroughExpired('not-a-date')).toBe(true);
  });
});
