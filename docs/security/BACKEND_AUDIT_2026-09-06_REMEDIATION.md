# Audit backend du 2026-09-06 — Suivi des correctifs

Ce document fait le point sur la checklist d'audit backend reçue le 2026-09-06 (findings
SEC-FS-001 à DATA-LOG-001, en 3 groupes de priorité). La grande majorité de ces findings
recoupent des constats déjà traités dans `docs/security/AUDIT_2026-09-05_REMEDIATION.md` (audit
du 2026-09-05, mêmes identifiants fonctionnels sous une autre nomenclature) — ce document ne
répète pas ce détail, il fait la correspondance et documente uniquement ce qui est nouveau ou
tranché aujourd'hui.

## Groupe 1 — CRITIQUE

| Finding | Statut | Détail |
|---|---|---|
| SEC-FS-001 (lecture publique `accounts`) | **Déjà corrigé** (session du 2026-09-05, `firestore.rules` SEC-01) | Voir `AUDIT_2026-09-05_REMEDIATION.md`. Revérifié le 2026-09-06 : `allow read: if isSignedIn() && (request.auth.uid == userId \|\| isAdmin())`, `LoginView.tsx` n'appelle plus jamais `getDocs(collection(db,'accounts'))`. |
| SEC-AUTH-001 (hash de mot de passe exposé) | **Déjà corrigé** (conséquence de SEC-FS-001, SEC-02) | Revérifié : aucun appel client ne peut plus lire `passwordHash`/`passwordSalt` d'un autre compte. |
| SEC-STOR-001 (`storage.rules` ouvert) | **Déjà corrigé** (SEC-04) | Revérifié : cloisonnement par organisation via custom claims déjà en place sur `member-photos/{orgId}/...` et `enrollment-photos/{orgId}/...`. |
| INFRA-001 (build/déploiement Cloud Functions) | **Vérifié, pas un correctif de code** | `cd functions && npm run build` → succès. `firebase.json` référence bien `functions`. **Action humaine requise** : `firebase deploy --only functions,firestore:rules,storage` (accès CLI authentifié requis, hors de portée de cette session). |

## Groupe 2 — ÉLEVÉ

| Finding | Statut | Détail |
|---|---|---|
| SEC-FS-002 (`hasOrgAccess()` ouvert par défaut) | **Décision : ne pas modifier** (identique à DATA-01, reconfirmée le 2026-09-06) | Inverser ce défaut sans connaître l'impact réel bloquerait immédiatement tout compte Agent/Supervisor sans `assignedOrganizations` renseigné — un risque de casse en production largement supérieur au bénéfice, sans donnée pour l'évaluer. `scripts/auditOrgScopeCoverage.ts` (lecture seule, nouveau) a été écrit pour produire ce chiffre le jour où quelqu'un avec un accès Firestore de production pourra l'exécuter ; **tant que ce chiffre n'est pas disponible et validé, le comportement actuel (ouvert par défaut, Admin toujours prioritaire) est conservé**. |
| SEC-AUTH-002 (rate limiting) | **Déjà corrigé et câblé** | `checkAndApplyRateLimit` (`functions/src/index.ts`) est appelé depuis `resolveLoginIdentifier`, elle-même appelée par `LoginView.tsx`. Rien à faire. |
| SEC-AUTH-003 (migration mots de passe en clair) | **Corrigé le 2026-09-06 (commit `7fad94b`)** | `scripts/migratePlaintextPasswords.ts` contenait une clé API Firebase et un couple e-mail/mot de passe réels **en clair, commis dans l'historique git déjà publié sur GitHub** — le même secret que celui déjà signalé compromis dans `server.ts` (voir la découverte non répertoriée en tête de `AUDIT_2026-09-05_REMEDIATION.md`), dupliqué dans ce second fichier. Retiré : le script lit désormais toutes ses valeurs sensibles depuis des variables d'environnement, sans valeur par défaut. Un mode `--dry-run` a été ajouté (journalise sans écrire). **Action humaine requise, urgente** : changer ce mot de passe dans Firebase Authentication — le retirer du fichier ne le retire pas de l'historique déjà publié. Script non exécuté par cette session. |
| SEC-APPCHECK-001 (Firebase App Check) | **Déjà en place, en mode observation** | `initializeAppCheck`/`ReCaptchaV3Provider` déjà initialisés côté client (`src/lib/firebase.ts`). Aucune application forcée : recherche exhaustive de `appCheck`/`AppCheck` dans `functions/src/index.ts`, `firestore.rules`, `storage.rules` → aucune occurrence. Conforme à la demande (observation avant obligation). |
| SEC-API-001/003 (routes Express sans appelant) | **Décision : conserver `/api/claims/validate-coverage` et `/api/audit/log`** (tranché le 2026-09-06) | `apiClient.ts` était déjà supprimé (session du 2026-09-05). Vérification exhaustive (`fetch(` dans `src/`) : `/api/policies/evaluate` a un appelant réel (`policyEngine.ts`) — à garder impérativement. `/api/claims/validate-coverage` et `/api/audit/log` n'ont aucun appelant, **mais** leurs commentaires internes montrent qu'elles ont été réécrites intentionnellement lors d'une phase antérieure de durcissement pour corriger de vraies failles (validation de couverture non fiable côté client ; log d'audit qui ne persistait jamais rien) — ce n'est pas du code mort hérité de `apiClient.ts`, mais un correctif de sécurité déjà écrit et fonctionnel, en attente d'un appelant. Les supprimer reviendrait à jeter un travail de durcissement déjà fait sans bénéfice de sécurité réel (les deux routes sont soit protégées par `requireAuth`, soit intentionnellement ouvertes pré-authentification en miroir exact de la règle Firestore `auditLogs`). **Conservées telles quelles.** Correction apportée en parallèle : `AUDIT_2026-09-05_REMEDIATION.md` (SEC-05) affirmait à tort que `/api/claims/validate-coverage` avait un appelant via `cardNumberService.ts` — c'est en réalité `/api/cards/continuity-report` qui est appelée par ce fichier ; corrigé dans ce document. |

