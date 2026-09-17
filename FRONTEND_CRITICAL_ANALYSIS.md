# ACTIVA HealthPass — Analyse Critique du Frontend & Propositions

**Date :** 17 Septembre 2026
**Périmètre :** `src/` (React + TypeScript + Vite), hors `functions/` et `server.ts`.
**Méthode :** mesures directes sur le code réel (tailles de fichiers, comptage de motifs,
configuration de build) — aucune estimation qualitative non vérifiée. Ce document constate,
il ne modifie rien : comme les rapports de découverte précédents, c'est un point de départ pour
décider ensemble quoi corriger et dans quel ordre.

## 1. Synthèse

Le frontend fonctionne et a été durci sur plusieurs axes de sécurité (voir
`AUDIT_AND_HARDENING_REPORT.md`, `docs/security/CODE_AUDIT_MAP.md`). Mais son **architecture
n'a pas suivi la croissance fonctionnelle** : ce qui a commencé comme une petite SPA à 3 rôles
est devenu une plateforme à plusieurs dizaines d'écrans sans que la structure de code (état
global, composants partagés, découpage des bundles) n'évolue en conséquence. Les symptômes sont
mesurables, pas seulement ressentis :

| Constat | Mesure |
|---|---|
| Fichiers monolithiques | `AccountsView.tsx` 1953 lignes, `MembersView.tsx` 1815, `App.tsx` 1730, `AgentMedicalFormView.tsx` 1728, `CeilingsView.tsx` 1677, `AgentClaimsView.tsx` 1667 |
| Aucune bibliothèque d'état global / data-fetching | 0 occurrence de Redux/Zustand/React Query/SWR dans `package.json` |
| Aucun composant UI générique réutilisable | `src/components/` ne contient que des modales/widgets spécifiques (17 fichiers), aucun `Button`/`Card`/`Input`/`Modal` de base |
| Bundle final trop gros | `dist/assets/index-*.js` = **1,49 Mo** minifié (avertissement Vite natif à la compilation) |
| Échappatoires de typage | 91×`: any` + 52×`as any` = 143 usages dans un code pourtant 100% TypeScript |
| Zéro mémoïsation | 0 occurrence de `React.memo` dans tout `src/` |
| Aucun outil de qualité automatisé | pas de `.eslintrc`/`eslint.config.*`, pas de Prettier — `npm run lint` n'exécute que `tsc --noEmit` |
| Tests uniquement sur la logique | 111 tests (vitest) couvrent `utils`/`services`/règles Firestore — **0 test de composant React** (`@testing-library/react` absent) |
| Accessibilité faible | attributs `aria-*` présents dans seulement **7 des 51** fichiers `.tsx` |
| Design system contourné | **483 couleurs hexadécimales codées en dur** (157 valeurs distinctes) alors qu'un système de variables CSS par rôle existe déjà (`getRoleCssVars`, `roleTheme.ts`) |

## 2. Architecture & état global

**Constat.** `App.tsx` (1730 lignes) est à la fois : machine à états d'authentification, routeur
de sections, détenteur de **tout** l'état métier (`members`, `organizations`, `providers`,
`claims`, `invoices`, `enrollments`, `ceilings`, `logs`, `medicalForms`, `notifications`,
`healthPolicies`, `policyPayments`), et point d'abonnement Firestore pour ces 12 collections —
toutes souscrites **dès la connexion**, quel que soit l'écran réellement affiché. Chaque vue
reçoit ensuite ces données par props (jusqu'à 10-15 props sur certaines vues).

**Pourquoi c'est un problème concret, pas juste stylistique :**
- Un Admin qui vient de se connecter et n'a pas encore cliqué sur "Invoices" télécharge déjà
  toute la collection `invoices` (idem `logs`, `medicalForms`...). Sur une base de production
  avec des années d'historique, c'est du temps de chargement et de la bande passante gaspillés
  pour des données que l'utilisateur ne verra peut-être jamais dans sa session.
- Une seule mise à jour Firestore sur une collection (ex. une notification) déclenche un
  `setState` dans `App.tsx`, donc un nouveau rendu qui **redescend en cascade** vers tous les
  enfants sous cet arbre — sans `React.memo` nulle part pour l'arrêter en chemin.
- Aucune vue ne peut être testée ou raisonnée isolément : elle dépend de 10+ props façonnées
  par la logique d'`App.tsx`.

**Propositions :**
1. **Chargement différé par section** : ne souscrire à une collection Firestore qu'au moment où
   la section qui l'utilise devient active (ou avec un `enabled` sur le hook), pas toutes au
   login. Gain immédiat de temps de chargement initial, sans toucher au modèle de données.
2. **Extraire un state par domaine** (ex. `useClaimsData()`, `useMembersData()` — un hook par
   collection, chacun encapsulant son propre `onSnapshot`) plutôt qu'un unique bloc dans
   `App.tsx`. Migration additive, écran par écran, sans big-bang.
3. **React Query (ou équivalent léger)** pour remplacer les `onSnapshot` + `useState` manuels
   là où un flux temps réel n'est pas strictement nécessaire (ex. `logs`, `providers`,
   `ceilings` — données qui changent rarement) : cache, dédoublonnage de requêtes, invalidation
   déclarative, sans réinventer ces mécanismes à la main.
