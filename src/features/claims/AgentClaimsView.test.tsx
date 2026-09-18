// @vitest-environment jsdom
// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Tests de
// caractérisation écrits AVANT toute migration (aucun test n'existait sur ce fichier). Ce
// formulaire est le plus à risque de tout le rollout Phase 3 : il gouverne la soumission réelle
// de réclamations d'assurance (blocage d'éligibilité, alertes doublon/fréquence/plafond,
// synchronisation croisée carte <-> nom <-> organisation <-> patient). Ces tests verrouillent le
// comportement EXACT du code impératif actuel, y compris ses particularités existantes (ex :
// `frequencyWarning` affiche toujours "6" dès qu'une carte est saisie, quel que soit l'historique
// réel — voir `Math.max(memberHistory.length, 6)` dans le composant ; `patientRelationship` et
// `currency` ne sont PAS réinitialisés après soumission, contrairement aux autres champs), pour
// détecter toute régression pendant la migration vers react-hook-form + zod.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AgentClaimsView } from './AgentClaimsView';
import { claimsQueryKey } from './useClaimsQuery';
import { Claim, Member, Organization, Provider } from '../../types';

const testMember: Member = {
  id: 'm1',
  cardNo: 'CARD-001',
  principalName: 'John Doe',
  children: [],
  birthDate: '1980-01-01',
  relationship: 'Principal',
  organization: 'Acme Corp',
  status: 'Active',
  hasPhoto: false,
  hasBiometrics: false,
  createdAt: '2026-01-01',
  outpatientBalanceUSD: 100,
};

const testOrganization: Organization = {
  id: 'o1',
  name: 'Acme Corp',
  policyNumber: 'P-1',
  effectiveDate: '2026-01-01',
  expirationDate: '2027-01-01',
  declaredMembers: 10,
  coverageRate: 80,
  status: 'Active',
};

const testProvider: Provider = {
  id: 'p1',
  name: 'City Clinic',
  type: 'Clinic',
  location: 'Monrovia',
  conventionNumber: 'C-1',
  kypStatus: 'validated',
  contactPhone: '000',
};

function renderView(overrides: {
  members?: Member[];
  organizations?: Organization[];
  providers?: Provider[];
  ceilings?: any[];
  claims?: Claim[];
} = {}) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(claimsQueryKey(null), overrides.claims ?? []);
  const onCreateClaim = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <AgentClaimsView
        assignedOrgs={null}
        members={overrides.members ?? [testMember]}
        providers={overrides.providers ?? [testProvider]}
        organizations={overrides.organizations ?? [testOrganization]}
        ceilings={overrides.ceilings ?? []}
        lang="en"
        onCreateClaim={onCreateClaim}
      />
    </QueryClientProvider>
  );
  // Le formulaire reste grisé/inactif tant que "New Claim" n'a pas été cliqué.
  fireEvent.click(screen.getByText('New Claim'));
  return { onCreateClaim };
}

function getCardInput() {
  return screen.getByPlaceholderText('e.g. AMID-260903-00023...');
}
function getPrincipalInput() {
  return screen.getByPlaceholderText('Name or select from directory...');
}
function getPatientInput() {
  return screen.getByPlaceholderText('Full name of the patient...');
}
function getProviderSelect() {
  return screen.getByDisplayValue('Select healthcare provider...');
}
function getPhysicianInput() {
  return screen.getByPlaceholderText('e.g. Dr. Samuel Johnson');
}

