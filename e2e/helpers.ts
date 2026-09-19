// === AMÉLIORATION AJOUTÉE : tests end-to-end (préparation Go-Live, 2026-09-07) ===
// Helpers partagés par les specs E2E, dérivés d'une exploration interactive de l'app réelle
// tournant contre les émulateurs (voir e2e/seed-data.ts pour les comptes/organisation de test).
// Les sélecteurs ci-dessous ne devinent rien : chaque champ a été vérifié dans le DOM réel.
import { Page, expect } from '@playwright/test';
import { E2E_AGENT, E2E_SUPERVISOR, E2E_ORG } from './e2e-constants';

// Le fallback client (Cloud Function indisponible -> écriture Firestore directe, voir
// src/services/workflowService.ts et cardNumberService.ts) prend ~10-15s dans cet environnement
// le temps que l'appel httpsCallable échoue avant le repli. On laisse large.
export const FALLBACK_TIMEOUT = 40_000;

/**
 * Signs out the current session, if any, via the profile menu (Topbar.tsx: #user-profile-button
 * -> "Sign Out"). Navigating to '/' while already authenticated shows the dashboard, not the
 * login form, so switching accounts mid-test (Agent -> Supervisor) requires an explicit logout
 * first — otherwise #login-username never appears and the next step times out.
 * === AMÉLIORATION AJOUTÉE : tient compte de la page d'accueil publique (HomeView, demande
 * explicite, 2026-09-18) affichée avant la page de connexion tant qu'aucun espace de travail
 * n'a été choisi. Elle remplace l'ancien écran de sélection par tuiles (WorkspaceSelectionView,
 * `#workspace-select-agent`) : le sélecteur d'espace (`#hero-workspace-select`, "Medical Agent"
 * par défaut) et son bouton "Go" (`#home-workspace-go-button`) sont désormais directement dans
 * le bloc héro de la page d'accueil (plus de menu déroulant sur le bouton "Log in" de la barre
 * de navigation, retiré sur demande explicite). Le choix de l'espace n'a aucune incidence sur le
 * rôle réellement résolu après connexion (déterminé côté serveur à partir du compte) : cliquer
 * "Go" avec la valeur par défaut suffit pour atteindre le formulaire de connexion.
 */
async function reachLoginForm(page: Page): Promise<void> {
  const loginField = page.locator('#login-username');
  const goButton = page.locator('#home-workspace-go-button');
  await Promise.race([
    loginField.waitFor({ state: 'visible', timeout: 20_000 }),
    goButton.waitFor({ state: 'visible', timeout: 20_000 }),
  ]);
  if (await goButton.isVisible().catch(() => false)) {
    await goButton.click();
  }
  await loginField.waitFor({ state: 'visible', timeout: 20_000 });
}

async function logoutIfNeeded(page: Page): Promise<void> {
  // Right after navigation, the app is still resolving auth state asynchronously: wait for
  // either the home page / login form (signed out) or the profile button (already signed in)
  // to settle.
  const loginField = page.locator('#login-username');
  const goButton = page.locator('#home-workspace-go-button');
  const profileButton = page.locator('#user-profile-button');
  await Promise.race([
    loginField.waitFor({ state: 'visible', timeout: 20_000 }),
    goButton.waitFor({ state: 'visible', timeout: 20_000 }),
    profileButton.waitFor({ state: 'visible', timeout: 20_000 }),
  ]);
  if (!(await profileButton.isVisible().catch(() => false))) {
    await reachLoginForm(page);
    return;
  }
  await profileButton.click();
  await page.click('button:has-text("Sign Out")');
  // Signing out clears the previously chosen workspace (see App.tsx handleLogout ->
  // sessionStorage.clear()), so the home page reappears first.
  await reachLoginForm(page);
}

export async function loginAs(
  page: Page,
  account: { username: string; password: string }
): Promise<void> {
  await page.goto('/');
  await logoutIfNeeded(page);
  await page.fill('#login-username', account.username);
  await page.fill('#login-password', account.password);
  await page.click('button:has-text("Sign In")');
}

export async function loginAsAgent(page: Page): Promise<void> {
  await loginAs(page, E2E_AGENT);
  await page.waitForSelector('text=Member Identification', { timeout: 20_000 });
}

export async function loginAsSupervisor(page: Page): Promise<void> {
  await loginAs(page, E2E_SUPERVISOR);
  await page.waitForSelector('#nav-item-enrollments_validation', { timeout: 20_000 });
}

export interface EnrollmentFormInput {
  lastName: string;
  firstName: string;
  birthDate: string; // YYYY-MM-DD
  mobilePhone: string;
  // === AMÉLIORATION AJOUTÉE : correctif E2E (2026-09-17) === Champ requis depuis le passage à
  // la saisie manuelle du numéro de carte (cardNumberService.ts, "Centralized Card Number
  // Management System", 2026-09-09) — l'ancienne génération automatique au format
  // AMID-YYMMDD-NNNNN n'existe plus. 11 caractères alphanumériques (A-Z, 0-9), voir
  // CARD_NUMBER_REGEX dans src/services/cardNumberService.ts.
  cardNo: string;
}

