import { describe, it, expect } from 'vitest';
import { checkPreauthorizationNeeded, PREAUTHORIZATION_THRESHOLD_USD } from '../src/features/preauthorization/preauthCheck';
import { Claim } from '../src/types';

// === AMÉLIORATION AJOUTÉE : sécurité/robustesse (Phase 2 du plan de durcissement, 2026-09-17) ===
// Test de caractérisation de checkPreauthorizationNeeded — jusqu'ici sans aucune couverture de
// test. Rappel du comportement documenté dans preauthCheck.ts : ce module est purement informatif
// (mode silencieux), il ne bloque jamais un claim — ce test ne fait que figer le calcul du seuil.

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-1',
    reference: 'CLM-1',
    patientName: 'Jean Dupont',
    cardNo: 'AMID-260101-00001',
    organization: 'ORG_A',
    amount: 100,
    status: 'pending',
    ...overrides,
  } as Claim;
}

describe('checkPreauthorizationNeeded', () => {
  it('does not require preauthorization exactly at the threshold', () => {
    const result = checkPreauthorizationNeeded(claim({ amount: PREAUTHORIZATION_THRESHOLD_USD }));
    expect(result.required).toBe(false);
    expect(result.thresholdUsd).toBe(PREAUTHORIZATION_THRESHOLD_USD);
  });

  it('requires preauthorization strictly above the threshold', () => {
    const result = checkPreauthorizationNeeded(claim({ amount: PREAUTHORIZATION_THRESHOLD_USD + 0.01 }));
    expect(result.required).toBe(true);
  });

  it('does not require preauthorization for amounts below the threshold', () => {
    const result = checkPreauthorizationNeeded(claim({ amount: 1 }));
    expect(result.required).toBe(false);
  });

  it('treats a missing/non-numeric amount as zero (never requires preauthorization)', () => {
    const result = checkPreauthorizationNeeded(claim({ amount: undefined as unknown as number }));
    expect(result.required).toBe(false);
    expect(result.thresholdUsd).toBe(PREAUTHORIZATION_THRESHOLD_USD);
  });
});
