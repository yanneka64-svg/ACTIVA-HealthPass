# Phase 1 — Cartographie et sécurisation immédiate — Rapport

**Date :** 17 Septembre 2026
**Portée :** exactement les 6 points de la Phase 1 demandée. Aucune logique métier touchée.

## 0. Constat préalable important

Avant d'exécuter quoi que ce soit, j'ai vérifié l'état réel du dépôt point par point plutôt que
de partir du principe que la description de dette technique fournie correspondait à l'état
actuel. **Une bonne partie du travail demandé en Phase 1 a déjà été effectuée lors d'une session
de durcissement antérieure**, documentée et committée sur `main` avant le début de cette
conversation (`AUDIT_AND_HARDENING_REPORT.md`, `HEALTHPASS_2_0_DISCOVERY.md`, et 17 documents
sous `docs/security/`). Je le signale explicitement plutôt que de refaire un travail déjà fait,
ou pire, de le refaire différemment et créer une divergence.

## 1. Scripts `fix_*`/`patch_*`/`update_*` à la racine

**Constat : aucun de ces scripts n'est présent à la racine aujourd'hui.** Recherche exhaustive
effectuée (`find . -maxdepth 1 -iname "fix_*|patch_*|update_*|account_update*"`) : rien.

Ils existent, mais déjà déplacés et documentés dans `scripts/archive/`, avec un README dédié
(`scripts/archive/README.md`) qui fait exactement ce que demande cette Phase 1 : un tableau
récapitulatif des 24 scripts historiques (nom, fichier ciblé, contexte), leur statut ("tous déjà
exécutés une fois contre un état antérieur du dépôt, désormais obsolètes/inertes — le motif de
code qu'ils recherchent via `String.replace` ne correspond plus au fichier cible actuel"), et la
confirmation qu'aucun n'est référencé par `package.json` ni importé par du code applicatif.
Aucun n'a été supprimé — uniquement archivé, conformément à la règle absolue.

**Ce qui existe en plus, et qui sert un usage réellement récurrent** (donc distinct des scripts
`fix_*` ponctuels) : `scripts/` contient aujourd'hui 7 scripts d'administration/migration
actifs et documentés — `resetCompromisedPassword.ts`, `migratePlaintextPasswords.ts`,
`auditOrgScopeCoverage.ts`, `revokeCompromisedAccountAccess.ts`, `rotatePasswordNoHardcode.ts`,
`deactivateCompromisedAccount.ts`, `loadtest.mjs`. Je ne les ai pas audités ligne à ligne dans
cette passe (hors périmètre strict de la demande, qui visait les scripts `fix_*`/`patch_*`) —
à faire si vous le souhaitez en complément.

**Action prise :** aucune — le travail demandé existe déjà et est correctement documenté.

## 2. Déplacement vers `scripts/migrations/` + confirmation interactive + logs

**Non fait, et je recommande de ne PAS le faire tel quel.** Les scripts archivés sont
explicitement décrits (par leur propre documentation) comme **inertes et non rejouables** ("la
plupart planteraient s'ils étaient relancés — fichier source introuvable, motif de remplacement
absent du fichier actuel"). Les déplacer vers un dossier `scripts/migrations/` en leur ajoutant
une confirmation interactive suggérerait qu'ils sont destinés à être ré-exécutés un jour, ce qui
contredit leur nature réelle (trace historique de codemods ponctuels, pas un outillage de
migration réutilisable). Les 7 scripts actifs listés au point 1 sont déjà dans `scripts/`
(racine du dossier, pas dans un sous-dossier `migrations/`) — je n'ai pas déplacé ces scripts-là
sans un signal clair que la convention de dossier doit changer, pour ne pas casser une
référence externe (README, procédure d'astreinte) que je n'aurais pas vue.

**Question pour vous avant d'agir plus loin sur ce point :** voulez-vous que je (a) renomme
`scripts/archive/` en autre chose, (b) ajoute une confirmation interactive aux 7 scripts actifs
existants (qui n'en ont peut-être pas tous aujourd'hui — à vérifier), ou (c) laisse cette
organisation telle quelle puisqu'elle remplit déjà l'objectif de traçabilité/réversibilité ?

## 3. `@google/genai` côté client

**Constat : cette dépendance n'existe pas dans ce dépôt.** Recherche dans `package.json`
(racine et `functions/`) et dans tout le code source : aucune occurrence. Ce point de la
description ne s'applique pas à l'état actuel de ce projet — peut-être un résidu d'une
description générique de dette technique typique des apps générées par Google AI Studio, pas
une observation spécifique à ce dépôt.

**Action prise :** aucune (rien à corriger).

## 4. Rôle du serveur Express (`server.ts`)

**Lu intégralement (17 Ko).** Ce n'est pas un serveur mystérieux : il sert le build Vite en
production et expose une poignée d'endpoints API précis, déjà intégrés au code applicatif
existant (pas un ajout orphelin) :

| Endpoint | Protection | Usage |
|---|---|---|
| `GET /api/health` | Aucune (health check) | Sonde de disponibilité |
| `POST /api/cards/verify-format`, `/api/cards/continuity-report` | Aucune (validation de format, pas de donnée sensible) | `cardNumberService.ts` |
| `POST /api/policies/evaluate` | `requireAuth` | Repli serveur de `policyEngine.ts` (`evaluatePolicyWithServer`) |
| `POST /api/claims/validate-coverage` | `requireAuth` | Validation serveur de couverture avant décision de sinistre |
| `POST /api/audit/log` | — (à vérifier si authentifié, voir ci-dessous) | Journalisation d'audit |

Le middleware `requireAuth` (lignes 65-80) vérifie un vrai jeton Firebase (`getAuth().verifyIdToken`)
via le SDK Admin — pas un placeholder, pas un secret en dur : `firebase-admin` s'initialise sans
argument (`initializeApp()`), donc via les identifiants par défaut de l'environnement (aucune clé
de compte de service committée — vérifié aussi au point 5). Répond `503` si le SDK Admin n'est
pas configuré plutôt que de laisser passer une requête non vérifiée (fail-closed).

**Rien d'anormal trouvé.** Ce serveur a un rôle clair et documenté (voir aussi
`docs/security/PHASE5_CLOUD_FUNCTIONS_WIRING.md`), sert exactement les cas où une décision
métier a besoin d'une vérification serveur — ce qui va justement dans le sens de la règle
absolue n°3 de ce brief ("aucune décision métier sensible... uniquement côté client").

## 5. Secrets et configuration

- **`.env.example`** : vérifié — ne contient QUE des noms de variables, aucune valeur (`APP_URL=`,
  `FIREBASE_API_KEY=`, etc., tous vides). Rien à corriger.
- **`firebase-applet-config.json`** : contient une `apiKey` Firebase en clair — **ce n'est pas un
  secret par conception** : la clé API Web Firebase est un identifiant public (elle doit être
  embarquée dans le bundle client pour que le SDK fonctionne ; la sécurité réelle vient des
  règles Firestore/Storage + App Check, jamais de la confidentialité de cette clé). Je le
  précise explicitement pour éviter une fausse alerte lors d'un futur audit.
- **`firebase-blueprint.json`** — **trouvaille réelle, à traiter** : ce fichier définit un jeu de
  règles Firestore radicalement plus permissif que les règles réellement déployées
  (`"accounts": { read: true }`, `"write": "request.auth != null"` pour absolument toutes les
  collections métier — équivalent à "tout utilisateur connecté peut tout lire/écrire"). Vérifié :
  **ce fichier n'est référencé nulle part** dans le code, les scripts, ou la CI (recherche
  exhaustive). C'est un vestige du gabarit AI Studio initial, jamais lu par l'application — les
  vraies règles vivent exclusivement dans `firestore.rules` (durci, testé par 89 tests
  d'émulateur). Il est aujourd'hui totalement inerte, mais **trompeur** pour quiconque l'ouvrirait
  en pensant qu'il reflète la sécurité réelle. **Je recommande de le supprimer** (aucune
  référence trouvée = aucun risque de casse) plutôt que de le garder comme confusion potentielle
  — mais je n'ai pas supprimé ce fichier de configuration sans votre confirmation explicite,
  conformément à la prudence demandée sur tout ce qui touche à la sécurité/configuration.
