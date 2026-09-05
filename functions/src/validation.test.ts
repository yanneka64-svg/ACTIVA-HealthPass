// === AMÉLIORATION AJOUTÉE : tests unitaires purs (Phase 2.1/3) pour validatePayload() —
// aucune dépendance à l'émulateur, exécutable via `npm test` dans functions/.
import { describe, expect, it } from 'vitest';
import { validatePayload } from './validation';

describe('validatePayload', () => {
  it('accepts a well-formed payload matching the schema', () => {
    expect(() =>
      validatePayload(
        { organization: 'OrgA', method: 'MANUAL' },
        { organization: { type: 'string', required: true }, method: { type: 'string', enum: ['MANUAL', 'AUTO_ENROLLMENT'] } }
      )
    ).not.toThrow();
  });

  it('rejects a missing required field', () => {
    expect(() => validatePayload({}, { claimId: { type: 'string', required: true } })).toThrow(/required/);
  });

  it('rejects an unknown field', () => {
    expect(() =>
      validatePayload({ claimId: 'c1', hacker: true }, { claimId: { type: 'string', required: true } })
    ).toThrow(/Unknown field/);
  });

  it('rejects a wrong type', () => {
    expect(() => validatePayload({ count: 'five' }, { count: { type: 'number' } })).toThrow(/must be a number/);
  });

  it('rejects a value outside an enum', () => {
    expect(() =>
      validatePayload({ decision: 'maybe' }, { decision: { type: 'string', enum: ['approved', 'rejected'] } })
    ).toThrow(/must be one of/);
  });

  it('rejects a number outside its min/max bounds', () => {
    expect(() => validatePayload({ amount: -5 }, { amount: { type: 'number', min: 0 } })).toThrow(/must be >=/);
    expect(() => validatePayload({ amount: 999 }, { amount: { type: 'number', max: 100 } })).toThrow(/must be <=/);
  });

  it('rejects a string exceeding maxLength', () => {
    expect(() => validatePayload({ name: 'x'.repeat(300) }, { name: { type: 'string', maxLength: 200 } })).toThrow(/maximum length/);
  });

  it('rejects an array exceeding maxItems', () => {
    expect(() => validatePayload({ rows: new Array(10).fill(1) }, { rows: { type: 'array', maxItems: 5 } })).toThrow(/maximum of/);
  });

  it('rejects an oversized payload', () => {
    const huge = { blob: 'x'.repeat(300_000) };
    expect(() => validatePayload(huge, { blob: { type: 'string' } }, 1000)).toThrow(/too large/);
  });

  it('rejects a non-object payload', () => {
    expect(() => validatePayload('not an object', {})).toThrow(/must be a JSON object/);
    expect(() => validatePayload(['array'], {})).toThrow(/must be a JSON object/);
    expect(() => validatePayload(null, {})).toThrow(/must be a JSON object/);
  });

  it('allows an optional field to be entirely absent', () => {
    expect(() => validatePayload({}, { rejectionReason: { type: 'string' } })).not.toThrow();
  });
});
