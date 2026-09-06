# Revue complète de l'application — ACTIVA HealthPass (2026-09-06)

## Méthodologie

Cette revue est distincte des audits sécurité précédents de cette session (`AUDIT_2026-09-05_REMEDIATION.md`,
`BACKEND_AUDIT_2026-09-06_REMEDIATION.md`, `HEALTH_DATA_GOVERNANCE_REVIEW_2026-09-05.md`, etc.) : elle porte sur
**l'état actuel réel du code** (post-corrections), pas sur ce que les audits précédents documentaient. Quatre
analyses indépendantes ont été menées en parallèle, chacune sans relire les docs d'audit existants, pour éviter
de recopier des constats obsolètes :

1. Cohérence entre `firestore.rules`/`storage.rules` et le code applicatif réel.
2. Logique métier des Cloud Functions (`functions/src/`) et du serveur Express (`server.ts`).
3. Qualité et performance du frontend React (`src/`).
4. Couverture de tests et outillage CI/CD.

Aucune modification n'a été apportée au code pendant ces analyses (lecture seule). Ce document consolide et
priorise l'ensemble des constats. Les numéros de finding sont propres à ce document (pas de continuité avec les
audits précédents).

---

## Résumé exécutif — à traiter en priorité absolue

| # | Constat | Sévérité | Domaine |
|---|---|---|---|
| 1 | Auto-élévation de privilège : n'importe quel compte authentifié peut s'auto-créer `profile: 'Supervisor'` | **CRITIQUE** | Règles/Sécurité |
| 2 | Aucun garde-fou serveur empêchant de rouvrir un claim/enrollment déjà `approved` | **CRITIQUE** | Backend |
| 3 | Race condition sur le rate-limiting anti-brute-force (lecture+écriture hors transaction) | **HAUTE** | Backend |
| 4 | `deploy-staging.yml` déploie automatiquement vers Firebase à chaque push sur `staging` — **contredit un constat documenté dans un audit précédent** | **HAUTE** (à corriger dans la doc) | CI/CD |
| 5 | Divergence client/serveur sur le calcul d'expiration des polices (le jour même de l'expiration) | **HAUTE** | Backend |
| 6 | ID de membres importés en masse quasi garantis en collision (~1,68M combinaisons pour 5000 lignes) | **HAUTE** | Backend |
| 7 | `strict` absent de `tsconfig.json` racine alors qu'il est actif côté `functions/` | **HAUTE** | Qualité/Tests |
| 8 | Aucun test sur SoD/approbation (`claimsService.ts`, `enrollmentsService.ts`), éligibilité, auth, cartes | **HAUTE** | Tests |

---

## A. Sécurité — cohérence règles Firestore/Storage vs code réel

### A1. CRITIQUE — Auto-élévation de privilège via `accounts.create`

`firestore.rules:139-142` :
```
allow create: if isSignedIn() && (isAdmin() || (request.auth.uid == userId && request.resource.data.profile != 'Admin'));
```
Seul `profile == 'Admin'` est bloqué à la création. Rien n'empêche un utilisateur de s'inscrire lui-même
(`createUserWithEmailAndPassword`) puis d'écrire directement `accounts/{uid}` avec
`{profile: 'Supervisor', isActive: true, permissions: [...]}` via un appel SDK direct, contournant entièrement
l'UI `AccountsView.tsx` (protégée côté client seulement par `canManageUsers`). Aucun blocking trigger Auth
(`beforeUserCreated`) ne restreint qui peut créer un compte Auth sur ce projet.

**Impact** : accès Supervisor complet (approbation de claims/enrollments, lecture des logs d'audit, export de
données de santé) sans jamais être invité par un Admin.

**Recommandation** : sur `create`, exiger `request.resource.data.profile == 'Agent' && request.resource.data.isActive == false`
pour l'auto-création, ou interdire la self-création et exiger `isAdmin()` pour toute création de compte.

### A2. CRITIQUE — Pas de garde-fou serveur contre la réouverture d'un claim/enrollment déjà décidé

`functions/src/claimsService.ts:46-65` (`processClaimDecisionServer`) et `functions/src/enrollmentsService.ts:41-55`
écrivent `status: payload.decision` par `tx.update()` **sans vérifier le statut courant du document**. La règle
Firestore équivalente (`statusChangeAllowed()`, `firestore.rules:56-58`) bloque bien cette régression — mais
`src/services/workflowService.ts` (`approveClaim`/`rejectClaim`) appelle **la Cloud Function en priorité**, la
règle Firestore n'étant qu'un filet de secours si la fonction est indisponible.

**Impact** : un second appel (double-clic, retry réseau, deux superviseurs concurrents) régénère une facture ou
un membre en double, ou écrase silencieusement une décision déjà prise.

