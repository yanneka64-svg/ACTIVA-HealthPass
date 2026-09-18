// @vitest-environment jsdom
// === AMÉLIORATION AJOUTÉE : demande explicite (2026-09-18, capture d'écran depuis un terminal
// HFSecurity FP08 tactile) — "sur la version mobile les données sur les assurés n'apparaissent
// pas sur la page" : taper une recherche ne montrait jamais de résultat car rien ne déclenchait
// `handleSearchSubmit` sans clavier physique (touche Entrée). Remplace le bouton "New
// Enrollment" du bandeau de recherche par un bouton "Search" qui déclenche la même recherche.
// Ce test verrouille : (1) avant toute recherche, l'état vide s'affiche bien (reproduit le bug
// signalé), (2) cliquer "Search" après une saisie affiche bien l'assuré trouvé.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentIdentificationView } from './AgentIdentificationView';
import { Member } from '../../types';

const testMember: Member = {
  id: 'm1',
  cardNo: 'AMID-2026-0001',
  principalName: 'Amina Diallo',
  children: [],
  birthDate: '1990-01-01',
  relationship: 'Principal',
  organization: 'TotalEnergies Liberia Ltd',
  status: 'Active',
  hasPhoto: false,
  hasBiometrics: false,
  createdAt: '2026-01-01',
};

describe('AgentIdentificationView — recherche tactile (bouton Search)', () => {
  it("n'affiche aucun assuré tant que la recherche n'a pas été déclenchée (reproduit le bug signalé)", () => {
    // === NOTE : l'annuaire desktop (colonne de gauche) est masqué sur mobile via une classe
    // CSS (`hidden lg:block`), pas retiré du DOM — jsdom ne simule pas les media queries, donc
    // il reste interrogeable ici et affiche déjà "Amina Diallo" au fil de la frappe (filtre live
    // de l'annuaire, inchangé). Ce test porte spécifiquement sur le panneau de DROITE (détail de
    // l'assuré sélectionné), seul visible sur mobile : tant qu'aucune recherche n'a été
    // soumise, il doit rester sur son état vide.
    render(<AgentIdentificationView lang="en" members={[testMember]} claims={[]} />);

    fireEvent.change(screen.getByPlaceholderText(/Search by Card Number/i), {
      target: { value: 'AMID' },
    });

    expect(screen.getByText('Identify an insured member')).toBeInTheDocument();
  });

  it('affiche l\'assuré trouvé après un clic sur le bouton "Search"', () => {
    render(<AgentIdentificationView lang="en" members={[testMember]} claims={[]} />);

    fireEvent.change(screen.getByPlaceholderText(/Search by Card Number/i), {
      target: { value: 'AMID' },
    });
    fireEvent.click(screen.getByText('Search'));

    expect(screen.queryByText('Identify an insured member')).not.toBeInTheDocument();
    // "Amina Diallo" apparaît maintenant à la fois dans l'annuaire (gauche, toujours dans le
    // DOM) et dans la fiche détaillée nouvellement affichée (droite) — on vérifie juste sa
    // présence, sans exiger l'unicité.
    expect(screen.getAllByText('Amina Diallo').length).toBeGreaterThan(0);
  });

  it('ne propose plus de bouton "New Enrollment" sur cet écran', () => {
    render(<AgentIdentificationView lang="en" members={[testMember]} claims={[]} />);
    expect(screen.queryByText('New Enrollment')).not.toBeInTheDocument();
  });
});
