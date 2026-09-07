# Stratégie de test — ACTIVA HealthPass

Statut : à jour au 2026-09-07 (226 tests automatisés, tous verts : 171 racine + 52
`functions/` + 3 E2E).

## 1. Pyramide de tests

```
        3   e2e/*.spec.ts        (Playwright, navigateur réel + émulateurs)
       52   functions/src/*.test.ts   (Vitest, Cloud Functions)
      171   tests/*.test.ts           (Vitest, front + règles Firestore/Storage)
```

Trois niveaux, du plus rapide/isolé au plus lent/réaliste :

1. **Unitaire (Vitest, racine et `functions/`)** — logique pure (hash de mot de passe,
   calcul d'âge, formatage de numéro de carte, évaluation de police) et services testés
   contre un faux Firestore en mémoire. Rapide (`npm run test:all` : ~1-2s ; les émulateurs
   ne sont nécessaires que pour `tests/firestore.rules.test.ts` et `tests/storage.rules.test.ts`).
2. **Règles de sécurité (Vitest + émulateur Firestore/Storage)** — vérifie que les
   `firestore.rules`/`storage.rules` autorisent/refusent exactement ce qui est attendu,
   indépendamment du code client (un bug côté UI ne doit jamais suffire à contourner une
   règle serveur).
3. **End-to-end (Playwright + émulateurs Firestore/Auth + serveur de dev réel)** — un
   navigateur headless pilote l'application telle qu'un utilisateur la verrait, du login
   au rendu final, pour les parcours métier les plus critiques.

## 2. Tests unitaires — `tests/` (racine, 171 tests)

| Fichier | Couvre |
|---|---|
| `authUtils.test.ts` | Normalisation de rôle, matrice de sections accessibles par profil — aucun repli implicite vers un rôle plus privilégié. |
| `passwordUtils.test.ts` | Hash/vérification de mot de passe (PBKDF2 + sel par utilisateur). |
| `eligibilityService.test.ts` | Calcul d'âge, éligibilité du principal et des ayants droit (plafonds d'âge conjoint/enfant). |
| `policyEngine.test.ts` | Évaluation de police (expirée / suspendue / impayée au-delà du délai de grâce / active). |
| `permissions.test.ts` | Matrice de permissions par rôle, y compris la séparation des tâches (`canApproveRecord` — un Agent ne peut jamais approuver son propre dossier). |
| `dataRetention.test.ts` | Calcul de la date de purge des formulaires médicaux et détection de dépassement. |
| `demoFallback.test.ts` / `storageFallback.test.ts` | Les deux drapeaux `VITE_ALLOW_*_FALLBACK` ne s'activent que sur la valeur exacte `"true"` — jamais par défaut. |
| `storageUtils.test.ts` | `uploadPhotoOrFallback` échoue explicitement (fail-closed) plutôt que de dégrader silencieusement vers du base64 en base de données. |
| `systemStatus.test.ts` | Bannières de repli visibles (sync issues, fallback events) : déduplication, expiration, abonnement. |
| `workflowServiceFallbackGuard.test.ts` | Le repli client (Cloud Function indisponible) relit le statut du dossier avant d'agir — jamais d'approbation en double sur un dossier déjà traité. |
| `firestore.rules.test.ts` | Règles Firestore : isolation par organisation, restriction de `accounts.create` à Admin, notifications scopées au destinataire, whitelist des champs modifiables sur `healthPolicies`, intégrité de la piste d'audit. **Nécessite l'émulateur Firestore** (`npm run test:rules`, ou `firebase emulators:exec --only firestore -- npm run test:rules`) — exécuté ainsi en CI (`deploy-staging.yml`/`deploy-production.yml`) avant tout déploiement de règles. |
| `storage.rules.test.ts` | Vérifie par analyse statique (lecture de `storage.rules` + assertions sur les motifs attendus) que les règles contiennent bien les garde-fous voulus (rejet non-authentifié, types/tailles autorisés, cloisonnement par organisation, blocage de suppression). **Ne s'exécute pas contre l'émulateur Storage** — ne prouve donc pas le comportement réel à l'exécution, seulement la présence du bon texte de règle. Un vrai test comportemental contre l'émulateur Storage est un gap connu, non comblé dans cette session (voir section 5). |

## 3. Tests unitaires — `functions/src/` (52 tests)

| Fichier | Couvre |
|---|---|
| `validation.test.ts` | Validation stricte des payloads des Cloud Functions callables. |
| `encryptionService.test.ts` | Chiffrement/déchiffrement des champs cliniques (`encv1:` prefix, fail-closed si absent). |
| `cardService.test.ts` | Formatage/parsing des numéros de carte HealthPass (`AMID-YYMMDD-NNNNN`), jamais d'exception sur un format invalide. |
| `claimsService.test.ts` / `enrollmentsService.test.ts` | Garde de statut (finding A2) : un dossier déjà décidé (`approved`/`rejected`) ne peut plus être re-décidé, y compris pour un document legacy sans champ `status`. |
| `importService.test.ts` | Import en masse : les ID de membres générés sont garantis uniques (`db.collection().doc().id`, plus de collision possible). |
| `policyService.test.ts` | Évaluation serveur de police (miroir du moteur côté client, source de vérité pour les Cloud Functions). |
| `rateLimiting.test.ts` | Rate limiting transactionnel sur les tentatives de connexion Admin (finding B — condition de course), vérifié sous 10 appels concurrents. |

## 4. Tests end-to-end — `e2e/` (3 tests, Playwright)

### Pourquoi Playwright et pas seulement les tests unitaires