## Groupe 3 — MOYEN

| Finding | Statut | Détail |
|---|---|---|
| MODEL-001 (`createdByUid` sur `medicalForms`) | **Déjà en place** | `MedicalForm.createdByUid` existe (`src/types/index.ts`), `createdByUidValid()` appliqué à la création (`firestore.rules`). Pas de logique d'auto-validation à bloquer sur cette collection : `medicalForms` n'a pas de notion d'approbation par un tiers (documenté dans `CODE_AUDIT_MAP.md`), contrairement à `claims`/`enrollments`. |
| SEC-FS-003 (machine à états explicite) | **Déjà en place** | `statusChangeAllowed()` (`firestore.rules`) rend le statut `approved` immuable sur `claims`/`enrollments`, appliqué et testé (57/57 tests de règles, dont les cas Phase 1.5). |
| DATA-LOG-001 (schéma du journal d'audit) | **Déjà en place** | `isPreAuthLoginLogValid()`/`isBusinessAuditLogValid()` (`firestore.rules`) généralisent déjà le principe demandé : schéma strict par type d'événement, vérifié contre tous les appelants réels de `FirestoreService.addLog`. |

## Résumé des décisions prises sans confirmation humaine préalable

Ces deux points avaient été explicitement soumis à l'utilisateur ; faute de pouvoir obtenir la
donnée manquante (accès Firestore de production) ou d'arbitrage produit supplémentaire,
l'utilisateur a délégué le choix. Décision prise selon le principe directeur du brief
("ne casse aucune fonctionnalité existante") :

1. **SEC-FS-002** : ne pas inverser le défaut de `hasOrgAccess()`. Un chiffre d'impact réel
   (via `scripts/auditOrgScopeCoverage.ts`) doit être obtenu avant toute bascule.
2. **SEC-API-001/003** : conserver `/api/claims/validate-coverage` et `/api/audit/log`. Ce sont
   des correctifs de sécurité déjà écrits, pas du code mort — les supprimer serait une régression
   de la posture de sécurité sans bénéfice réel.

## Conflit de fusion avec `main` (2026-09-06, après validation des Groupes 1-3)

Pendant que cette PR était ouverte, un commit direct sur `main` (`chore: update infrastructure
and dependencies`) a modifié plusieurs fichiers touchés par cette PR, créant un vrai conflit de
fusion — pas seulement textuel, mais fonctionnel sur deux points :

1. **`storage.rules`** : `main` a réécrit intégralement le fichier avec un durcissement
   MIME/taille/suppression (types de fichiers vérifiés, limites de taille, suppression réservée
   Admin, fermeture par défaut sur tout chemin non déclaré) — **sans avoir connaissance du
   cloisonnement par organisation** de cette PR (SEC-STOR-001). Prendre la version de `main`
   telle quelle aurait fait régresser ce cloisonnement ; garder uniquement la version de cette PR
   aurait perdu le nouveau durcissement. **Résolution : fusion des deux** — chaque chemin
   cloisonné par organisation porte désormais aussi la validation MIME/taille, et les nouveaux
   chemins anticipés par `main` (`claims`/`receipts`/`documents`, non encore utilisés par le code
   actuel) portent eux aussi un segment d'organisation, par cohérence. `tests/storage.rules.test.ts`
   (ajouté par `main`) mis à jour pour refléter cette fusion plutôt que cassé par elle.

2. **`functions/package.json`** : `main` a rétrogradé `firebase-functions` de `^7.3.2` à
   `^5.0.0` et `firebase-admin` de `^13.0.0` à `^12.0.0` ("downgrade SDKs for compatibility" —
   raison exacte non documentée dans le commit). Cette rétrogradation cassait intégralement la
   compilation de `functions/src/index.ts` (18 erreurs TypeScript) : le code de cette PR utilise
   la signature v2 `CallableRequest` (migration Phase 2, nécessaire sous v7), or sous v5 l'import
   générique `functions.https.*` résout vers l'API v1, qui n'a jamais eu `CallableRequest`.
   **Résolution : ni revenir à l'ancienne signature `(data, context)`, ni annuler la
   rétrogradation de `main`** (dont la raison n'est pas connue) — `firebase-functions@5.1.1`
   (version réellement installée) expose en fait très bien l'API v2 via l'import explicite
   `firebase-functions/v2/https` (vérifié dans `node_modules`) ; le code a été mis à jour pour
   importer `onCall`/`CallableRequest`/`HttpsError` depuis ce sous-module plutôt que depuis
   l'espace de noms générique — compatible avec v5 ET v7, donc avec les deux contraintes.
   **Effet secondaire noté, pas une régression nouvelle** : `npm audit` dans `functions/`
   remonte 17 vulnérabilités (15 modérées, 1 haute, 1 critique) sur les dépendances de
   `firebase-admin`/`firebase-functions` à ces versions — la sévérité "critique" concerne
   `vitest` (dépendance de développement uniquement, exploitable seulement si son serveur UI est
   exposé publiquement, ce qui n'est pas le cas ici) ; les autres recoupent les 13 findings
   MODÉRÉS déjà documentés et acceptés dans `AUDIT_2026-09-05_REMEDIATION.md`. Aucune nouvelle
   vulnérabilité critique de production identifiée, mais signalé ici pour traçabilité.

Vérifié après fusion : `npm run lint` (racine), `npm test` (37/37), tests de règles Firestore
sur émulateur (57/57), `cd functions && npx tsc --noEmit` et `npm test` (19/19), `npm run build`
(racine) — tous passent sans régression.

## Deuxième conflit de fusion avec `main` (2026-09-06, après le premier) — mot de passe compromis une seconde fois

Un second commit direct sur `main` (`chore: enhance security and add audit tools`) a réécrit
`scripts/migratePlaintextPasswords.ts` et `scripts/auditOrgScopeCoverage.ts`, et ajouté
`scripts/resetCompromisedPassword.ts`. Ces trois fichiers réintroduisaient, en clair, la clé API
Firebase et — plus grave — **le NOUVEAU mot de passe issu de la rotation** du compte
`yannick.ekani_test@activa.local` (`Activa#P@ss2026_DLgQmkuyVPyxClkS!`), codé en dur comme valeur
de repli dans deux fichiers différents. C'est exactement le même type d'erreur que celle déjà
corrigée le 2026-09-06 plus tôt dans la journée (voir plus haut) — la rotation du mot de passe
compromis a elle-même fini par recompromettre son remplaçant, très probablement en recopiant la
valeur affichée une fois par `resetCompromisedPassword.ts` à l'exécution directement dans le
code d'un autre script au lieu de la stocker dans un gestionnaire de secrets.

**Résolution** : fusion plutôt que choix d'un côté — la couverture d'audit multi-collections
apportée par la version de `main` (`members`/`claims`/`enrollments`/`invoices`/`medicalForms`/
`policyPayments`/`healthPolicies`, registre des organisations) est conservée dans
`auditOrgScopeCoverage.ts`, mais toute valeur sensible (clé API, e-mail, mot de passe) reste
exclusivement lue depuis une variable d'environnement dans les trois scripts, sans aucun repli
codé en dur. Revérifié après fusion : `npm run lint`, `npm test` (37/37), tests de règles
Firestore sur émulateur (57/57), `npm run build` — tous passent.

## Actions humaines requises (cumulées, tous groupes)

1. **Urgent, à nouveau** : le mot de passe `Activa#P@ss2026_DLgQmkuyVPyxClkS!` (censé remplacer
   le premier secret compromis) est LUI AUSSI désormais exposé dans l'historique git déjà publié
   sur GitHub — il doit être changé une deuxième fois dans Firebase Authentication, cette fois-ci
   en prenant soin de ne JAMAIS le recopier en dur dans un fichier commité (voir
   `scripts/resetCompromisedPassword.ts`, qui l'affiche une seule fois sur la sortie standard
   pour être noté dans un gestionnaire de secrets — pas dans un autre script).
2. Déployer les règles/fonctions réellement modifiées : `firebase deploy --only functions,firestore:rules,storage`.
3. Exécuter `scripts/auditOrgScopeCoverage.ts` (lecture seule) avec un accès Firestore de
   production pour chiffrer l'impact de SEC-FS-002, si une bascule est envisagée un jour.
4. Le cas échéant, exécuter `scripts/migratePlaintextPasswords.ts --dry-run` puis, après
   vérification du résultat, sans `--dry-run`, pour purger les mots de passe encore en clair
   dans `accounts` (SEC-AUTH-003 / DATA-04).

## Décision : le compte `yannick.ekani_test@activa.local` expose l'application à un risque

Ce compte a vu son mot de passe compromis à deux reprises (voir sections ci-dessus) et sert par
ailleurs de compte à privilèges élevés à des scripts d'exploitation (`migratePlaintextPasswords.ts`,
`auditOrgScopeCoverage.ts`) qui lisent l'intégralité de la collection `accounts` — ce que
`firestore.rules` n'autorise qu'à un compte `profile: 'Admin'`. Deux options ont été évaluées :

- **Suppression** (Firebase Auth + document `accounts/{id}`) : coupe l'accès immédiatement, mais
  Firestore ne supprime rien en cascade — tout document historique (claims, enrollments, logs
  d'audit) référençant l'UID de ce compte comme auteur/acteur deviendrait orphelin (UID non
  résolvable dans l'historique). Irréversible.
- **Désactivation** (`isActive: false` sur le document `accounts/{id}`, compte Auth conservé mais
  inutilisable dans l'app) : bloque la connexion et **toute écriture** — `isActive` est vérifié à
  la fois côté client (`src/components/auth/LoginView.tsx`) et côté règles (`isActiveUser()` dans
  `firestore.rules`, qui conditionne la quasi-totalité des `allow create/update`). Préserve
  l'historique/audit trail (le compte reste résolvable par nom) et reste réversible.

**Décision retenue : désactivation**, comme mesure immédiate et proportionnée au risque, sans les
effets de bord irréversibles d'une suppression. La suppression définitive peut être reconsidérée
plus tard, une fois confirmé qu'aucune donnée métier ne référence encore son UID.

// === AMÉLIORATION AJOUTÉE : sécurité (2026-09-06) ===
Nouveau script `scripts/deactivateCompromisedAccount.ts` (lecture + une seule écriture ciblée,
`isActive: false`), suivant le même modèle que `resetCompromisedPassword.ts` : toutes les
identités/secrets requis via variables d'environnement uniquement, mode `--dry-run` pour valider
la cible avant écriture, garde-fou explicite empêchant qu'un compte s'auto-désactive (le champ
`isActive` est de toute façon figé au self-update par `firestore.rules`). Ce script n'a PAS été
exécuté contre la production depuis cette session — aucun accès Firestore de production n'est
disponible ici : c'est une **action humaine requise**, ajoutée à la liste ci-dessus :

5. **Exécuter `scripts/deactivateCompromisedAccount.ts`** (d'abord `--dry-run` pour confirmer la
   cible, puis sans) avec `ADMIN_EMAIL`/`ADMIN_PASSWORD` d'un **autre** compte Admin actif et
   `TARGET_ACCOUNT_EMAIL=yannick.ekani_test@activa.local`, pour désactiver ce compte compromis.
   Si le mot de passe compromis n'a pas déjà été changé une seconde fois (action 1 ci-dessus),
   le faire dans la foulée via `scripts/resetCompromisedPassword.ts`.
