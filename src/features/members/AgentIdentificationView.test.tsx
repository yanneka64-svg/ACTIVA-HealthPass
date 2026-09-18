// @vitest-environment jsdom
// === AMÉLIORATION AJOUTÉE : demande explicite (2026-09-18, capture d'écran depuis un terminal
// HFSecurity FP08 tactile) — "sur la version mobile les données sur les assurés n'apparaissent
// pas sur la page" : taper une recherche ne montrait jamais de résultat car rien ne déclenchait
// `handleSearchSubmit` sans clavier physique (touche Entrée). Remplace le bouton "New
// Enrollment" du bandeau de recherche par un bouton "Search" qui déclenche la même recherche.
// Ce test verrouille : (1) avant toute recherche, l'état vide s'affiche bien (reproduit le bug
// signalé), (2) cliquer "Search" après une saisie affiche bien l'assuré trouvé.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

const secondTestMember: Member = {
  id: 'm2',
  cardNo: 'AMID-2026-0002',
  principalName: 'Moussa Traoré',
  children: [],
  birthDate: '1985-03-14',
  relationship: 'Principal',
  organization: 'TotalEnergies Liberia Ltd',
  status: 'Active',
  hasPhoto: false,
  hasBiometrics: true,
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

// === AMÉLIORATION AJOUTÉE : revue automatisée (2026-09-18) — passer à .includes() (voir
// handleSearchSubmit) rend plusieurs résultats possibles pour un même préfixe partagé (ex.
// "AMID", présent dans toutes les cartes ACTIVA) ; sélectionner le premier trouvé au hasard
// serait un risque réel d'afficher le dossier d'une autre personne dans une appli santé.
describe('AgentIdentificationView — désambiguïsation de la recherche partielle', () => {
  it('ne sélectionne personne quand plusieurs assurés partagent le même préfixe', () => {
    render(
      <AgentIdentificationView lang="en" members={[testMember, secondTestMember]} claims={[]} />
    );

    fireEvent.change(screen.getByPlaceholderText(/Search by Card Number/i), {
      target: { value: 'AMID' },
    });
    fireEvent.click(screen.getByText('Search'));

    expect(screen.getByText('Identify an insured member')).toBeInTheDocument();
    expect(screen.getByText(/2 insured members match this search/i)).toBeInTheDocument();
  });

  it('sélectionne directement la personne quand le n° de carte complet est saisi, même en présence d\'autres préfixes partagés', () => {
    render(
      <AgentIdentificationView lang="en" members={[testMember, secondTestMember]} claims={[]} />
    );

    fireEvent.change(screen.getByPlaceholderText(/Search by Card Number/i), {
      target: { value: 'AMID-2026-0002' },
    });
    fireEvent.click(screen.getByText('Search'));

    expect(screen.queryByText('Identify an insured member')).not.toBeInTheDocument();
    expect(screen.getAllByText('Moussa Traoré').length).toBeGreaterThan(0);
  });
});

// === AMÉLIORATION AJOUTÉE : revue automatisée (2026-09-18) — "Any fingerprint selects the
// first member". handleFingerprintCaptured sélectionnait n'importe quel assuré ayant des
// données biométriques (ou, à défaut, le premier de la liste) en ignorant le gabarit capturé —
// désormais corrigé, ce simulacre pouvait afficher le dossier d'une personne totalement
// différente une fois le callback réparé (voir plus haut).
describe('AgentIdentificationView — scan biométrique honnête (pas de faux "match")', () => {
  it('ne sélectionne aucun assuré après un scan biométrique et prévient que ce n\'est pas disponible', async () => {
    render(
      <AgentIdentificationView lang="en" members={[testMember, secondTestMember]} claims={[]} />
    );

    fireEvent.click(screen.getByText('Scan Biometric Sensor'));
    fireEvent.click(screen.getByText('Trigger Sensor'));

    await waitFor(() => expect(screen.getByText('Confirm Biometrics')).toBeInTheDocument(), {
      timeout: 3000,
    });
    fireEvent.click(screen.getByText('Confirm Biometrics'));

    expect(screen.getByText('Identify an insured member')).toBeInTheDocument();
    expect(
      screen.getByText('Biometric 1:N identification is not available yet. Please search by card number or name instead.')
    ).toBeInTheDocument();
  });
});
