// @vitest-environment jsdom
// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Le module
// organizations est le premier domaine "complexe" migré (22 champs dans un seul formulaire, dont
// un sélecteur de taux à 3 contrôles synchronisés — pastilles/curseur/champ numérique — et une
// section police santé conditionnellement enregistrée). Ce test verrouille précisément les deux
// comportements les plus délicats AVANT toute régression future : (1) la synchronisation des 3
// contrôles du taux de couverture, et (2) que la police santé n'est enregistrée QUE si la
// section a été ouverte (ou existait déjà) — jamais silencieusement à l'insu de l'admin.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OrganizationsView } from './OrganizationsView';

describe('OrganizationsView — formulaire Créer/Modifier une organisation (react-hook-form + zod)', () => {
  it('synchronise les 3 contrôles du taux de couverture (pastille -> champ numérique) et transmet le taux choisi à la création', async () => {
    const onAddOrganization = vi.fn();
    render(
      <OrganizationsView
        lang="en"
        organizations={[]}
        onAddOrganization={onAddOrganization}
        onUpdateOrganization={vi.fn()}
        onDeleteOrganization={vi.fn()}
        onImportOrganizations={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('New Organization'));

    const nameInput = screen.getByPlaceholderText('e.g. Liberia Petroleum Refining Company');
    fireEvent.change(nameInput, { target: { value: 'Acme Corp' } });

    // Choisit la pastille "90%" — doit se répercuter sur le champ numérique synchronisé.
    fireEvent.click(screen.getByText('90%'));
    // getByDisplayValue('90') matcherait à la fois le curseur (range) et le champ numérique
    // synchronisés sur la même valeur : on isole ici précisément le champ numérique.
    const rateNumberInput = screen
      .getAllByDisplayValue('90')
      .find((el) => (el as HTMLInputElement).type === 'number') as HTMLInputElement;
    expect(rateNumberInput).toBeDefined();
    expect(rateNumberInput.type).toBe('number');

    fireEvent.click(screen.getByText('Save Organization'));

    // La validation zod (zodResolver) est asynchrone : on attend la résolution de la
    // microtâche avant de vérifier les appels, sinon le test échoue faussement.
    await waitFor(() => expect(onAddOrganization).toHaveBeenCalledTimes(1));
    expect(onAddOrganization.mock.calls[0][0]).toMatchObject({
      name: 'Acme Corp',
      coverageRate: 90,
    });
  });

  it("n'enregistre PAS de police santé si la section repliable n'a jamais été ouverte", async () => {
    const onAddOrganization = vi.fn();
    const onSaveHealthPolicy = vi.fn();
    render(
      <OrganizationsView
        lang="en"
        organizations={[]}
        onAddOrganization={onAddOrganization}
        onUpdateOrganization={vi.fn()}
        onDeleteOrganization={vi.fn()}
        onImportOrganizations={vi.fn()}
        onSaveHealthPolicy={onSaveHealthPolicy}
      />
    );

    fireEvent.click(screen.getByText('New Organization'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Liberia Petroleum Refining Company'), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.click(screen.getByText('Save Organization'));

    await waitFor(() => expect(onAddOrganization).toHaveBeenCalledTimes(1));
    expect(onSaveHealthPolicy).not.toHaveBeenCalled();
  });

  it('enregistre la police santé si la section repliable a été ouverte avant soumission', async () => {
    const onAddOrganization = vi.fn();
    const onSaveHealthPolicy = vi.fn();
    render(
      <OrganizationsView
        lang="en"
        organizations={[]}
        onAddOrganization={onAddOrganization}
        onUpdateOrganization={vi.fn()}
        onDeleteOrganization={vi.fn()}
        onImportOrganizations={vi.fn()}
        onSaveHealthPolicy={onSaveHealthPolicy}
      />
    );

    fireEvent.click(screen.getByText('New Organization'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Liberia Petroleum Refining Company'), {
      target: { value: 'Acme Corp' },
    });
    // Ouvre la section repliable "Health Insurance Policy Configuration".
    fireEvent.click(screen.getByText('Health Insurance Policy Configuration (Optional)'));
    fireEvent.click(screen.getByText('Save Organization'));

    await waitFor(() => expect(onAddOrganization).toHaveBeenCalledTimes(1));
    expect(onSaveHealthPolicy).toHaveBeenCalledTimes(1);
    expect(onSaveHealthPolicy.mock.calls[0][0]).toBe('Acme Corp');
  });
});
