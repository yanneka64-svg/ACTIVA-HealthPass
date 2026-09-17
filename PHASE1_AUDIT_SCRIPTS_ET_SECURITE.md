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

### 1.bis Audit détaillé des 7 scripts actifs (`scripts/*.ts`, `scripts/loadtest.mjs`)

Chaque script a été lu intégralement. Aucun ne contient de secret en dur (tous exigent leurs
identifiants/clés via variables d'environnement, avec `requireEnv()` qui échoue explicitement si
absent) — cohérent avec l'historique documenté dans leurs propres en-têtes
(`docs/security/BACKEND_AUDIT_2026-09-06_REMEDIATION.md` : plusieurs réintroductions accidentelles
de secrets en dur, corrigées à chaque fois).

| Script | Opération | `--dry-run` | Confirmation interactive avant écriture | Log horodaté persisté sur disque | Secret en dur |
|---|---|---|---|---|---|
| `resetCompromisedPassword.ts` | Écriture Auth (mot de passe, SDK client) | **Non** | Non | Non (console uniquement) | Aucun |
| `migratePlaintextPasswords.ts` | Écriture Firestore `accounts` (bulk, PBKDF2-SHA256 150k iter.) | Oui | Non (le flag suffit à passer en LIVE) | Non (console uniquement) | Aucun |
| `auditOrgScopeCoverage.ts` | Lecture seule | N/A | N/A | Non (console uniquement) | Aucun |
| `revokeCompromisedAccountAccess.ts` | Écriture Auth (disable + révocation tokens, SDK Admin + ADC) | Oui | Non | Non (console uniquement) | Aucun |
| `rotatePasswordNoHardcode.ts` | Écriture Auth (mot de passe) + écriture `.env.local` (0600, gitignored) | **Non** | Non | Non (seul le nouveau credential est écrit, pas un log d'exécution) | Aucun |
| `deactivateCompromisedAccount.ts` | Écriture Firestore `accounts.isActive` | Oui | Non (garde-fou automatique : refuse si admin = cible) | Non (console uniquement) | Aucun |
| `loadtest.mjs` | Aucune écriture — HTTP vers endpoints publics uniquement | N/A | N/A | Non (console uniquement) | Aucun |

**Constat :** ce sont des outils manuels de type "break-glass" (opérateur humain, jamais planifiés
ni appelés par l'application ou la CI), pas un risque d'exécution automatique non désirée. Deux
lacunes réelles, identiques sur les 7 scripts :

1. **Aucune confirmation interactive** ("tapez OUI pour continuer") avant une écriture réelle —
   4 scripts s'appuient uniquement sur le flag `--dry-run` (opt-in, pas de garde-fou si l'opérateur
   omet le flag par erreur) ; 2 scripts (`resetCompromisedPassword.ts`,
   `rotatePasswordNoHardcode.ts`) n'ont même pas de mode `--dry-run`.
2. **Aucun log d'exécution horodaté persisté sur disque** — toute la sortie va uniquement sur la
   console (perdue si l'opérateur ne la redirige pas lui-même vers un fichier).

**Hardening implémenté (validé par vous le 2026-09-17) :** ajout de `scripts/lib/opsSafety.ts`,
un helper partagé strictement additif fournissant :

- `confirmLiveWrite(description)` : invite interactive ("Tapez OUI en majuscules pour confirmer")
  posée juste avant chaque écriture réelle (Firestore ou Firebase Auth) des 5 scripts qui
  écrivent — `resetCompromisedPassword.ts`, `migratePlaintextPasswords.ts`,
  `revokeCompromisedAccountAccess.ts`, `rotatePasswordNoHardcode.ts`,
  `deactivateCompromisedAccount.ts`. Contournable explicitement par `CONFIRM=yes` (usage non
  interactif assumé) ; sans TTY et sans `CONFIRM=yes`, l'opération est refusée avec une erreur
  claire plutôt que de rester bloquée silencieusement.
- `startOpsLog(nomScript)` : journal d'exécution horodaté persisté dans
  `scripts/logs/<nom-script>-<horodatage>.log` (déjà couvert par la règle `*.log` existante du
  `.gitignore` — vérifié avec `git check-ignore`), en complément de la sortie console existante
  (jamais à sa place). Appliqué aux 6 scripts TypeScript, y compris `auditOrgScopeCoverage.ts`
  (lecture seule — journal ajouté pour traçabilité, sans invite de confirmation puisqu'aucune
  écriture n'y est faite).
- **Vigilance appliquée** : dans `resetCompromisedPassword.ts`, le nouveau mot de passe en clair
  reste affiché uniquement sur `console.log` (jamais routé vers `ops.log`/le fichier persisté),
  conformément à l'intention de sécurité déjà documentée dans l'en-tête de ce script. Vérifié
  fichier par fichier qu'aucun des 5 scripts d'écriture ne fait désormais transiter un secret en
  clair vers le journal disque (`rotatePasswordNoHardcode.ts` ne logue qu'une empreinte SHA-256
  tronquée, jamais le mot de passe lui-même).
- **`loadtest.mjs` volontairement non modifié** : aucune écriture, JavaScript pur exécuté via
  `node` (pas `tsx`) — ajouter une dépendance croisée vers un helper TypeScript aurait été
  disproportionné pour un outil de diagnostic ponctuel jamais exécuté en production.
- Testé fonctionnellement (script jetable, non committé) : confirmation refusée sans TTY ni
  `CONFIRM=yes`, acceptée avec `CONFIRM=yes`, log correctement écrit sur disque avec horodatage.
- Validation de non-régression : `tsc --noEmit` propre, `npm test` 120/120 passing (aucun test
  n'exerce ces scripts, cohérent avec leur nature d'outils opérationnels hors application).

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
- **`firebase-blueprint.json`** — vestige inerte du gabarit AI Studio initial, définissant des
  règles Firestore radicalement plus permissives et trompeuses par rapport aux vraies règles
  déployées (`firestore.rules`, durci, testé par 89 tests d'émulateur). Confirmé non référencé
  nulle part (code, scripts, CI). **Supprimé, avec votre confirmation explicite du 2026-09-17.**
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
| 7 scripts d'administration actifs (`scripts/*.ts`, `scripts/loadtest.mjs`) | Audités en détail (voir §1.bis) : aucun secret en dur | **Fait : hardening implémenté (`scripts/lib/opsSafety.ts`) sur les 6 scripts TypeScript** ; `loadtest.mjs` inchangé (sans écriture) |
| `@google/genai` côté client | N'existe pas dans ce dépôt | Aucune |
| `server.ts` (Express) | Rôle clair, `requireAuth` correctement implémenté, fail-closed | Aucune |
| `.env.example` | Propre (aucune valeur) | Aucune |
| `firebase-applet-config.json` | Clé publique par conception, pas un secret | Aucune (juste documenté ici pour éviter une fausse alerte future) |
| `firebase-blueprint.json` | Vestige inerte, non référencé, règles trompeuses | **Fait : supprimé** |
| `bun.lock` | Déjà documenté comme non utilisé par la CI | Aucune |
| `firestore-debug.log` | Fichier local transitoire, déjà gitignoré | Supprimé localement |
| `package.json` name | `"react-example"` | **Fait : renommé en `"activa-healthpass"`** |

## Ce qui n'a PAS changé (comportement préservé)

Aucun flux métier, aucune règle Firestore, aucune collection, aucun composant React n'a été
modifié dans cette passe. Les deux seuls changements de fichiers sont : le nom du projet dans
`package.json`/`package-lock.json`, et la suppression d'un fichier de log local jamais suivi par
git.

## Risques résiduels identifiés

Aucun risque résiduel ouvert sur le périmètre de la Phase 1 : les deux points en attente
(suppression de `firebase-blueprint.json`, audit + hardening des 7 scripts actifs) sont traités.

**Phase 1 terminée (mise à jour du 2026-09-17) : suppression de `firebase-blueprint.json`
effectuée, audit détaillé des 7 scripts actifs livré, et hardening (confirmation interactive +
journal horodaté) implémenté sur les 6 scripts TypeScript. En attente de votre validation
explicite avant de passer à la Phase 2**, conformément à votre instruction.
