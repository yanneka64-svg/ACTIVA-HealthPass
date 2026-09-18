// @vitest-environment jsdom
// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Verrouille les
// deux comportements les plus délicats de la migration AVANT toute régression future : (1) un
// mot de passe ne respectant pas toutes les règles affiche le message d'erreur générique et
// n'appelle jamais onSuccess, (2) une soumission valide transmet le nouveau mot de passe et,
// hors première connexion forcée, le mot de passe actuel saisi.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChangePasswordModal } from './ChangePasswordModal';

describe('ChangePasswordModal — react-hook-form + zod', () => {
  it("n'appelle pas onSuccess si le mot de passe ne respecte pas toutes les règles", async () => {
    const onSuccess = vi.fn();
    render(<ChangePasswordModal isOpen lang="en" onSuccess={onSuccess} />);

    // Trois champs mot de passe partagent le même placeholder : on cible via le DOM.
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(passwordInputs[0], { target: { value: 'OldPass1!' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'short' } });
    fireEvent.change(passwordInputs[2], { target: { value: 'short' } });

    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() =>
      expect(screen.getByText('Please meet all the password security requirements.')).toBeInTheDocument()
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('appelle onSuccess avec le nouveau mot de passe et le mot de passe actuel (hors première connexion forcée)', async () => {
    const onSuccess = vi.fn();
    render(<ChangePasswordModal isOpen lang="en" onSuccess={onSuccess} />);

    const passwordInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(passwordInputs[0], { target: { value: 'OldPass1!' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'NewPass1!' } });
    fireEvent.change(passwordInputs[2], { target: { value: 'NewPass1!' } });

    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onSuccess).toHaveBeenCalledWith('NewPass1!', 'OldPass1!');
  });

  it('lors d\'une première connexion forcée, appelle onSuccess sans mot de passe actuel', async () => {
    const onSuccess = vi.fn();
    render(<ChangePasswordModal isOpen lang="en" onSuccess={onSuccess} isForcedFirstLogin />);

    // Pas de champ "mot de passe actuel" affiché dans ce mode : seuls 2 champs mot de passe.
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    expect(passwordInputs.length).toBe(2);
    fireEvent.change(passwordInputs[0], { target: { value: 'NewPass1!' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'NewPass1!' } });

    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onSuccess).toHaveBeenCalledWith('NewPass1!', undefined);
  });
});
