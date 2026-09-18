// @vitest-environment jsdom
// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Tests de
// caractérisation écrits AVANT toute migration (aucun test n'existait sur ce fichier). Deux
// formulaires distincts dans ce composant : (1) "Generate Medical Form" — chiffrement
// applicatif STRICTEMENT fail-closed (une erreur de chiffrement doit bloquer l'émission, jamais
// persister de donnée de santé en clair) ; (2) la modale "Clear All History" — phrase de
// confirmation exacte + motif obligatoire avant toute suppression en masse. Ces tests
// verrouillent le comportement EXACT du code impératif actuel pour détecter toute régression
// pendant la migration vers react-hook-form + zod.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentMedicalFormView } from './AgentMedicalFormView';
import { Member, Provider, MedicalForm } from '../../types';
import { encryptMedicalFormPrescription } from '../../utils/sensitiveData';

vi.mock('../../utils/sensitiveData', () => ({
  encryptMedicalFormPrescription: vi.fn(async (form) => form),
  decryptMedicalFormPrescription: vi.fn(async (form) => form),
}));

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
  outpatientBalanceUSD: 400,
  inpatientBalanceUSD: 7000,
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

const existingMedicalForm: MedicalForm = {
  id: 'mf1',
  securityNumber: 'AMID-26-01-0001',
  barcode: 'AMID-26-01-0001',
  memberId: 'm1',
  memberName: 'John Doe',
  memberCardNo: 'CARD-001',
  organization: 'Acme Corp',
  providerId: 'p1',
  providerName: 'City Clinic',
  coverageType: 'Outpatient',
  practitionerType: 'Generalist',
  outpatientBalanceUSD: 400,
  inpatientBalanceUSD: 7000,
  issueDate: '2026-01-01',
  status: 'issued',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderView(overrides: { members?: Member[]; providers?: Provider[]; medicalForms?: MedicalForm[] } = {}) {
  const onCreateMedicalForm = vi.fn();
  const onClearAllMedicalForms = vi.fn().mockResolvedValue(undefined);
  render(
    <AgentMedicalFormView
      providers={overrides.providers ?? [testProvider]}
      members={overrides.members ?? [testMember]}
      organizations={[]}
      medicalForms={overrides.medicalForms ?? []}
      lang="en"
      onCreateMedicalForm={onCreateMedicalForm}
      onClearAllMedicalForms={onClearAllMedicalForms}
    />
  );
  fireEvent.click(screen.getByText('New Medical Form'));
  return { onCreateMedicalForm, onClearAllMedicalForms };
}

function selectMember() {
  fireEvent.change(screen.getByPlaceholderText('Type the name, card number or company to search...'), {
    target: { value: 'John' },
  });
  fireEvent.click(screen.getByText('John Doe'));
}

function selectProvider() {
  fireEvent.change(screen.getByPlaceholderText('Type the hospital, clinic or medical center name...'), {
    target: { value: 'City' },
  });
  fireEvent.click(screen.getByText('City Clinic'));
}

describe('AgentMedicalFormView — "Generate Medical Form" (caractérisation avant migration)', () => {
  beforeEach(() => {
    vi.mocked(encryptMedicalFormPrescription).mockImplementation(async (form: any) => form);
  });

  it("affiche une erreur et n'émet rien si le membre ou le prestataire n'est pas sélectionné", async () => {
    const { onCreateMedicalForm } = renderView();
    // Le bouton de soumission est désactivé tant que membre/prestataire ne sont pas choisis (un
    // clic dessus ne déclenche donc rien, y compris dans un vrai navigateur) : on soumet le
    // <form> directement, reproduisant une soumission implicite via Enter dans un champ texte.
    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    expect(
      await screen.findByText('Please select both the insured member and the healthcare provider using smart search.')
    ).toBeInTheDocument();
    expect(onCreateMedicalForm).not.toHaveBeenCalled();
  });

  it('Généraliste : préremplit "Dr. General Practitioner" quand le nom du médecin est vide', async () => {
    const { onCreateMedicalForm } = renderView();
    selectMember();
    selectProvider();
    fireEvent.click(screen.getByText('Generate Coverage Authorization Voucher'));

    await waitFor(() => expect(onCreateMedicalForm).toHaveBeenCalledTimes(1));
    expect(onCreateMedicalForm).toHaveBeenCalledWith(
      expect.objectContaining({ doctorName: 'Dr. General Practitioner', practitionerType: 'Generalist' })
    );
  });

  it('Spécialiste avec "Other Specialty" : replis JS sur "Medical Specialist" quand la spécialité personnalisée est vide', async () => {
    // === NOTE === Dans un vrai navigateur, l'attribut HTML `required` du champ personnalisé
    // (dès que "Other Specialty" est choisi) bloque déjà toute soumission (bouton ou Enter) tant
    // qu'il est vide — le repli JS `customSpecialty || 'Medical Specialist'` (effectiveSpecialty
    // dans le composant) n'est donc normalement jamais atteint en pratique. On force ici la
    // soumission via `fireEvent.submit` (qui ne reproduit PAS la validation native des champs
    // `required` de jsdom, contrairement à un clic ou une touche Entrée réels) pour verrouiller
    // que ce repli JS défensif se comporte comme codé s'il venait à être atteint.
    const { onCreateMedicalForm } = renderView();
    selectMember();
    selectProvider();
    fireEvent.click(screen.getByText('👨‍⚕️ Specialist'));
    fireEvent.change(screen.getByDisplayValue('Cardiology'), { target: { value: 'Other Specialty' } });

    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => expect(onCreateMedicalForm).toHaveBeenCalledTimes(1));
    expect(onCreateMedicalForm).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorSpecialty: 'Medical Specialist',
        doctorName: 'Dr. Specialist (Medical Specialist)',
      })
    );
  });

  it('Spécialiste : utilise la spécialité personnalisée saisie quand "Other Specialty" est choisie', async () => {
    const { onCreateMedicalForm } = renderView();
    selectMember();
    selectProvider();
    fireEvent.click(screen.getByText('👨‍⚕️ Specialist'));
    fireEvent.change(screen.getByDisplayValue('Cardiology'), { target: { value: 'Other Specialty' } });
    fireEvent.change(screen.getByPlaceholderText('Enter the exact specialty...'), {
      target: { value: 'Rare Disease Expert' },
    });

    fireEvent.click(screen.getByText('Generate Coverage Authorization Voucher'));
    await waitFor(() => expect(onCreateMedicalForm).toHaveBeenCalledTimes(1));
    expect(onCreateMedicalForm).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorSpecialty: 'Rare Disease Expert',
        doctorName: 'Dr. Specialist (Rare Disease Expert)',
      })
    );
  });

  it('construit le payload attendu avec les valeurs saisies (diagnostic, examens, traitement, modalité)', async () => {
    const { onCreateMedicalForm } = renderView();
    selectMember();
    selectProvider();
    fireEvent.click(screen.getByText('🛏️ Inpatient'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Dr. Arthur Miller, General Medicine'), {
      target: { value: 'Dr. Custom' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Health checkup, feverish syndrome, cardiology consultation...'), {
      target: { value: 'Flu-like symptoms' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. CBC, Lipid panel, Chest X-ray, Ultrasound...'), {
      target: { value: 'CBC' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. 1. Dosage, daily regimen and treatment duration...'), {
      target: { value: 'Rest for 3 days' },
    });

    fireEvent.click(screen.getByText('Generate Coverage Authorization Voucher'));
    await waitFor(() => expect(onCreateMedicalForm).toHaveBeenCalledTimes(1));
    expect(onCreateMedicalForm).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: 'm1',
        memberName: 'John Doe',
        memberCardNo: 'CARD-001',
        organization: 'Acme Corp',
        providerId: 'p1',
        providerName: 'City Clinic',
        coverageType: 'Inpatient',
        doctorName: 'Dr. Custom',
        outpatientBalanceUSD: 400,
        inpatientBalanceUSD: 7000,
        status: 'issued',
        doctorPrescription: expect.objectContaining({
          presumedDiagnosis: 'Flu-like symptoms',
          requestedExams: 'CBC',
          treatmentOrder: 'Rest for 3 days',
        }),
      })
    );
  });

  it("bloque l'émission (fail-closed) si le chiffrement échoue, et n'appelle jamais onCreateMedicalForm", async () => {
    vi.mocked(encryptMedicalFormPrescription).mockRejectedValueOnce(new Error('KMS unavailable'));
    const { onCreateMedicalForm } = renderView();
    selectMember();
    selectProvider();
    fireEvent.click(screen.getByText('Generate Coverage Authorization Voucher'));

    expect(await screen.findByText('KMS unavailable')).toBeInTheDocument();
    expect(onCreateMedicalForm).not.toHaveBeenCalled();
  });
});