**Recommandation** : ajouter `if (claim.status !== 'pending') throw new HttpsError('failed-precondition', ...)`
en tête de chaque transaction, avant toute écriture.

### A3. HAUTE — `notifications` lisible/écrivable par tout utilisateur signé, alors que le cloisonnement existe déjà dans les données

`firestore.rules:483-485` : `allow read, write: if isSignedIn();` — justifié dans le commentaire par l'absence
de champ destinataire. Or `src/types/index.ts:525-538` définit et peuple déjà `recipientId`/`recipientEmail`/
`recipientRole` partout (`workflowService.ts`, `claimsService.ts`, `enrollmentsService.ts`), avec des données
sensibles en clair dans `message` (nom de patient, montant, n° de carte). La justification de la règle est
obsolète.

**Recommandation** : `allow read: if resource.data.recipientId == request.auth.uid || resource.data.recipientRole == userProfile() || isAdmin();`

### A4. HAUTE — `healthPolicies.update` : liste blanche de champs incomplète pour la synchro automatique

`firestore.rules:258-264` limite l'update non-Admin/Supervisor à `hasOnly(['status','coverageBlocked','updatedAt','lastEvaluatedAt'])`,
mais `src/services/workflowService.ts:604-616` (`syncPolicyStatuses`, appelé pour **tout rôle** toutes les 5
minutes via `App.tsx:396-403`) écrit aussi `suspensionReason`, `suspensionDate`, `reactivationDate`. Si la Cloud
Function `syncPolicy` est indisponible, l'écriture de secours échoue en `permission-denied`, non catchée à ce
niveau — le statut de police n'est jamais persisté pour une session Agent.

**Recommandation** : ajouter ces trois champs à `hasOnly(...)`, ou restreindre l'appel de secours aux sessions
Admin/Supervisor.

### A5. MOYENNE — Staleness des custom claims : fenêtre d'accès non restreint sur Storage

