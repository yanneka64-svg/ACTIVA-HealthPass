# Câblage des Cloud Functions au frontend (Phase 3/5), avec repli automatique

Suite de `CODE_REVIEW_3e3bea9.md`, qui constatait qu'aucune Cloud Function n'était appelée par
le frontend. Ce document décrit le câblage effectué, la stratégie de repli, et ce qui reste
volontairement non câblé.

## Stratégie : repli automatique, zéro risque de régression

Aucune Cloud Function n'est déployée aujourd'hui (pas de `firebase.json` dans ce dépôt, pas
d'accès CLI dans cet environnement). Chaque point câblé suit donc le même patron :

```
try {
  appeler la Cloud Function (httpsCallable)
} catch (n'importe quelle erreur — non déployée, hors-ligne, erreur serveur...) {
  logger un avertissement console
}
si la Cloud Function n'a pas réussi -> exécuter EXACTEMENT le code client existant, inchangé
```

Tant qu'aucune fonction n'est réellement déployée, ce câblage n'a **aucun effet observable** :
chaque appel échoue et retombe systématiquement sur le chemin client — comportement identique
à avant. Le jour où vous déployez les fonctions (`firebase deploy --only functions`, après
avoir créé un `firebase.json`), elles prennent le relais automatiquement, sans autre
changement de code.

C'est exactement l'architecture demandée par la Phase 5 du brief : *"Le frontend doit continuer
à appeler une fonction/service similaire afin de minimiser les changements UI [...] L'interface
ne doit pas avoir besoin de connaître les détails de la nouvelle architecture."*

## Ce qui a été câblé

| Cloud Function | Appelée depuis | Repli si échec |
|---|---|---|
| `generateCardNumber` | `src/services/cardNumberService.ts` → `generateNextCardNumber()` | Transaction Firestore cliente existante (inchangée) |
| `processClaimDecision` | `src/services/workflowService.ts` → `approveClaim()` / `rejectClaim()` | Mise à jour du claim + facture + audit log côté client (inchangé). La notification à l'Agent (sans équivalent serveur) est envoyée dans tous les cas. |
| `syncPolicy` | `src/services/workflowService.ts` → `syncPolicyStatuses()` | `FirestoreService.upsertHealthPolicy(...)` côté client (inchangé) |

Une correction a été nécessaire pendant le câblage : le payload envoyé à `syncPolicy` utilisait
`orgId` alors que la Cloud Function attend `organizationId` (`functions/src/index.ts`) — corrigé
avant de committer.

### Pourquoi `syncPolicy` mérite d'être câblé même si `firestore.rules` bloque déjà l'écriture directe

Le correctif HIGH précédent (voir `CODE_REVIEW_3e3bea9.md`) réserve la **réactivation** d'une
police (`coverageBlocked: true → false`) à Admin/Supervisor au niveau des règles Firestore. Une
session Agent seule ne peut donc plus réactiver une police en écrivant directement dans
Firestore. La Cloud Function `syncPolicy`, elle, s'exécute avec les privilèges admin du SDK
serveur (Firebase Admin SDK, qui contourne les règles Firestore par conception) et effectue
elle-même le calcul correct — c'est donc, une fois déployée, le seul chemin qui permette à une
session Agent de déclencher une réactivation automatique détectée par la synchronisation
périodique (`WorkflowService.syncPolicyStatuses`, exécutée par toute session authentifiée).

## Ce qui n'a volontairement PAS été câblé, et pourquoi

### `bulkImportMembers` (import Excel massif)

La Cloud Function `processBulkMemberImportServer` (`functions/src/importService.ts`) **crée
toujours de nouveaux membres** — elle n'a aucune notion de mise à jour d'un membre existant. Le
flux client actuel (`handleImportMembers`, `src/App.tsx`) fait explicitement la distinction :
`if (i.id && members.some(...)) updateMember() else addMember()`, pour permettre la
ré-importation d'un fichier contenant des assurés déjà enregistrés (mise à jour de leurs
informations) sans créer de doublons. Câbler cette fonction telle quelle aurait silencieusement
changé le comportement de l'import : toute ré-importation aurait créé des membres en double au
lieu de les mettre à jour — une régression de données réelle, pas seulement une question de
disponibilité. Non câblé tant que la Cloud Function ne supporte pas la mise à jour.

### `logAuditEvent` (journalisation d'audit)

La collection `auditLogs` est déjà **immuable côté règles Firestore** (create-only, update/delete
toujours refusés), que l'écriture vienne du client ou d'une Cloud Function — la garantie de
non-falsification recherchée est donc déjà assurée sans passer par le serveur. La forme des
données écrites par `logAuditEventServer` (`userId`/`userRole`/`category`/`severity`...) est
compatible avec `FirestoreService.addLog` déjà utilisé côté client (même collection, formes de
document proches) ; router systématiquement chaque appel via une Cloud Function n'apporterait
pas de garantie de sécurité supplémentaire, pour une complexité et un risque de latence/échec
ajoutés à chaque opération. Laissé tel quel (écriture cliente directe).

### `evaluatePolicy` / `validateCoverage` (lecture)

Ce sont des **lectures non critiques** au sens de la Phase 16 du brief ("LECTURES NON CRITIQUES
→ React → Firestore") : elles alimentent l'affichage (badges de statut, blocage visuel dans
l'UI) et n'ont pas besoin de passer par une Cloud Function, puisque la décision réellement
engageante (bloquer la création d'un claim/formulaire médical) est déjà appliquée côté serveur
par `firestore.rules` (`policyBlocksCoverage()`), indépendamment de ce que le client affiche.
Router aussi ces lectures fréquentes par Cloud Function ajouterait de la latence perceptible
sans bénéfice de sécurité réel.

## Vérification effectuée

- `tsc --noEmit` (app principale) : propre.
- `npm run build` (app principale, y compris `dist/server.cjs`) : propre.
- `tsc --noEmit` (`functions/`) : propre.
- Vérification manuelle de chaque nom de Cloud Function et de la forme exacte de son payload
  contre `functions/src/index.ts` (une incohérence de nom de champ trouvée et corrigée avant
  commit — voir ci-dessus).
- Non exécuté (aucune fonction déployée dans cet environnement) : un appel réel de bout en bout.
  Recommandé après déploiement, sur un projet de test avant la production.

## Prochaine étape pour activer réellement ces fonctions

1. Créer un `firebase.json` référençant `functions/` (absent aujourd'hui).
2. `firebase deploy --only functions` depuis un environnement avec la Firebase CLI connectée à
   votre projet.
3. Revenir sur `bulkImportMembers` : ajouter le support de mise à jour d'un membre existant à
   `processBulkMemberImportServer` avant de le câbler, pour ne pas perdre le comportement
   actuel de ré-import.
