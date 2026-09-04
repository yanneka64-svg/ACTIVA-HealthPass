# Phase 1 — Durcissement des Firestore Security Rules

Suite directe de `PHASE0_AUDIT.md`. Ce document décrit les changements apportés à
`firestore.rules`, la méthode de vérification utilisée, et ce qui est **volontairement laissé
de côté** dans cette passe (avec la raison), conformément à la règle de non-régression du brief.

## Changements appliqués

### 1. `healthPolicies` et `policyPayments` : écriture réservée à `isAdmin()`

**Avant** : `allow read, write: if isSignedIn();` — n'importe quel compte connecté (Agent,
Superviseur) pouvait suspendre une police ou modifier un paiement de prime directement via le
SDK Firestore, en contournant l'interface.

**Après** : `allow read: if isSignedIn(); allow write: if isAdmin();` — identique au modèle déjà
en place pour `organizations`/`providers`/`ceilings`.

**Preuve de non-régression** : recherche exhaustive dans `src/views` et `src/components` — les
seuls gestionnaires qui écrivent dans ces deux collections (`onSaveHealthPolicy`,
`onAddPolicyPayment`, `onDeletePolicyPayment`, définis dans `App.tsx`) ne sont transmis en props
qu'à `OrganizationsView`, rendue uniquement quand `effectiveSection === 'organizations'` — une
section réservée au rôle Admin dans `ROLE_ALLOWED_SECTIONS` (`src/utils/authUtils.ts`). Aucun
autre composant, quel que soit le rôle, n'appelle ces fonctions. Le changement de règle ne
modifie donc aucun comportement observable de l'application.

### 2. `claims`, `medicalForms`, `enrollments` : suppression réservée à `isAdmin()`

**Avant** : `allow update, delete: if isSignedIn();` — suppression ouverte à tout compte connecté.

**Après** : `update` reste `isSignedIn()` (inchangé — un Agent doit pouvoir continuer à modifier
ses propres dossiers), mais `delete: if isAdmin();` séparément.

**Preuve de non-régression** : `deleteClaim`, `deleteMedicalForm` et `deleteEnrollment`
(`src/services/firestore.ts`) n'ont **aucun appelant** dans `src/views` (recherche exhaustive :
0 résultat). Ce sont des fonctions de service exposées mais jamais invoquées par l'UI
actuelle — le changement de règle ne casse donc rien d'observable aujourd'hui, et empêche par
avance une suppression non autorisée si l'une de ces fonctions venait à être câblée sans
vérification de rôle. Conforme à la matrice de permissions existante
(`src/services/permissions.ts`), qui réserve explicitement la suppression d'un enregistrement au
rôle Admin.

## Méthode de vérification utilisée dans cette session

- Recherche exhaustive (`grep`) de tous les appelants de chaque fonction d'écriture concernée,
  pour confirmer qu'aucun flux Agent/Superviseur légitime n'est affecté.
- Vérification de la cohérence syntaxique du fichier `firestore.rules` (accolades équilibrées).
- `tsc --noEmit` et `npm run build` : propres (les règles Firestore ne sont pas compilées par ces
  outils, mais ceci confirme qu'aucune modification collatérale n'a été introduite ailleurs).

**Limite assumée** : je n'ai pas pu exécuter les règles contre l'émulateur Firestore dans cet
environnement (`firebase-tools` n'est pas installé et nécessiterait un accès réseau/CLI non
disponible ici). La vérification ci-dessus repose sur une analyse statique exhaustive du code
appelant, pas sur une exécution réelle des règles. Avant un déploiement en production, je
recommande de rejouer les 17 scénarios mentionnés dans les commentaires historiques de
`firestore.rules` (ou un jeu équivalent) sur l'émulateur Firestore, avec `firebase emulators:exec`.

## Volontairement NON traité dans cette passe — et pourquoi

### Séparation des tâches (SoD) sur l'approbation des `claims`/`medicalForms`/`enrollments`

Le brief demande qu'un Agent ne puisse jamais approuver son propre dossier, appliqué côté
serveur. La logique existe déjà côté client (`canApproveRecord()`,
`src/services/permissions.ts`), avec la règle : *"An Agent or author user can NEVER approve
their own record."*

**Pourquoi ce n'est pas traduit en règle Firestore dans cette passe** : `canApproveRecord()`
identifie l'auteur d'un enregistrement via une chaîne de repli sur plusieurs champs
(`createdBy`/`createdById`/`creatorEmail`/`agentName`/`creatorName`), **aucun n'étant un uid
Firebase Auth garanti présent et fiable** sur les interfaces `Claim`/`MedicalForm`/`Enrollment`
actuelles (`src/types/index.ts`) — ces champs sont optionnels et absents de la définition de
type. Une règle Firestore comparant `request.auth.uid` à un champ qui peut être absent,
incohérent, ou basé sur un nom/email plutôt qu'un uid, risquerait soit de ne rien bloquer
(si le champ est absent, la comparaison échoue silencieusement côté client aujourd'hui — pas
d'équivalent fiable côté règles), soit de **bloquer des approbations légitimes** si le champ
existe mais ne correspond pas exactement (casse, alias, compte migré) — ce qui violerait la
règle absolue de non-régression du brief.

**Prérequis avant de pouvoir le faire correctement** : ajouter un champ `createdByUid` (uid
Firebase Auth du créateur), écrit de façon fiable à la création par le code applicatif existant
(changement additif, non-destructif — n'affecte aucune donnée existante, les documents plus
anciens sans ce champ resteraient simplement non couverts par la règle SoD serveur tant qu'ils
n'auront pas été retouchés). C'est un changement de code applicatif (pas seulement de règles),
que je propose de faire dans une passe dédiée pour rester traçable et testable séparément.

**Ce qui reste vrai en attendant** : la règle SoD continue d'être appliquée côté client comme
aujourd'hui (aucune régression), et `update` reste réservé aux comptes connectés — ce n'est donc
pas une régression de sécurité par rapport à l'état actuel, seulement un écart qui persiste
et reste documenté ici plutôt que masqué.

## Vérification de non-régression (Phase 11, partielle — statique)

| Élément | Statut | Méthode |
|---|---|---|
| Build | PASS | `npm run build` |
| TypeScript | PASS | `tsc --noEmit` |
| Firestore Rules — syntaxe | PASS | Vérification manuelle (accolades) |
| Firestore Rules — non-régression fonctionnelle | PASS (analyse statique) | Recherche exhaustive des appelants ; **non rejoué sur émulateur dans cette session** |
| Cards / Claims / Policies / Excel Import / Audit | Non ré-exécuté | Aucun changement de code applicatif dans cette passe — seules les règles ont changé |

## Prochaine étape proposée

1. Si vous le souhaitez, rejouer les règles sur l'émulateur Firestore (je peux écrire les
   scénarios de test si `firebase-tools` est installable dans votre environnement, ou vous les
   remettre pour exécution locale).
2. Ajouter le champ `createdByUid` aux trois collections concernées (changement de code
   applicatif ciblé, additif) puis appliquer la vraie règle SoD côté serveur.
3. Poursuivre avec la Phase 8 (extension du contenu des `auditLogs` aux événements métier
   critiques), réalisable sans dépendance externe.