describe('AgentClaimsView — comportement actuel (caractérisation avant migration)', () => {
  it('la saisie du numéro de carte auto-remplit nom, organisation et patient (si patient vide)', () => {
    renderView();
    fireEvent.change(getCardInput(), { target: { value: 'CARD-001' } });

    expect(getPrincipalInput()).toHaveValue('John Doe');
    expect(screen.getByPlaceholderText('e.g. Firestone, TotalEnergies...')).toHaveValue('Acme Corp');
    expect(getPatientInput()).toHaveValue('John Doe');
  });

  it('la saisie du nom principal auto-remplit carte et organisation, et le patient si vide', () => {
    renderView();
    fireEvent.change(getPrincipalInput(), { target: { value: 'John Doe' } });

    expect(getCardInput()).toHaveValue('CARD-001');
    expect(screen.getByPlaceholderText('e.g. Firestone, TotalEnergies...')).toHaveValue('Acme Corp');
    expect(getPatientInput()).toHaveValue('John Doe');
  });

  it('un patient déjà divergé manuellement ne se fait plus écraser par la synchronisation carte', () => {
    renderView();
    fireEvent.change(getCardInput(), { target: { value: 'CARD-001' } });
    expect(getPatientInput()).toHaveValue('John Doe');

    fireEvent.change(getPatientInput(), { target: { value: 'Custom Patient' } });
    // Re-déclenche la synchronisation carte (même valeur) : le patient ne doit plus être écrasé.
    fireEvent.change(getCardInput(), { target: { value: 'CARD-001' } });

    expect(getPatientInput()).toHaveValue('Custom Patient');
  });

  it("la saisie dans un champ d'acte médical (description ou montant) ne fait jamais perdre le focus (pas de démontage de ligne)", () => {
    // === AMÉLIORATION AJOUTÉE : verrouille le correctif du finding Qodo sur PR #78 —
    // useFieldArray.update() démonte et remonte la ligne à chaque frappe, ce qui ferait perdre
    // le focus après chaque caractère saisi. form.setValue (pas update()) ne démonte rien.
    renderView();
    const descriptionInput = screen.getByPlaceholderText('Description of act / test...');
    descriptionInput.focus();
    'Routine check'.split('').forEach((char, i) => {
      fireEvent.change(descriptionInput, { target: { value: 'Routine check'.slice(0, i + 1) } });
      expect(document.activeElement).toBe(descriptionInput);
    });
    expect(descriptionInput).toHaveValue('Routine check');

    const amountInput = screen.getByPlaceholderText('0.00');
    amountInput.focus();
    '120'.split('').forEach((char, i) => {
      fireEvent.change(amountInput, { target: { value: '120'.slice(0, i + 1) } });
      expect(document.activeElement).toBe(amountInput);
    });
  });

  it('ajoute une ligne d\'acte médical avec les valeurs par défaut, et empêche la suppression de la dernière ligne', () => {
    renderView();
    expect(screen.getAllByPlaceholderText('Description of act / test...')).toHaveLength(1);

    fireEvent.click(screen.getByText('Add Medical Act'));
    const descriptionInputs = screen.getAllByPlaceholderText('Description of act / test...');
    expect(descriptionInputs).toHaveLength(2);

    // Bouton "Remove Act" désactivé uniquement quand une seule ligne reste — ici 2 lignes, tous
    // les boutons doivent être actifs.
    const removeButtons = screen.getAllByTitle('Remove Act');
    expect(removeButtons[0]).not.toBeDisabled();
    fireEvent.click(removeButtons[0]);
    expect(screen.getAllByPlaceholderText('Description of act / test...')).toHaveLength(1);
    expect(screen.getByTitle('Remove Act')).toBeDisabled();
  });

  it('calcule le montant total et la répartition ACTIVA/assuré selon le taux de couverture de l\'organisation', () => {
    renderView();
    fireEvent.change(getCardInput(), { target: { value: 'CARD-001' } }); // matche l'organisation à 80%
    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '100' } });

    // 80% ACTIVA / 20% assuré (coverageRate de testOrganization = 80).
    expect(screen.getByText('$80.00')).toBeInTheDocument();
    expect(screen.getByText('$20.00')).toBeInTheDocument();
  });

  it('retombe sur 85% de couverture par défaut quand aucune organisation ne correspond', () => {
    renderView({ organizations: [] });
    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '100' } });

    expect(screen.getByText('$85.00')).toBeInTheDocument();
    expect(screen.getByText('$15.00')).toBeInTheDocument();
  });

  it('affiche l\'alerte de fréquence élevée dès qu\'une carte est saisie, quel que soit l\'historique réel (comportement existant : Math.max(..., 6))', () => {
    renderView({ claims: [] });
    expect(
      screen.queryByText(/High Frequency Alert/)
    ).not.toBeInTheDocument();

    fireEvent.change(getCardInput(), { target: { value: 'CARD-001' } });

    // Comportement actuel (voir commentaire en tête de fichier) : toujours "6", pas le vrai
    // décompte (0 ici, aucune réclamation dans l'historique).
    expect(
      screen.getByText('High Frequency Alert: The insured member has logged 6 medical visits.')
    ).toBeInTheDocument();
  });

  it('affiche l\'alerte de doublon quand une réclamation récente (<48h) existe pour ce membre', () => {
    const recentClaim: Claim = {
      id: 'c1',
      reference: 'CLM-2026-0001',
      memberCardNo: 'CARD-001',
      memberName: 'John Doe',
      organization: 'Acme Corp',
      provider: 'City Clinic',
      amount: 50,
      serviceDate: new Date().toISOString(),
      submissionDate: new Date().toISOString(),
      status: 'pending',
      careType: 'General Practitioner Consultation',
    };
    renderView({ claims: [recentClaim] });
    fireEvent.change(getCardInput(), { target: { value: 'CARD-001' } });

    expect(
      screen.getByText('Warning: A recent claim (CLM-2026-0001) already exists for this insured member at City Clinic.')
    ).toBeInTheDocument();
  });

  it('affiche l\'alerte de plafond quand le montant dépasse le solde ambulatoire disponible du membre', () => {
    renderView(); // testMember.outpatientBalanceUSD = 100
    fireEvent.change(getCardInput(), { target: { value: 'CARD-001' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '150' } });

    expect(
      screen.getByText('Notice: The total amount ($150.00) exceeds available outpatient balance ($100). Medical supervisor authorization will be required.')
    ).toBeInTheDocument();
  });

  it('bloque la soumission et affiche le motif d\'inéligibilité pour un membre suspendu', () => {
    const suspendedMember: Member = { ...testMember, status: 'Suspended' };
    const { onCreateClaim } = renderView({ members: [suspendedMember] });
    fireEvent.change(getCardInput(), { target: { value: 'CARD-001' } });

    expect(
      screen.getByText('Principal insured (John Doe) is SUSPENDED. All healthcare benefits are blocked.')
    ).toBeInTheDocument();
    expect(screen.getByText('Submit Claim for Supervisor Validation').closest('button')).toBeDisabled();

    fireEvent.change(getProviderSelect(), { target: { value: 'City Clinic' } });
    fireEvent.change(getPhysicianInput(), { target: { value: 'Dr. Smith' } });
    fireEvent.change(screen.getByPlaceholderText('Description of act / test...'), { target: { value: 'Consult' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    expect(onCreateClaim).not.toHaveBeenCalled();
  });

  it('soumission valide : construit le payload attendu, réinitialise le formulaire mais PAS currency ni patientRelationship', async () => {
    const { onCreateClaim } = renderView();
    fireEvent.change(getCardInput(), { target: { value: 'CARD-001' } });
    fireEvent.change(getProviderSelect(), { target: { value: 'City Clinic' } });
    fireEvent.change(getPhysicianInput(), { target: { value: 'Dr. Smith' } });
    fireEvent.change(screen.getByPlaceholderText('Description of act / test...'), { target: { value: 'Routine check' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '40' } });
    // Devise changée en LRD avant soumission : ne doit PAS être réinitialisée après.
    fireEvent.click(screen.getByText('LRD (L$)'));

    fireEvent.click(screen.getByText('Submit Claim for Supervisor Validation'));

    await waitFor(() => expect(onCreateClaim).toHaveBeenCalledTimes(1));
    expect(onCreateClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        memberCardNo: 'CARD-001',
        memberName: 'John Doe',
        organization: 'Acme Corp',
        provider: 'City Clinic',
        doctorName: 'Dr. Smith',
        currency: 'LRD',
        status: 'pending',
        medicalActs: [
          expect.objectContaining({ amount: 40, category: 'General Practitioner Consultation', description: 'Routine check' }),
        ],
      })
    );

    // Réinitialisation : carte/nom/patient/médecin vidés, actes remis à l'unique ligne par défaut.
    expect(getCardInput()).toHaveValue('');
    expect(getPrincipalInput()).toHaveValue('');
    expect(getPatientInput()).toHaveValue('');
    expect(getPhysicianInput()).toHaveValue('');
    expect(screen.getAllByPlaceholderText('Description of act / test...')).toHaveLength(1);
    expect(screen.getByPlaceholderText('Description of act / test...')).toHaveValue('Consultation');

    // Comportement existant (particularité à préserver) : la devise reste LRD, pas remise à USD.
    expect(screen.getByText('LRD (L$)').closest('button')).toHaveClass('bg-[var(--brand-900)]');
  });

  it('bouton de soumission désactivé sans prestataire sélectionné ou avec un montant total nul', () => {
    renderView();
    fireEvent.change(getCardInput(), { target: { value: 'CARD-001' } });
    const submitBtn = screen.getByText('Submit Claim for Supervisor Validation').closest('button');
    // Aucun prestataire choisi, montant par défaut (35) > 0 mais provider vide -> désactivé.
    expect(submitBtn).toBeDisabled();

    fireEvent.change(getProviderSelect(), { target: { value: 'City Clinic' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '0' } });
    expect(submitBtn).toBeDisabled();
  });

  it('une soumission forcée (bypass du bouton désactivé) sans prestataire ne fait rien silencieusement', () => {
    const { onCreateClaim } = renderView();
    fireEvent.change(getCardInput(), { target: { value: 'CARD-001' } });
    fireEvent.change(screen.getByPlaceholderText('Description of act / test...'), { target: { value: 'x' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    // Pas de prestataire sélectionné : soumission directe du <form>, contournant le bouton
    // désactivé (reproduit une soumission implicite via Enter dans un champ texte).
    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    expect(onCreateClaim).not.toHaveBeenCalled();
    expect(screen.queryByText('Coverage Ineligibility / Direct-Billing Blocked')).not.toBeInTheDocument();
  });
});
