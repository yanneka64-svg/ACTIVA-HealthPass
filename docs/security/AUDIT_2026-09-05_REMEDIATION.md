# Audit de sécurité du 2026-09-05 — Suivi des correctifs

Ce document fait le point, constat par constat, sur l'audit de sécurité informatique et
d'authentification, de protection des données, de modélisation, de structure, d'infrastructure
et de fiabilité daté du 2026-09-05. Il distingue ce qui a été corrigé dans le code de ce dépôt
lors de cette session de ce qui reste une action opérationnelle (déploiement, configuration
console/GitHub) hors de portée d'une session sans accès à la console Firebase ni aux
identifiants de déploiement du projet réel.

## Découverte non répertoriée dans l'audit — CRITIQUE

**Identifiant et mot de passe codés en dur dans `server.ts`.** La fonction
`ensureServerServiceAuth()` (supprimée dans ce lot) authentifiait le serveur contre Firebase
Auth avec l'e-mail `yannick.ekani_test@activa.local` et le mot de passe `ActivaJKC8Q@!2025`
écrits en clair dans le code source, donc versionnés dans l'historique Git.
**Action requise, indépendamment de ce correctif de code** : un administrateur doit changer ce
mot de passe dans Firebase Authentication dès que possible ; ce secret doit être considéré
comme compromis.

## 6.1 Sécurité informatique et authentification

