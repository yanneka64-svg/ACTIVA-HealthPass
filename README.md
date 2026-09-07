# ACTIVA HealthPass

Système d'administration des assurances santé et de gestion des sinistres pour ACTIVA
HealthPass : enrôlement des assurés, émission de cartes HealthPass, traitement des dossiers
(enrôlements et sinistres) avec séparation des tâches Agent/Superviseur, facturation, et
suivi des polices par organisation.

Stack : React 19 + Vite (frontend), Express + Vite middleware en dev (`server.ts`), Firebase
(Firestore, Auth, Storage, Cloud Functions) comme backend.

## Prérequis

- **Node.js 20** (version utilisée par la CI, voir `.github/workflows/ci.yml`).
- **npm** (le dépôt est verrouillé via `package-lock.json`, utilisé par la CI et les scripts de
  déploiement — un `bun.lock` est aussi présent mais non utilisé par la CI ; préférer npm pour
  rester cohérent avec les workflows).
- **Firebase CLI** (`npm install -g firebase-tools`) — nécessaire pour lancer les émulateurs
  locaux (Firestore/Auth), exécuter les tests de règles de sécurité, et pour tout déploiement.
- Un projet Firebase existant si vous devez déployer ou pointer vers un backend réel (Firestore,
  Auth, Storage, Cloud Functions activés). La configuration client (clé API Web publique,
  projet, base Firestore nommée) est déjà committée dans `firebase-applet-config.json` — c'est
  la configuration attendue côté client Firebase (restreinte par les règles de sécurité, pas par
  le secret) ; aucune clé de service (Admin SDK) n'est présente dans le dépôt.

## Installation

```bash
npm install
cd functions && npm install && cd ..
```

## Lancer en développement

```bash
npm run dev
```

Démarre `server.ts` (Express + middleware Vite en mode dev) sur `http://localhost:3000`. Sans
configuration supplémentaire, l'app pointe vers le projet Firebase réel déclaré dans
`firebase-applet-config.json` — voir la section Variables d'environnement ci-dessous pour
travailler à la place contre des émulateurs locaux.

### Travailler contre les émulateurs Firebase (recommandé pour le développement local)

```bash
firebase emulators:start --only firestore,auth
# Dans un autre terminal :
VITE_USE_FIREBASE_EMULATOR=true npm run dev
```

Voir `src/lib/firebase.ts` pour le détail du branchement (inerte par défaut, sans effet tant que
`VITE_USE_FIREBASE_EMULATOR` n'est pas explicitement à `"true"`).

## Variables d'environnement

Voir `.env.example` — chaque variable y est documentée individuellement (usage, valeur par
défaut le cas échéant, avertissements de sécurité). Résumé des catégories :

| Catégorie | Exemples | Où |
|---|---|---|
| Build / serveur de dev | `APP_URL`, `DISABLE_HMR` | racine, lu par `server.ts`/`vite.config.ts` |
| Drapeaux client (`VITE_*`) | `VITE_ALLOW_DEMO_FALLBACK`, `VITE_ALLOW_STORAGE_BASE64_FALLBACK`, `VITE_USE_FIREBASE_EMULATOR` | injectées au build ; **ne jamais définir les deux premières en production** |
| Scripts opérationnels (`scripts/*.ts`) | `FIREBASE_API_KEY`, `ADMIN_EMAIL`, ... | saisies au terminal au moment de l'exécution, jamais committées |
| Secrets Cloud Functions | `MEDICAL_FIELD_ENCRYPTION_KEY` | Firebase Secret Manager uniquement, jamais un fichier `.env` |

```bash
cp .env.example .env.local   # puis éditer .env.local (jamais suivi par git)
```

## Tests

```bash
npm run test:all              # suite unitaire complète (racine)
npm test                      # suite unitaire, sans les tests de règles Firestore
firebase emulators:exec --only firestore -- npm run test:rules   # règles Firestore, contre l'émulateur

cd functions && npm test      # suite unitaire Cloud Functions

npx playwright test           # end-to-end (orchestre émulateurs + seed + serveur automatiquement)
```

Voir [`docs/ci-cd/TEST_STRATEGY.md`](docs/ci-cd/TEST_STRATEGY.md) pour le détail de ce que
couvre chaque suite.

## Build et déploiement

```bash
npm run build   # build Vite (client) + bundle server.ts (dist/server.cjs)
npm start        # sert le build de production
```

Le déploiement Firebase (règles Firestore/Storage, index, Cloud Functions) est piloté par les
workflows GitHub Actions :

- **`.github/workflows/ci.yml`** — lint, typecheck, tests, build sur chaque push/PR.
- **`.github/workflows/deploy-staging.yml`** — déploiement automatique vers l'environnement de
  staging (valide les règles Firestore contre l'émulateur avant tout déploiement).
- **`.github/workflows/deploy-production.yml`** — déploiement en production, déclenché
  manuellement avec confirmation explicite, ou à la publication d'une release.

L'authentification vers GCP utilise Workload Identity Federation (pas de clé de service
statique stockée en secret GitHub).

## Documentation complémentaire

- [`docs/ci-cd/TEST_STRATEGY.md`](docs/ci-cd/TEST_STRATEGY.md) — stratégie de test détaillée.
- [`docs/ci-cd/DEPLOYMENT_GUIDE.md`](docs/ci-cd/DEPLOYMENT_GUIDE.md) — guide de déploiement.
- [`docs/security/`](docs/security/) — audits de sécurité, revues de code, gouvernance des
  données de santé, runbook opérationnel.
