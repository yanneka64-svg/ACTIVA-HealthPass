# Rapport final — Sécurisation et durcissement d'ACTIVA HealthPass

Ce rapport couvre le travail réalisé du Phase 0 au Phase 5 du brief de durcissement, sur la
base de `docs/security/CODE_AUDIT_MAP.md` (cartographie factuelle produite avant toute
modification). 13 commits, tous vérifiés (`tsc --noEmit`, `npm run build`, tests automatisés)
avant d'être poussés sur `main` et la branche de développement.

**Portée honnête** : ce rapport documente aussi, explicitement, ce qui n'a **pas** été traité
dans ce lot et pourquoi (section 3), et ce qui nécessite une action humaine hors du code
(section 6) — notamment le déploiement réel (aucun accès Firebase CLI/GCP dans cet
environnement).

---

## 1. Fichiers modifiés/créés, avec résumé de chaque changement

### Documentation / cartographie
- **`docs/security/CODE_AUDIT_MAP.md`** (créé) — cartographie complète Phase 0 : collections
  Firestore + règles, opérations CRUD par composant, Cloud Functions/API existantes, logique
  métier client, rôles/permissions réels, données PII/médicales/biométriques, Storage, exports,
  audit/logging, inventaire des scripts racine. Point d'arrêt documenté (section 11) sur
  l'absence de champ de rattachement organisationnel sur `accounts`, tranché par vous.
- **`docs/security/HARDENING_CODE_REPORT.md`** (ce document).

### Firestore Security Rules
- **`firestore.rules`** — réécriture substantielle et additive :
  - `assignedOrganizations()` / `hasOrgAccess()` : isolation par organisation (Phase 1.3),
    appliquée à `members`, `claims`, `medicalForms`, `enrollments`, `invoices`,
    `policyPayments` (read/create/update).
  - `isSelfCreated()` / `createdByUidValid()` : SoD via `createdByUid` server-vérifié
    (Phase 1.4), avec repli sur l'ancien `createdBy` pour les documents legacy.
  - `statusChangeAllowed()` : statut `approved` immuable une fois atteint sur `claims` et
    `enrollments` (Phase 1.5).
  - `isPreAuthLoginLogValid()` : `auditLogs.create` pré-authentification restreint à la forme
    exacte d'un journal de connexion (Phase 2.3).
  - Verrou anti-auto-élévation sur `accounts.update` (self) étendu à `assignedOrganizations`.
  - Justifications écrites ajoutées sur chaque règle `allow read: if isSignedIn()` restante
    (Phase 2.9).
  - (Correctifs hérités des sessions précédentes, déjà en place avant cette itération :
    `healthPolicies` asymétrique, `counters` monotone, SoD `isAdmin()` non prioritaire.)

### Cloud Functions (`functions/`, non déployées)
- **`functions/src/index.ts`** :
  - `syncAccountClaims` (nouveau, déclencheur `onDocumentWritten` — Phase 1.2) : synchronise
    `role`/`isActive`/`orgs` en Custom Claims à chaque écriture sur `accounts/{uid}`.
  - `getSignedFileUrl` (nouveau, callable — Phase 1.9) : URL Storage signée à durée limitée,
    avec vérification d'autorisation et journalisation.
  - `resolveUserRole` corrigé : lisait `accounts.role` (champ inexistant) au lieu de
    `accounts.profile`.
  - `evaluatePolicy` corrigé : lit désormais la police réelle en base au lieu de faire
    confiance à l'objet fourni par le client (Phase 2.2).
  - `validatePayload(...)` ajouté en tête des 10 fonctions callables (Phase 2.1).
- **`functions/src/claimsService.ts`, `functions/src/enrollmentsService.ts`** : SoD serveur
  priorise `createdByUid` sur `createdBy` (cohérent avec les règles).
- **`functions/src/validation.ts`** (nouveau) : validateur de schéma minimaliste, sans
  dépendance supplémentaire.
- **`functions/src/validation.test.ts`** (nouveau) : 11 tests unitaires.
- **`functions/package.json`, `functions/vitest.config.ts`** : ajout de `vitest` pour les
  tests unitaires côté functions.

### Serveur Express (`server.ts`)
- Middleware `requireAuth` (vérification du jeton Firebase Auth — absent auparavant sur
  **toutes** les routes).
