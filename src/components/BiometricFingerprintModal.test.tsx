// @vitest-environment jsdom
// === AMÉLIORATION AJOUTÉE : intégration du capteur physique HFSecurity FP08 (demande
// explicite, 2026-09-18) === Preuve reproductible du bug trouvé en marge de cette intégration :
// AgentIdentificationView.tsx appelait ce composant avec une prop `onCapture` qui n'existe pas
// sur son interface (la vraie prop est `onFingerprintCaptured`), donc la confirmation d'une
// empreinte n'appelait jamais le callback attendu — silencieusement, car `tsc` ne détecte pas ce
// genre d'erreur de prop JSX ici (voir @types/react manquant du projet). Ce test verrouille le
// comportement correct : `onFingerprintCaptured` doit bien être appelé avec le template capturé
// à la confirmation, en capture simulée (aucun pont HFSecurity natif présent dans jsdom).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { BiometricFingerprintModal } from './BiometricFingerprintModal';

afterEach(() => {
  cleanup();
  delete (window as any).HFSecurityBridge;
  delete (window as any).__hfSecurityCaptureCallback;
  delete (window as any).__hfSecurityErrorCallback;
});

describe('BiometricFingerprintModal — capture simulée (pas de pont HFSecurity natif)', () => {
  it('appelle onFingerprintCaptured avec un template ANSI 378 à la confirmation', async () => {
    const onFingerprintCaptured = vi.fn();
    const onClose = vi.fn();

    render(
      <BiometricFingerprintModal
        isOpen
        autoStart={false}
        onClose={onClose}
        onFingerprintCaptured={onFingerprintCaptured}
      />
    );

    fireEvent.click(screen.getByText('Trigger Sensor'));

    await waitFor(() => expect(screen.getByText('Confirm Biometrics')).toBeInTheDocument(), {
      timeout: 3000,
    });
    fireEvent.click(screen.getByText('Confirm Biometrics'));

    expect(onFingerprintCaptured).toHaveBeenCalledTimes(1);
    const payload = onFingerprintCaptured.mock.calls[0][0];
    expect(payload.finger).toBe('right_index');
    expect(payload.template).toMatch(/^ANSI_378_RIGHT_INDEX_/);
    expect(typeof payload.score).toBe('number');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('affiche les références HFSecurity FP08 par défaut (plus l\'ancien FAP-20 fictif)', () => {
    render(
      <BiometricFingerprintModal
        isOpen
        autoStart={false}
        onClose={() => {}}
        onFingerprintCaptured={() => {}}
      />
    );

    expect(screen.getAllByText(/HFSecurity FP08/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/HF20260303001123B62/).length).toBeGreaterThan(0);
  });
});

// === AMÉLIORATION AJOUTÉE : revue automatisée (2026-09-18) — verrouille les correctifs
// apportés au pont HFSecurity réel : un seul déclenchement par ouverture (pas de double capture
// auto-start + manuelle) et le doigt sélectionné ne peut plus changer pendant une capture.
describe('BiometricFingerprintModal — pont HFSecurity natif (simulé via window.HFSecurityBridge)', () => {
  it('un tap manuel pendant le délai auto-start ne déclenche qu\'une seule capture native', async () => {
    const captureFingerprint = vi.fn();
    (window as any).HFSecurityBridge = { captureFingerprint };

    render(
      <BiometricFingerprintModal
        isOpen
        autoStart
        onClose={() => {}}
        onFingerprintCaptured={() => {}}
      />
    );

    // Déclenchement manuel avant l'expiration du délai auto-start (500ms).
    fireEvent.click(screen.getByText('Trigger Sensor'));
    // Laisse le délai auto-start largement le temps de s'écouler s'il n'a pas été annulé.
    await new Promise((r) => setTimeout(r, 700));

    expect(captureFingerprint).toHaveBeenCalledTimes(1);
  });

  it('désactive le sélecteur de doigt pendant une capture en cours', async () => {
    const captureFingerprint = vi.fn(); // ne répond jamais — la capture reste "en cours"
    (window as any).HFSecurityBridge = { captureFingerprint };

    render(
      <BiometricFingerprintModal
        isOpen
        autoStart={false}
        onClose={() => {}}
        onFingerprintCaptured={() => {}}
      />
    );

    fireEvent.click(screen.getByText('Trigger Sensor'));
    await waitFor(() => expect(screen.getByText('Left Index').closest('button')).toBeDisabled());
  });

  it('utilise le template et le score renvoyés par le pont natif à la confirmation', async () => {
    (window as any).HFSecurityBridge = {
      captureFingerprint: (requestId: string) => {
        setTimeout(() => {
          window.__hfSecurityCaptureCallback?.(
            requestId,
            JSON.stringify({ score: 88, template: 'REAL_FP08_TEMPLATE', finger: 'right_index' })
          );
        }, 0);
      },
    };
    const onFingerprintCaptured = vi.fn();

    render(
      <BiometricFingerprintModal
        isOpen
        autoStart={false}
        onClose={() => {}}
        onFingerprintCaptured={onFingerprintCaptured}
      />
    );

    fireEvent.click(screen.getByText('Trigger Sensor'));
    await waitFor(() => expect(screen.getByText('Confirm Biometrics')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Confirm Biometrics'));

    expect(onFingerprintCaptured).toHaveBeenCalledWith({
      score: 88,
      template: 'REAL_FP08_TEMPLATE',
      finger: 'right_index',
    });
  });

  it('ignore une réponse native tardive arrivant après la fermeture de la modale', async () => {
    let capturedRequestId = '';
    (window as any).HFSecurityBridge = {
      captureFingerprint: (requestId: string) => {
        capturedRequestId = requestId;
        // Ne répond jamais avant la fermeture, simulée ci-dessous.
      },
    };
    const onFingerprintCaptured = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <BiometricFingerprintModal
        isOpen
        autoStart={false}
        onClose={onClose}
        onFingerprintCaptured={onFingerprintCaptured}
      />
    );

    fireEvent.click(screen.getByText('Trigger Sensor'));
    await waitFor(() => expect(capturedRequestId).not.toBe(''));

    // Fermeture de la modale pendant que la capture native est encore en attente.
    rerender(
      <BiometricFingerprintModal
        isOpen={false}
        autoStart={false}
        onClose={onClose}
        onFingerprintCaptured={onFingerprintCaptured}
      />
    );

    // Réponse tardive de la coquille native, après la fermeture : ne doit avoir aucun effet.
    window.__hfSecurityCaptureCallback?.(
      capturedRequestId,
      JSON.stringify({ score: 90, template: 'STALE_TEMPLATE', finger: 'right_index' })
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(onFingerprintCaptured).not.toHaveBeenCalled();
  });
});
