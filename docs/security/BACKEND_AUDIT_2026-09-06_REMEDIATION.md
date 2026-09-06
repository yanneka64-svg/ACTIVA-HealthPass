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

## Actions humaines requises (cumulées, tous groupes)

1. **Urgent** : changer le mot de passe du compte `yannick.ekani_test@activa.local` dans Firebase
   Authentication (secret exposé dans l'historique git, à la fois dans `server.ts` — déjà retiré
   le 2026-09-05 — et dans `scripts/migratePlaintextPasswords.ts` — retiré le 2026-09-06).
2. Déployer les règles/fonctions réellement modifiées : `firebase deploy --only functions,firestore:rules,storage`.
3. Exécuter `scripts/auditOrgScopeCoverage.ts` (lecture seule) avec un accès Firestore de
   production pour chiffrer l'impact de SEC-FS-002, si une bascule est envisagée un jour.
4. Le cas échéant, exécuter `scripts/migratePlaintextPasswords.ts --dry-run` puis, après
   vérification du résultat, sans `--dry-run`, pour purger les mots de passe encore en clair
   dans `accounts` (SEC-AUTH-003 / DATA-04).