- `/api/policies/evaluate`, `/api/claims/validate-coverage` : lisent désormais l'état réel en
  base (`healthPolicies`, `members`) au lieu de faire confiance au payload client.
- `/api/audit/log` : écrit réellement dans `auditLogs` (auparavant un simulacre qui ne
  persistait rien).

### Application cliente (`src/`)
- **`src/types/index.ts`** : `UserAccount.assignedOrganizations?`, `Claim.createdByUid?`,
  `Enrollment.createdByUid?`, `MedicalForm.createdByUid?` — champs additifs, optionnels.
- **`src/services/firestore.ts`** : `subscribeToMembers/Claims/Invoices/Enrollments/
  MedicalForms/PolicyPayments` acceptent un `orgScope` optionnel (contrepartie lecture de
  l'isolation par organisation — sans quoi activer `assignedOrganizations` sur un compte
  aurait bloqué son accès au lieu de le filtrer).
- **`src/App.tsx`** : câble `assignedOrganizations` (via une clé stable dérivée, pour ne pas
  réabonner les listeners à chaque rendu) ; `onCreateMedicalForm` fixe `createdByUid`.
- **`src/services/workflowService.ts`** : `submitClaim`/`submitEnrollment` fixent
  `createdByUid` à `currentUser?.uid` (jamais depuis l'appelant).
- **`src/services/seedData.ts`** : les écritures de démonstration incluent `createdByUid` du
  compte qui déclenche le seeding (nécessaire pour rester compatible avec la vérification à la
  création).
- **`src/services/policyEngine.ts`, `src/services/apiClient.ts`** : contrat mis à jour pour
  refléter le nouveau `/api/policies/evaluate` (aucun appelant réel — pas de régression).

### Configuration / outillage
- **`firebase.json`, `.firebaserc`** (créés lors d'une itération précédente, complétés ici avec
  la section `emulators`) : ciblent explicitement le projet et la base Firestore nommée
  réellement utilisée.
- **`tsconfig.json`** : `tests/` ajouté à `include` (n'était jamais vérifié par `tsc --noEmit`).
- **`package.json`** : scripts `test`, `test:rules`, `test:all`.
- **`vitest.config.ts`** (racine, nouveau).
- **`.github/workflows/ci.yml`** (nouveau — Phase 4).

### Tests
- **`tests/firestore.rules.test.ts`** (nouveau, 48 tests, émulateur Firestore).
- **`tests/policyEngine.test.ts`**, **`tests/permissions.test.ts`** (nouveaux, 21 tests, purs).

### Nettoyage
- **`scripts/archive/`** (nouveau) : les 24 scripts `fix*`/`patch*`/`update*` de la racine,
  déplacés sans modification de contenu, avec `README.md` documentant le contexte de chacun.

---

## 2. Failles corrigées, avec preuve (test qui échouait avant / réussit après)

| # | Faille | Preuve |
|---|---|---|
| 1 | **Isolation par organisation absente** — un Agent authentifié pouvait lire/écrire les dossiers de n'importe quelle organisation via le SDK. | 6 tests `tests/firestore.rules.test.ts` (section "Phase 1.3") ; vérifié manuellement par `git stash` des règles : ces 6 tests échouent sur l'ancien `firestore.rules`, réussissent après (12 autres tests inchangés dans les deux cas, confirmant l'absence de régression). |
| 2 | **SoD contournable** — `createdBy` était entièrement fourni par le client (`claimData.createdBy \|\| currentUser?.uid`, valeur du client prioritaire) ; un appel direct au SDK pouvait omettre ou usurper ce champ pour s'auto-approuver. | 4 tests "Phase 1.4" : usurpation refusée à la création, `createdByUid` priorisé sur un `createdBy` mensonger, document legacy retombant sur l'ancien test. |
| 3 | **Statut d'un claim/enrollment `approved` réversible** — rien n'empêchait de le ramener à `pending`/`rejected` après coup (facture déjà émise / membre déjà inscrit). | 4 tests "Phase 1.5" : Admin et Supervisor ne peuvent plus faire reculer un document approuvé ; une mise à jour d'un autre champ reste possible. |
| 4 | **Duplication de numéro de carte sous concurrence** — non prouvée jusqu'ici. | 3 tests "Phase 1.6" : 2, 10 puis 100 générations strictement concurrentes (émulateur) produisent systématiquement des numéros uniques, aucun doublon. |
| 5 | **`server.ts` sans authentification ni vérification serveur réelle** — `/api/policies/evaluate` et `/api/claims/validate-coverage` acceptaient un payload `{"coverageBlocked":false}` et répondaient en conséquence, sans jamais lire la base. | Smoke-test manuel (`node dist/server.cjs`) : ces routes répondent désormais `401` sans jeton au lieu d'accepter n'importe quel payload (voir section 5). Logique d'évaluation elle-même déjà couverte par `tests/policyEngine.test.ts` (miroir exact). |
| 6 | **`evaluatePolicy` (Cloud Function callable) même faille que #5**, non détectée lors du premier correctif de `server.ts`. | Corrigée par analogie ; non testable automatiquement sans émulateur Functions (voir section 6). |
| 7 | **`resolveUserRole()` lisait un champ `accounts.role` inexistant** — retombait systématiquement sur `'Agent'`, ce qui aurait bloqué `bulkImportMembers` pour tout Admin/Supervisor une fois déployé. | Corrigé (lit `accounts.profile`) ; non testable sans émulateur Functions (voir section 6). |
| 8 | **`auditLogs.create: if true` sans aucune restriction** — un utilisateur non authentifié pouvait forger une entrée d'action métier privilégiée (`{action:'CLAIM_APPROVED', userRole:'Admin'}`). | 4 tests "Phase 2.3" : forgerie refusée, forme "login" pré-auth acceptée, écriture authentifiée non affectée. |
| 9 | **Génération de carte : pas de preuve de non-duplication** (préoccupation de la Phase 1.6). | Voir #4. |
| 10 | **Cloud Functions callables sans validation de schéma** — champs inconnus, types incorrects, payloads volumineux acceptés sans contrôle. | 11 tests `functions/src/validation.test.ts` (le validateur lui-même) ; appliqué aux 10 fonctions existantes (revue manuelle champ par champ contre les types réels — voir commit `bd3c85f`). |

Faille additionnelle **corrigée mais héritée d'une itération précédente** (confirmée non
régressée par cette session) : `healthPolicies.update` asymétrique, `counters` monotone,
`medicalForms.delete` Admin-only, SoD `isAdmin()` non prioritaire sur `claims`/`enrollments` —
tous couverts par les tests des sections "comportement pré-existant, non modifié ici".

---

## 3. Failles identifiées mais non corrigées dans ce lot, avec raison

| Faille / limitation | Raison de non-correction dans ce lot |
|---|---|
| **`storage.rules` ouvert à tout utilisateur authentifié, sans expiration.** `getSignedFileUrl` (Cloud Function, Phase 1.9) est livrée mais **non câblée côté client** : remplacer `getDownloadURL()` partout où une photo/pièce jointe s'affiche toucherait de nombreux écrans (`<img src={photoUrl}>`) sans outillage de test visuel disponible dans cet environnement pour garantir l'absence de régression d'affichage. | Risque jugé disproportionné pour ce lot ; capacité serveur livrée et documentée, câblage UI en suite recommandée. |
| **Cloisonnement par organisation au niveau des chemins Storage** — non appliqué dans `getSignedFileUrl` : les chemins actuels (`uploadPhotoOrFallback`) n'encodent pas l'organisation. | Appliquer un contrôle sans cette convention de nommage ne protégerait rien de réel ; documenté plutôt qu'à moitié implémenté. |
| **SoD sur `medicalForms`** — pas de champ `createdBy`/`createdByUid` exploité pour un test d'auto-validation. | `medicalForms` n'a structurellement aucune notion de transition d'approbation (`status`: issued/used/pending_return/completed ne représente pas un cycle de validation par un tiers) — un test SoD dessus n'aurait pas de sens fonctionnel, ce n'est pas un oubli (documenté aussi dans les tests eux-mêmes). |
| **Rate limiting côté serveur (Phase 2.6)** au-delà du verrou client déjà en place (`LoginView.tsx`, `MAX_LOGIN_ATTEMPTS`) et du throttling natif Firebase Auth (`auth/too-many-requests`). | Implémenter un compteur Firestore par utilisateur/IP a un coût de complexité réel ; comme la quasi-totalité des Cloud Functions ne sont pas encore appelées en production (aucune déployée), un rate limiting Cloud-Function-side n'aurait aucun effet observable aujourd'hui. Recommandé comme **ACTION HORS-CODE** (App Check, Cloud Armor, ou quota Firebase) une fois les fonctions déployées — voir section 6. |
| **Idempotence des soumissions (Phase 2.7)** — pas de clé d'idempotence explicite sur la soumission de claims/paiements/génération de cartes. | La génération de carte est déjà protégée par construction (registre immuable + transaction, prouvé section 2 #4). Les soumissions de claims/enrollments n'ont pas de garde anti-double-clic explicite identifiée dans l'UI ; ajouter une clé d'idempotence correcte demande de choisir un mécanisme de déduplication (ex. ID généré client-side stable) sans casser le flux existant — non traité par manque de temps dans ce lot, recommandé en suite. |
| **Export de données (Phase 2.4)** — pas de journalisation `EXPORT_GENERATED`, pas de gate `canExportData()` appliqué systématiquement dans `ReportsView.tsx`/`ExportDropdown.tsx`. | `ReportsView.tsx` ne reçoit pas l'identité de l'utilisateur courant (`currentUser`) parmi ses props actuelles — ajouter une journalisation correcte nécessite d'abord de threader cette prop à travers plusieurs écrans, un changement plus large que le temps restant ne permettait pas de faire prudemment. Le risque résiduel réel est cependant limité : un export ne peut déjà exposer que les données que l'utilisateur peut lire via Firestore (donc déjà cloisonnées par organisation depuis la Phase 1.3). |
| **Centralisation des fonctions de validation/autorisation dupliquées entre écrans admin (Phase 5).** | Refactor large et transversal ; reporté pour éviter un risque de régression en fin de session sans couverture de tests UI suffisante pour le garantir. |
| **Réduction ciblée des usages de `any` (Phase 5).** | Idiome déjà largement répandu dans le code existant (`currentUser: any`, Cloud Functions `data: any`) ; un nettoyage sûr demande une revue approfondie type par type, non menée dans ce lot. |
| **Non-régression fonctionnelle de bout en bout** (connexion, génération de carte, import Excel, cycles complets claim/enrollment/police, formulaires médicaux, rapports) — demandée en Phase 3. | Nécessite un environnement Firebase réel (Auth + Firestore + Storage) et un outillage e2e (Playwright) ; non exécutée automatiquement dans cet environnement (pas d'accès à un projet Firebase réel). Le filet de sécurité pour cette session a été `tsc --noEmit` + `npm run build` systématiques avant chaque commit (jamais un seul échec toléré) plus les tests unitaires/règles ci-dessus. |

---

## 4. Nouvelles règles Firestore et Cloud Functions livrées

### Règles Firestore (fonctions ajoutées à `firestore.rules`)
`assignedOrganizations()`, `hasOrgAccess(orgName)`, `isSelfCreated(data)`,
`createdByUidValid()`, `statusChangeAllowed(oldStatus, newStatus)`, `isPreAuthLoginLogValid(data)`.

### Cloud Functions (`functions/src/index.ts`, **non déployées** — voir section 6)
| Fonction | Type | Statut de câblage client |
|---|---|---|
| `syncAccountClaims` | Déclencheur Firestore (`onDocumentWritten`) | N/A (automatique une fois déployée) |
| `getSignedFileUrl` | Callable | Non câblée (voir section 3) |
| `generateCardNumber`, `processClaimDecision`, `syncPolicy` | Callable | Câblées avec repli automatique (héritées, non modifiées cette session) |
| `registerCardNumber`, `batchGenerateCardNumbers`, `processEnrollmentDecision`, `bulkImportMembers`, `evaluatePolicy`, `validateCoverage`, `logAuditEvent` | Callable | Non câblées (raisons documentées dans `docs/security/PHASE5_CLOUD_FUNCTIONS_WIRING.md`, itération précédente) |

Toutes les fonctions callables valident désormais leur payload en tête (`validatePayload`,
Phase 2.1).

---

## 5. Résultats d'exécution des commandes de la Phase 3

Exécutées juste avant la rédaction de ce rapport (voir aussi chaque commit pour un
avant/après spécifique) :

```
$ npm run build
✓ built in 7.67s
dist/server.cjs      11.6kb

$ npx tsc --noEmit
(aucune sortie — propre)

$ npx vitest run --exclude '**/firestore.rules.test.ts'
Test Files  2 passed (2)
     Tests  21 passed (21)

$ firebase emulators:exec --only firestore "npm run test:rules"
Test Files  1 passed (1)
     Tests  48 passed (48)

$ cd functions && npx tsc --noEmit --project tsconfig.json
(aucune sortie — propre)

$ cd functions && npm run build
(propre)

$ cd functions && npx vitest run
Test Files  1 passed (1)
     Tests  11 passed (11)
```

**Total : 80 tests automatisés, tous au vert.** `firebase emulators:exec --only firestore
"npm run test:rules"` correspond exactement à la commande de validation demandée par le brief.

Non exécuté : `firebase emulators:exec --only firestore,functions,auth` pour un test de bout en
bout des Cloud Functions (voir section 6 — nécessite des identifiants Firebase réels pour
`getAuth().verifyIdToken`/Custom Claims, non simulables avec l'émulateur Firestore seul).

---

## 6. Actions hors-code requises (décision ou action humaine)

1. **Déployer les règles et Cloud Functions** — `firebase deploy --only firestore:rules` puis
   `firebase deploy --only functions`, depuis un poste avec la Firebase CLI connectée au
   projet réel (`gen-lang-client-0957905786`, base
   `ai-studio-activahealthpass-a71d742a-47a5-4343-b20f-a025fe51929b` — voir `firebase.json`).
   Sans ce déploiement, **aucun des correctifs de ce lot n'a d'effet en production** : les
   règles actuellement appliquées sont celles déployées manuellement en dernier (état inconnu
   depuis cet environnement), pas celles de ce dépôt.
2. **Backfill des Custom Claims** (`syncAccountClaims`) — une fois déployée, cette fonction ne
   synchronise le claim qu'à la PROCHAINE écriture sur chaque compte. Exécuter un script de
   rattrapage ponctuel (itérer `accounts`, ré-écrire chaque document pour déclencher la
   fonction, ou appeler `admin.auth().setCustomUserClaims()` directement) pour les comptes déjà
   existants, si une prise d'effet immédiate est souhaitée.
3. **Assigner `assignedOrganizations`** aux comptes Agent/Supervisor concernés (aucune UI ne
   le permet encore — à faire via la console Firebase ou une future page Admin) pour que
   l'isolation par organisation ait un effet réel ; par défaut (champ absent), rien ne change.
4. **Rate limiting infrastructure** (Phase 2.6) — envisager Firebase App Check et/ou des quotas
   Cloud Functions une fois les fonctions déployées et réellement utilisées.
5. **Storage rules** — `firebase deploy --only storage` (fichier déjà présent, jamais confirmé
   déployé).
6. **Revue de gouvernance CI** — configurer la protection de branche GitHub (reviewers requis,
   check CI obligatoire) : hors périmètre du fichier `.github/workflows/ci.yml` lui-même
   (Phase 4 du brief le précise explicitement).
7. **Décision produit sur le périmètre de `assignedOrganizations`** — actée par vous en cours
   de session (champ additif rétrocompatible) ; à documenter dans un futur écran Admin
   d'assignation si le produit doit réellement exploiter ce cloisonnement.

---

## Critère de réussite du brief

> *Une opération sensible doit être impossible à contourner en modifiant le frontend, en
> appelant directement Firestore/l'API, en modifiant un champ dans le navigateur, ou en
> utilisant un compte à rôle inférieur — démontré par un test automatisé, pas par une
> affirmation.*

Ce critère est démontré, par test automatisé, pour : l'isolation par organisation, la
séparation des tâches (claims/enrollments), l'immuabilité du statut approuvé, la non-duplication
de numéros de carte sous concurrence, l'immuabilité du registre de cartes, le blocage
asymétrique des polices, et la restriction du journal d'audit pré-authentification — soit la
majorité des opérations listées comme critiques en Phase 1. Il **n'est pas encore démontré**
pour les opérations qui dépendent de Cloud Functions non déployées (RBAC par Custom Claims,
URLs signées) ni pour le rate limiting/l'idempotence (non implémentés dans ce lot, raisons
en section 3) — ces limites sont documentées ci-dessus plutôt que passées sous silence.
