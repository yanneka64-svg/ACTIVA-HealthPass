// @vitest-environment jsdom
// === AMÉLIORATION AJOUTÉE : intégration du capteur physique HFSecurity FP08 (demande
// explicite, 2026-09-18) — voir hfSecurityBridge.ts pour le contexte complet. Ce test couvre le
// contrat du pont natif : absence de pont (cas de tout navigateur classique aujourd'hui),
// résolution sur succès, rejet sur échec ou réponse malformée, délai dépassé, annulation, et
// rejet immédiat si `captureFingerprint` lève une exception synchrone (revue automatisée,
// 2026-09-18).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  isHFSecurityBridgeAvailable,
  captureViaHFSecurityBridge,
} from './hfSecurityBridge';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as any).HFSecurityBridge;
  delete (window as any).__hfSecurityCaptureCallback;
  delete (window as any).__hfSecurityErrorCallback;
});

describe('hfSecurityBridge', () => {
  it('signale l\'absence de pont natif quand window.HFSecurityBridge n\'est pas défini', () => {
    expect(isHFSecurityBridgeAvailable()).toBe(false);
  });

  it('rejette immédiatement une capture si aucun pont natif n\'est détecté', async () => {
    const { promise } = captureViaHFSecurityBridge('right_index');
    await expect(promise).rejects.toThrow(/pont HFSecurity indisponible/i);
  });

  it('résout avec le résultat transmis par le pont natif une fois le callback de succès appelé', async () => {
    (window as any).HFSecurityBridge = {
      captureFingerprint: (requestId: string) => {
        // Simule la coquille Android répondant de façon asynchrone.
        setTimeout(() => {
          window.__hfSecurityCaptureCallback?.(
            requestId,
            JSON.stringify({ score: 97, template: 'ANSI378_REAL_TEMPLATE', finger: 'right_index' })
          );
        }, 0);
      },
    };

    const { promise } = captureViaHFSecurityBridge('right_index');
    vi.advanceTimersByTime(0);
    const result = await promise;
    expect(result).toEqual({ score: 97, template: 'ANSI378_REAL_TEMPLATE', finger: 'right_index' });
  });

  it('rejette la promesse quand la coquille native rapporte une erreur', async () => {
    (window as any).HFSecurityBridge = {
      captureFingerprint: (requestId: string) => {
        setTimeout(() => {
          window.__hfSecurityErrorCallback?.(requestId, 'Sensor timeout');
        }, 0);
      },
    };

    const { promise } = captureViaHFSecurityBridge('right_index');
    vi.advanceTimersByTime(0);
    await expect(promise).rejects.toThrow('Sensor timeout');
  });

  it('rejette proprement si la coquille native renvoie un JSON invalide', async () => {
    (window as any).HFSecurityBridge = {
      captureFingerprint: (requestId: string) => {
        setTimeout(() => {
          window.__hfSecurityCaptureCallback?.(requestId, 'not-json');
        }, 0);
      },
    };

    const { promise } = captureViaHFSecurityBridge('right_index');
    vi.advanceTimersByTime(0);
    await expect(promise).rejects.toThrow(/invalide/i);
  });

  // === AMÉLIORATION AJOUTÉE : revue automatisée (2026-09-18) — "Bad sensor data becomes a
  // valid scan". Un JSON syntaxiquement valide mais structurellement incorrect (score hors
  // bornes, template vide, tableau, null...) ne doit jamais être accepté comme une capture
  // réussie.
  it.each([
    ['un tableau', '[]'],
    ['null', 'null'],
    ['un score hors bornes (>100)', JSON.stringify({ score: 150, template: 'T', finger: 'right_index' })],
    ['un score négatif', JSON.stringify({ score: -1, template: 'T', finger: 'right_index' })],
    ['un template vide', JSON.stringify({ score: 90, template: '', finger: 'right_index' })],
    ['un finger manquant', JSON.stringify({ score: 90, template: 'T' })],
  ])('rejette une réponse structurellement invalide : %s', async (_label, payload) => {
    (window as any).HFSecurityBridge = {
      captureFingerprint: (requestId: string) => {
        setTimeout(() => {
          window.__hfSecurityCaptureCallback?.(requestId, payload);
        }, 0);
      },
    };

    const { promise } = captureViaHFSecurityBridge('right_index');
    vi.advanceTimersByTime(0);
    await expect(promise).rejects.toThrow(/invalide/i);
  });

  // === AMÉLIORATION AJOUTÉE : revue automatisée (2026-09-18) — "A silent sensor leaves
  // capture stuck". Sans délai, une requête dont la coquille native ne répond jamais restait
  // "capturing" indéfiniment.
  it('rejette après le délai si la coquille native ne répond jamais', async () => {
    (window as any).HFSecurityBridge = {
      captureFingerprint: () => {
        // Ne répond jamais — simule un capteur silencieux.
      },
    };

    const { promise } = captureViaHFSecurityBridge('right_index');
    const assertion = expect(promise).rejects.toThrow(/délai/i);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it('rejette immédiatement si captureFingerprint lève une exception synchrone', async () => {
    (window as any).HFSecurityBridge = {
      captureFingerprint: () => {
        throw new Error('Capteur non initialisé');
      },
    };

    const { promise } = captureViaHFSecurityBridge('right_index');
    await expect(promise).rejects.toThrow('Capteur non initialisé');
  });

  // === AMÉLIORATION AJOUTÉE : revue automatisée (2026-09-18) — `cancel()` doit rendre une
  // réponse tardive de la coquille native totalement inoffensive (elle ne doit plus pouvoir
  // régler la promesse abandonnée).
  it('cancel() empêche une réponse tardive de régler la capture abandonnée', async () => {
    let capturedRequestId = '';
    (window as any).HFSecurityBridge = {
      captureFingerprint: (requestId: string) => {
        capturedRequestId = requestId;
        // Le natif "répond" bien plus tard, après l'annulation.
      },
    };

    const { promise, cancel } = captureViaHFSecurityBridge('right_index');
    let settled = false;
    promise.then(
      () => { settled = true; },
      () => { settled = true; }
    );

    cancel();
    // Réponse tardive de la coquille native, après annulation : doit être ignorée sans effet.
    window.__hfSecurityCaptureCallback?.(
      capturedRequestId,
      JSON.stringify({ score: 90, template: 'T', finger: 'right_index' })
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
  });
});
