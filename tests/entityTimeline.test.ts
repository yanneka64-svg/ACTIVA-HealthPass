// === AMÉLIORATION AJOUTÉE : test (HealthPass 3.0, revue 2026-09-12 — module Claim 360) ===
// Preuve reproductible que filterAndSortEntityLogs (src/modules/timeline/EntityTimeline.tsx)
// isole correctement les événements d'une seule entité, dans le bon ordre chronologique, sans
// dépendre d'un rendu DOM (ce projet n'a pas de dépendance jsdom).
import { describe, expect, it } from 'vitest';
import { filterAndSortEntityLogs } from '../src/modules/timeline/EntityTimeline';

describe('filterAndSortEntityLogs', () => {
  const logs = [
    { id: 'l1', entityId: 'clm-1', entityType: 'claim', timestamp: '2026-09-09T13:02:00Z', action: 'Claim approved' },
    { id: 'l2', entityId: 'clm-1', entityType: 'claim', timestamp: '2026-09-09T09:21:00Z', action: 'Claim submitted' },
    { id: 'l3', entityId: 'clm-2', entityType: 'claim', timestamp: '2026-09-09T10:00:00Z', action: 'Other claim event' },
    { id: 'l4', entityId: 'clm-1', entityType: 'enrollment', timestamp: '2026-09-09T11:00:00Z', action: 'Wrong entity type' },
    { id: 'l5', userEmail: 'a@b.com', status: 'success' as const, ipAddress: '1.2.3.4', userAgent: 'x', timestamp: '2026-09-09T08:00:00Z' },
  ];

  it("isole les événements de la bonne entité, dans l'ordre chronologique croissant", () => {
    const result = filterAndSortEntityLogs(logs, 'clm-1', 'claim');
    expect(result.map((e) => e.id)).toEqual(['l2', 'l1']);
  });

  it('ignore les entrées portant un entityType différent quand demandé', () => {
    const result = filterAndSortEntityLogs(logs, 'clm-1', 'claim');
    expect(result.find((e) => e.id === 'l4')).toBeUndefined();
  });

  it('sans entityType, accepte toute entrée dont entityId correspond (rétrocompatible avec des logs anciens sans entityType)', () => {
    const legacyLogs = [
      { id: 'legacy1', entityId: 'clm-1', timestamp: '2026-09-01T00:00:00Z', action: 'Legacy entry, no entityType' },
    ];
    const result = filterAndSortEntityLogs(legacyLogs, 'clm-1', 'claim');
    expect(result.map((e) => e.id)).toEqual(['legacy1']);
  });

  it("retourne un tableau vide quand aucune entrée ne correspond (ex: LoginLog sans entityId)", () => {
    const result = filterAndSortEntityLogs(logs, 'clm-999', 'claim');
    expect(result).toEqual([]);
  });

  it('ne lève jamais d\'exception sur un tableau vide', () => {
    expect(() => filterAndSortEntityLogs([], 'clm-1', 'claim')).not.toThrow();
    expect(filterAndSortEntityLogs([], 'clm-1', 'claim')).toEqual([]);
  });
});