- **`bun.lock`** : coexiste avec `package-lock.json`. **Déjà documenté** dans `README.md`
  ("un `bun.lock` est aussi présent mais non utilisé par la CI ; préférer npm"). Pas une
  découverte nouvelle, déjà tranché.
- **Nettoyage effectué (sans risque)** : suppression d'un `firestore-debug.log` local de 1,8 Mo
  (sortie de l'émulateur Firestore utilisé pendant mes propres tests cette session) — déjà
  couvert par `*.log` dans `.gitignore`, jamais suivi par git, aucune perte possible.

## 6. Renommage de `package.json`

**Fait.** `"name": "react-example"` → `"name": "activa-healthpass"`, dans `package.json` ET
`package-lock.json` (les deux doivent rester synchronisés pour que `npm ci` reste valide).
Aucune autre référence à `"react-example"` trouvée nulle part dans le dépôt.

**Vérifié après coup :** `tsc --noEmit` propre, `npm test` — 120/120 tests verts (l'en-tête de
sortie de npm affiche maintenant `activa-healthpass@0.0.0` au lieu de `react-example@0.0.0`,
confirmant la prise en compte).

## Tableau récapitulatif demandé (point 1)

| Élément | Statut réel constaté | Action recommandée |
|---|---|---|
| 24 scripts `fix_*`/`patch_*`/`update_*` | Déjà archivés + documentés (`scripts/archive/README.md`) | Aucune — déjà fait |
| 7 scripts d'administration actifs (`scripts/*.ts`) | Existent, non audités en détail dans cette passe | Audit de détail si souhaité (hors périmètre initial) |
| `@google/genai` côté client | N'existe pas dans ce dépôt | Aucune |
| `server.ts` (Express) | Rôle clair, `requireAuth` correctement implémenté, fail-closed | Aucune |
| `.env.example` | Propre (aucune valeur) | Aucune |
| `firebase-applet-config.json` | Clé publique par conception, pas un secret | Aucune (juste documenté ici pour éviter une fausse alerte future) |
| `firebase-blueprint.json` | Vestige inerte, non référencé, règles trompeuses | **Recommandé : suppression — en attente de votre confirmation** |
| `bun.lock` | Déjà documenté comme non utilisé par la CI | Aucune |
| `firestore-debug.log` | Fichier local transitoire, déjà gitignoré | Supprimé localement |
| `package.json` name | `"react-example"` | **Fait : renommé en `"activa-healthpass"`** |

## Ce qui n'a PAS changé (comportement préservé)

Aucun flux métier, aucune règle Firestore, aucune collection, aucun composant React n'a été
modifié dans cette passe. Les deux seuls changements de fichiers sont : le nom du projet dans
`package.json`/`package-lock.json`, et la suppression d'un fichier de log local jamais suivi par
git.

## Risques résiduels identifiés

1. `firebase-blueprint.json` reste dans le dépôt tant que vous n'avez pas confirmé sa
   suppression — risque de confusion pour un futur audit, aucun risque d'exécution (fichier
   inerte).
2. Les 7 scripts d'administration actifs (`scripts/*.ts`) n'ont pas été audités individuellement
   dans cette passe — statut de confirmation interactive/logs horodatés non vérifié pour chacun.

**Phase 1 terminée. En attente de votre validation explicite avant de passer à la Phase 2**,
conformément à votre instruction.
