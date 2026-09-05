// === AMÉLIORATION AJOUTÉE : protection des données (revue 2026-09-05, section 3.1) — tests
// unitaires purs pour le chiffrement/déchiffrement des champs sensibles, sans dépendance à
// l'émulateur ni au SDK Admin (comme validation.test.ts).
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  // `defineSecret(...).value()` lit `process.env[name]` en dehors du runtime Cloud Functions
  // réel (émulateur ou déploiement, où le secret est injecté de la même façon) — une valeur de
  // test suffit ici, elle n'a aucun rapport avec la clé réelle utilisée en production.
  process.env.MEDICAL_FIELD_ENCRYPTION_KEY = 'unit-test-key-not-used-in-production';
});

describe('encryptField / decryptField', () => {
  it('round-trips a plaintext string', async () => {
    const { encryptField, decryptField } = await import('./encryptionService');
    const plaintext = 'Suspected type 2 diabetes, recommend HbA1c panel.';
    const encrypted = encryptField(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(typeof encrypted).toBe('string');
    expect(decryptField(encrypted as string)).toBe(plaintext);
  });

  it('marks encrypted values with the version prefix', async () => {
    const { encryptField, isEncryptedField, ENCRYPTED_FIELD_PREFIX } = await import('./encryptionService');
    const encrypted = encryptField('some clinical note') as string;
    expect(encrypted.startsWith(ENCRYPTED_FIELD_PREFIX)).toBe(true);
    expect(isEncryptedField(encrypted)).toBe(true);
  });

  it('passes through legacy plaintext untouched on decrypt (no prefix = not encrypted)', async () => {
    const { decryptField, isEncryptedField } = await import('./encryptionService');
    const legacyPlaintext = 'Legacy diagnosis written before this correctif';
    expect(isEncryptedField(legacyPlaintext)).toBe(false);
    expect(decryptField(legacyPlaintext)).toBe(legacyPlaintext);
  });

  it('passes through empty/undefined/null values unchanged', async () => {
    const { encryptField, decryptField } = await import('./encryptionService');
    expect(encryptField('')).toBe('');
    expect(encryptField(undefined)).toBe(undefined);
    expect(encryptField(null)).toBe(null);
    expect(decryptField('')).toBe('');
    expect(decryptField(undefined)).toBe(undefined);
    expect(decryptField(null)).toBe(null);
  });

  it('produces different ciphertext for the same plaintext each time (random IV)', async () => {
    const { encryptField } = await import('./encryptionService');
    const a = encryptField('identical input');
    const b = encryptField('identical input');
    expect(a).not.toBe(b);
  });
});

describe('encryptFieldMap / decryptFieldMap', () => {
  it('round-trips a map of fields, leaving non-string values untouched', async () => {
    const { encryptFieldMap, decryptFieldMap } = await import('./encryptionService');
    const original = {
      presumedDiagnosis: 'Hypertension, stage 1',
      requestedExams: 'Lipid panel, ECG',
      treatmentOrder: 'Amlodipine 5mg daily',
      someNumber: 42,
    };
    const encrypted = encryptFieldMap(original);
    expect(encrypted.someNumber).toBe(42);
    expect(encrypted.presumedDiagnosis).not.toBe(original.presumedDiagnosis);

    const decrypted = decryptFieldMap(encrypted);
    expect(decrypted).toEqual(original);
  });

  it('rejects a map with too many fields', async () => {
    const { encryptFieldMap } = await import('./encryptionService');
    const tooMany: Record<string, string> = {};
    for (let i = 0; i < 25; i++) tooMany[`field${i}`] = 'value';
    expect(() => encryptFieldMap(tooMany)).toThrow(/Too many fields/);
  });

  it('rejects a field value exceeding the maximum length', async () => {
    const { encryptFieldMap } = await import('./encryptionService');
    expect(() => encryptFieldMap({ notes: 'x'.repeat(10_001) })).toThrow(/exceeds the maximum length/);
  });
});