4. **`React.memo` sur les lignes de tableau/cartes** dans les vues à grosses listes (Members,
   Claims, Invoices) — le gain est le plus visible là où les listes sont longues.

## 3. Taille des fichiers & duplication

**Constat.** Une exploration réalisée pendant la construction du wizard ACTIVA Health Claims
(Phase 2) a confirmé directement dans le code : la recherche d'un assuré par numéro de carte
est **réimplémentée indépendamment** dans `AgentIdentificationView.tsx` et
`AgentClaimsView.tsx`, avec deux logiques de filtrage légèrement différentes — aucun composant
partagé. Le même constat vaut probablement pour d'autres motifs récurrents (bannières de statut,
badges, formulaires d'upload de fichiers) au vu de l'absence totale de `src/components/ui/`.

**Propositions :**
1. Extraire un composant `<InsuredMemberSearch />` unique (recherche + liste filtrée + sélection)
   à partir du meilleur des deux implémentations existantes, à réutiliser dans les deux vues
   actuelles et dans le nouveau module Health Claims — additif, sans changer le comportement
   visible.
2. Créer `src/components/ui/` avec les primitives réellement dupliquées partout (`Button`,
   `Card`, `StatusBadge`, `FormField`, `Modal`) — migration progressive vue par vue, jamais en
   bloc, pour rester dans la discipline déjà en place ("ne jamais casser l'existant").
3. Avant toute nouvelle vue (y compris la suite du module Health Claims), vérifier si un
   composant équivalent existe déjà plutôt que d'en écrire un nouveau — ce document sert de
   rappel pour cette vérification.

## 4. Performance de build

**Constat.** `npm run build` avertit lui-même : `dist/assets/index-*.js` (1,49 Mo minifié,
389 Ko gzip) dépasse largement le seuil recommandé. `excelUtils.ts` (2629 lignes, 474 Ko
minifié) et les bibliothèques PDF (`jspdf` 390 Ko + `html2canvas` 202 Ko) semblent chargées
dans des chemins critiques plutôt qu'à la demande. Le découpage actuel (`React.lazy` par vue,
déjà en place depuis un correctif précédent de cette session) aide, mais le chunk `index`
central reste énorme.

**Propositions :**
1. **Importer dynamiquement** `xlsx`/`excelUtils`/`jspdf`/`html2canvas` uniquement au moment du
   clic sur "Exporter en Excel/PDF" (`import()` dans le gestionnaire de clic), pas au chargement
   de la vue qui contient le bouton — ces bibliothèques ne sont utiles qu'à l'export, pas à
   l'affichage.
2. Ajouter `build.rollupOptions.output.manualChunks` dans `vite.config.ts` pour séparer
   `firebase`, `jspdf`+`html2canvas`, `xlsx` dans des chunks dédiés, chargés uniquement quand
   nécessaires — change uniquement le découpage du build, aucun changement de comportement.
3. Mesurer avant/après avec `vite-bundle-visualizer` (ou équivalent) pour prioriser objectivement
   plutôt que deviner quel module pèse le plus.

## 5. Typage & qualité de code

**Constat.** 143 échappatoires de typage (`any`/`as any`) dans un projet 100% TypeScript en
réduisent la valeur : chaque `as any` est un endroit où le compilateur ne peut plus détecter une
régression. Aucun ESLint n'est configuré — `npm run lint` n'exécute en réalité que
`tsc --noEmit`, donc aucune règle de style, de hooks React (`react-hooks/exhaustive-deps` déjà
contourné explicitement par endroits avec un commentaire `eslint-disable`, ce qui suppose qu'un
linter React a un jour existé ou est prévu) ni de bonnes pratiques n'est appliquée
automatiquement.

