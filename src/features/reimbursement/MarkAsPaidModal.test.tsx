// @vitest-environment jsdom
// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Verrouille les
// deux comportements les plus délicats de la migration AVANT toute régression future : (1) le
// message d'erreur s'affiche et onClose n'est jamais appelé quand la référence de paiement est
// vide/blanche, (2) une soumission valide transmet le payee sélectionné via les pastilles et la
// référence saisie à FirestoreService.updateInvoice. FirestoreService.updateInvoice (écriture
// Firestore réelle) est mocké pour ne jamais toucher de backend réel dans ce test.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MarkAsPaidModal } from './MarkAsPaidModal';
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
};

describe('MarkAsPaidModal — react-hook-form + zod', () => {
  it("n'enregistre pas le paiement si la référence est vide ou blanche", async () => {
    const onClose = vi.fn();
    render(<MarkAsPaidModal invoice={testInvoice} onClose={onClose} />);

    // Un champ vraiment vide est bloqué par l'attribut HTML natif `required` avant même que
    // handleSubmit ne s'exécute (jsdom applique la validation native au clic sur submit) : on
    // saisit des espaces pour passer ce contrôle natif tout en échouant le `.refine()` zod,
    // exactement comme le faisait l'ancien `.trim()` impératif.
    fireEvent.change(screen.getByPlaceholderText('e.g. bank transfer ref, mobile money ref'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByText('Confirm Payment'));

    await waitFor(() => expect(screen.getByText('Payment reference is required.')).toBeInTheDocument());
    expect(FirestoreService.updateInvoice).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('enregistre le paiement avec le payee sélectionné et la référence saisie', async () => {
    const onClose = vi.fn();
    render(<MarkAsPaidModal invoice={testInvoice} onClose={onClose} />);

    fireEvent.click(screen.getByText(`Insured (${testInvoice.patientName})`));
    fireEvent.change(screen.getByPlaceholderText('e.g. bank transfer ref, mobile money ref'), {
      target: { value: 'MOMO-REF-123' },
    });
    fireEvent.click(screen.getByText('Confirm Payment'));

    await waitFor(() => expect(FirestoreService.updateInvoice).toHaveBeenCalledTimes(1));
    expect(FirestoreService.updateInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentStatus: 'paid',
        payee: 'member',
        paymentReference: 'MOMO-REF-123',
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