`storage.rules` ne lit que `request.auth.token` (pas de repli Firestore live comme côté `firestore.rules`), et
aucun code client ne force de refresh de token (`getIdToken(true)`) après une action Admin (désactivation,
restriction d'organisation). Une désactivation de compte ne prend effet sur Storage qu'au prochain
rafraîchissement naturel du token (jusqu'à ~1h), malgré la documentation interne de `permissions.ts` qui
qualifie la désactivation de compte de « révocation immédiate ».

**Recommandation** : `onSnapshot` léger sur `accounts/{uid}.isActive` côté client déclenchant `getIdToken(true)`
+ déconnexion si `isActive === false`.

### A6. MOYENNE — Requête `claims` par `memberCardNo` non scopée par organisation

`src/views/settings/MembersView.tsx:342-345` interroge `claims` par `memberCardNo` sans `where('organization', 'in', ...)`.
Fonctionne aujourd'hui car `assignedOrganizations` est vide pour tous les comptes existants, mais échouera en
`permission-denied` dès qu'un Admin peuplera ce champ (fonctionnalité déjà câblée côté règles).

**Recommandation** : passer par `scopedQuery()` comme le reste du code.

### A7. BASSE

- `firestore.indexes.json` déclare 4 index composites (`claims`/`enrollments`/`auditLogs`) qu'aucune requête
  actuelle n'utilise (aucun `orderBy` dans le code) — à retirer ou justifier.
- Lectures temps réel sans pagination sur `auditLogs` et `notifications` (`src/services/firestore.ts`).
- `scopedQuery` tronque silencieusement à 30 organisations (limite de la clause `in`).
- `counters`/`cardNumberRegistry` lisibles par tout compte signé, y compris désactivé (`isSignedIn()` sans `isActiveUser()`).

---

## B. Logique métier backend (Cloud Functions / `server.ts`)

### HAUTE

- **Race condition rate-limiting** (`functions/src/index.ts:598-668`) : lecture puis écriture du compteur de
  tentatives hors transaction — des requêtes concurrentes peuvent dépasser la limite de 5 tentatives/60s.
  → `db.runTransaction(...)` ou `FieldValue.increment(1)`.
- **Enrôlements jamais traités côté serveur** : contrairement aux claims, `workflowService.ts` n'appelle jamais
  `processEnrollmentDecision` — 4 écritures non atomiques, aucun contrôle serveur du rôle approbateur.
- **Collision d'ID sur import de masse** (`importService.ts:155`) : ID membre sur ~1,68M combinaisons pour
  jusqu'à 5000 lignes → collisions quasi certaines, écrasement silencieux. → utiliser un ID Firestore auto-généré.
- **Chunks d'import hors transaction** (`importService.ts:198-211`) : échec partiel sans rapport ligne-par-ligne
  au client après que le compteur de cartes a déjà avancé.
- **Divergence client/serveur sur l'expiration des polices** : `policyEngine.ts` compare un horodatage brut,
  les implémentations serveur normalisent à minuit — décision de couverture différente le jour même de
  l'expiration selon le chemin emprunté (point de service vs back-office).

### MOYENNE

- Scan intégral de `accounts` à chaque tentative de connexion (`handleResolveLogin`, `ensureUserAccount`) au
  lieu d'une requête ciblée.
- Erreurs métier (violation SoD) et erreurs internes remontées sous le même code `failed-precondition` ;
  messages d'erreur bruts (`error?.message`) transmis au client au lieu d'être journalisés + génériques.
- Concaténation directe d'identifiants client dans des chemins Firestore sans rejeter `/` (risque sur `syncPolicy`, en écriture).
- AES-256-GCM sans AAD liant le chiffré au nom du champ (`encryptionService.ts`).
- Numéros de carte auto-générés à l'import jamais revérifiés contre le registre (incohérence avec `generateNextCardNumberServer`).
- 500 lectures transactionnelles séquentielles dans `batchGenerateCardNumbersServer` au lieu de `tx.getAll(...)`.
- Aucune validation de format sur `birthDate`/`gender`/`relationship`/`email`/`phone` à l'import de masse.
- Modèle de données incompatible entre `processEnrollmentDecisionServer` (mort) et le modèle réel client (dependents imbriqués).
- Code mort côté serveur : `registerCardNumber`, `batchGenerateCardNumbers`, `processEnrollmentDecision`,
  `evaluatePolicy`, `validateCoverage`, `logAuditEvent`, `getSignedFileUrl` + routes `server.ts` déjà signalées
  dans un audit précédent — à ne pas supprimer sans confirmation produit (cf. décision déjà prise de les garder).
- Logs d'audit construits à la main dans les transactions de décision au lieu de réutiliser `logAuditEventServer` — schéma incohérent.

### BASSE

- `parseCardNumber` n'invalide pas les dates calendaires impossibles (31 février).
- `pad()` transforme un nombre négatif en 0 au lieu de lever une erreur.
- Valeurs `birthDate` par défaut fabriquées silencieusement quand absentes à l'enrôlement.
- `skippedCount` codé en dur à 0, statut `'SKIPPED'` jamais produit.
- `invoiceNumber` basé sur `Date.now()` tronqué — doublons possibles en cas d'approbations rapprochées.
- `validation.ts` importe encore l'espace de noms `firebase-functions` v1 — fonctionne uniquement par
  réexport de classe, fragile à une future mise à jour.

---

## C. Frontend — qualité de code et performance

### HAUTE

1. `AccountsView.tsx:583-591` — toast de succès affiché **avant** résolution de l'écriture Firestore, erreur
   avalée (`.catch(() => {})`) sur une action de sécurité (activation/désactivation de compte).
2. `currentUser` typé `any` à 17 endroits, dont 7 fonctions du moteur d'approbation (`workflowService.ts`) —
   aucune vérification de type sur les champs qui pilotent tout le RBAC.
3. Casts `as any` répétés sur des données médicales/biométriques dans `AttachmentBiometricViewerModal.tsx`.
4. 144 `<label>` dans le code, un seul avec `htmlFor` — accessibilité WCAG non respectée sur les formulaires
   (dont le login).
5. God components : `MembersView.tsx` (1888 lignes, 39 `useState`), `AccountsView.tsx` (1879), `CeilingsView.tsx`
   (1670), `AgentMedicalFormView.tsx` (1666), `AgentClaimsView.tsx` (1506), `OrganizationsView.tsx` (1293).
6. Calcul de "% consommé" de couverture dupliqué 4 fois inline dans `AgentIdentificationView.tsx`, avec des
   fallbacks magiques dupliqués 6 fois, non mémoïsé.

### MOYENNE

- Calculs dérivés (`myClaims`, `myPendingClaims`, etc.) dans `DashboardView.tsx` sans `useMemo`, alors qu'un
  `setInterval` force un re-render toutes les 4,5s.
- 13 fonctions `subscribeToX` dans `firestore.ts` répètent le même squelette — factorisable.
- Logique d'audit d'export (`logExportEvent`) réimplémentée 4 fois avec des champs différents.
- Casts `as any` sur des tableaux de navigation pourtant déjà typés (`Sidebar.tsx`).
- `App.tsx` : effet de synchro des polices dépendant de la référence complète du tableau `members` — un seul
  membre modifié relance un scan complet.
- Code mort confirmé par `tsc --noUnusedLocals` dans `App.tsx` (handlers jamais appelés).
- Paramètre `lang` mort dans ~12 fonctions d'export Excel — localisation illusoire.
- `.catch(() => {})` silencieux sans log sur des échecs d'écriture de logs d'audit (export de données de santé).
- 0 usage de `useCallback`/`React.memo` dans tout `src/`.

### BASSE

- Imports/variables inutilisés nombreux (confirmés par `tsc`).
- Clés de liste par index sur des listes dynamiques filtrables.
- Payloads batch typés `any` sur des mises à jour de membres.
- Duplication mineure de la logique "ce record m'appartient-il" (claims vs enrollments).

*Note positive* : l'incohérence de nommage organisation/org signalée dans un audit antérieur est déjà résolue
dans le code (seuls des commentaires FR emploient "organisation", aucun identifiant de code).

---

## D. Tests et outillage CI/CD

### HAUTE

1. **Aucun test** sur les zones les plus critiques : `claimsService.ts`/`enrollmentsService.ts` (SoD,
   approbation), `eligibilityService.ts` (plafonds d'âge familiaux), `authUtils.ts`/`passwordUtils.ts`
   (normalisation de rôle, hash PBKDF2), `cardNumberService.ts`/`cardService.ts` (génération/validation de
   cartes — pourtant des fonctions pures facilement testables sans émulateur), `policyService.ts` (copie
   serveur du moteur de polices, avec un risque de divergence déjà documenté dans son propre commentaire de code).
2. **`deploy-staging.yml` déploie automatiquement vers Firebase à chaque push sur `staging`** (Firestore rules/indexes,
   Storage rules, Cloud Functions) — **ceci contredit l'affirmation d'audits précédents de cette session selon
   laquelle "aucun déploiement automatisé n'existe"**. `deploy-production.yml` a lui aussi un déclencheur
   automatique (`release: published`), atténué par une protection `environment: production` (reviewers GitHub,
   à vérifier dans les Settings du repo — invisible depuis le YAML).
3. `tsconfig.json` racine n'active pas `strict` (ni `strictNullChecks`), contrairement à `functions/tsconfig.json`
   qui a `strict: true` — le code frontend le plus sensible (login, cartes, formulaires médicaux) est typé avec
   moins de rigueur que le code serveur.

### MOYENNE

- `tests/permissions.test.ts` ne couvre que 3-4 fonctions sur une matrice de permissions de 40+ lignes ; la
  valeur spéciale `'scope'` (sémantique différente de `true`/`false`) n'est testée nulle part.
- `tests/storage.rules.test.ts` : 9 assertions pour 74 lignes, contre 57 assertions pour `firestore.rules.test.ts`
  — disproportion nette sur des règles qui protègent des photos/données biométriques.
- `npm run lint` = `tsc --noEmit` uniquement — **aucun ESLint/Prettier dans le projet**. Le nom du script laisse
  croire à des vérifications de style/qualité qui n'existent pas.

### BASSE / POSITIF

- `.github/workflows/ci.yml` tourne bien sur chaque PR et bloque en cas d'échec (lint, build, tests unitaires,
  tests de règles Firestore sur émulateur) — pipeline honnête.
- `functions/src/validation.test.ts` et `functions/src/encryptionService.test.ts` sont de bons exemples de
  couverture (cas d'erreur inclus) à répliquer sur les fichiers non testés.
- Lacune mineure sur `policyEngine.test.ts` (pas de test sur le fallback réseau ni les dates limites exactes).

---

## Correction à apporter aux audits précédents

Le finding D2 ci-dessus (déploiement automatique sur `staging`) contredit une affirmation faite dans les échanges
précédents de cette session ("aucune automatisation CI/CD n'a jamais exécuté `firebase deploy`"). Cette
affirmation portait sur l'absence de déploiement **vers l'environnement de production observé alors** — mais un
pipeline de déploiement automatique vers un environnement `staging` distinct existe bel et bien dans
`.github/workflows/`. Il convient de corriger toute communication future en ce sens et de vérifier que
l'environnement GitHub `staging` (et `production`) dispose bien de reviewers requis dans les paramètres du dépôt.

---

## Priorisation recommandée pour la suite

Cette revue est volumineuse (60+ constats). Conformément aux règles déjà appliquées cette session (jamais casser
l'existant, tests avant modification des règles, une correction = un commit), voici l'ordre suggéré si une
correction est demandée :

1. **A1 + A2** (auto-élévation de privilège, réouverture de décision) — failles exploitables dès aujourd'hui, à traiter en premier.
2. **B — race condition rate-limiting** et **B — collision d'ID d'import** — risques concrets, corrections localisées.
3. **A3/A4** (notifications, whitelist `healthPolicies`) — corrections de règles ciblées, avec tests avant/après sur l'émulateur.
4. **D1** — tests ciblés sur SoD/éligibilité/auth/cartes (aucune modification de comportement, pur ajout).
5. Le reste (C, D restant) — qualité/performance, à traiter par lots sans urgence business.

Aucune de ces corrections n'a été appliquée dans le cadre de cette revue : c'est un audit, pas un lot de correctifs.
