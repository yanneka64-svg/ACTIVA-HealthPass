// === AMÉLIORATION AJOUTÉE : tests unitaires purs (Phase 3) pour permissions.ts — aucune
// dépendance à l'émulateur, exécutable via `npm test` (vitest run tests/permissions.test.ts).
import { describe, expect, it } from 'vitest';
import { canApproveRecord, canDeleteRecord, canExportData, hasPermission } from '../src/services/permissions';

describe('Export par un Agent (si non autorisé) = REFUS', () => {
  it('canExportData refuse un Agent', () => {
    expect(canExportData('Agent')).toBe(false);
  });
  it('canExportData autorise Supervisor et Admin', () => {
    expect(canExportData('Supervisor')).toBe(true);
    expect(canExportData('Admin')).toBe(true);
  });
  it('hasPermission refuse EXPORT à un Agent', () => {
    expect(hasPermission('Agent', 'EXPORT')).toBe(false);
  });
});

describe('Agent → approuver un claim = REFUS (matrice de permissions)', () => {
  it('hasPermission refuse APPROVE à un Agent', () => {
    expect(hasPermission('Agent', 'APPROVE')).toBe(false);
  });
  it('canApproveRecord refuse systématiquement un Agent, même sur le dossier d\'un tiers', () => {
    const result = canApproveRecord('Agent', { uid: 'agent1' }, { createdBy: 'someoneElse' });
    expect(result.allowed).toBe(false);
  });
});

describe('Séparation des tâches — canApproveRecord', () => {
  it('refuse un Supervisor qui approuve son propre dossier (par uid)', () => {
    const result = canApproveRecord('Supervisor', { uid: 'sup1' }, { createdBy: 'sup1' });
    expect(result.allowed).toBe(false);
  });
  it('refuse un Supervisor qui approuve son propre dossier (par email, casse différente)', () => {
    const result = canApproveRecord('Supervisor', { email: 'Sup@Example.com' }, { creatorEmail: 'sup@example.com' });
    expect(result.allowed).toBe(false);
  });
  it('autorise un Supervisor à approuver le dossier d\'un tiers', () => {
    const result = canApproveRecord('Supervisor', { uid: 'sup1' }, { createdBy: 'agent1' });
    expect(result.allowed).toBe(true);
  });
});

describe('Suppression réservée à Admin', () => {
  it('canDeleteRecord refuse Agent et Supervisor', () => {
    expect(canDeleteRecord('Agent')).toBe(false);
    expect(canDeleteRecord('Supervisor')).toBe(false);
  });
  it('canDeleteRecord autorise Admin', () => {
    expect(canDeleteRecord('Admin')).toBe(true);
  });
});
