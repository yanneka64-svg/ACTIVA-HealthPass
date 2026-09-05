"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// === AMÉLIORATION AJOUTÉE : protection des données (revue 2026-09-05, section 3.1) — tests
// unitaires purs pour le chiffrement/déchiffrement des champs sensibles, sans dépendance à
// l'émulateur ni au SDK Admin (comme validation.test.ts).
const vitest_1 = require("vitest");
(0, vitest_1.beforeAll)(() => {
    // `defineSecret(...).value()` lit `process.env[name]` en dehors du runtime Cloud Functions
    // réel (émulateur ou déploiement, où le secret est injecté de la même façon) — une valeur de
    // test suffit ici, elle n'a aucun rapport avec la clé réelle utilisée en production.
    process.env.MEDICAL_FIELD_ENCRYPTION_KEY = 'unit-test-key-not-used-in-production';
});
(0, vitest_1.describe)('encryptField / decryptField', () => {
    (0, vitest_1.it)('round-trips a plaintext string', async () => {
        const { encryptField, decryptField } = await Promise.resolve().then(() => require('./encryptionService'));
        const plaintext = 'Suspected type 2 diabetes, recommend HbA1c panel.';
        const encrypted = encryptField(plaintext);
        (0, vitest_1.expect)(encrypted).not.toBe(plaintext);
        (0, vitest_1.expect)(typeof encrypted).toBe('string');
        (0, vitest_1.expect)(decryptField(encrypted)).toBe(plaintext);
    });
    (0, vitest_1.it)('marks encrypted values with the version prefix', async () => {
        const { encryptField, isEncryptedField, ENCRYPTED_FIELD_PREFIX } = await Promise.resolve().then(() => require('./encryptionService'));
        const encrypted = encryptField('some clinical note');
        (0, vitest_1.expect)(encrypted.startsWith(ENCRYPTED_FIELD_PREFIX)).toBe(true);
        (0, vitest_1.expect)(isEncryptedField(encrypted)).toBe(true);
    });
    (0, vitest_1.it)('passes through legacy plaintext untouched on decrypt (no prefix = not encrypted)', async () => {
        const { decryptField, isEncryptedField } = await Promise.resolve().then(() => require('./encryptionService'));
        const legacyPlaintext = 'Legacy diagnosis written before this correctif';
        (0, vitest_1.expect)(isEncryptedField(legacyPlaintext)).toBe(false);
        (0, vitest_1.expect)(decryptField(legacyPlaintext)).toBe(legacyPlaintext);
    });
    (0, vitest_1.it)('passes through empty/undefined/null values unchanged', async () => {
        const { encryptField, decryptField } = await Promise.resolve().then(() => require('./encryptionService'));
        (0, vitest_1.expect)(encryptField('')).toBe('');
        (0, vitest_1.expect)(encryptField(undefined)).toBe(undefined);
        (0, vitest_1.expect)(encryptField(null)).toBe(null);
        (0, vitest_1.expect)(decryptField('')).toBe('');
        (0, vitest_1.expect)(decryptField(undefined)).toBe(undefined);
        (0, vitest_1.expect)(decryptField(null)).toBe(null);
    });
    (0, vitest_1.it)('produces different ciphertext for the same plaintext each time (random IV)', async () => {
        const { encryptField } = await Promise.resolve().then(() => require('./encryptionService'));
        const a = encryptField('identical input');
        const b = encryptField('identical input');
        (0, vitest_1.expect)(a).not.toBe(b);
    });
});
(0, vitest_1.describe)('encryptFieldMap / decryptFieldMap', () => {
    (0, vitest_1.it)('round-trips a map of fields, leaving non-string values untouched', async () => {
        const { encryptFieldMap, decryptFieldMap } = await Promise.resolve().then(() => require('./encryptionService'));
        const original = {
            presumedDiagnosis: 'Hypertension, stage 1',
            requestedExams: 'Lipid panel, ECG',
            treatmentOrder: 'Amlodipine 5mg daily',
            someNumber: 42,
        };
        const encrypted = encryptFieldMap(original);
        (0, vitest_1.expect)(encrypted.someNumber).toBe(42);
        (0, vitest_1.expect)(encrypted.presumedDiagnosis).not.toBe(original.presumedDiagnosis);
        const decrypted = decryptFieldMap(encrypted);
        (0, vitest_1.expect)(decrypted).toEqual(original);
    });
    (0, vitest_1.it)('rejects a map with too many fields', async () => {
        const { encryptFieldMap } = await Promise.resolve().then(() => require('./encryptionService'));
        const tooMany = {};
        for (let i = 0; i < 25; i++)
            tooMany[`field${i}`] = 'value';
        (0, vitest_1.expect)(() => encryptFieldMap(tooMany)).toThrow(/Too many fields/);
    });
    (0, vitest_1.it)('rejects a field value exceeding the maximum length', async () => {
        const { encryptFieldMap } = await Promise.resolve().then(() => require('./encryptionService'));
        (0, vitest_1.expect)(() => encryptFieldMap({ notes: 'x'.repeat(10_001) })).toThrow(/exceeds the maximum length/);
    });
});
//# sourceMappingURL=encryptionService.test.js.map