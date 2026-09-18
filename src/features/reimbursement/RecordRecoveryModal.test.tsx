// @vitest-environment jsdom
// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Verrouille les
// deux comportements les plus délicats de la migration AVANT toute régression future : (1) un
// montant hors bornes (ici 0, atteignable en vidant le champ numérique) affiche le message
// d'erreur avec la borne réelle de CETTE facture et n'appelle jamais updateInvoice/onClose,
// (2) une soumission valide transmet le montant saisi et les champs texte à
// FirestoreService.updateInvoice. FirestoreService.updateInvoice (écriture Firestore réelle) est
// mocké pour ne jamais toucher de backend réel dans ce test.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecordRecoveryModal } from './RecordRecoveryModal';
import { FirestoreService } from '../../services/firestore';
import { InvoiceItem } from '../../types';

vi.mock('../../services/firestore', () => ({
  FirestoreService: {
    updateInvoice: vi.fn().mockResolvedValue(undefined),
  },
}));

const testInvoice: InvoiceItem = {
  id: 'inv-1',
  reference: 'INV-2026-0001',
  patientName: 'Jane Roe',
  familyHead: 'Jane Roe',
  cardNo: 'A1B2C3D4E5F',
  organization: 'TotalEnergies Liberia Ltd',
  provider: 'City Clinic',
  amount: 250,
  serviceDate: '2026-09-01',
  status: 'approved' as InvoiceItem['status'],
  careType: 'Outpatient Consultations',
  coveragePercentage: 80,
  refactionTotalUSD: 100,
  recoveredTotalUSD: 0,
};

describe('RecordRecoveryModal — react-hook-form + zod', () => {
  it("n'enregistre pas le recouvrement si le montant est hors bornes (0)", async () => {
    const onClose = vi.fn();
    render(
      <RecordRecoveryModal
        invoice={testInvoice}
        currentUserName="Admin User"
        currentUserRole="Admin"
        onClose={onClose}
      />
    );

    // Le <label> n'est pas lié à l'input via htmlFor/id (comme ailleurs dans ce composant) —
    // on cible le champ numérique via son rôle ARIA (seul input type="number" du formulaire).
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Confirm Recovery'));

    await waitFor(() =>
      expect(
        screen.getByText('Amount must be between 0 and the pending refacted amount ($100.00).')
      ).toBeInTheDocument()
    );
    expect(FirestoreService.updateInvoice).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('enregistre le recouvrement avec le montant et la référence saisis', async () => {
    const onClose = vi.fn();
    render(
      <RecordRecoveryModal
        invoice={testInvoice}
        currentUserName="Admin User"
        currentUserRole="Admin"
        onClose={onClose}
      />
    );

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '60' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. supporting medical file ref'), {
      target: { value: 'JUSTIF-001' },
    });
    fireEvent.click(screen.getByText('Confirm Recovery'));

    await waitFor(() => expect(FirestoreService.updateInvoice).toHaveBeenCalledTimes(1));
    expect(FirestoreService.updateInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        recoveredTotalUSD: 60,
        recoveries: expect.arrayContaining([
          expect.objectContaining({
            amountUSD: 60,
            reference: 'JUSTIF-001',
            recordedBy: 'Admin User',
            recordedByRole: 'Admin',
          }),
        ]),
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