/**
 * Submits a new beneficiary enrollment as the currently logged-in Agent. Must be called after
 * loginAsAgent(). Returns once the "Submit Enrollment Application for Approval" button is
 * enabled again (i.e. the Cloud Function attempt + client fallback, if any, has completed).
 */
export async function submitEnrollment(page: Page, input: EnrollmentFormInput): Promise<void> {
  await page.click('text=Enrollments');
  // === AMÉLIORATION AJOUTÉE : correctif E2E (2026-09-17) === Le formulaire d'enrôlement reste
  // grisé/inactif (opacity-50, pointer-events-none — voir AgentEnrollmentsView.tsx) tant que
  // l'onglet "New Enrollment" (libellé simplifié le 2026-09-18, auparavant "New Beneficiary
  // Enrollment") n'a pas été explicitement cliqué (comportement applicatif introduit le
  // 2026-09-10, après l'écriture initiale de ce helper le 2026-09-07, jamais mis à jour depuis).
  // Sans ce clic, le clic final sur le bouton de soumission était bloqué indéfiniment (élément
  // parent interceptant le pointeur), faisant échouer ce test alors que l'application elle-même
  // fonctionne comme prévu.
  await page.click('text=New Enrollment');
  await page.waitForSelector('label:has-text("Last Name:")', { timeout: 10_000 });

  // Le libellé n'est pas un frère direct du champ (un badge "ACTIVA UNIQUE IDENTIFIER" s'intercale
  // dans le même conteneur) — même approche que pour "Affiliated Organization" plus bas.
  await page
    .locator('label:has-text("Health Card Number")')
    .locator('xpath=following::input[1]')
    .fill(input.cardNo);
  await page.locator('label:text-is("Last Name:") + input').fill(input.lastName);
  await page.locator('label:text-is("First Name:") + input').fill(input.firstName);
  await page.locator('label:text-is("Date of Birth:") + input').fill(input.birthDate);
  // The "Affiliated Organization" <select> is not a direct sibling of its <label> (there is an
  // intervening "Corporate Group Policy" hint <span> inside a shared wrapper div) — matching the
  // next <select> in document order is robust to that wrapper regardless of its exact markup.
  await page
    .locator('label:has-text("Affiliated Organization")')
    .locator('xpath=following::select[1]')
    .selectOption({ value: E2E_ORG });
  await page.locator('label:text-is("Mobile Phone:") + input').fill(input.mobilePhone);

  const submitBtn = page.locator(
    'button[type="submit"]:has-text("Submit Enrollment Application for Approval")'
  );
  await submitBtn.click();
  // The button's own label reverting confirms the async submission (Cloud Function attempt +
  // fallback) has settled, whichever path was taken.
  await expect(submitBtn).toBeVisible({ timeout: FALLBACK_TIMEOUT });
}

/** Approves a pending enrollment identified by its beneficiary full name. Call after loginAsSupervisor(). */
export async function approveEnrollmentByName(page: Page, fullNameSubstring: string): Promise<void> {
  await page.click('#nav-item-enrollments_validation');
  const row = page.locator('tr', { hasText: fullNameSubstring });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(row.getByRole('button', { name: 'Approve' })).toHaveCount(0, {
    timeout: FALLBACK_TIMEOUT,
  });
}

export interface ClaimFormInput {
  principalName: string;
  cardNumber: string;
  physicianName: string;
  providerLabel: string; // exact <option> label text, e.g. "E2E Test Clinic (Clinic - Monrovia)"
}

/** Submits a medical claim as the currently logged-in Agent. Call after loginAsAgent(). */
export async function submitClaim(page: Page, input: ClaimFormInput): Promise<void> {
  await page.click('text=Claims Processing');
  // === AMÉLIORATION AJOUTÉE : correctif E2E (2026-09-17) === Même mécanisme de formulaire
  // grisé/inactif que pour l'enrôlement (voir submitEnrollment ci-dessus) : le bouton "New
  // Claim" (AgentClaimsView.tsx, ajouté le 2026-09-10) doit être cliqué avant que le formulaire
  // ne devienne interactif.
  await page.click('text=New Claim');
  await page.waitForSelector('label:has-text("Principal Insured (Name)")', { timeout: 10_000 });

  await page.locator('label:has-text("Principal Insured (Name)") + input').fill(input.principalName);
  await page.locator('label:has-text("Patient Treated (Beneficiary)") + input').fill(input.principalName);
  await page.locator('label:has-text("HealthCare Card Number") + input').fill(input.cardNumber);
  await page.locator('label:has-text("Attending Physician") + input').fill(input.physicianName);
  await page
    .locator('label:has-text("Approved Healthcare Provider")')
    .locator('xpath=following::select[1]')
    .selectOption({ label: input.providerLabel });

  const submitBtn = page.locator(
    'button[type="submit"]:has-text("Submit Claim for Supervisor Validation")'
  );
  await submitBtn.click();
  await expect(submitBtn).toBeVisible({ timeout: FALLBACK_TIMEOUT });
}

/** Approves a pending claim identified by its reference. Call after loginAsSupervisor(). */
export async function approveClaimByReference(page: Page, reference: string): Promise<void> {
  await page.click('#nav-item-claims_validation');
  const row = page.locator('tr', { hasText: reference });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(row.getByRole('button', { name: 'Approve' })).toHaveCount(0, {
    timeout: FALLBACK_TIMEOUT,
  });
}
