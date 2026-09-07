// === AMÉLIORATION AJOUTÉE : tests end-to-end (préparation Go-Live, 2026-09-07) ===
// Valide les 3 parcours critiques demandés contre une app réelle tournant sur les émulateurs
// Firestore/Auth (voir e2e/global-setup.ts, e2e/seed-data.ts) : création d'une carte (enrôlement
// d'un bénéficiaire), approbation d'un dossier par un superviseur, et génération d'une facture
// après validation d'un sinistre. Les 3 tests sont volontairement chaînés (mode serial) : ils
// représentent un seul parcours métier continu (Agent enrôle -> Superviseur valide -> Agent
// facture un soin -> Superviseur valide -> facture générée), exactement comme en production, et
// cela évite de payer 3 fois le délai de repli Cloud Function -> transaction Firestore
// (~10-15s, voir e2e/helpers.ts) pour reconstruire un contexte équivalent à chaque test.
import { test, expect } from '@playwright/test';
import {
  loginAsAgent,
  loginAsSupervisor,
  submitEnrollment,
  approveEnrollmentByName,
  submitClaim,
  approveClaimByReference,
} from './helpers';

test.describe.configure({ mode: 'serial' });

const BENEFICIARY = { lastName: 'E2ECriticalLast', firstName: 'E2ECriticalFirst' };
const FULL_NAME = `${BENEFICIARY.lastName} ${BENEFICIARY.firstName}`;

let generatedCardNumber: string | null = null;
let claimReference: string | null = null;

test.describe('Parcours critiques ACTIVA HealthPass', () => {
  test('1. Création de carte : un Agent enrôle un bénéficiaire et un numéro de carte est généré', async ({
    page,
  }) => {
    await loginAsAgent(page);
    await submitEnrollment(page, {
      lastName: BENEFICIARY.lastName,
      firstName: BENEFICIARY.firstName,
      birthDate: '1990-05-15',
      mobilePhone: '+231770000123',
    });

    await page.click('text=Submitted Requests');
    const row = page.locator('tr', { hasText: FULL_NAME });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('Pending Review');

    const cardCell = await row.locator('td').first().innerText();
    const match = cardCell.match(/AMID-\d{6}-\d{5}/);
    expect(match, `Expected a generated AMID- card number, got: ${cardCell}`).not.toBeNull();
    generatedCardNumber = match![0];
  });

  test("2. Approbation de dossier : un Superviseur valide l'enrôlement et active la carte", async ({
    page,
  }) => {
    expect(generatedCardNumber, 'Test 1 must run first and generate a card number').not.toBeNull();

    await loginAsSupervisor(page);
    await approveEnrollmentByName(page, FULL_NAME);

    const historyRow = page.locator('tr', { hasText: FULL_NAME });
    await expect(historyRow).toContainText('Validated');
    await expect(historyRow).toContainText('Health card issued & activated');
  });

  test('3. Génération de facture : un sinistre validé produit une facture de règlement', async ({
    page,
  }) => {
    expect(generatedCardNumber, 'Test 2 must run first and activate the card').not.toBeNull();

    await loginAsAgent(page);
    await submitClaim(page, {
      principalName: FULL_NAME,
      cardNumber: generatedCardNumber!,
      physicianName: 'Dr. E2E Critical Flow',
      providerLabel: 'E2E Test Clinic (Clinic - Monrovia)',
    });

    // Capture the claim reference just created (top row of the claims history table, matching
    // our beneficiary) before switching accounts.
    const claimRow = page.locator('tr', { hasText: FULL_NAME }).first();
    await expect(claimRow).toBeVisible({ timeout: 10_000 });
    const refCell = await claimRow.locator('td').first().innerText();
    const refMatch = refCell.match(/SIN-\d{4}-\d+/);
    expect(refMatch, `Expected a claim reference like SIN-2026-1234, got: ${refCell}`).not.toBeNull();
    claimReference = refMatch![0];

    await loginAsSupervisor(page);
    await approveClaimByReference(page, claimReference!);

    await page.click('text=Receipts / Vouchers');
    const invoiceRow = page.locator('tr', { hasText: claimReference! });
    await expect(invoiceRow).toBeVisible({ timeout: 10_000 });
    await expect(invoiceRow).toContainText(FULL_NAME.split(' ')[0]);
  });
});
