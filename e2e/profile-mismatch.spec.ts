// === AMÉLIORATION AJOUTÉE : tests end-to-end (retour utilisateur, 2026-09-07) ===
// Valide que la connexion est réellement refusée quand le profil sélectionné dans la liste
// déroulante de la page de connexion (LoginView.tsx, "Connect as") ne correspond pas au vrai
// rôle du compte utilisé — la vérification qui fait autorité vit dans le listener global
// onAuthStateChanged (App.tsx), pas dans LoginView lui-même (voir
// src/utils/pendingLoginProfile.ts pour le détail). Ce test échouerait si cette vérification
// n'existait que côté LoginView, puisque le tableau de bord serait quand même affiché sous le
// vrai rôle du compte.
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';
import { E2E_AGENT } from './e2e-constants';

test('Connexion refusée si le profil sélectionné ne correspond pas au vrai rôle du compte', async ({
  page,
}) => {
  // Identifiants Agent réels, mais profil "Supervisor" sélectionné dans la liste déroulante.
  await loginAs(page, E2E_AGENT, 'Supervisor');

  const blockedScreen = page.locator('#auth-blocked-screen');
  await expect(blockedScreen).toBeVisible({ timeout: 20_000 });
  await expect(blockedScreen).toContainText('Profile Mismatch');
  await expect(blockedScreen).toContainText('Agent');

  // Le tableau de bord Superviseur (ni aucun autre) ne doit jamais apparaître.
  await expect(page.locator('#nav-item-enrollments_validation')).toHaveCount(0);
  await expect(page.locator('text=Member Identification')).toHaveCount(0);

  // "Return to Login" ramène bien au formulaire de connexion.
  await page.click('#blocked-logout-button');
  await page.waitForSelector('#login-username', { timeout: 20_000 });

  // Avec le bon profil sélectionné, la connexion aboutit normalement.
  await loginAs(page, E2E_AGENT, 'Agent');
  await page.waitForSelector('text=Member Identification', { timeout: 20_000 });
});
