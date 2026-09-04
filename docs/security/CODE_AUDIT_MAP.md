# Cartographie technique — ACTIVA HealthPass (Phase 0)

Document factuel, produit avant toute modification, conformément à la règle absolue du
prompt de durcissement. Toutes les affirmations ci-dessous sont vérifiées directement dans
le code du dépôt (`main` / `claude/architecture-interface-agent-6ekudj`, HEAD =
`353ff38`), pas supposées. Quand une information n'a pas pu être vérifiée par le code seul,
c'est noté explicitement.

**⚠️ Point d'arrêt obligatoire avant la Phase 1** : voir section 11 — une ambiguïté de
modèle de données bloque strictement la Phase 1.3 (isolation par organisation) et doit être
tranchée par vous avant que j'écrive le moindre code de cloisonnement.

---

## 1. Collections Firestore et règles actuelles (`firestore.rules`)

| Collection | read | create | update | delete | Remarque |
|---|---|---|---|---|---|
| `accounts/{userId}` | `if true` (public, y compris non authentifié) | `isAdmin()` OU (`auth.uid==userId` ET `profile != 'Admin'`) | `isAdmin()` OU self-update figeant `profile`/`isActive`/`permissions` | `isAdmin()` | Lecture volontairement ouverte : `LoginView.tsx` doit résoudre un nom d'utilisateur en e-mail Firebase Auth **avant** authentification (voir `docs/security/LOGIN_INCIDENT_2026-09-04.md`). |
| `members/{memberId}` | `isSignedIn()` | `isSignedIn() && isActiveUser()` | idem | `isAdmin()` | Aucune restriction de rôle ni d'organisation sur read/write. |
| `counters/{counterId}` | `isSignedIn()` | `isSignedIn() && isActiveUser()` | idem + garde anti-régression sur `lastAssuredNumber` (corrigée le 2026-09-04, l'ancien nom de champ `lastInsuredNumber` ne correspondait à rien dans le code réel) | `false` | Un seul document utilisé : `counters/cardNumbers`. |
| `cardNumberRegistry/{cardNumber}` | `isSignedIn()` | `isSignedIn() && isActiveUser()` | `false` | `false` | Immuable — clé d'unicité des numéros de carte. |
| `healthPolicies/{organizationName}` | `isSignedIn()` | `isAdmin()` | `isAdmin()`/`isSupervisor()` libres ; sinon utilisateur actif limité aux champs `status,coverageBlocked,updatedAt,lastEvaluatedAt` ET ne peut jamais faire `coverageBlocked: true → false` | `isAdmin()` | Le document `id` = nom exact de l'organisation cliente. |
| `policyPayments/{paymentId}` | `isSignedIn()` | `isAdmin()` (write) | `isAdmin()` | `isAdmin()` | — |
| `claims/{claimId}` | `isSignedIn()` | `isSignedIn() && isActiveUser()` ET police non bloquante | changement de `status` réservé à `isAdmin()/isSupervisor()` ET `createdBy != auth.uid` (SoD) ; tout le reste libre à un utilisateur actif | `isAdmin()` | Pas de vérification de transition d'état (n'importe quel statut listé peut aller vers n'importe quel autre). |
| `medicalForms/{formId}` | `isSignedIn()` | `isSignedIn() && isActiveUser()` ET police non bloquante | `isSignedIn() && isActiveUser()` (**aucune restriction de champ**) | `isAdmin()` | Pas de champ `createdBy` dans le type `MedicalForm` — SoD non applicable ici faute de donnée. |
| `enrollments/{enrollmentId}` | `isSignedIn()` | `isSignedIn() && isActiveUser()` | même schéma SoD que `claims` | `isAdmin()` | — |
| `invoices/{invoiceId}` | `isSignedIn()` | `isSignedIn() && isActiveUser() && canValidate()` | idem | `isAdmin()` | `canValidate()` = Admin ou Supervisor. |
| `organizations/{orgId}` | `isSignedIn()` | `isAdmin()` (write) | idem | idem | — |
| `providers/{providerId}` | `isSignedIn()` | `isAdmin()` (write) | idem | idem | — |
| `ceilings/{ceilingId}` | `isSignedIn()` | `isAdmin()` (write) | idem | idem | — |
| `loginLogs/{logId}` | `isSignedIn() && isAdmin()` | `isSignedIn()` | `false` | `false` | **Règle jamais exploitée par le code** — aucun `addDoc`/`setDoc` vers `loginLogs` trouvé dans `src/`. Collection historique, probablement remplacée par `auditLogs`. |
| `auditLogs/{logId}` | `isSignedIn() && (isAdmin()\|\|isSupervisor())` | `if true` | `false` | `false` | Create ouvert **volontairement** : nécessaire pour journaliser un échec de connexion avant authentification (`LoginView.tsx`). Aucun contrôle du contenu écrit (voir section 9). |
| `notifications/{notificationId}` | `isSignedIn()` | idem (write) | idem | idem | Notifications applicatives internes, pas de PII sensible au-delà du nom du destinataire. |
| `users/{userId}` | `auth.uid==userId \|\| isAdmin()` | `isAdmin()` (write) | idem | idem | **Collection legacy quasi-morte** : un seul point de lecture (`App.tsx:268`, fallback si `accounts/{uid}` et aucun match n'existent), aucune écriture trouvée dans le code applicatif actuel (seed data ancienne uniquement, voir section 4). |

**Constat transversal majeur** : à l'exception de `accounts` (self-scope) et des collections
strictement Admin-only (`organizations`/`providers`/`ceilings`/`policyPayments`), **toutes les
collections métier (`members`, `claims`, `medicalForms`, `enrollments`, `healthPolicies`,
`invoices`) sont lisibles intégralement par N'IMPORTE QUEL utilisateur authentifié actif**,
quel que soit son rôle ou l'organisation cliente à laquelle il est rattaché. Un Agent peut lire
directement via le SDK Firestore l'ensemble des claims/dossiers médicaux/membres de toutes les
organisations, pas seulement ceux qu'il a créés ou que l'interface lui affiche. Ceci est décrit
factuellement ici ; correction en Phase 1.3, sous réserve de la section 11.

---

## 2. Opérations read/write/delete par collection et composant appelant

Deux points d'accès Firestore coexistent dans `src/` :

1. **`src/services/firestore.ts`** (`FirestoreService`) — point d'entrée central pour la
   plupart des écrans (`getX`/`subscribeToX`/`addX`/`updateX`/`deleteX` par collection). Utilisé
   par la quasi-totalité des vues (`App.tsx`, `ClaimsView.tsx`, `EnrollmentsView.tsx`,
   `MembersView.tsx`, `AccountsView.tsx`, etc.).
2. **Accès direct à `db`** (`collection(db, ...)`/`doc(db, ...)`), en dehors de
   `FirestoreService`, dans :
   - `src/components/auth/LoginView.tsx` — lecture `accounts` pré-authentification, création
     `accounts/{uid}` post-provisioning (voir `LOGIN_INCIDENT_2026-09-04.md`).
   - `src/App.tsx` — écoute temps réel `accounts/{uid}` (`onSnapshot`), fallback
     `accounts`/`users` si le document n'existe pas encore, mise à jour du mot de passe
     (`updateDoc(doc(db,'accounts',...))` ligne ~1514).
   - `src/services/cardNumberService.ts` — transaction directe sur
     `counters/cardNumbers` + `cardNumberRegistry/{cardNumber}` + lecture `members`.
   - `src/components/CardNumberManagementModal.tsx` — lecture `cardNumberRegistry` filtrée
     par organisation.
   - `src/views/settings/AccountsView.tsx` — écriture directe `accounts/{uid}` (création,
     édition, reset mot de passe, activation/désactivation) — redondant avec
     `FirestoreService.addAccount`/`updateAccount` (les deux sont appelés successivement à la
     création, voir section 10).
   - `src/views/settings/MembersView.tsx` — requête `claims` filtrée par `memberCardNo`.
   - `src/services/seedData.ts` — écriture batch de **toutes** les collections métier
     (données de démonstration/amorçage), voir section 4.

`WorkflowService` (`src/services/workflowService.ts`) n'accède pas directement à `db` : il
orchestre `FirestoreService` (écritures métier) + tente d'abord les Cloud Functions câblées
(`generateCardNumber`, `processClaimDecision`, `syncPolicy`, voir section 3) avant de retomber
sur `FirestoreService`.

---

## 3. Cloud Functions / endpoints API existants (même partiels)

### 3.1 Cloud Functions (`functions/src/index.ts`, `firebase-functions` v5, non déployées)

| Fonction | Rôle | Appelée depuis le frontend ? |
|---|---|---|
| `generateCardNumber` | Génération transactionnelle du numéro de carte suivant | ✅ `cardNumberService.ts` (avec repli client automatique) |
| `registerCardNumber` | Enregistrement d'un numéro de carte fourni manuellement (Cas A) | ❌ Aucun appelant dans `src/` |
| `batchGenerateCardNumbers` | Génération en lot sans trou de séquence | ❌ Aucun appelant |
| `processClaimDecision` | Décision (approve/reject/return) sur un claim, SoD serveur, génération facture | ✅ `workflowService.ts` (`approveClaim`/`rejectClaim`, avec repli client) |
| `processEnrollmentDecision` | Décision sur un enrollment, SoD serveur | ❌ Aucun appelant (référencé seulement dans `apiClient.ts`, lui-même mort — voir 3.2) |
| `bulkImportMembers` | Import Excel en masse, **crée toujours de nouveaux membres** (pas de mise à jour) | ❌ Non câblé (câblage explicitement refusé le 2026-09-04 : romprait le comportement create-or-update de l'import réel) |
| `evaluatePolicy` | Recalcul du statut de police à partir d'un objet `policy` **fourni par l'appelant** (pas de lecture Firestore) | ❌ Aucun appelant |
| `syncPolicy` | Recalcule et persiste le statut réel de toutes les polices d'une organisation à partir de Firestore | ✅ `workflowService.ts` (`syncPolicyStatuses`, avec repli client) |
| `validateCoverage` | Vérifie l'accès aux soins pour une organisation | ❌ Aucun appelant |
| `logAuditEvent` | Écrit un événement d'audit signé serveur | ❌ Aucun appelant (redondant avec `FirestoreService.addLog`, déjà en écriture ouverte, voir section 9) |

Correctif appliqué le 2026-09-04 : `resolveUserRole()` (ajoutée le même jour dans un commit
externe) lisait `accounts.role`, un champ qui n'existe nulle part dans le modèle réel
(`accounts.profile`) — corrigé, sinon `bulkImportMembers` aurait refusé indéfiniment tout
Admin/Supervisor et `processClaimDecision`/`processEnrollmentDecision` auraient reçu un rôle
serveur toujours égal à `'Agent'`.

**Aucune de ces fonctions n'est actuellement déployée** : `functions/` n'a pas de projet
Firebase configuré côté CLI avant le commit du jour ajoutant `firebase.json` (voir
`LOGIN_INCIDENT_2026-09-04.md`), et je n'ai pas d'accès de déploiement dans cet environnement.
Les 3 fonctions "câblées" ci-dessus le sont via un patron `try Cloud Function → catch → repli
client identique à avant`, donc sans aucun effet observable tant qu'elles ne sont pas
déployées.

### 3.2 Serveur Express (`server.ts`, servi en dev par Vite middleware ; en prod, sert `dist/` statique)

| Route | Authentifie l'appelant ? | Que fait-elle réellement ? |
|---|---|---|
| `GET /api/health` | Non | Ping. |
| `POST /api/cards/verify-format` | Non | Valide un format `AMID-YYMMDD-NNNNN` par regex, aucun accès Firestore. |
| `POST /api/cards/continuity-report` | Non | Analyse un tableau de numéros fourni par le client (gaps/doublons), aucun accès Firestore. |
| `POST /api/policies/evaluate` | Non | Recalcule le statut à partir de l'objet `policy` **envoyé tel quel par le client** — ne lit jamais la police réelle en base. N'apporte donc **aucune garantie d'intégrité** : un client malveillant peut fournir n'importe quelles dates/montants. |
| `POST /api/claims/validate-coverage` | Non | Retourne `allowed` en se basant sur `coverageBlocked`/`memberStatus` **fournis directement dans le corps de la requête** par le client — trivialement contournable (`{"coverageBlocked": false}` suffit). |
| `POST /api/audit/log` | Non | Renvoie `{success:true, entry:{...}}` **sans jamais écrire nulle part** (ni Firestore ni fichier) — c'est un simulacre, aucune trace n'est réellement conservée. |

**Aucune route n'effectue de vérification du jeton Firebase Auth** (`Authorization: Bearer`
envoyé par `apiClient.ts` mais jamais lu ni vérifié dans `server.ts`) : ces 6 routes sont donc
accessibles anonymement. `src/services/apiClient.ts` (207 lignes, ajouté le 2026-09-04 dans le
même commit externe que les nouvelles Cloud Functions) définit des méthodes pour **9** routes
`/api/*`, dont **6 n'existent pas du tout** dans `server.ts`
(`/api/cards/generate-next`, `/api/cards/register-existing`, `/api/cards/batch-generate`,
`/api/claims/process-decision`, `/api/enrollments/process-decision`,
`/api/import/bulk-members`) — un appel à ces méthodes recevrait un 404. **`apiClient.ts` n'a
aucun appelant dans `src/`** (vérifié par recherche exhaustive) : code mort à ce jour, sur les
deux plans (fonctions inexistantes côté serveur, et non importé côté client).

`src/services/policyEngine.ts` expose aussi `evaluatePolicyWithServer()`, qui appelle
`/api/policies/evaluate` avec repli sur la logique locale — **également sans appelant** dans
`src/` (le code de production utilise directement `getPolicyCoverageStatus`/`isPolicyBlocking`/
`hasHealthcareAccess`, jamais la variante serveur).

---

## 4. Décisions métier sensibles calculées côté client

| Logique | Fichier | Utilisée par | Rejouée/vérifiée côté serveur ? |
|---|---|---|---|
| Statut de couverture d'une police (Active/Expiring Soon/Expired/Suspended/Pending Renewal) et blocage de couverture qui en découle | `src/services/policyEngine.ts` (`getPolicyCoverageStatus`, `isPolicyBlocking`, `hasHealthcareAccess`) — référence fonctionnelle unique, correctement non dupliquée ailleurs côté client | `WorkflowService.syncPolicyStatuses` (écrit `coverageBlocked`/`status` dans Firestore), écrans Agent/Claims/Medical Form pour l'affichage | Partiellement : `firestore.rules.policyBlocksCoverage()` revérifie `coverageBlocked` **déjà persisté**, mais c'est le client qui décide de la valeur à persister (via `syncPolicyStatuses`, avec repli si `syncPolicy` Cloud Function indisponible — ce qui est le cas aujourd'hui). `functions/src/policyService.ts` réimplémente la même logique (`evaluatePolicyServer`), alignée avec le client depuis le correctif du 2026-09-04, mais n'est appelée en pratique que via `syncPolicy` (câblé) — `evaluatePolicy` (lecture à la demande) n'a aucun appelant. |
| Génération du numéro de carte (`AMID-YYMMDD-NNNNN`, transaction `counters`+`cardNumberRegistry`) | `src/services/cardNumberService.ts` | Enrôlement Agent, génération manuelle Admin | Oui pour l'unicité (transaction Firestore + registre immuable côté règles), mais la génération **définitive** peut aboutir uniquement via écriture client directe si `generateCardNumber` (Cloud Function câblée) échoue/n'est pas déployée — pas de mode "refus / mise en file" (contraire à la Phase 1.6 du brief). |
| Séparation des tâches (auto-approbation) | `src/services/permissions.ts` (`canApproveRecord`, comparaison `createdBy`/`creatorEmail`/`agentName`/`creatorName`) — **purement déclaratif, gate uniquement l'affichage des boutons** | `ClaimsView.tsx`, `EnrollmentsView.tsx`, `DashboardView.tsx` | Oui pour `claims`/`enrollments` (règles Firestore + Cloud Function `processClaimDecision`/`processEnrollmentDecision`, cette dernière non câblée). **Non** pour `medicalForms` (pas de champ `createdBy` dans le type — SoD non applicable faute de donnée, voir section 11 pour une note connexe). |
| Matrice de permissions complète (`hasPermission`, `canExportData`, `canManageUsers`, `canConfigureSettings`, `canViewAuditLogs`, `canAssignRecord`, `canReturnRecord`, `canDeleteRecord`, `canEditRecord`) | `src/services/permissions.ts` | `DashboardView.tsx`, `EnrollmentsView.tsx`, `ClaimsView.tsx` (pas systématiquement — `ReportsView.tsx`/`AccountsView.tsx` n'appellent aucune de ces fonctions) | **Non, presque entièrement côté client.** Les seules bornes serveur réelles sont : `organizations`/`providers`/`ceilings`/`policyPayments` = write `isAdmin()` ; suppression = `isAdmin()` sur toutes les collections métier ; SoD sur `claims`/`enrollments`. Export, assignation, retour, édition de tiers ne sont contrôlés qu'à l'affichage — un appel direct au SDK Firestore par un Agent authentifié n'est bloqué que là où une règle Firestore le bloque explicitement (section 1). |
| Résolution de rôle et de section de navigation par défaut | `src/utils/authUtils.ts` (`normalizeRole`, `ROLE_ALLOWED_SECTIONS`, `isSectionAllowedForRole`) — strict, retourne `null` si rôle non reconnu (pas de repli privilégié) | `App.tsx` | La navigation autorisée n'est qu'un filtre d'affichage ; l'accès réel aux données est déterminé par les règles Firestore (section 1), qui sont plus larges que la navigation ne le laisse penser côté Agent. |

`src/services/seedData.ts` amorce/synchronise en masse **toutes** les collections métier avec
des données de démonstration (`accounts`, `organizations`, `providers`, `members`,
`medicalForms`, `claims`, `invoices`, `ceilings`) — logique d'amorçage, pas de décision métier,
mais à garder en tête pour la Phase 1 (elle écrit directement en batch, hors `FirestoreService`).

---

## 5. Rôles et permissions tels qu'ils existent réellement dans le code (pas tels qu'ils devraient être)

- **3 rôles réels, non hiérarchisés dynamiquement** : `Admin`, `Supervisor` (alias
  `Superviseur`/`medical_supervisor`), `Agent` (alias `frontdesk`/`intake_agent`) —
  `normalizeRole()` (`src/utils/authUtils.ts`) ne retourne jamais de rôle par défaut : un rôle
  non reconnu bloque l'utilisateur (`authStatus: 'invalid_role'`), jamais un repli silencieux
  vers un rôle privilégié ou dégradé.
- **Source de vérité du rôle** : `accounts/{uid}.profile` (jamais `accounts/{uid}.role` — ce
  champ n'existe dans aucun code d'écriture applicatif ; seul un import ponctuel de démo
  aurait pu l'utiliser historiquement, non retrouvé dans `seedData.ts` actuel qui utilise bien
  `profile`).
- **Custom Claims Firebase (`request.auth.token.role`/`isActive`)** : le code des règles
  (`firestore.rules`) et des Cloud Functions (`resolveUserRole`) sait déjà les lire en
  priorité, **mais aucun code du dépôt ne les pose jamais** (recherche exhaustive de
  `setCustomUserClaims` : aucune occurrence). Le repli sur `accounts/{uid}.profile` s'applique
  donc systématiquement en pratique aujourd'hui.
- **Aucune notion de tenant/organisation sur `accounts`** — voir section 11 (point d'arrêt).
- **Lecture non cloisonnée** : comme noté en section 1, un rôle Agent authentifié peut lire
  l'intégralité de `members`/`claims`/`medicalForms`/`enrollments`/`healthPolicies` via le SDK,
  au-delà de ce que l'interface lui affiche (qui filtre côté client uniquement, ex.
  `DashboardView.tsx`/`ClaimsView.tsx` avec `agent: 'scope'` dans `PERMISSIONS_MATRIX` —
  déclaratif, non appliqué techniquement).

---

## 6. Champs contenant des données personnelles, médicales ou biométriques

D'après `src/types/index.ts` :

- **`Member`** : `principalName`, `spouseName`, `dependents[].fullName`, `birthDate`, `gender`,
  `phone`, `email`, `photoUrl` (photo du visage), **`hasBiometrics`, `fingerprintScore`,
  `fingerprintSensor`, `fingerprintDate`, `nfiqQuality`** (données biométriques —
  empreinte digitale, score de qualité NFIQ), `organization` (rattachement employeur).
- **`Enrollment`** : mêmes catégories (`fullName`, `birthDate`, `gender`, `phone`, `email`,
  `photoUrl`, `fingerprintScore`, `idDocumentUrl` — pièce d'identité scannée).
- **`Claim`** : `memberName`, `photoUrl`, **`prescriptionUrl`** (ordonnance médicale),
  **`invoiceDocumentUrl`** (facture de soins), `fingerprintSampleUrl`/`fingerprintScore`,
  `doctorName`.
- **`MedicalForm`** : `memberName`, `memberBirthDate`, `memberGender`, `securityNumber`,
  **`doctorPrescription.{presumedDiagnosis, requestedExams, treatmentOrder}`** (diagnostic
  médical présumé, examens demandés, traitement prescrit — donnée médicale sensible au sens
  strict), `doctorName`, signatures (`doctorSignatureDate`/`memberSignatureDate`).
- **`UserAccount`** (personnel ACTIVA, pas des assurés) : `fullName`, `phone`, `email`, et
  historiquement `password`/`tempPassword` en clair (voir section 9bis) — pas de donnée
  médicale.

Toutes les URLs de documents (`photoUrl`, `prescriptionUrl`, `invoiceDocumentUrl`,
`idDocumentUrl`, `fingerprintSampleUrl`) pointent vers Firebase Storage — voir section 7 pour
le niveau de protection réel de ces fichiers.

---

## 7. Fichiers stockés via Firebase Storage et leurs règles d'accès

- **Usage réel** : `src/utils/storageUtils.ts` (`uploadPhotoOrFallback`) — utilisé pour les
  photos capturées (membres/enrollments). Écrit sous des chemins `member-photos/…` ou
  `enrollment-photos/…`. **Repli automatique vers stockage base64 inline dans Firestore si
  l'upload Storage échoue** (comportement pré-existant conservé pour ne jamais régresser).
- **Règle `storage.rules`** (fichier présent dans le dépôt, jamais confirmé déployé —
  commentaire du fichier lui-même le dit explicitement) : `allow read, write: if request.auth
  != null;` sur **tous les chemins** (`{allPaths=**}`) — aucune restriction de rôle,
  d'organisation, ni de propriétaire. N'importe quel utilisateur authentifié (y compris un
  Agent d'une autre organisation) peut lire OU écraser n'importe quel fichier de n'importe quel
  autre utilisateur/membre s'il devine ou énumère le chemin — ceci inclut les pièces d'identité
  (`idDocumentUrl`) et ordonnances/factures si elles étaient un jour routées par ce même
  mécanisme (aujourd'hui, `prescriptionUrl`/`invoiceDocumentUrl`/`fingerprintSampleUrl` ne sont
  pas produits par du code d'upload trouvé dans `src/` — probablement saisis comme simples
  chaînes ou non encore implémentés côté upload réel ; à confirmer si besoin).
- **URLs retournées par `getDownloadURL()`** sont des URLs de téléchargement **permanentes**
  (pas d'expiration), conformément au SDK Firebase Storage client standard — pas d'URL signée à
  durée limitée (Phase 1.9 du brief).

---

## 8. Mécanismes d'export existants (Excel/CSV/PDF)

- **PDF** : `src/utils/pdfMedicalForm.ts` (génération du formulaire médical, avec
  `src/utils/pdfBranding.ts` pour le branding/logo), `src/utils/printUtils.ts`. Consommé par
  `ReportsView.tsx`, `ClaimsView.tsx`, écrans Agent (Medical Form).
- **Excel/CSV** : `src/utils/excelUtils.ts` (parsing ET génération), consommé par
  `ExcelImportModal.tsx` (import), `MembersView.tsx`, `ClaimsView.tsx`, `ReportsView.tsx`
  (export).
- **UI commune** : `src/components/ExportDropdown.tsx` — purement présentationnel (déclenche
  les callbacks `onExportExcel`/`onExportCSV`/`onExportPDF`/`onExportJSON` fournis par le
  composant parent), **aucune vérification d'autorisation à l'intérieur du composant lui-même**.
- **Gate d'autorisation observée** : `permissions.ts.canExportData()` (Admin/Supervisor
  uniquement selon la matrice) n'est **pas** appelée par `ReportsView.tsx` ni par
  `ExportDropdown.tsx` — seule la visibilité du bouton dans les écrans qui l'utilisent
  effectivement (`ClaimsView.tsx`, `EnrollmentsView.tsx`) semble suivre `PERMISSIONS_MATRIX`,
  mais l'export lui-même opère toujours sur des données déjà chargées côté client sans
  filtrage d'organisation supplémentaire (cohérent avec l'absence de cloisonnement notée en
  section 1/5) : un export ne peut donc pas exposer plus de données que ce que l'utilisateur
  peut déjà lire directement via Firestore, mais ce périmètre est déjà large (toutes
  organisations).

---

## 9. Mécanismes d'audit/logging existants

- **`auditLogs`** (Firestore, `create: if true`, `update/delete: if false`) — collection
  active, alimentée par `FirestoreService.addLog()` (`src/services/firestore.ts`) :
  - Connexions réussies (`App.tsx`) et échecs de connexion (`LoginView.tsx`,
    `status:'failed'`, avec IP/localisation/user-agent via `src/utils/geoUtils.ts`).
  - Actions métier via `WorkflowService.logAction` (`src/services/workflowService.ts`).
  - **Aucun schéma de champs imposé** : la fonction accepte
    `Partial<AuditLog> | Partial<LoginLog>` sans validation — n'importe quel appelant peut
    écrire n'importe quel champ (y compris, en théorie, un utilisateur non authentifié
    puisque `create: if true`), et la règle Firestore ne restreint ni les champs ni les
    valeurs acceptées pour une écriture pré-authentification (Phase 2.3 du brief le vise
    explicitement).
- **`loginLogs`** : règles présentes, **jamais écrites par le code actuel** (voir section 1) —
  probablement un vestige d'une version antérieure remplacée par `auditLogs`.
- **Cloud Function `logAuditEvent`** (`functions/src/index.ts`) et son binding Express
  `POST /api/audit/log` : tous deux existent mais **aucun appelant côté client** ; de plus
  `POST /api/audit/log` n'écrit réellement nulle part (voir section 3.2) — un doublon
  actuellement inerte, pas une garantie supplémentaire.
- **Pas de tampon d'intégrité/hash-chaînage** entre entrées d'audit (une entrée immuable
  individuellement, mais rien n'empêche d'en omettre une silencieusement côté client).

### 9bis. Identifiants sensibles (`password`/`tempPassword`/`passwordHash`/`passwordSalt`)

- `src/utils/passwordUtils.ts` : `hashPassword`/`verifyPassword`, format non documenté ici en
  détail (à vérifier avant Phase 1.8 si PBKDF2/scrypt réel ou SHA-256+sel simple — **je ne l'ai
  pas encore relu ligne à ligne**, à faire avant toute modification de ce module).
  - **Précision utilisateur (préférences enregistrées de session)** : remplacer un hash SHA-256
    sans sel par PBKDF2 ou SHA-256+sel fort est explicitement demandé — sera vérifié et traité
    en Phase 1.8, sans casser les comptes existants (migration paresseuse déjà en place pour le
    passage clair→hash, voir `LoginView.tsx` section 7 de son flux, à étendre pour le futur
    algorithme si nécessaire).
- Comptes anciens : encore un fallback plaintext (`password`/`tempPassword`) accepté en lecture
  pour compatibilité, jamais réécrit en clair pour un compte nouveau/réinitialisé depuis le
  correctif du 2026-09-01/02 (voir `AccountsView.tsx`, `LoginView.tsx`).
- Aucun mot de passe par défaut codé en dur trouvé dans le code applicatif actuel (à confirmer
  également dans les scripts racine, section 10, mais ceux-ci ne sont plus exécutés).

---

## 10. Scripts `fix*.js`, `fix*.cjs`, `patch_*.js`, `update_*.js` à la racine

24 fichiers, tous datés du 2026-09-01 (avant le début de cette session), tous des scripts
Node one-shot de type "codemod" (lecture d'un fichier source, `String.replace` sur un extrait
de code exact, réécriture). **Aucun n'est référencé dans `package.json` (racine ou
`functions/`), aucun n'est importé par du code applicatif.** Hypothèse de statut pour chacun,
basée sur la lecture de son contenu et la comparaison avec l'état actuel du fichier ciblé :

| Script | Fichier ciblé | Hypothèse de statut |
|---|---|---|
| `account_update.js` | `AccountsView.tsx` | Exécuté une fois (retrait d'une colonne "Mot de Passe Actuel") — le motif recherché n'existe plus dans le fichier actuel. Obsolète. |
| `fix2.js` | `MembersView.tsx` | Correctif d'urgence suite à un `patch_members_view.cjs` disparu (commentaire interne le mentionne) ; artefact de récupération. Obsolète. |
| `fix_accounts.cjs` | `AccountsView.tsx` | Migration `storage` (mock local) → `FirestoreService`. Motif absent du fichier actuel. Obsolète. |
| `fix_accounts_create.cjs` | `AccountsView.tsx` | Itération intermédiaire du même chantier que ci-dessus. Obsolète (confirmé dans une session précédente : le motif recherché ne correspond plus au code actuel). |
| `fix_accounts_create2.cjs` | `AccountsView.tsx` | Itération suivante. Obsolète. |
| `fix_accounts_view.cjs` | `AccountsView.tsx` | Version la plus complète de la migration Firestore (état/écoute temps réel, création via `secondaryAuth`). Obsolète (déjà appliqué, le code actuel va plus loin). |
| `fix_accounts_view.js` | `AccountsView.tsx` | Suppression d'une cellule HTML liée au mot de passe. Obsolète. |
| `fix_agent_enroll.cjs` | `AgentEnrollmentsView.tsx` (308 lignes de code généré inline) | Récrit le fichier en entier depuis un template embarqué dans le script — outil de génération ponctuel, pas un correctif incrémental. Obsolète (le fichier actuel a depuis évolué indépendamment). |
| `fix_app.cjs` | `App.tsx` | Remplace un `reloadData` basé sur un `FirestoreService` synchrone (mock) par des abonnements temps réel. Obsolète — cette architecture (mock synchrone) n'existe plus du tout dans le code actuel. |
| `fix_app_auth.cjs` | `App.tsx` | Étape intermédiaire du même chantier. Obsolète. |
| `fix_app_race.cjs` | `App.tsx` | Corrige une race condition dans la résolution du rôle (`docSnap.data().profile`, avec repli hardcodé `'Admin'` si le document n'existe pas — **repli dangereux**, mais ce motif n'existe plus dans `App.tsx` actuel qui utilise `normalizeRole()` sans repli privilégié). Obsolète et son défaut déjà corrigé depuis par la réécriture actuelle. |
| `fix_claims_export.cjs` | `ClaimsView.tsx` | Réagencement des boutons d'export CSV/Excel. Obsolète (le JSX ciblé ne correspond plus à la structure actuelle avec `ExportDropdown`). |
| `fix_claims_props.cjs` | `ClaimsView.tsx` + `App.tsx` | Ajout de la prop `currentSection`. Obsolète. |
| `fix_lint.cjs` / `fix_lint2.cjs` | `App.tsx`, `AccountsView.tsx` | Corrections d'imports manquants (`onSnapshot`) après un refactor précédent. Obsolètes. |
| `fix_members_view.js` / `fix_members_view_regex.js` | `MembersView_broken.tsx` → `MembersView.tsx` | Scripts de **récupération après un refactor cassé** (le fichier source `MembersView_broken.tsx` visé n'existe plus du tout dans le dépôt) — confirme que la récupération a été menée à bien puis le fichier temporaire supprimé. Totalement obsolètes/inertes (planteraient s'ils étaient réexécutés, faute de fichier source). |
| `fix_phone_rem.cjs` | `AccountsView.tsx` | Retrait d'un bloc "Phone Number" du formulaire. Obsolète. |
| `fix_rules.cjs` | `firestore.rules` | Cible une fonction `isUserRole(role)` et un motif `isValidId(userId)` — **n'existent pas** dans les règles actuelles (`firestore.rules` a été entièrement réécrit depuis, voir `isAdmin()`/`isSupervisor()` etc.). Obsolète. |
| `fix_rules_read.cjs` | `firestore.rules` | Retrait généralisé de `isValidId(...)` des règles de lecture — même motif absent aujourd'hui. Obsolète. |
| `fix_sidebar.cjs` | `Sidebar.tsx` | Restreint la visibilité de certains items pour l'Agent. À vérifier si le comportement résultant est bien celui du fichier actuel (probablement oui, refactors ultérieurs ayant pris le relais) — obsolète en tant que script exécutable (motif exact absent), mais son **intention** (Agent sans accès `members`/`organizations`/`providers` en navigation) semble cohérente avec `ROLE_ALLOWED_SECTIONS` actuel. |
| `fix_topbar.cjs` | `Topbar.tsx` | Ajout de props `currentUser`/`userRole`. Obsolète. |
| `patch_app.js` | `App.tsx` | Bootstrap initial de l'authentification Firebase (avant l'architecture actuelle avec `onSnapshot`/`normalizeRole`). Obsolète, historique. |
| `update_claims.js` | `ClaimsView.tsx` | Masquage des boutons approve/reject pour les agents. Obsolète (motif absent). |
| `update_translations.js` | `src/i18n/translations.ts` | Réduit le fichier de traductions à l'anglais uniquement. À vérifier : si le fichier de traductions actuel est mono-langue anglais, ce script a probablement été exécuté avec succès — obsolète soit qu'il ait réussi, soit que le fichier ait encore évolué depuis. |

**Recommandation Phase 5** (à ne pas exécuter maintenant) : tous relèvent de la catégorie
"déjà exécutés une fois, à archiver dans `/scripts/archive/`" plutôt que "outil de maintenance
récurrent" — aucun ne présente de paramétrage ni de logique réutilisable en l'état (chemins et
motifs de code en dur, écrits pour une seule exécution contre un état de fichier précis et
désormais dépassé). Aucun ne sera supprimé ni modifié avant la Phase 5, conformément à la règle
absolue.