**Propositions :**
1. Ajouter une configuration ESLint minimale (`@typescript-eslint`, `eslint-plugin-react-hooks`)
   en mode **avertissement seulement** au démarrage (jamais bloquant pour l'existant), pour
   avoir une mesure objective de la dette avant de commencer à la réduire.
2. Réduire les `any` progressivement, en commençant par les points d'entrée les plus utilisés
   (`FirestoreService`, `WorkflowService`) plutôt que par un balayage global risqué.
3. Ne plus introduire de nouveau `any` dans le code ajouté à partir de maintenant (déjà respecté
   dans le nouveau module `src/modules/healthclaims/` — 0 `any` dans ce code).

## 6. Accessibilité (a11y)

**Constat.** Seulement 7 fichiers `.tsx` sur 51 contiennent un attribut `aria-*`. Pour une
application de gestion de santé utilisée quotidiennement par des agents (potentiellement sur des
postes variés, parfois avec des besoins d'accessibilité), c'est un point faible réel : lecteurs
d'écran, navigation clavier des tableaux/modales, contraste des couleurs de statut non vérifié
formellement.

**Propositions :**
1. Audit ciblé (rapide) des formulaires les plus utilisés (Identification, Medical Form, Claims)
   avec l'extension navigateur axe DevTools — corrections ponctuelles, pas une réécriture.
2. Règle simple à appliquer aux nouveaux composants : tout bouton icône-seul a un `aria-label`,
   toute modale piège le focus et se ferme à `Escape` (à vérifier composant par composant, pas
   supposé acquis).

## 7. Internationalisation (i18n)

**Constat positif.** Les 15 vues sous `src/views/` utilisent **toutes** `useTranslation` — bon
niveau de discipline pour le cœur applicatif.
**Écart trouvé (auto-critique) :** le nouveau `ClaimCaseWizard.tsx` (Phase 2 du module Health
Claims, ce module même) a été écrit avec du texte anglais codé en dur, **sans passer par
`src/i18n/translations.ts`** — un oubli de cohérence de ma part à corriger avant que ce
composant soit branché pour de vrai dans l'application.

**Proposition :** avant de câbler le wizard dans l'app réelle (prochaine étape), migrer ses
textes vers le dictionnaire `translations.ts` existant, pour qu'il se comporte comme le reste
de l'application (FR/EN).

## 8. Tests

**Constat.** Les 111 tests vitest couvrent exclusivement de la logique pure (utilitaires,
services, règles Firestore) — aucun test de rendu ou d'interaction sur un composant React
(`@testing-library/react` n'est même pas une dépendance). La vérification des écrans repose
entièrement sur des captures Playwright ponctuelles faites manuellement pendant chaque session
de développement, jamais rejouées automatiquement.

**Propositions :**
1. Ajouter `@testing-library/react` + `@testing-library/user-event` et couvrir en priorité les
   composants à plus fort risque de régression silencieuse : `PhotoThumbnail` (fallback
   d'image), les calculs de garantie/co-paiement, le nouveau `ClaimCaseWizard` (navigation entre
   étapes, blocage sur police expirée).
2. Conserver Playwright, mais pour un petit nombre de parcours critiques **rejouables en CI**
   (connexion, création d'un sinistre) plutôt que uniquement des scripts jetables par session.

## 9. Cohérence visuelle (design tokens)

**Constat.** 483 couleurs hexadécimales codées en dur (157 valeurs distinctes) cohabitent avec
un système de variables CSS par rôle déjà construit et fonctionnel
(`getRoleCssVars`/`roleTheme.ts`, `var(--brand-900)` etc.) mais visiblement peu utilisé en
dehors de la Sidebar et de quelques bannières. Résultat : changer une teinte de marque exige de
chercher/remplacer dans des dizaines de fichiers plutôt que de modifier une seule palette.

**Proposition :** lors de toute nouvelle modification d'une vue existante (pas une réécriture
dédiée), remplacer les couleurs codées en dur rencontrées par la variable CSS équivalente —
convergence progressive, opportuniste, sans chantier dédié à faible valeur immédiate.

## 10. Ce qui fonctionne déjà bien (à ne pas casser)

Pour équilibrer : le découpage en `React.lazy` par vue post-connexion, le système de rôles/thème
(`roleTheme.ts`), la discipline des modules `src/modules/` (feature flags, jamais de bulk,
prévisualisation avant construction réelle), et l'usage cohérent de `useTranslation` dans les
vues sont de bonnes fondations sur lesquelles s'appuyer — les propositions ci-dessus s'ajoutent à
l'existant, elles ne le remplacent pas.

## 11. Priorisation proposée

**Gains rapides, faible risque (à faire en premier) :**
- Import dynamique des libs Excel/PDF (§4.1) — impact bundle immédiat, zéro risque fonctionnel.
- i18n du `ClaimCaseWizard` avant câblage réel (§7) — cohérence avant que ça devienne visible.
- ESLint en mode avertissement seul (§5.1) — mesure sans casser.

**Structurant, à planifier (moyen terme) :**
- Extraction du composant de recherche d'assuré partagé (§3.1).
- Hooks de données par domaine + chargement différé par section (§2.1/§2.2).
- Premiers tests `@testing-library/react` sur les composants à risque (§8.1).

**Long terme / à discuter avant de démarrer :**
- Adoption d'une librairie de data-fetching (§2.3) — changement d'architecture, à valider
  ensemble avant tout code.
- `src/components/ui/` complet (§3.2) — chantier transverse, progressif par nature.
