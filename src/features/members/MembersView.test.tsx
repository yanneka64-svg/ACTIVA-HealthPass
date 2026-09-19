// @vitest-environment jsdom
// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Verrouille les
// deux comportements les plus délicats de la migration du formulaire Créer/Modifier un assuré
// AVANT toute régression future : (1) le message d'erreur combiné unique s'affiche toujours
// quand le nom principal est vide/blanc, sans jamais appeler onAddMember, et (2) une création
// valide transmet bien les valeurs saisies à onAddMember. reserveExistingCardNumber (écriture
// transactionnelle Firestore réelle) est mocké pour ne jamais toucher un backend réel dans ce
// test — seule sa signature d'appel/résolution est simulée, sa logique de format
// (isValidCardNumberFormat/normalizeCardNumber) reste réelle.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MembersView } from './MembersView';
import { Member, Organization, Ceiling } from '../../types';

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

// === AMÉLIORATION AJOUTÉE : correctif (revue Qodo, PR #90) — preuve reproductible que la
// mémoïsation ajoutée à eligibilityByMemberId (perf) n'introduit pas un badge "Age limit
// exceeded" obsolète : le passage d'un jour calendaire à l'autre (franchissement d'un
// anniversaire), SANS aucun changement de `members`/`ceilings`, doit toujours faire réapparaître
// un badge devenu correct.
describe('MembersView — badge "Age limit exceeded" reste à jour au passage de minuit (correctif Qodo, PR #90)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("affiche le badge dès que l'assuré principal franchit la limite d'âge par défaut (65 ans), sans changement de `members`/`ceilings`", async () => {
    // Né le 15 janvier 1960 : a 65 ans (pas encore 66) le 14 janvier 2026, puis 66 ans le 15.
    vi.setSystemTime(new Date('2026-01-14T12:00:00Z'));

    // === AMÉLIORATION AJOUTÉE : correctif (revue Qodo, PR #90) — `ceilings` DOIT être passé
    // explicitement et avec une référence stable ici. `MembersView` déclare `ceilings = []`
    // comme valeur par défaut : si la prop n'est pas fournie, chaque nouveau rendu (y compris
    // celui déclenché par l'intervalle horaire ci-dessous) recrée un tableau `[]` totalement
    // nouveau, ce qui invaliderait le cache `eligibilityByMemberId` à CHAQUE rendu — masquant
    // ainsi un vrai bug de mémoïsation obsolète au lieu de le révéler. En production, `App.tsx`
    // fournit toujours `ceilings` depuis un état stable (abonnement Firestore), donc ce risque
    // ne s'y pose pas — mais le test doit reproduire une référence stable pour être probant.
    const testCeilings: Ceiling[] = [];

    const principal: Member = {
      id: 'm1',
      cardNo: 'A1B2C3D4E5F',
      principalName: 'Old Principal',
      children: [],
      birthDate: '1960-01-15',
      relationship: 'Principal',
      organization: 'TotalEnergies Liberia Ltd',
      status: 'Actif',
      hasPhoto: false,
      hasBiometrics: false,
      createdAt: '2026-01-01T00:00:00Z',
    } as Member;

    render(
      <MembersView
        lang="en"
        members={[principal]}
        organizations={[]}
        ceilings={testCeilings}
        onAddMember={vi.fn()}
        onUpdateMember={vi.fn()}
        onDeleteMember={vi.fn()}
        onImportMembers={vi.fn()}
      />
    );

    // 65 ans, limite par défaut 65 ans (65 > 65 est faux) : pas encore de badge.
    expect(screen.queryByText(/Age limit exceeded/)).not.toBeInTheDocument();

    // Passage au 15 janvier 2026 (66e anniversaire) — aucune prop ne change, seule l'horloge
    // avance. L'intervalle horaire du composant doit détecter le changement de jour calendaire.
    // `waitFor` n'est pas utilisable ici : son polling interne repose lui aussi sur des timers,
    // désormais falsifiés par `vi.useFakeTimers()` — on avance donc explicitement le temps FAUX
    // (`advanceTimersByTime`, qui fait à la fois avancer l'horloge fictive ET déclencher les
    // callbacks planifiés dedans, dont l'intervalle horaire du composant) puis on flushe le
    // re-rendu React qui en résulte via `act`, avant d'asserter de façon synchrone.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25 * 60 * 60 * 1000);
    });

    expect(screen.getByText(/Age limit exceeded \(66 yrs > Limit 65 yrs\)/)).toBeInTheDocument();
  });
});
