"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePayload = validatePayload;
// === AMÉLIORATION AJOUTÉE : sécurité (Phase 2.1 — validation stricte des payloads) ===
// Constat (docs/security/CODE_AUDIT_MAP.md) : chaque Cloud Function callable acceptait
// `data: any` et ne validait que quelques champs ponctuels (souvent juste leur présence),
// jamais leur type exact, jamais les champs inconnus, jamais une taille de payload maximale.
// Ce module fournit un validateur minimaliste (aucune dépendance supplémentaire) appliqué en
// tête de chaque fonction callable : rejette les champs non déclarés, les types incorrects,
// les valeurs hors bornes, et les payloads anormalement volumineux — AVANT tout traitement
// métier, conformément à la Phase 2.1 du brief.
const functions = require("firebase-functions");
const MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KiB — largement suffisant pour ces payloads JSON,
// bloque un abus grossier (ex. un attaquant qui gonflerait `rows`/`ctxList` pour épuiser la
// mémoire de la fonction) sans jamais gêner un usage légitime observé dans le code existant.
/**
 * Validates `data` against `schema`: rejects unknown top-level keys, wrong types, out-of-range
 * values, and oversized payloads. Throws a functions.https.HttpsError('invalid-argument', ...)
 * on the first problem found — never silently drops or coerces a bad value.
 */
function validatePayload(data, schema, maxBytes = MAX_PAYLOAD_BYTES) {
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        throw new functions.https.HttpsError('invalid-argument', 'Request payload must be a JSON object.');
    }
    let size = 0;
    try {
        size = Buffer.byteLength(JSON.stringify(data), 'utf8');
    }
    catch {
        throw new functions.https.HttpsError('invalid-argument', 'Request payload could not be serialized.');
    }
    if (size > maxBytes) {
        throw new functions.https.HttpsError('invalid-argument', `Request payload too large (${size} bytes, max ${maxBytes}).`);
    }
    for (const key of Object.keys(data)) {
        if (!(key in schema)) {
            throw new functions.https.HttpsError('invalid-argument', `Unknown field "${key}" is not accepted by this endpoint.`);
        }
    }
    for (const [key, field] of Object.entries(schema)) {
        const value = data[key];
        const present = value !== undefined && value !== null;
        if (!present) {
            if (field.required) {
                throw new functions.https.HttpsError('invalid-argument', `Field "${key}" is required.`);
            }
            continue;
        }
        switch (field.type) {
            case 'string':
                if (typeof value !== 'string') {
                    throw new functions.https.HttpsError('invalid-argument', `Field "${key}" must be a string.`);
                }
                if (field.maxLength !== undefined && value.length > field.maxLength) {
                    throw new functions.https.HttpsError('invalid-argument', `Field "${key}" exceeds the maximum length of ${field.maxLength}.`);
                }
                if (field.enum && !field.enum.includes(value)) {
                    throw new functions.https.HttpsError('invalid-argument', `Field "${key}" must be one of: ${field.enum.join(', ')}.`);
                }
                break;
            case 'number':
                if (typeof value !== 'number' || Number.isNaN(value)) {
                    throw new functions.https.HttpsError('invalid-argument', `Field "${key}" must be a number.`);
                }
                if (field.min !== undefined && value < field.min) {
                    throw new functions.https.HttpsError('invalid-argument', `Field "${key}" must be >= ${field.min}.`);
                }
                if (field.max !== undefined && value > field.max) {
                    throw new functions.https.HttpsError('invalid-argument', `Field "${key}" must be <= ${field.max}.`);
                }
                break;
            case 'boolean':
                if (typeof value !== 'boolean') {
                    throw new functions.https.HttpsError('invalid-argument', `Field "${key}" must be a boolean.`);
                }
                break;
            case 'array':
                if (!Array.isArray(value)) {
                    throw new functions.https.HttpsError('invalid-argument', `Field "${key}" must be an array.`);
                }
                if (field.maxItems !== undefined && value.length > field.maxItems) {
                    throw new functions.https.HttpsError('invalid-argument', `Field "${key}" exceeds the maximum of ${field.maxItems} items.`);
                }
                break;
            case 'object':
                if (typeof value !== 'object' || Array.isArray(value)) {
                    throw new functions.https.HttpsError('invalid-argument', `Field "${key}" must be an object.`);
                }
                break;
        }
    }
}
//# sourceMappingURL=validation.js.map