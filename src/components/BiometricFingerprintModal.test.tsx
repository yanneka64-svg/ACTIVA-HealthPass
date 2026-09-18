// @vitest-environment jsdom
// === AMÉLIORATION AJOUTÉE : intégration du capteur physique HFSecurity FP08 (demande
// explicite, 2026-09-18) === Preuve reproductible du bug trouvé en marge de cette intégration :
// AgentIdentificationView.tsx appelait ce composant avec une prop `onCapture` qui n'existe pas
// sur son interface (la vraie prop est `onFingerprintCaptured`), donc la confirmation d'une
// empreinte n'appelait jamais le callback attendu — silencieusement, car `tsc` ne détecte pas ce
// genre d'erreur de prop JSX ici (voir @types/react manquant du projet). Ce test verrouille le
// comportement correct : `onFingerprintCaptured` doit bien être appelé avec le template capturé
// à la confirmation, en capture simulée (aucun pont HFSecurity natif présent dans jsdom).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BiometricFingerprintModal } from './BiometricFingerprintModal';

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
