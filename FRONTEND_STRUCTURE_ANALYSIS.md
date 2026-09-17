# ACTIVA HealthPass — Analyse de la structure du frontend & recommandation

**Date :** 17 Septembre 2026
**Question posée :** quelle structure de dossiers est la mieux adaptée à ce type
d'application ? Ce document répond avec un diagnostic mesuré de la structure actuelle, puis une
recommandation concrète pour CE dépôt (pas un conseil générique). Aucun fichier de code n'est
déplacé par ce document — c'est une analyse et une proposition, pas une exécution.

## 1. Structure actuelle — inventaire réel

```
src/
├── App.tsx                 (1730 lignes — auth, routage, TOUT l'état métier)
├── assets/
├── components/             (17 fichiers à plat + auth/ + ui/ naissant)
├── config/                 (feature flags, fallback de stockage...)
├── hooks/                  (5 fichiers — mélange générique/métier)
├── i18n/                   (translations.ts, 2936 lignes, un seul fichier)
├── lib/                    (firebase.ts)
├── modules/                (billaudit/ claim360/ fraud/ healthclaims/ membercard/
│                            preauthorization/ reimbursement/ sla/ timeline/)
├── services/               (firestore.ts 1028 lignes ~50 opérations, workflowService.ts...)
├── theme/                  (roleTheme.ts)
├── types/                  (index.ts 747 lignes, healthClaims.ts, dataClassification.ts)
├── utils/                  (15 fichiers)
└── views/                  (5 vues à plat + agent/ 4 vues + settings/ 6 vues)
```

**Verdict : c'est une architecture "par type technique"** (on regroupe par nature du fichier —
vues, composants, services, utils — comme le ferait un tutoriel React classique), **avec une île
"par fonctionnalité" qui a émergé organiquement** (`modules/`) pour tout le travail HealthPass
2.0/3.0 et maintenant ACTIVA Health Claims. Ce n'est pas un défaut isolé — c'est le résultat
naturel d'un projet qui a grandi sans qu'on revienne réorganiser l'existant, et `modules/` est
déjà, sans que ce soit nommé ainsi, un embryon de la bonne réponse (voir §3).

## 2. Le coût mesuré de la structure "par type technique" ici

Preuve concrète, pas une supposition : le domaine **"Claims" (sinistres/réclamations) est
dispersé sur au moins 8 fichiers dans 4 emplacements différents** :
`views/ClaimsView.tsx`, `views/agent/AgentClaimsView.tsx`, `views/DashboardView.tsx`,
`views/ReportsView.tsx`, `modules/claim360/Claim360Panel.tsx`,
`modules/healthclaims/ClaimCaseWizard.tsx`, `modules/reimbursement/ApplyRefactionModal.tsx`,
`modules/timeline/EntityTimeline.tsx` — sans compter `services/firestore.ts` (1028 lignes, ~50
opérations pour TOUTES les collections dans un seul fichier) et `services/workflowService.ts`.

Conséquence directe déjà observée cette session : la recherche d'assuré par carte a été
réimplémentée deux fois indépendamment (`AgentIdentificationView.tsx` et
`AgentClaimsView.tsx`) — pas par negligence, mais parce que **rien dans l'arborescence
n'indique que ces deux fichiers parlent du même domaine**. `views/agent/` regroupe par RÔLE
(qui voit l'écran), pas par DOMAINE (de quoi parle l'écran) — `ClaimsView.tsx` (Admin/
Superviseur) et `AgentClaimsView.tsx` (Agent) traitent tous deux des réclamations mais vivent
dans deux dossiers sans lien visible.

## 3. Les options, et pourquoi une seule convient à ce profil d'application