---

## 11. ⚠️ Point d'arrêt — ambiguïté de modèle de données bloquant la Phase 1.3

La Phase 1.3 du brief demande le cloisonnement par organisation des collections `claims`,
`medicalForms`, `enrollments`, `invoices`, `policyPayments`, `members`, **si un champ
d'affectation organisationnelle existe déjà sur `accounts`**.

Vérification faite sur `src/types/index.ts` (`UserAccount`, section 33-62) et sur
`AccountsView.tsx` (formulaire de création/édition complet) : **`accounts` ne porte aucun
champ reliant un compte Supervisor/Agent à une ou plusieurs organisations clientes** (les
organisations au sens de `Organization.name` / `Member.organization` / `Claim.organization`,
etc.). `accounts` porte en revanche `entity`/`country` (ex. "ACTIVA Liberia"), qui désigne la
**filiale/bureau pays d'ACTIVA** employant l'agent — un concept entièrement différent des
organisations clientes (les employeurs assurés dont les salariés sont couverts).

Je ne peux donc pas déterminer avec certitude, à partir du seul code, **quel périmètre de
cloisonnement est réellement voulu** :

- **Option A** — cloisonner par `entity`/`country` (un Agent d'ACTIVA Liberia ne verrait que
  les organisations clientes rattachées à ACTIVA Liberia). Cela suppose que chaque
  `Organization`/`Claim`/`Member` porte (ou puisse porter) un rattachement à une entité ACTIVA
  — **champ non trouvé non plus** sur `Organization` (`src/types/index.ts:261-276` : pas de
  champ `entity`/`country`).
