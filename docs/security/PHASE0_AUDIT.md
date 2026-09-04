# ACTIVA HealthPass — Audit technique Phase 0 (avant toute modification)

Date : 2026-09-04
Portée : analyse du dépôt tel qu'il existe aujourd'hui, sans aucune modification de code.
Cette analyse répond au périmètre demandé (Phase 0 du brief « Sécurisation et durcissement de
l'architecture ACTIVA HealthPass sans régression ») : cartographie de l'architecture, des
fonctionnalités, des rôles et des opérations critiques, avant toute action des phases suivantes.

---

## A. Architecture actuelle (réelle, vérifiée dans le dépôt)

```
React 19 (Vite, TypeScript, Tailwind)
 ↓
Services TypeScript côté client (src/services/*, src/utils/*)
 ↓
Firebase Authentication (SDK client, src/lib/firebase.ts)
 ↓
Cloud Firestore (SDK client, aucun serveur applicatif)
 ↓
Firestore Security Rules (firestore.rules)
```

Constat factuel important pour la suite du brief : **il n'existe aucune infrastructure backend
dans ce dépôt.**
- Aucun dossier `functions/`.
- Aucun `firebase.json` (donc aucune configuration de déploiement Cloud Functions/Hosting
  gérée par ce dépôt).
- Aucune utilisation de Custom Claims (`grep customClaims|getIdTokenResult|setCustomUserClaims`
  → 0 résultat dans `src/`).
- Toute la logique métier (génération de cartes, moteur de police, permissions, audit) s'exécute
  **exclusivement côté client**, avec Firestore Security Rules comme unique ligne de défense
  côté serveur.

C'est le point de départ réel des Phases 2 et 3 du brief (RBAC via Custom Claims, backend Cloud
Functions) : ce sont des **briques à créer entièrement**, pas à faire évoluer. J'y reviens dans
« Constats et limites de cette session » en fin de document.

---

## B. Cartographie des fonctionnalités (fichier → service → collection → règles → rôle)