| Structure | Convient à | Pourquoi elle ne convient PAS bien ici |
|---|---|---|
| **Par type technique** (l'actuelle) | Petites apps, bibliothèques de composants | Le domaine métier (Claims, Members...) n'a aucun "chez lui" — il faut ouvrir 4+ dossiers pour tout voir |
| **Atomic Design** (atoms/molecules/organisms) | Design systems, apps orientées UI/marketing | Optimisé pour la composition visuelle, pas pour des écrans métier riches en règles (éligibilité, plafonds, SoD) — force un découpage artificiel |
| **Par fonctionnalité / vertical slice** (`features/`) | Apps métier à plusieurs rôles avec des domaines CRUD nombreux et semi-indépendants — **exactement le profil de cette application** | — |

Pour une application interne multi-rôles (Admin/Superviseur/Agent, bientôt +4 rôles ACTIVA
Health Claims), avec des domaines métier nombreux (Members, Organizations, Providers, Claims,
Enrollments, Medical Forms, Health Claims...) qui grandissent chacun indépendamment et sont
consultés par plusieurs rôles différents, le standard actuel du secteur (Bulletproof React,
Feature-Sliced Design, la structure recommandée par les équipes Next.js/Remix pour les apps
métier) converge sur la **structure par fonctionnalité ("vertical slice")** : chaque domaine
métier possède SON dossier contenant tout ce qui le concerne (vues, hooks, logique, types
locaux), et seul ce qui est vraiment transverse (design system, auth, connexion Firebase) reste
partagé.

**Ce dépôt a déjà commencé, sans le nommer ainsi** : `src/modules/` EST une structure par
fonctionnalité — chaque sous-dossier (`fraud/`, `sla/`, `reimbursement/`, `healthclaims/`...)
est un domaine autonome. La recommandation ci-dessous n'invente rien : elle généralise ce
motif déjà éprouvé et documenté (`src/modules/README.md`) à l'ensemble de l'application,
plutôt que de le réserver au nouveau code.

## 4. Structure cible recommandée pour CE dépôt

```
src/
├── app/                       # Coquille applicative (extrait d'App.tsx)
│   ├── AppShell.tsx           #   routage de sections, layout Sidebar+Topbar
│   ├── AuthGate.tsx           #   machine à états d'authentification (déjà isolable —
│   │                          #   voir authStatus/onAuthStateChanged dans App.tsx)
│   └── providers.tsx          #   CurrencyProvider, ErrorBoundary...
│
├── features/                  # Un dossier par domaine métier — remplace modules/ + views/
│   ├── claims/                #   ClaimsView, AgentClaimsView, Claim360Panel, hooks, types
│   ├── health-claims/         #   tout le module ACTIVA Health Claims (déjà bien isolé
│   │                          #   aujourd'hui sous modules/healthclaims/ — renommage seul)
│   ├── enrollments/
│   ├── members/
│   ├── organizations/
│   ├── providers/
│   ├── medical-forms/
│   ├── reports/
│   ├── accounts/
│   ├── ceilings/
│   ├── fraud/ sla/ preauthorization/ reimbursement/ billaudit/  # déjà des features, déplacées telles quelles
│   └── auth/                  #   LoginView, WorkspaceSelectionView (déjà dans components/auth/)
│
├── shared/                    # Ce qui sert à PLUSIEURS features (renommage de components/ui + hooks génériques)
│   ├── ui/                    #   SearchableList, futurs Button/Card/Modal génériques
│   ├── hooks/                 #   useIdleLogout (générique) — les hooks par domaine
│   │                          #   (useLogsData...) migrent dans leur feature respective
│   └── components/            #   Sidebar, Topbar, ErrorBoundary, PhotoThumbnail...
│
├── lib/                       # Inchangé — firebase.ts
├── services/                  # Réduit au vraiment transverse : FirestoreService "bas niveau"
│                               #   (ou éclaté par domaine dans chaque feature — à trancher)
├── theme/  config/  i18n/  types/   # Inchangés dans leur rôle, mais types/index.ts se vide
│                                     # progressivement vers types.ts locaux à chaque feature
```

**Ce qui NE bouge PAS dans ce plan** : `lib/`, `theme/`, `config/` restent transverses par
nature (une connexion Firebase, un thème, des feature flags ne sont pas des "domaines
métier"). `i18n/translations.ts` reste un seul dictionnaire exporté (pas de raison de casser
`useTranslation`) mais peut, à terme, être composé à partir de fichiers `*.i18n.ts` locaux à
chaque feature plutôt que d'être un fichier unique de 2936 lignes.

## 5. Chemin de migration — incrémental, pas un big-bang

Conformément à la discipline déjà appliquée cette session (jamais de réécriture en bloc, un
domaine à la fois, vérifié avant de passer au suivant) :

1. **Renommer `modules/` en `features/`** — pur déplacement, zéro changement de comportement,
   corrige tous les imports (mécanique, vérifiable par `tsc --noEmit`).
2. **Choisir UN domaine pilote à migrer en premier** — `claims` est le candidat naturel :
   c'est le domaine le plus dispersé aujourd'hui (8 fichiers, 4 emplacements) et donc celui où
   le gain sera le plus visible. Regrouper `ClaimsView.tsx`, `AgentClaimsView.tsx`,
   `Claim360Panel.tsx` sous `features/claims/` sans changer leur contenu, seulement leur
   emplacement + les imports qui les référencent (à valider avec `tsc`, `npm run build`,
   `npm test`, et une vérification visuelle Playwright avant/après, comme pour chaque
   changement de cette session).
3. **Répéter domaine par domaine**, dans un ordre de priorité à décider ensemble (probablement :
   claims → members → enrollments → le reste), chaque migration étant un incrément séparé,
   validé et mergé avant le suivant — jamais plusieurs domaines à la fois.
4. **`App.tsx` en dernier** — une fois que les domaines ont leur propre dossier, extraire son
   routage de sections et sa machine d'authentification devient mécanique plutôt que risqué,
   puisque chaque section pointera déjà vers un module autonome.

## 6. Recommandation

Passer d'une structure par type technique à une structure par fonctionnalité (`features/`),
en généralisant le motif `modules/` déjà en place — c'est le standard actuel pour ce profil
d'application (multi-rôles, domaines métier nombreux et semi-indépendants), et c'est la
structure qui aurait empêché la duplication de code déjà constatée deux fois cette session.
Ce n'est pas un chantier à faire en une fois : je recommande de commencer par l'étape 1
(renommage `modules/` → `features/`, zéro risque) et l'étape 2 sur le domaine `claims`
uniquement, puis de juger sur pièce avant de continuer.