- **Option B** — introduire un nouveau champ additif `assignedOrganizations?: string[]` (ou
  équivalent) sur `accounts`, par défaut absent/vide, avec une règle de repli explicite
  **"champ absent → aucune restriction"** pour ne jamais bloquer un compte existant tant que
  l'Admin n'a pas explicitement assigné les organisations d'un utilisateur — c'est l'approche
  rétrocompatible que la règle absolue du prompt privilégie ("propose un champ additif
  rétrocompatible... plutôt que de le créer silencieusement"), mais elle suppose une action
  humaine ultérieure (un Admin doit renseigner ce champ pour que le cloisonnement ait un effet
  réel) et un choix de modélisation (un agent peut-il être rattaché à plusieurs organisations
  clientes à la fois ? à toutes par défaut, ou à aucune par défaut ?).
- **Option C** — ne pas cloisonner par organisation cliente du tout dans ce lot, et documenter
  ce point comme "ACTION HORS-CODE / DÉCISION PRODUIT REQUISE" dans le rapport final, en se
  concentrant en Phase 1 sur les autres sous-points (autorité serveur, RBAC claims, SoD,
  workflow, cartes, policyEngine, secrets, storage) qui ne dépendent pas de cette décision.

**Je m'arrête ici sur ce point précis, conformément à la règle absolue du prompt**, et attends
votre arbitrage avant d'écrire le moindre code de cloisonnement organisationnel. Les autres
sous-points de la Phase 1 (1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9) ne dépendent pas de cette
décision et peuvent être engagés dès validation de cette cartographie.

---

## Récapitulatif des constats prioritaires pour la Phase 1

1. Lecture non cloisonnée par rôle/organisation sur la quasi-totalité des collections métier
   (section 1) — le plus large des constats, périmètre à trancher (section 11).
2. `storage.rules` totalement ouvert à tout utilisateur authentifié, sans scoping ni URL
   signée (section 7).
3. `server.ts` (`/api/policies/evaluate`, `/api/claims/validate-coverage`) fait confiance à des
   valeurs entièrement fournies par le client — aucune vérification serveur réelle malgré les
   apparences (section 3.2). `apiClient.ts` et la moitié des routes qu'il cible sont du code
   mort/inexistant.
4. Pas de contrôle de transition d'état sur `claims`/`enrollments` (une mise à jour peut passer
   n'importe quel statut valide vers n'importe quel autre, du moment que l'auteur n'est pas
   l'approbateur) — Phase 1.5.
5. Génération de carte : pas de mode "refus/file d'attente" si la Cloud Function est
   indisponible — repli actuel = écriture client directe (contraire à l'esprit strict de la
   Phase 1.6, bien que protégée par ailleurs contre le doublon).
6. `medicalForms` n'a pas de champ `createdBy` — la SoD serveur y est donc structurellement
   inapplicable en l'état ; à netre en Phase 1.4 comme un ajout de champ (jamais retiré) avant
   de pouvoir y appliquer une règle de non-auto-validation.
7. `resolveUserRole()` (Cloud Functions) corrigé le jour même de cette cartographie — à
   valider par un test automatisé en Phase 3, pas seulement par relecture.
8. Aucun Custom Claim n'est jamais posé (`setCustomUserClaims` introuvable) — la Phase 1.2 est
   donc à construire entièrement, pas à ajuster.

Aucune ligne de code métier n'a été modifiée pour produire ce document.