| # | Statut | Détail |
|---|---|---|
| SEC-01 | **Corrigé** | `firestore.rules` : `accounts` n'est plus lisible qu'en tant que propriétaire ou Admin (`allow read: if true` retiré). `LoginView.tsx` ne lit plus jamais la collection `accounts` avant authentification ; la résolution identifiant → e-mail et la vérification legacy passent exclusivement par la Cloud Function `resolveLoginIdentifier`. Deux chemins de repli dans `App.tsx` qui scannaient encore l'intégralité de `accounts` (listener `onAuthStateChanged` et bouton "Retry" de l'écran `invalid_role`) ont été corrigés pour utiliser la Cloud Function `ensureUserAccount` à la place — ils auraient sinon échoué silencieusement après le retrait de la lecture publique. |
| SEC-02 | **Corrigé (architecturalement)** | La vérification de mot de passe ne s'exécute plus jamais côté client (retrait de la comparaison hash/clair dans `LoginView.tsx`) ; elle est désormais exclusivement effectuée par la Cloud Function `resolveLoginIdentifier` (SDK Admin, PBKDF2, jamais de secret renvoyé). Cible à terme (non traitée ici, nécessite une décision produit) : migrer entièrement vers Firebase Authentication comme source unique, sans duplication de mot de passe dans Firestore. |
| SEC-03 | **Action manuelle requise** | Nécessite de se connecter à la console Firebase du projet réel pour comparer les règles publiées aux règles du dépôt — impossible depuis cette session (pas d'accès à la console ni au CLI authentifié pour ce projet). |
| SEC-04 | **Corrigé** | `storage.rules` cloisonne désormais `member-photos/{orgId}/...` et `enrollment-photos/{orgId}/...` par organisation, via les custom claims déjà posés par la Cloud Function `syncAccountClaims` (pas de dépendance à `firestore.get()`, qui ne cible que la base Firestore "(default)" — incompatible avec la base nommée de ce projet). `storageUtils.ts` et les 3 sites d'upload (`EnrollmentsView.tsx`, `MembersView.tsx`, `AgentEnrollmentsView.tsx`) construisent désormais le chemin avec l'organisation. Les fichiers déjà déposés sous l'ancien format plat restent lisibles (règle de compatibilité dédiée) — aucune régression sur les photos existantes. **Nécessite `firebase deploy --only storage` pour prendre effet.** |
| SEC-05 | **Corrigé** | Les routes `/api/auth/lookup-account` et `/api/auth/verify-legacy-credentials` (qui contenaient le secret codé en dur ci-dessus et dupliquaient, avec un rate limiting non persistant, `resolveLoginIdentifier`) ont été supprimées. `apiClient.ts`, confirmé sans aucun appelant dans `src/`, a été supprimé. **Correction du 2026-09-06** : cette ligne affirmait à tort que `/api/claims/validate-coverage` avait un appelant réel via `cardNumberService.ts` — vérification refaite (recherche exhaustive de `fetch(` dans `src/`) : `cardNumberService.ts` appelle en réalité `/api/cards/continuity-report`, pas `/api/claims/validate-coverage`. Seule `/api/policies/evaluate` (`policyEngine.ts`) a un appelant réel confirmé. `/api/claims/validate-coverage` et `/api/audit/log` n'ont aucun appelant, mais ne sont **pas** du code mort hérité de `apiClient.ts` : voir la décision documentée dans `docs/security/BACKEND_AUDIT_2026-09-06_REMEDIATION.md` (finding SEC-API-001/003) — conservées intentionnellement, ce sont des correctifs de sécurité déjà écrits (validation de couverture non fiable côté client, log d'audit qui n'écrivait jamais rien) en attente d'un appelant, toutes deux déjà protégées par `requireAuth` sauf `/api/audit/log` (ouverte pré-authentification par nécessité, en miroir de la règle Firestore `auditLogs`). |
| SEC-06 | **Déjà en place (code) — déploiement à confirmer** | Le rate limiting serveur existe déjà dans `resolveLoginIdentifier` (Firestore `login_rate_limits`, 5 tentatives/60s). Voir INFRA-01 : nécessite la confirmation du déploiement des Cloud Functions. |
| SEC-07 | **Corrigé (ReportsView)** | `canExportData()` est désormais appelée dans `ReportsView.tsx` ; les 3 boutons Export ne sont rendus que pour Supervisor/Admin, en défense en profondeur du filtrage déjà fait par `Sidebar.tsx`. Le reste de la recommandation (miroir systématique de chaque permission d'écran dans les règles Firestore) est déjà largement en place pour les actions d'écriture sensibles (approve/reject/delete). |

## 6.2 Protection des données personnelles, médicales et biométriques

| # | Statut | Détail |
|---|---|---|
| DATA-01 | **Non modifié — décision produit requise** | Le code documente déjà explicitement ce choix comme un arbitrage produit délibéré (rétrocompatibilité). Inverser le défaut sans campagne de configuration préalable des comptes existants bloquerait immédiatement tout Agent/Supervisor sans `assignedOrganizations` explicitement renseigné — l'audit recommande lui-même de trancher au niveau produit avant bascule. |
| DATA-02 | **Non câblé** | La Cloud Function `getSignedFileUrl` existe déjà et est prête ; son câblage dans tous les affichages de photo (`<img src=...>`) à travers l'application est un changement transverse que cette session n'a pas les moyens de valider visuellement de façon exhaustive — laissé tel que déjà documenté dans le code existant. |
| DATA-03 | **Corrigé** | `firestore.rules` : les écritures authentifiées sur `auditLogs` doivent désormais correspondre à l'une des deux formes réellement utilisées dans le code (journal de connexion, ou journal d'action métier `{userId, action, category, ...}`) — vérifié exhaustif contre tous les appelants de `FirestoreService.addLog`. Les 48 tests de règles sur émulateur passent toujours après ce changement. |
| DATA-04 | **Action manuelle requise** | `scripts/migratePlaintextPasswords.ts` existe déjà ; son exécution contre la base de production nécessite des identifiants Admin SDK que cette session n'a pas. |

## 6.3 Modélisation des données

| # | Statut | Détail |
|---|---|---|
| MODEL-01 | **Déjà corrigé avant cette session** | `MedicalForm.createdByUid` était déjà présent dans `src/types/index.ts` et déjà renseigné à la création (`App.tsx`). Vérifié, aucune action nécessaire. |
| MODEL-02 | **Décision produit non tranchée** | Hors périmètre code — nécessite un arbitrage produit explicite. |
| MODEL-03 | **Non modifié — vérification produit requise** | Je n'ai pas pu localiser avec certitude, dans le code actuel, un flux qui fait repasser un dossier `returned` à `pending` (résubmission après retour pour correction). Imposer une machine à états stricte sans cette certitude risquait de bloquer un flux de production réel. À vérifier avec l'équipe produit/QA avant d'implémenter la machine à états complète. |
| MODEL-04 | **Non modifié** | Risque de régression élevé sur des flux de compte déjà substantiellement modifiés dans ce même lot (SEC-01/SEC-02) ; à traiter séparément, avec ses propres tests de non-régression. |

## 6.4 Structure du projet et qualité du code

| # | Statut | Détail |
|---|---|---|
| STRUCT-01 | **Déjà fait** | `scripts/archive/README.md` documente déjà explicitement que ces scripts sont conservés à titre historique et ne doivent plus être exécutés. |
| STRUCT-02 | **Corrigé** | `apiClient.ts` et les routes serveur orphelines correspondantes ont été supprimés (voir SEC-05). |
| STRUCT-03 | **Corrigé** | Commentaire ajouté dans `firestore.rules` documentant explicitement `accounts` comme unique source de vérité active et `users` comme filet de compatibilité résiduel. |

## 6.5 Infrastructure et déploiement

| # | Statut | Détail |
|---|---|---|
| INFRA-01 | **Action manuelle requise** | Déploiement de `functions/`, `firestore.rules` et `storage.rules` sur le projet Firebase réel — nécessite des identifiants IAM que cette session n'a pas. |
| INFRA-02 | **Action manuelle requise** | Exécuter `firebase deploy --only firestore:rules,storage` et vérifier en console. |
| INFRA-03 | **Action manuelle requise** | Configuration de protection de branche GitHub — hors périmètre code, nécessite un accès aux paramètres du dépôt. |
| INFRA-04 | **Action manuelle requise** | Déploiement de bout en bout en environnement de recette dédié. |

## 6.6 Fiabilité de l'application

| # | Statut | Détail |
|---|---|---|
| FIAB-01 | **Non implémenté** | Un script de comparaison automatisée dépôt/production nécessiterait un accès Firebase CLI authentifié non disponible dans cette session. |
| FIAB-02 | **Corrigé** | Nouveau module `src/utils/fallbackTelemetry.ts` : chaque repli silencieux vers la logique client (`policyEngine.evaluatePolicyWithServer`, `cardNumberService.generateNextCardNumber`) journalise désormais un événement `SERVER_FALLBACK_TRIGGERED` dans `auditLogs` (catégorie "Reliability"), avec anti-spam de 5 minutes par type de repli — sans jamais bloquer ni ralentir l'appelant. |
| FIAB-03 | **Non implémenté** | Tests de bout en bout par rôle — recommandé comme prochaine étape, hors budget de cette session. |

## Vérifications effectuées

- `npm run lint` (tsc --noEmit) : aucune erreur.
- `npm test` (vitest, hors règles Firestore) : 21/21 tests passent.
- `npm run test:rules` (règles Firestore sur émulateur, via `firebase emulators:exec`) : 48/48
  tests passent — y compris après le retrait de la lecture publique de `accounts` et le
  resserrement du schéma de `auditLogs`.
- `npm run build` : build de production réussi (Vite + esbuild pour `server.ts`).
