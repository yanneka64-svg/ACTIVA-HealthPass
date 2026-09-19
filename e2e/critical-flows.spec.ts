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
// === AMÉLIORATION AJOUTÉE : correctif E2E (2026-09-17) === Depuis le passage à la saisie
// manuelle du numéro de carte (voir e2e/helpers.ts), ce numéro n'est plus généré par
// l'application : c'est ce test qui le choisit, au format attendu (11 caractères
// alphanumériques — CARD_NUMBER_REGEX dans src/services/cardNumberService.ts).
const ENROLLED_CARD_NO = 'E2ECR1T1CAL';

let generatedCardNumber: string | null = null;
let claimReference: string | null = null;

test.describe('Parcours critiques ACTIVA HealthCare', () => {
  test('1. Création de carte : un Agent enrôle un bénéficiaire et un numéro de carte est généré', async ({
    page,
  }) => {
    await loginAsAgent(page);
    await submitEnrollment(page, {
      lastName: BENEFICIARY.lastName,
      firstName: BENEFICIARY.firstName,
      birthDate: '1990-05-15',
      mobilePhone: '+231770000123',
      cardNo: ENROLLED_CARD_NO,
    });

    await page.click('text=Submitted Requests');
    const row = page.locator('tr', { hasText: FULL_NAME });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('Pending Review');
    await expect(row).toContainText(ENROLLED_CARD_NO);
    generatedCardNumber = ENROLLED_CARD_NO;
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
    // === AMÉLIORATION AJOUTÉE : correctif E2E (2026-09-17) === Le préfixe réel généré par
    // l'application (AgentClaimsView.tsx) est "CLM-", jamais "SIN-" — corrigé pour refléter le
    // comportement actuel, jamais observé ailleurs dans le code (voir aussi seedData.ts).
    const refMatch = refCell.match(/CLM-\d{4}-\d+/);
    expect(refMatch, `Expected a claim reference like CLM-2026-1234, got: ${refCell}`).not.toBeNull();
    claimReference = refMatch![0];

    await loginAsSupervisor(page);
    await approveClaimByReference(page, claimReference!);

    await page.click('text=Receipts / Vouchers');
    const invoiceRow = page.locator('tr', { hasText: claimReference! });
    await expect(invoiceRow).toBeVisible({ timeout: 10_000 });
    await expect(invoiceRow).toContainText(FULL_NAME.split(' ')[0]);
  });

  // === AMÉLIORATION AJOUTÉE : Phase 3 (2026-09-18) — première introduction de react-router-dom
  // (voir main.tsx/App.tsx) : l'app n'avait jusqu'ici AUCUN routage par URL (juste un état React
  // en mémoire). Ce test verrouille la promesse centrale du changement — l'URL reflète
  // désormais réellement la section affichée, et le bouton "précédent" du navigateur fonctionne
  // — avant qu'une régression future ne le casse silencieusement. Indépendant des 3 tests
  // ci-dessus (page/connexion propres), ne dépend d'aucune donnée créée par eux.
  test('4. Navigation par URL : l\'adresse change avec la section et le bouton "précédent" du navigateur fonctionne', async ({
    page,
  }) => {
    // === AMÉLIORATION AJOUTÉE : correctif (retour de revue qodo sur la PR #66, 2026-09-18) ===
    // La barre latérale (Sidebar.tsx) affiche TOUJOURS le bouton "dashboard", actif ou non — la
    // version précédente de ce test se contentait donc de vérifier que ce bouton existe (une
    // tautologie, jamais capable d'échouer). Ce sélecteur cible plutôt l'indicateur visuel
    // affiché UNIQUEMENT quand la section est réellement active (`isActive &&` dans
    // Sidebar.tsx — classe statique `absolute left-0 top-2 bottom-2 w-1`, indépendante du thème
    // de couleur par rôle), pour prouver que le CONTENU affiché a bien changé, pas seulement
    // l'URL.
    const activeIndicator = (section: string) =>
      page.locator(`#nav-item-${section} > div.absolute.left-0.top-2.bottom-2.w-1`);

    await loginAsSupervisor(page);
    // Section par défaut du Superviseur (voir getDefaultSectionForRole) — atteinte directement
    // après connexion, sans aucun clic.
    await expect(page).toHaveURL(/\/claims_validation$/);

    await page.click('#nav-item-dashboard');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(activeIndicator('dashboard')).toBeVisible();

    await page.click('#nav-item-reports');
    await expect(page).toHaveURL(/\/reports$/);
    await expect(activeIndicator('reports')).toBeVisible();
    await expect(activeIndicator('dashboard')).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard$/);
    // Le contenu affiché doit lui aussi être revenu en arrière, pas seulement l'URL.
    await expect(activeIndicator('dashboard')).toBeVisible();
    await expect(activeIndicator('reports')).toHaveCount(0);

    // Un rechargement en pleine page ne doit pas faire perdre la section courante (persistance
    // par l'URL elle-même, plus par sessionStorage) ni renvoyer une 404 (voir public/_redirects).
    // === AMÉLIORATION AJOUTÉE : correctif (retour de revue qodo sur la PR #66, 2026-09-18) ===
    // On attend d'abord que le contenu authentifié se stabilise (l'indicateur actif du
    // dashboard réapparaît) AVANT de vérifier l'URL finale — sans quoi une éventuelle
    // redirection tardive (déclenchée par la résolution asynchrone du compte après le
    // rechargement) pourrait passer inaperçue si l'assertion d'URL réussissait sur un état
    // transitoire précédent.
    await page.reload();
    await expect(activeIndicator('dashboard')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/dashboard$/);

    // Une URL pointant vers une section non autorisée pour le rôle actif (ici "accounts",
    // réservée à l'Admin — voir ROLE_ALLOWED_SECTIONS dans authUtils.ts) doit être corrigée vers
    // la section par défaut du rôle, exactement comme le faisait déjà `effectiveSection` avant
    // ce changement — la seule nouveauté est que l'URL elle-même est désormais corrigée en plus
    // de l'affichage (voir le useEffect dédié dans App.tsx).
    await page.goto('/accounts');
    await expect(page).toHaveURL(/\/claims_validation$/);

    // === AMÉLIORATION AJOUTÉE : correctif (retour de revue qodo sur la PR #66, 2026-09-18) ===
    // Reproduction du bug identifié : un lien direct/partagé vers une section AUTORISÉE mais
    // différente de la dernière section mémorisée (sessionStorage, ici "claims_validation" —
    // voir l'assertion ci-dessus) devait rester sur cette section, pas être silencieusement
    // remplacé par la valeur mémorisée. `page.goto` déclenche un vrai rechargement complet, donc
    // exactement le même chemin de code (onAuthStateChanged -> onSnapshot du compte) que la
    // connexion initiale ou un rafraîchissement de page.
    await page.goto('/reports');
    await expect(activeIndicator('reports')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/reports$/);
  });
});
