// === AMÉLIORATION AJOUTÉE : tests unitaires (Revue complète 2026-09-06, finding #6) pour le
// petit bus d'état utilisé pour signaler un incident de synchronisation Firestore réel (voir
// src/services/firestore.ts) sans repli silencieux vers des données de démonstration.
import { describe, expect, it, beforeEach } from 'vitest';
import { reportSyncIssue, clearSyncIssue, getSyncIssues, subscribeSyncIssues } from '../src/utils/systemStatus';

describe('systemStatus — reportSyncIssue / clearSyncIssue / getSyncIssues', () => {
  beforeEach(() => {
    // Nettoie l'état global entre les tests (module singleton).
    getSyncIssues().forEach((i) => clearSyncIssue(i.collectionName));
  });

  it('reportSyncIssue ajoute une entrée pour la collection concernée', () => {
    reportSyncIssue('members', new Error('permission-denied'));
    const issues = getSyncIssues();
    expect(issues).toHaveLength(1);
    expect(issues[0].collectionName).toBe('members');
    expect(issues[0].message).toContain('permission-denied');
  });

  it('un second appel sur la MÊME collection remplace l\'entrée au lieu de la dupliquer', () => {
    reportSyncIssue('members', new Error('first error'));
    reportSyncIssue('members', new Error('second error'));
    const issues = getSyncIssues();
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('second error');
  });

  it('deux collections différentes en erreur produisent deux entrées distinctes', () => {
    reportSyncIssue('members', new Error('err1'));
    reportSyncIssue('claims', new Error('err2'));
    expect(getSyncIssues().map((i) => i.collectionName).sort()).toEqual(['claims', 'members']);
  });

  it('clearSyncIssue retire uniquement l\'entrée de la collection concernée', () => {
    reportSyncIssue('members', new Error('err1'));
    reportSyncIssue('claims', new Error('err2'));
    clearSyncIssue('members');
    const issues = getSyncIssues();
    expect(issues).toHaveLength(1);
    expect(issues[0].collectionName).toBe('claims');
  });

  it('clearSyncIssue sur une collection déjà saine (aucune entrée) est un no-op silencieux', () => {
    expect(() => clearSyncIssue('never-reported')).not.toThrow();
    expect(getSyncIssues()).toHaveLength(0);
  });
});

describe('systemStatus — subscribeSyncIssues', () => {
  beforeEach(() => {
    getSyncIssues().forEach((i) => clearSyncIssue(i.collectionName));
  });

  it('un nouvel abonné reçoit immédiatement l\'état courant', () => {
    reportSyncIssue('members', new Error('err'));
    let received: string[] = [];
    subscribeSyncIssues((issues) => {
      received = issues.map((i) => i.collectionName);
    });
    expect(received).toEqual(['members']);
  });

  it('un abonné est notifié de chaque changement ultérieur', () => {
    const snapshots: number[] = [];
    subscribeSyncIssues((issues) => snapshots.push(issues.length));
    reportSyncIssue('members', new Error('err'));
    reportSyncIssue('claims', new Error('err'));
    clearSyncIssue('members');
    expect(snapshots).toEqual([0, 1, 2, 1]);
  });

  it('se désabonner arrête les notifications futures', () => {
    const snapshots: number[] = [];
    const unsubscribe = subscribeSyncIssues((issues) => snapshots.push(issues.length));
    unsubscribe();
    reportSyncIssue('members', new Error('err'));
    expect(snapshots).toEqual([0]);
  });
});
