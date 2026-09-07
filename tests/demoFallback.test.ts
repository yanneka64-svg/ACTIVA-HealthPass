// === AMÉLIORATION AJOUTÉE : tests unitaires (Revue complète 2026-09-06, finding #6 — CRITIQUE)
// pour isDemoFallbackAllowed() — garde-fou empêchant un repli silencieux vers des données de
// démonstration en production. Par défaut (variable absente), le repli doit être INTERDIT.
import { describe, expect, it, afterEach, vi } from 'vitest';
import { isDemoFallbackAllowed } from '../src/config/demoFallback';

describe('isDemoFallbackAllowed', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('retourne false par défaut (variable absente) — comportement sûr pour la production', () => {
    vi.stubEnv('VITE_ALLOW_DEMO_FALLBACK', undefined as unknown as string);
    expect(isDemoFallbackAllowed()).toBe(false);
  });

  it('retourne true uniquement si la variable vaut exactement "true"', () => {
    vi.stubEnv('VITE_ALLOW_DEMO_FALLBACK', 'true');
    expect(isDemoFallbackAllowed()).toBe(true);
  });

  it('retourne false pour toute autre valeur (typo, "1", "yes", majuscule) — pas de repli implicite', () => {
    for (const value of ['1', 'yes', 'TRUE', 'True', 'false', '']) {
      vi.stubEnv('VITE_ALLOW_DEMO_FALLBACK', value);
      expect(isDemoFallbackAllowed()).toBe(false);
    }
  });
});
