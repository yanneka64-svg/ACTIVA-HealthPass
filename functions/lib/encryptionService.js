"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENCRYPTED_FIELD_PREFIX = exports.MEDICAL_FIELD_ENCRYPTION_KEY = void 0;
exports.encryptField = encryptField;
exports.decryptField = decryptField;
exports.isEncryptedField = isEncryptedField;
exports.encryptFieldMap = encryptFieldMap;
exports.decryptFieldMap = decryptFieldMap;
// === AMÉLIORATION AJOUTÉE : protection des données (revue 2026-09-05, section 3.1 — chiffrement
// applicatif des champs de santé les plus sensibles) ===
// Constat : les champs cliniques de `medicalForms` (diagnostic présumé, examens demandés,
// traitement prescrit) étaient stockés en clair dans Firestore, dans le même document que
// l'identité complète de l'assuré. Le chiffrement natif de Firestore/Cloud Storage (clés gérées
// par Google) protège contre le vol de support physique, mais pas contre une règle de sécurité
// mal configurée (ce qui s'est déjà produit deux fois dans ce projet — voir SEC-01/SEC-04) ni
// contre un accès direct via la console/l'Admin SDK.
//
// Choix architectural : la clé de chiffrement ne quitte JAMAIS le navigateur — elle n'existe
// que côté serveur (Cloud Functions), chargée depuis Secret Manager via `defineSecret`. Le
// client appelle des fonctions callable authentifiées (`encryptSensitiveFields`/
// `decryptSensitiveFields`, voir index.ts) qui font le travail cryptographique et ne renvoient
// que le résultat. C'est le niveau de protection le plus élevé pour ce cas d'usage : même
// quelqu'un disposant du code source complet de l'application ne peut pas déchiffrer les
// données sans un jeton d'authentification Firebase valide ET un accès aux Cloud Functions.
//
// Déploiement requis (non fait ici, cette session n'a pas d'accès de déploiement) :
//   firebase functions:secrets:set MEDICAL_FIELD_ENCRYPTION_KEY
// (générer une valeur aléatoire forte, ex. `openssl rand -base64 32`, à conserver en lieu sûr —
// sa perte rend les données déjà chiffrées définitivement illisibles).
const params_1 = require("firebase-functions/params");
const crypto = require("crypto");
exports.MEDICAL_FIELD_ENCRYPTION_KEY = (0, params_1.defineSecret)('MEDICAL_FIELD_ENCRYPTION_KEY');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // recommended nonce length for AES-GCM
const AUTH_TAG_LENGTH_BYTES = 16;
// Préfixe qui marque une valeur comme chiffrée par ce module — permet de distinguer sans
// ambiguïté les documents déjà chiffrés des documents legacy encore en clair (migration
// progressive, jamais un big-bang qui casserait l'affichage des dossiers existants).
exports.ENCRYPTED_FIELD_PREFIX = 'encv1:';
function getKeyBuffer() {
    const raw = exports.MEDICAL_FIELD_ENCRYPTION_KEY.value();
    if (!raw) {
        throw new Error('MEDICAL_FIELD_ENCRYPTION_KEY secret is not configured. Run: firebase functions:secrets:set MEDICAL_FIELD_ENCRYPTION_KEY');
    }
    // Accepte une clé de 32 octets encodée en base64 telle quelle ; sinon dérive une clé de 32
    // octets via SHA-256 à partir de la chaîne fournie, pour que n'importe quelle valeur de
    // secret raisonnablement forte fonctionne sans contrainte d'encodage exact.
    try {
        const asBase64 = Buffer.from(raw, 'base64');
        if (asBase64.length === 32)
            return asBase64;
    }
    catch {
        // fall through to derivation below
    }
    return crypto.createHash('sha256').update(raw, 'utf8').digest();
}
/** Encrypts a single plaintext string. Returns it unchanged if empty/undefined. */
function encryptField(plaintext) {
    if (!plaintext)
        return plaintext;
    const key = getKeyBuffer();
    const iv = crypto.randomBytes(IV_LENGTH_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return exports.ENCRYPTED_FIELD_PREFIX + Buffer.concat([iv, authTag, encrypted]).toString('base64');
}
/**
 * Decrypts a single field value. Values that don't carry ENCRYPTED_FIELD_PREFIX are assumed to
 * be legacy plaintext (written before this correctif) and are returned as-is — never an error,
 * never a regression for existing medical forms.
 */
function decryptField(value) {
    if (!value || !value.startsWith(exports.ENCRYPTED_FIELD_PREFIX))
        return value;
    const key = getKeyBuffer();
    const raw = Buffer.from(value.slice(exports.ENCRYPTED_FIELD_PREFIX.length), 'base64');
    const iv = raw.subarray(0, IV_LENGTH_BYTES);
    const authTag = raw.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
    const encrypted = raw.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
}
function isEncryptedField(value) {
    return typeof value === 'string' && value.startsWith(exports.ENCRYPTED_FIELD_PREFIX);
}
const MAX_FIELDS_PER_CALL = 20;
const MAX_FIELD_LENGTH = 10_000;
/** Encrypts every string value in `fields`; non-string values are passed through unchanged. */
function encryptFieldMap(fields) {
    const keys = Object.keys(fields);
    if (keys.length > MAX_FIELDS_PER_CALL) {
        throw new Error(`Too many fields in a single call (max ${MAX_FIELDS_PER_CALL}).`);
    }
    const result = {};
    for (const key of keys) {
        const value = fields[key];
        if (typeof value === 'string') {
            if (value.length > MAX_FIELD_LENGTH) {
                throw new Error(`Field "${key}" exceeds the maximum length of ${MAX_FIELD_LENGTH}.`);
            }
            result[key] = encryptField(value);
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
/** Decrypts every string value in `fields`; non-string values are passed through unchanged. */
function decryptFieldMap(fields) {
    const keys = Object.keys(fields);
    if (keys.length > MAX_FIELDS_PER_CALL) {
        throw new Error(`Too many fields in a single call (max ${MAX_FIELDS_PER_CALL}).`);
    }
    const result = {};
    for (const key of keys) {
        const value = fields[key];
        result[key] = typeof value === 'string' ? decryptField(value) : value;
    }
    return result;
}
//# sourceMappingURL=encryptionService.js.map