describe('AgentMedicalFormView — modale "Clear All History" (caractérisation avant migration)', () => {
  function openClearAllModal() {
    // Passe par l'onglet Historique, où se trouve le bouton "Clear History".
    fireEvent.click(screen.getByText(/History \(/));
    fireEvent.click(screen.getByText('Clear History'));
  }

  it('bouton de confirmation désactivé tant que la phrase exacte et le motif ne sont pas tous deux renseignés', () => {
    renderView({ medicalForms: [existingMedicalForm] });
    openClearAllModal();
    const confirmBtn = screen.getByText('Clear All History').closest('button');
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('e.g. End-of-period cleanup approved by...'), {
      target: { value: 'Cleanup' },
    });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('DELETE ALL'), { target: { value: 'delete all' } });
    // Insensible à la casse (comparaison via .toUpperCase()).
    expect(confirmBtn).not.toBeDisabled();
  });

  it('appelle onClearAllMedicalForms avec le motif et referme la modale en réinitialisant les champs', async () => {
    const { onClearAllMedicalForms } = renderView({ medicalForms: [existingMedicalForm] });
    openClearAllModal();

    fireEvent.change(screen.getByPlaceholderText('e.g. End-of-period cleanup approved by...'), {
      target: { value: '  End of quarter cleanup  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('DELETE ALL'), { target: { value: 'DELETE ALL' } });
    fireEvent.click(screen.getByText('Clear All History'));

    await waitFor(() => expect(onClearAllMedicalForms).toHaveBeenCalledWith('End of quarter cleanup'));
    await waitFor(() => expect(screen.queryByText('Clear All History')).not.toBeInTheDocument());
  });
});
