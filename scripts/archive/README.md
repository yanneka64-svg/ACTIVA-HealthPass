# Scripts archivés (Phase 5 — nettoyage de code)

24 scripts Node one-shot (codemods), tous datés du 2026-09-01 (avant le début de la session de
durcissement), déplacés ici depuis la racine du dépôt **sans modification de leur contenu**,
conformément à la règle absolue du brief de durcissement ("ne supprimer ni modifier leur
contenu sans certitude sur leur statut").

Statut déterminé en Phase 0 (voir `docs/security/CODE_AUDIT_MAP.md`, section 10) pour chacun :
**tous ont déjà été exécutés une fois** contre un état antérieur du dépôt et sont désormais
obsolètes/inertes (le motif de code qu'ils recherchent via `String.replace` ne correspond plus
au fichier cible actuel, qui a évolué depuis). Aucun n'est référencé dans `package.json`
(racine ou `functions/`), aucun n'est importé par du code applicatif. Aucun ne relève de la
catégorie "outil de maintenance récurrent" — chacun cible un chemin et un extrait de code en
dur, écrits pour une seule exécution contre un état de fichier précis et dépassé.

| Script | Fichier ciblé (historique) | Contexte |
|---|---|---|
| `account_update.js` | `AccountsView.tsx` | Retrait d'une colonne "Mot de Passe Actuel" de l'écran de gestion des comptes. |
| `fix2.js` | `MembersView.tsx` | Correctif d'urgence suite à une exécution ratée d'un `patch_members_view.cjs` antérieur (voir commentaire interne du fichier). |
| `fix_accounts.cjs`, `fix_accounts_create.cjs`, `fix_accounts_create2.cjs`, `fix_accounts_view.cjs`, `fix_accounts_view.js` | `AccountsView.tsx` | Chantier itératif de migration du stockage mock local (`storage.ts`) vers Firestore (`FirestoreService`), création via `secondaryAuth`, gestion du mot de passe temporaire — 5 scripts successifs représentant les étapes de cette migration. |
| `fix_agent_enroll.cjs` | `AgentEnrollmentsView.tsx` | Génère le fichier entier depuis un template embarqué dans le script (pas un correctif incrémental) — capture d'un état antérieur de cet écran. |
| `fix_app.cjs`, `fix_app_auth.cjs` | `App.tsx` | Migration de `reloadData` (lecture synchrone depuis un mock) vers des abonnements Firestore temps réel (`onSnapshot`). |
| `fix_app_race.cjs` | `App.tsx` | Correction d'une race condition dans la résolution du rôle au login, avec un repli `'Admin'` par défaut si le compte n'existe pas encore — ce repli dangereux n'existe plus dans le code actuel, qui utilise `normalizeRole()` sans repli privilégié (voir `src/utils/authUtils.ts`). |
| `fix_claims_export.cjs` | `ClaimsView.tsx` | Réagencement des boutons d'export CSV/Excel (avant l'introduction du composant `ExportDropdown`). |
| `fix_claims_props.cjs` | `ClaimsView.tsx`, `App.tsx` | Ajout de la prop `currentSection`. |
| `fix_lint.cjs`, `fix_lint2.cjs` | `App.tsx`, `AccountsView.tsx` | Corrections d'imports manquants (`onSnapshot`) après un refactor précédent. |
| `fix_members_view.js`, `fix_members_view_regex.js` | `MembersView_broken.tsx` → `MembersView.tsx` | Scripts de récupération après un refactor cassé — le fichier source `MembersView_broken.tsx` visé n'existe plus du tout dans le dépôt, confirmant que la récupération a été menée à bien. |
| `fix_phone_rem.cjs` | `AccountsView.tsx` | Retrait d'un bloc "Phone Number" du formulaire de création de compte. |
| `fix_rules.cjs`, `fix_rules_read.cjs` | `firestore.rules` | Ciblent une fonction `isUserRole(role)` et un motif `isValidId(userId)` qui n'existent plus du tout dans les règles actuelles (réécrites depuis, voir `isAdmin()`/`isSupervisor()`/etc.). |
| `fix_sidebar.cjs` | `Sidebar.tsx` | Restriction de la navigation visible pour le rôle Agent. |
| `fix_topbar.cjs` | `Topbar.tsx` | Ajout des props `currentUser`/`userRole`. |
| `patch_app.js` | `App.tsx` | Bootstrap initial de l'authentification Firebase, avant l'architecture actuelle (`onSnapshot`/`normalizeRole`). |
| `update_claims.js` | `ClaimsView.tsx` | Masquage des boutons approve/reject pour les agents (logique aujourd'hui portée par `permissions.ts`/`firestore.rules`). |
| `update_translations.js` | `src/i18n/translations.ts` | Réduction du fichier de traductions à l'anglais uniquement. |

Ces scripts sont conservés comme trace historique du développement du projet, pas comme
outillage à réexécuter — la plupart planteraient s'ils étaient relancés (fichier source
introuvable, motif de remplacement absent du fichier actuel).