Les tests unitaires ci-dessus prouvent que chaque brique (règle Firestore, service, hook)
se comporte correctement en isolation. Ils ne prouvent pas que l'utilisateur final peut
réellement, depuis le formulaire de connexion, mener à bien un dossier de bout en bout —
en particulier à travers le **repli client** (Cloud Function indisponible → écriture
Firestore directe, voir `src/services/workflowService.ts` et `cardNumberService.ts`), qui
n'est exercé de façon réaliste que si l'appel `httpsCallable` échoue *pour de vrai* contre
un environnement où aucune Cloud Function n'est déployée — exactement la situation testée
ici.

### Architecture

- **Aucune Cloud Function émulée.** Les tests s'appuient volontairement sur l'absence de
  l'émulateur Functions : chaque appel `httpsCallable` échoue (`net::ERR_CONNECTION_RESET`
  après ~10-15s), ce qui déclenche systématiquement le chemin de repli client — le chemin
  précisément le plus sensible et le moins souvent exercé manuellement.
- **Émulateurs Firestore + Auth réels** (`e2e/global-setup.ts`), démarrés, seedés
  (`e2e/seed-data.ts` → exécuté en sous-processus via `e2e/run-seed.ts`, voir note ESM
  ci-dessous), puis le serveur de dev de l'app est démarré avec
  `VITE_USE_FIREBASE_EMULATOR=true` (voir `src/lib/firebase.ts`) — jamais actif par défaut.
- **Deux comptes de test** (Agent + Superviseur) pour respecter la séparation des tâches
  (SoD) exactement comme en production : un Agent ne peut jamais approuver son propre
  dossier (`firestore.rules` `isSelfCreated()`).
- **Note technique** : `e2e/e2e-constants.ts` isole les constantes pures (identifiants de
  test, pas d'import `firebase-admin`) de `e2e/seed-data.ts`. `firebase-admin` embarque des
  dépendances hybrides CJS/ESM (`jose`/`jwks-rsa`) qui entrent en conflit avec le chargeur
  TypeScript de Playwright si `seed-data.ts` est importé — même partiellement — par un
  fichier que Playwright charge lui-même (`global-setup.ts`, ou tout `*.spec.ts` via
  `e2e/helpers.ts`) ; le seed s'exécute donc dans un sous-processus `tsx` séparé
  (`e2e/run-seed.ts`).

### Parcours couverts (`e2e/critical-flows.spec.ts`, mode `serial`)

Les 3 tests sont chaînés car ils forment un seul parcours métier continu (comme le ferait
un Agent puis un Superviseur en production) :

1. **Création de carte** — un Agent enrôle un bénéficiaire ; un numéro de carte
   (`AMID-YYMMDD-NNNNN`) est généré via le repli client et le dossier apparaît en attente
   de validation.
2. **Approbation de dossier** — un Superviseur valide l'enrôlement (repli client) ; le
   dossier passe à `Validated` et la carte est activée.
3. **Génération de facture** — l'Agent soumet un sinistre référençant la carte désormais
   active ; le Superviseur le valide (repli client) ; une facture de règlement apparaît
   dans `Receipts / Vouchers` avec la couverture calculée selon le taux de l'organisation
   (80 % dans l'environnement de test).

### Exécuter la suite E2E

```bash
npx playwright test
```

Aucune configuration manuelle nécessaire : `playwright.config.ts` orchestre tout
(émulateurs → seed → serveur de dev → tests → arrêt propre) via `globalSetup`/
`globalTeardown`. Timeout par test : 120s (ce parcours cumule 2 connexions et 2 replis
Cloud Function de ~13-15s chacun dans cet environnement — vérifié par reproduction
manuelle, ce n'est pas un défaut applicatif, juste un budget de test généreux).

**Non intégré à `ci.yml` pour l'instant** : cette suite nécessite Chromium (préinstallé
dans cet environnement d'exécution via `PLAYWRIGHT_BROWSERS_PATH`, mais pas garanti sur
tout runner CI) et prend ~3 minutes. L'intégrer au pipeline CI standard (avec
`npx playwright install --with-deps chromium` en amont) est une amélioration de suivi
naturelle, hors périmètre immédiat de cette session.

## 5. Ce qui n'est délibérément PAS couvert

- **Comportement réel des règles Storage** (voir section 4 ci-dessus) : `storage.rules.test.ts`
  vérifie le texte des règles, pas leur application par l'émulateur — un vrai test
  `@firebase/rules-unit-testing` côté Storage (comme celui déjà en place pour Firestore)
  reste à écrire.
- Les écrans purement visuels sans logique métier (marque, mise en page).
- Les intégrations tierces réelles (Cloud Functions déployées, Storage réel, APIs de
  taux de change) — testées séparément en `staging` avant `production` (voir
  `docs/ci-cd/DEPLOYMENT_GUIDE.md` et les workflows `deploy-staging.yml`/
  `deploy-production.yml`, qui exécutent `test:rules` contre l'émulateur avant tout
  déploiement de règles).
- Les tests de charge (hors périmètre de cette suite ; nécessiteraient un environnement
  cible réel, voir la note correspondante dans
  `docs/security/REVUE_COMPLETE_2026-09-06.md`).

## 6. Lancer l'ensemble

```bash
# Unitaire (racine) — émulateurs optionnels sauf pour firestore.rules.test.ts / storage.rules.test.ts
npm run test:all

# Unitaire (Cloud Functions)
cd functions && npm test

# Règles Firestore isolément, contre l'émulateur (test:rules = tests/firestore.rules.test.ts)
firebase emulators:exec --only firestore -- npm run test:rules

# End-to-end
npx playwright test
```
