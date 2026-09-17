// === AMÉLIORATION AJOUTÉE : tests unitaires (Revue complète 2026-09-06, finding #7 — HIGH) pour
// isBase64PhotoFallbackAllowed() — interrupteur de secours désactivé par défaut.
import { describe, expect, it, afterEach, vi } from 'vitest';
import { isBase64PhotoFallbackAllowed } from '../src/config/storageFallback';

describe('isBase64PhotoFallbackAllowed', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('retourne false par défaut (variable absente) — fail-closed', () => {
    vi.stubEnv('VITE_ALLOW_STORAGE_BASE64_FALLBACK', undefined as unknown as string);
    expect(isBase64PhotoFallbackAllowed()).toBe(false);
  });

  it('retourne true uniquement si la variable vaut exactement "true"', () => {
    vi.stubEnv('VITE_ALLOW_STORAGE_BASE64_FALLBACK', 'true');
    expect(isBase64PhotoFallbackAllowed()).toBe(true);
  });

  it('retourne false pour toute autre valeur', () => {
    for (const value of ['1', 'yes', 'TRUE', 'false', '']) {
      vi.stubEnv('VITE_ALLOW_STORAGE_BASE64_FALLBACK', value);
      expect(isBase64PhotoFallbackAllowed()).toBe(false);
    }
  });
});
