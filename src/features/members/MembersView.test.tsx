// @vitest-environment jsdom
// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Verrouille les
// deux comportements les plus délicats de la migration du formulaire Créer/Modifier un assuré
// AVANT toute régression future : (1) le message d'erreur combiné unique s'affiche toujours
// quand le nom principal est vide/blanc, sans jamais appeler onAddMember, et (2) une création
// valide transmet bien les valeurs saisies à onAddMember. reserveExistingCardNumber (écriture
// transactionnelle Firestore réelle) est mocké pour ne jamais toucher un backend réel dans ce
// test — seule sa signature d'appel/résolution est simulée, sa logique de format
// (isValidCardNumberFormat/normalizeCardNumber) reste réelle.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MembersView } from './MembersView';
import { Organization } from '../../types';

vi.mock('../../services/cardNumberService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/cardNumberService')>();
  return {
    ...actual,
    reserveExistingCardNumber: vi.fn().mockResolvedValue(undefined),
  };
});

const testOrganizations: Organization[] = [
  {
    id: 'org-1',
    name: 'TotalEnergies Liberia Ltd',
    policyNumber: 'POL-2026-1',
    effectiveDate: '2026-01-01',
    expirationDate: '2026-12-31',
    declaredMembers: 100,
    coverageRate: 80,
    status: 'Actif',
  },
];

describe('MembersView — formulaire Créer/Modifier un assuré (react-hook-form + zod)', () => {
  it("n'enregistre pas de membre si le nom principal est vide ou blanc — affiche le message d'erreur combiné", async () => {
    const onAddMember = vi.fn();
    const { container } = render(
      <MembersView
        lang="en"
        members={[]}
        organizations={testOrganizations}
        onAddMember={onAddMember}
        onUpdateMember={vi.fn()}
        onDeleteMember={vi.fn()}
        onImportMembers={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('New Member'));
    fireEvent.change(screen.getByPlaceholderText('e.g. A1B2C3D4E5F (11 alphanumeric characters)'), {
      target: { value: 'A1B2C3D4E5F' },
    });
    fireEvent.change(container.querySelector('input[type="date"]') as HTMLInputElement, {
      target: { value: '1990-01-01' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. John Doe'), { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Submit Enrollment'));

    await waitFor(() =>
      expect(
        screen.getByText('Please fill in all mandatory fields (Name and Organization).')
      ).toBeInTheDocument()
    );
    expect(onAddMember).not.toHaveBeenCalled();
  });

  it('crée un membre avec un numéro de carte valide et transmet les valeurs saisies', async () => {
    const onAddMember = vi.fn();
    const { container } = render(
      <MembersView
        lang="en"
        members={[]}
        organizations={testOrganizations}
        onAddMember={onAddMember}
        onUpdateMember={vi.fn()}
        onDeleteMember={vi.fn()}
        onImportMembers={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('New Member'));
    fireEvent.change(screen.getByPlaceholderText('e.g. A1B2C3D4E5F (11 alphanumeric characters)'), {
      target: { value: 'a1b2c3d4e5f' },
    });
    fireEvent.change(container.querySelector('input[type="date"]') as HTMLInputElement, {
      target: { value: '1990-01-01' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. John Doe'), { target: { value: 'Jane Roe' } });
    fireEvent.click(screen.getByText('Submit Enrollment'));

    await waitFor(() => expect(onAddMember).toHaveBeenCalledTimes(1));
    expect(onAddMember.mock.calls[0][0]).toMatchObject({
      cardNo: 'A1B2C3D4E5F',
      principalName: 'Jane Roe',
      organization: 'TotalEnergies Liberia Ltd',
      relationship: 'Principal',
      status: 'Actif',
    });
  });
});
