// @vitest-environment jsdom
// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Verrouille les
// comportements les plus délicats de cette migration (useFieldArray + validation croisée)
// AVANT toute régression future : (1) une somme de lignes ne correspondant pas au montant
// original de la facture affiche le message d'erreur exact (avec montants formatés) et
// n'appelle jamais updateInvoice/onClose, (2) une ligne réduite sans motif affiche le message
// nommant cette ligne, (3) une soumission valide transmet les réfactions calculées à
// FirestoreService.updateInvoice, (4) ajouter une ligne (Split into another line) permet de
// répartir le montant sur plusieurs lignes tant que leur somme reste égale au montant original.
// FirestoreService.updateInvoice (écriture Firestore réelle) est mocké pour ne jamais toucher de
// backend réel dans ce test.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ApplyRefactionModal } from './ApplyRefactionModal';
import { FirestoreService } from '../../services/firestore';
import { InvoiceItem } from '../../types';

vi.mock('../../services/firestore', () => ({
  FirestoreService: {
    updateInvoice: vi.fn().mockResolvedValue(undefined),
  },
}));

const baseInvoice: InvoiceItem = {
  id: 'inv-1',
  reference: 'INV-2026-0001',
  patientName: 'Jane Roe',
  familyHead: 'Jane Roe',
  cardNo: 'A1B2C3D4E5F',
  organization: 'TotalEnergies Liberia Ltd',
  provider: 'City Clinic',
  amount: 100,
  serviceDate: '2026-09-01',
  status: 'approved' as InvoiceItem['status'],
  careType: 'Pharmacy & Prescription Drugs',
  coveragePercentage: 80,
};

describe('ApplyRefactionModal — react-hook-form + zod', () => {
  it("n'enregistre pas la réfaction si aucune ligne n'a été réduite", async () => {
    const onClose = vi.fn();
    render(
      <ApplyRefactionModal
        invoice={baseInvoice}
        currentUserName="Admin User"
        currentUserRole="Admin"
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByText('Confirm Réfaction'));

    await waitFor(() =>
      expect(
        screen.getByText('No act was reduced — lower at least one retained amount to apply a réfaction.')
      ).toBeInTheDocument()
    );
    expect(FirestoreService.updateInvoice).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('exige un motif quand une ligne est réduite', async () => {
    const onClose = vi.fn();
    render(
      <ApplyRefactionModal
        invoice={baseInvoice}
        currentUserName="Admin User"
        currentUserRole="Admin"
        onClose={onClose}
      />
    );

    // Ordre des champs numériques d'une ligne : Original (compact), Original (grille),
    // Retained, Rejected — index 2 = Retained.
    fireEvent.change(screen.getAllByRole('spinbutton')[2], { target: { value: '60' } });
    fireEvent.click(screen.getByText('Confirm Réfaction'));

    await waitFor(() =>
      expect(
        screen.getByText('A reason is required for "Pharmacy & Prescription Drugs" — its retained amount is below the original.')
      ).toBeInTheDocument()
    );
    expect(FirestoreService.updateInvoice).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('enregistre la réfaction avec le montant retenu et le motif saisis', async () => {
    const onClose = vi.fn();
    render(
      <ApplyRefactionModal
        invoice={baseInvoice}
        currentUserName="Admin User"
        currentUserRole="Admin"
        onClose={onClose}
      />
    );

    fireEvent.change(screen.getAllByRole('spinbutton')[2], { target: { value: '60' } });
    fireEvent.change(screen.getByPlaceholderText('Reason for rejection (required)'), {
      target: { value: 'Duplicate charge' },
    });
    fireEvent.click(screen.getByText('Confirm Réfaction'));

    await waitFor(() => expect(FirestoreService.updateInvoice).toHaveBeenCalledTimes(1));
    expect(FirestoreService.updateInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        refactionApplied: true,
        refactionTotalUSD: 40,
        payableAmountUSD: 60,
        refactionAppliedBy: 'Admin User',
        refactionAppliedByRole: 'Admin',
        refactions: expect.arrayContaining([
          expect.objectContaining({
            originalAmountUSD: 100,
            retainedAmountUSD: 60,
            rejectedAmountUSD: 40,
            reason: 'Duplicate charge',
          }),
        ]),
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("refuse une somme de lignes ne correspondant pas au montant original de la facture", async () => {
    const onClose = vi.fn();
    render(
      <ApplyRefactionModal
        invoice={baseInvoice}
        currentUserName="Admin User"
        currentUserRole="Admin"
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByText('Split into another line'));
    // Ligne 0, champ "Original" (compact, index 0) : on la réduit sans ajuster la nouvelle
    // ligne (montant 0 par défaut) pour rompre l'égalité avec le montant original de la facture.
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '80' } });
    fireEvent.click(screen.getByText('Confirm Réfaction'));

    await waitFor(() =>
      expect(
        screen.getByText('Line amounts must add up to the original invoice total ($100.00). Currently: $80.00.')
      ).toBeInTheDocument()
    );
    expect(FirestoreService.updateInvoice).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