| Fonctionnalité | Frontend (vue) | Service | Collection(s) Firestore | Règle Firestore actuelle | Rôle(s) autorisé(s) dans l'UI |
|---|---|---|---|---|---|
| Authentification | `components/auth/LoginView.tsx` | Firebase Auth SDK + `FirestoreService.addLog` | `accounts` (lecture pré-auth), `auditLogs` | `accounts`: read `if true` ; `auditLogs`: create `if true` | Tous |
| Gestion des comptes (Admin) | `views/settings/AccountsView.tsx` | `services/firestore.ts` (`addAccount`/`updateAccount`) | `accounts` | create/update: `isAdmin() OR (self, sans changer profile/isActive/permissions)` ; delete: `isAdmin()` | Admin uniquement |
| Identification assuré | `views/agent/AgentIdentificationView.tsx` | `services/firestore.ts` | `members`, `healthPolicies` (lecture) | `members`: `isSignedIn()` (read/write) | Agent (Supervisor/Admin en lecture via d'autres vues) |
| Génération de carte | `services/cardNumberService.ts` (`generateNextCardNumber`, etc.) | idem | `counters/cardNumbers`, `cardNumberRegistry/{cardNumber}`, `members` | `counters`: `isSignedIn()` (read/write) ; `cardNumberRegistry`: create `isSignedIn()`, **update/delete `if false`** | Agent, Admin |
| Enrôlement | `views/agent/AgentEnrollmentsView.tsx` | `services/firestore.ts`, `cardNumberService` | `enrollments`, `members`, `cardNumberRegistry` | `enrollments`: `isSignedIn()` (read/write) | Agent (soumission), Supervisor (validation) |
| Claims (création) | `views/agent/AgentClaimsView.tsx` | `services/firestore.ts`, `policyEngine.ts` | `claims` | create: `isSignedIn() && !policyBlocksCoverage(organization)` — **appliqué côté serveur, pas seulement côté UI** | Agent (création), Supervisor (validation/rejet) |
| Claims (validation) | `views/supervisor/*` (validation) | `services/permissions.ts` (`canApproveRecord` — règle SoD : interdiction d'auto-approbation) | `claims` | update/delete: `isSignedIn()` (pas de vérification de rôle serveur sur l'update — voir Constats) | Supervisor, Admin |
| Medical Forms | `views/agent/AgentMedicalFormView.tsx` | `services/firestore.ts`, `utils/pdfMedicalForm.ts` | `medicalForms` | create: `isSignedIn() && !policyBlocksCoverage(...)` ; update/delete: `isSignedIn()` | Agent, Supervisor |
| Organizations | `views/settings/OrganizationsView.tsx` (Admin only, `ROLE_ALLOWED_SECTIONS`) | `services/firestore.ts` | `organizations` | read: `isSignedIn()` ; **write: `isAdmin()`** | Admin (écriture), tous (lecture) |
| Providers | idem | idem | `providers` | read: `isSignedIn()` ; **write: `isAdmin()`** | Admin (écriture) |
| Ceilings (plafonds) | `views/settings/CeilingsView.tsx` | `services/firestore.ts` | `ceilings` | read: `isSignedIn()` ; **write: `isAdmin()`** | Admin (écriture) |
| Health Policies (suspension/réactivation) | `views/settings/*Policy*` | `services/policyEngine.ts` (source de vérité du statut) | `healthPolicies/{organizationName}` | `isSignedIn()` (read/write — **pas de restriction `isAdmin()` actuellement**, voir Constats) | Admin dans l'UI, mais pas forcé par les règles |
| Policy Payments | idem | `services/firestore.ts` | `policyPayments` | `isSignedIn()` (read/write) | Admin dans l'UI |
| Import Excel (membres/orgs/providers) | `components/ExcelImportModal.tsx` | `utils/excelUtils.ts` (`parseMemberExcel`, `parseActivaMultiOrgExcel`, `parseOrganizationExcel`, `parseProviderExcel`) | `members`, `organizations`, `providers`, `cardNumberRegistry` | mêmes règles que les collections cibles | Admin/Agent selon la section |
| Export Excel/PDF/CSV | `utils/excelUtils.ts`, `utils/printUtils.ts`, `utils/pdfMedicalForm.ts` | — | lecture seule | héritée des règles de lecture | Supervisor/Admin (`canExportData`) |
| Audit & connexions | `views/settings/LogsView.tsx` | `services/firestore.ts` (`addLog`, `subscribeToLogs`) | `auditLogs` | read: `isSignedIn()` ; create: `if true` (nécessaire pour logguer un échec de connexion, donc non authentifié) ; **update/delete: `if false`** | Admin (lecture) |
| Notifications | `components/Topbar.tsx` | `services/firestore.ts` | `notifications` | `isSignedIn()` (read/write) | Tous |

---

## C. Cartographie des rôles (aucun rôle inventé — exactement ceux du code)

Source : `src/types/index.ts` (`UserProfile`) et `src/utils/authUtils.ts` (`AppRole`,
`ROLE_ALLOWED_SECTIONS`).

**Exactement 3 rôles applicatifs, aucun autre :**

- **Admin**
- **Supervisor** (alias interne `Superviseur`, `medical_supervisor` — normalisés vers le même
  rôle par `normalizeRole()`)
- **Agent** (alias internes `frontdesk`, `intake_agent`)

`normalizeRole()` retourne explicitement `null` pour tout rôle non reconnu — **aucun repli par
défaut vers un rôle privilégié**, ce qui est une bonne pratique déjà en place.

Sections de navigation autorisées par rôle (`ROLE_ALLOWED_SECTIONS`) :

| Rôle | Sections autorisées |
|---|---|
| Admin | dashboard, claims, invoices, enrollments, reports, members, organizations, providers, ceilings, accounts, logs, identification, medical_form, claims_validation, enrollments_validation, receipts *(toutes)* |
| Supervisor | dashboard, medical_form, claims_validation, enrollments_validation, receipts, reports |
| Agent | identification, medical_form, claims, enrollments |

Matrice de permissions détaillée déjà codifiée dans `src/services/permissions.ts`
(`PERMISSIONS_MATRIX`, 24 lignes) — reprise telle quelle en section « Matrice RBAC » plus bas,
sans invention.

---

## D. Cartographie des opérations critiques

| Opération | Où (fichier) | Contrôle client (UI/permissions.ts) | Contrôle serveur (Firestore Rules) | Écart identifié |
|---|---|---|---|---|
| Création de membre | `AgentIdentificationView.tsx` / `MembersView.tsx` | rôle via `ROLE_ALLOWED_SECTIONS` | `members`: `isSignedIn()` seulement | Pas de vérification de rôle côté serveur — n'importe quel compte connecté peut écrire dans `members` |
| Génération de carte | `cardNumberService.ts` | idem | transaction + `cardNumberRegistry` immuable (update/delete `false`) | **Bien protégé contre le doublon/réattribution** ; pas de restriction de rôle serveur sur la création |
| Modification de carte | — (pas de flux de modification directe d'un numéro existant identifié) | — | `cardNumberRegistry`: update `if false` | Conforme à la règle « jamais de réattribution » |
| Enrôlement | `AgentEnrollmentsView.tsx` | Agent (création), Supervisor (validation) | `enrollments`: `isSignedIn()` | Pas de séparation Agent/Supervisor au niveau des règles |
| Création de claim | `AgentClaimsView.tsx` | Agent | `claims` create: bloque si police suspendue/expirée (**appliqué serveur**) | Bon exemple de contrôle métier critique déjà côté serveur |
| Modification/validation de claim | vues Supervisor | `canApproveRecord()` (règle SoD anti-auto-approbation) **côté client uniquement** | `claims` update: `isSignedIn()` seulement | **Écart le plus significatif** : la règle SoD (interdiction d'auto-approbation) n'est vérifiée que côté React — un Agent qui appellerait directement le SDK Firestore pourrait techniquement approuver/rejeter un claim, y compris le sien |
| Création/modification de police | vues Admin | `canConfigureSettings()` (Admin only) côté client | `healthPolicies`: `isSignedIn()` (**pas `isAdmin()`**) | **Écart identifié** : contrairement à `organizations`/`providers`/`ceilings`, `healthPolicies` n'est pas restreint à `isAdmin()` côté règles |
| Suspension de police | idem | idem | idem | Même écart |
| Modification des plafonds | `CeilingsView.tsx` | Admin only | `ceilings`: **`write: isAdmin()`** | Conforme |
| Paiements de primes | vues Admin | Admin only côté client | `policyPayments`: `isSignedIn()` (**pas `isAdmin()`**) | Écart identifié |
| Import massif Excel | `ExcelImportModal.tsx` | rôle selon section hôte | règles des collections cibles (`members`, `organizations`, `providers`) | Validation de doublons/format faite côté client (`excelUtils.ts`), pas revalidée côté serveur |
| Gestion des utilisateurs | `AccountsView.tsx` | Admin only | `accounts`: create/update `isAdmin() OR self-sans-élévation` ; delete `isAdmin()` | Conforme, y compris anti-auto-élévation de privilège |
| Modification des permissions | `AccountsView.tsx` | Admin only | `accounts` update: un utilisateur non-Admin **ne peut pas** changer `profile`/`isActive`/`permissions`, même les siens | Conforme |

---

## Constats généraux — ce qui est DÉJÀ en place (bonnes nouvelles, à ne pas refaire)

Le dépôt a déjà fait l'objet d'un durcissement substantiel des Firestore Rules lors d'un travail
antérieur (commentaires « AMÉLIORATION AJOUTÉE » horodatés dans `firestore.rules`) :

1. Suppression du catch-all `match /{document=**} { allow read, write: if isSignedIn(); }` qui
   court-circuitait silencieusement toutes les autres règles (bug de logique OU des règles
   Firestore) — corrigé et vérifié par une suite de 17 scénarios sur l'émulateur.
2. `accounts/{uid}` : impossible de s'auto-attribuer le rôle Admin, impossible de modifier le
   compte d'un autre utilisateur sans être Admin.
3. `cardNumberRegistry` : immuabilité totale (update/delete `false`) — aucune réattribution
   possible, même par un Admin, au niveau base de données.
4. `claims`/`medicalForms` : le blocage de couverture (police suspendue/expirée) est déjà
   **appliqué côté serveur** via `policyBlocksCoverage()`, pas seulement dans l'UI.
5. `auditLogs`/`loginLogs` : create-only, immuables, lecture réservée aux connectés.
6. `organizations`/`providers`/`ceilings` : écriture déjà réservée à `isAdmin()`.
7. `users/{uid}` : lecture limitée à soi-même ou à un Admin.

## Constats généraux — écarts réels identifiés (base factuelle pour la Phase 1)

1. **`healthPolicies` et `policyPayments`** ne sont pas restreints à `isAdmin()` en écriture,
   contrairement à `organizations`/`providers`/`ceilings` qui suivent le même modèle d'accès
   dans l'UI (section réservée Admin). C'est une incohérence avec le principe déjà appliqué
   ailleurs dans les mêmes règles.
2. **`claims`/`medicalForms`/`enrollments` update** : aucune vérification de rôle serveur sur la
   validation/rejet (approbation). La règle métier « un Agent ne peut pas approuver » et « pas
   d'auto-approbation » (SoD) n'existe qu'en JavaScript côté client (`permissions.ts`).
3. **`members`** : `isSignedIn()` seul — tout compte connecté (y compris un rôle non prévu pour
   cette opération) peut créer/modifier un membre.
4. **Audit métier** : `auditLogs` ne contient aujourd'hui que des événements de connexion
   (`LoginLog` : email, IP, navigateur, statut succès/échec). Aucun événement métier
   (`CREATE_MEMBER`, `GENERATE_CARD`, `APPROVE_CLAIM`, `SUSPEND_POLICY`, etc., demandés en
   Phase 8) n'est actuellement journalisé.
5. **Aucune infrastructure Custom Claims / Cloud Functions n'existe** — les Phases 2 et 3 du
   brief sont donc des créations ex nihilo, pas des évolutions.

---

## Matrice RBAC (reprise strictement de `src/services/permissions.ts`, non inventée)

| Fonctionnalité | Admin | Supervisor | Agent |
|---|:---:|:---:|:---:|
| Se connecter | ✓ | ✓ | ✓ |
| Voir le dashboard | ✓ (global) | ✓ (équipe) | scope (personnel) |
| Créer un enregistrement (claim/enrollment) | ✓ | ✓ | ✓ |
| Modifier ses propres brouillons | ✓ | ✓ | ✓ |
| Modifier les enregistrements d'autrui | ✓ | ✓ | ✗ |
| Voir les claims/enrollments | ✓ (tous) | ✓ (tous) | scope (les siens) |
| Supprimer un enregistrement | ✓ | ✗ | ✗ |
| Soumettre pour validation | ✓ | ✓ | ✓ |
| Approuver (règle SoD : jamais son propre dossier) | ✓ | ✓ | ✗ |
| Rejeter | ✓ | ✓ | ✗ |
| Retourner pour correction | ✓ | ✓ | ✗ |
| Assigner/réassigner | ✓ | ✓ | ✗ |
| Statistiques personnelles | ✓ | ✓ | ✓ |
| Statistiques équipe/opérations | ✓ | ✓ | ✗ |
| Rapports analytiques | ✓ | ✓ | ✗ |
| Export (Excel/CSV/PDF) | ✓ | ✓ | ✗ |
| Gérer les comptes utilisateurs | ✓ | ✗ | ✗ |
| Créer un compte | ✓ | ✗ | ✗ |
| Configurer permissions/rôles | ✓ | ✗ | ✗ |
| Suspendre/désactiver un compte | ✓ | ✗ | ✗ |
| Réinitialiser un mot de passe | ✓ | ✗ | ✗ |
| Configurer plafonds/providers/organisations | ✓ | ✗ | ✗ |
| Voir les journaux d'audit | ✓ | ✗ | ✗ |
| Accès données non restreint | ✓ | ✗ | ✗ |

---

## Constats et limites de cette session (transparence avant de poursuivre)

Pour que la suite du brief (Phases 1 à 17) soit réaliste et honnête plutôt que simulée :

- **Aucun accès aux données Firestore de production** n'existe dans cet environnement (pas de
  clé de compte de service, pas d'accès admin SDK). Les rapports de rapprochement demandés en
  Phase 4/Phase 13 (« TOTAL MEMBERS, TOTAL CARDS, MISSING NUMBERS, DUPLICATE NUMBERS... ») ne
  peuvent être produits qu'à partir d'un export réel des données ou d'un accès que vous
  fourniriez (ex. export Firestore, ou identifiants d'un projet de test).
- **Aucune infrastructure de déploiement** (Firebase CLI connecté à votre projet, `firebase.json`,
  environnement de staging) n'existe dans ce dépôt. Créer des Cloud Functions dans le dépôt est
  possible immédiatement (code TypeScript), mais **les déployer, les tester en conditions
  réelles et activer Custom Claims sur de vrais comptes utilisateurs** nécessite soit un accès
  à votre projet Firebase (identifiants/CLI), soit que vous exécutiez vous-même les commandes de
  déploiement que je préparerais.
- Le pipeline DEVELOPMENT → TEST → STAGING → PILOT → PRODUCTION (Phase 14) suppose des
  environnements Firebase distincts qui n'existent pas aujourd'hui (un seul projet Firebase
  utilisé, vu dans `src/lib/firebase.ts`) — sa mise en place est elle-même un travail de
  gouvernance à valider avec vous avant tout déploiement.

Je peux réaliser immédiatement, sans dépendance externe : le **durcissement des Firestore Rules**
(Phase 1 — combler les écarts listés ci-dessus), l'**extension du contenu des audit logs**
(Phase 8, format), l'**écriture du code des Cloud Functions** (Phase 3/4) prêt à déployer, et
toute la **documentation/matrices** (Phase 18). Le déploiement réel et la validation sur données
réelles nécessitent votre implication (accès projet ou exécution des commandes).

---

## Prochaine étape proposée

Conformément à la règle absolue de non-régression du brief, aucune ligne de code n'a été modifiée
pour produire ce rapport. Je propose de poursuivre, dans l'ordre, par les actions réalisables
sans accès externe supplémentaire :

1. **Phase 1** — combler les 3 écarts identifiés dans `firestore.rules` (`healthPolicies`,
   `policyPayments` → `write: isAdmin()` ; ajout d'une vérification de rôle serveur sur
   l'approbation/rejet des `claims`/`medicalForms`/`enrollments`), sans toucher aux opérations
   légitimes déjà vérifiées.
2. **Phase 8** — étendre `auditLogs` aux événements métier critiques listés dans le brief, en
   conservant `LoginLog` intact.
3. Préparer le code des Cloud Functions (Phases 3/4) en local, prêt à être déployé quand vous
   aurez confirmé l'accès/l'environnement cible.

Dites-moi si vous voulez que je démarre par le point 1, ou si vous préférez d'abord clarifier
l'accès à un projet Firebase de test pour les phases nécessitant un déploiement réel.
