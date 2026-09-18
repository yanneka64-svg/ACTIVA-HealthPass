// @vitest-environment jsdom
// === AMÉLIORATION AJOUTÉE : intégration du capteur physique HFSecurity FP08 (demande
// explicite, 2026-09-18) — voir hfSecurityBridge.ts pour le contexte complet. Ce test couvre le
// contrat du pont natif : absence de pont (cas de tout navigateur classique aujourd'hui),
// résolution sur succès, et rejet sur échec ou réponse malformée.
import { describe, it, expect, afterEach } from 'vitest';
import {
  isHFSecurityBridgeAvailable,
  captureViaHFSecurityBridge,
} from './hfSecurityBridge';

afterEach(() => {
  delete (window as any).HFSecurityBridge;
  delete (window as any).__hfSecurityCaptureCallback;
  delete (window as any).__hfSecurityErrorCallback;
});

describe('hfSecurityBridge', () => {
  it('signale l\'absence de pont natif quand window.HFSecurityBridge n\'est pas défini', () => {
    expect(isHFSecurityBridgeAvailable()).toBe(false);
  });

  it('rejette immédiatement une capture si aucun pont natif n\'est détecté', async () => {
    await expect(captureViaHFSecurityBridge('right_index')).rejects.toThrow(
      /pont HFSecurity indisponible/i
    );
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

    const result = await captureViaHFSecurityBridge('right_index');
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

    await expect(captureViaHFSecurityBridge('right_index')).rejects.toThrow('Sensor timeout');
  });

  it('rejette proprement si la coquille native renvoie un JSON invalide', async () => {
    (window as any).HFSecurityBridge = {
      captureFingerprint: (requestId: string) => {
        setTimeout(() => {
          window.__hfSecurityCaptureCallback?.(requestId, 'not-json');
        }, 0);
      },
    };

    await expect(captureViaHFSecurityBridge('right_index')).rejects.toThrow(/invalide/i);
  });
});
