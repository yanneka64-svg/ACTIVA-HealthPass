// === AMÉLIORATION AJOUTÉE : tests unitaires purs (Phase 3, section 2.4) pour
// src/config/dataRetention.ts — aucune dépendance à l'émulateur, exécutable via
// `npm test` (vitest run tests/dataRetention.test.ts).
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MEDICAL_FORM_RETENTION_YEARS,
  computeMedicalFormRetentionUntil,
  isPastRetention,
} from '../src/config/dataRetention';

describe('computeMedicalFormRetentionUntil', () => {
  it('ajoute la durée de rétention par défaut à la date d\'émission', () => {
    const result = computeMedicalFormRetentionUntil('2020-01-15T00:00:00.000Z');
    const expectedYear = 2020 + DEFAULT_MEDICAL_FORM_RETENTION_YEARS;
    expect(new Date(result).getUTCFullYear()).toBe(expectedYear);
  });

  it('accepte une durée personnalisée', () => {
    const result = computeMedicalFormRetentionUntil('2020-01-15T00:00:00.000Z', 2);
    expect(new Date(result).getUTCFullYear()).toBe(2022);
  });

  it('retombe sur la date du jour si issueDate est invalide (jamais de crash)', () => {
    const result = computeMedicalFormRetentionUntil('not-a-date', 1);
    expect(Number.isNaN(new Date(result).getTime())).toBe(false);
  });
});

describe('isPastRetention', () => {
  it('renvoie false si retentionUntil est absente (jamais "à purger" par défaut)', () => {
    expect(isPastRetention(undefined)).toBe(false);
  });

  it('renvoie false si retentionUntil est invalide', () => {
    expect(isPastRetention('not-a-date')).toBe(false);
  });

  it('renvoie true si la date de rétention est dans le passé', () => {
    expect(isPastRetention('2020-01-01T00:00:00.000Z', new Date('2026-01-01T00:00:00.000Z'))).toBe(true);
  });

  it('renvoie false si la date de rétention est dans le futur', () => {
    expect(isPastRetention('2030-01-01T00:00:00.000Z', new Date('2026-01-01T00:00:00.000Z'))).toBe(false);
  });
});
