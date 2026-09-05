"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// === AMÉLIORATION AJOUTÉE : tests unitaires purs (Phase 2.1/3) pour validatePayload() —
// aucune dépendance à l'émulateur, exécutable via `npm test` dans functions/.
const vitest_1 = require("vitest");
const validation_1 = require("./validation");
(0, vitest_1.describe)('validatePayload', () => {
    (0, vitest_1.it)('accepts a well-formed payload matching the schema', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validatePayload)({ organization: 'OrgA', method: 'MANUAL' }, { organization: { type: 'string', required: true }, method: { type: 'string', enum: ['MANUAL', 'AUTO_ENROLLMENT'] } })).not.toThrow();
    });
    (0, vitest_1.it)('rejects a missing required field', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validatePayload)({}, { claimId: { type: 'string', required: true } })).toThrow(/required/);
    });
    (0, vitest_1.it)('rejects an unknown field', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validatePayload)({ claimId: 'c1', hacker: true }, { claimId: { type: 'string', required: true } })).toThrow(/Unknown field/);
    });
    (0, vitest_1.it)('rejects a wrong type', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validatePayload)({ count: 'five' }, { count: { type: 'number' } })).toThrow(/must be a number/);
    });
    (0, vitest_1.it)('rejects a value outside an enum', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validatePayload)({ decision: 'maybe' }, { decision: { type: 'string', enum: ['approved', 'rejected'] } })).toThrow(/must be one of/);
    });
    (0, vitest_1.it)('rejects a number outside its min/max bounds', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validatePayload)({ amount: -5 }, { amount: { type: 'number', min: 0 } })).toThrow(/must be >=/);
        (0, vitest_1.expect)(() => (0, validation_1.validatePayload)({ amount: 999 }, { amount: { type: 'number', max: 100 } })).toThrow(/must be <=/);
    });
    (0, vitest_1.it)('rejects a string exceeding maxLength', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validatePayload)({ name: 'x'.repeat(300) }, { name: { type: 'string', maxLength: 200 } })).toThrow(/maximum length/);
    });
    (0, vitest_1.it)('rejects an array exceeding maxItems', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validatePayload)({ rows: new Array(10).fill(1) }, { rows: { type: 'array', maxItems: 5 } })).toThrow(/maximum of/);
    });
    (0, vitest_1.it)('rejects an oversized payload', () => {
        const huge = { blob: 'x'.repeat(300_000) };
        (0, vitest_1.expect)(() => (0, validation_1.validatePayload)(huge, { blob: { type: 'string' } }, 1000)).toThrow(/too large/);
    });
    (0, vitest_1.it)('rejects a non-object payload', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validatePayload)('not an object', {})).toThrow(/must be a JSON object/);
        (0, vitest_1.expect)(() => (0, validation_1.validatePayload)(['array'], {})).toThrow(/must be a JSON object/);
        (0, vitest_1.expect)(() => (0, validation_1.validatePayload)(null, {})).toThrow(/must be a JSON object/);
    });
    (0, vitest_1.it)('allows an optional field to be entirely absent', () => {
        (0, vitest_1.expect)(() => (0, validation_1.validatePayload)({}, { rejectionReason: { type: 'string' } })).not.toThrow();
    });
});
//# sourceMappingURL=validation.test.js.map