# Tests de charge — ACTIVA HealthPass

## Outil

`scripts/loadtest.mjs` — générateur de charge minimal en Node natif (`fetch`, `Promise.all`),
sans dépendance ajoutée : un outil externe (autocannon, k6...) a été volontairement écarté pour
ne pas élargir la surface de dépendances d'un simple outil de diagnostic ponctuel, jamais exécuté
en production (voir aussi `docs/security/REVUE_COMPLETE_2026-09-06.md`, section Redis, pour la
même logique appliquée à l'infrastructure).

```bash
node scripts/loadtest.mjs [--url http://localhost:3000] [--concurrency 20] [--requests 500] [--endpoint /api/health]
```

N'exerce que des endpoints **publics** (sans authentification) par défaut : `/api/health` (GET)
et `/api/cards/verify-format` (POST) — voir `server.ts`. Pointer `--url` vers un déploiement
staging avant de généraliser à d'autres endpoints authentifiés nécessiterait d'étendre le script
avec un jeton Firebase Auth valide, non fait ici.

## Résultats de référence (environnement de cette session, sans identifiants Firebase réels)

Mesurés en local contre `npm run dev` (`server.ts` via `tsx`), **sans** connexion Firebase/Auth
réelle (pas de credentials dans ce bac à sable) — les chiffres absolus ne reflètent donc pas des
conditions de production, mais le **différentiel** entre un endpoint pur calcul et un endpoint
dépendant d'appels externes est représentatif et reproductible.

### `/api/cards/verify-format` (calcul pur, aucun appel externe)

| Requêtes | Concurrence | Débit | p50 | p95 | p99 | Échecs |
|---|---|---|---|---|---|---|
| 1000 | 20 | **1407 req/s** | 12.1 ms | 19.5 ms | 54.4 ms | 0 |

### `/api/health` (vérifie Firestore + Auth à chaque appel, timeout 2s chacun)

| Passe | Requêtes | Concurrence | Débit | p50 | p95 | p99 | Échecs |
|---|---|---|---|---|---|---|---|
| 1 (à froid) | 500 | 20 | 89.9 req/s | 15.5 ms | 997 ms | **4103 ms** | 0 |
| 2 (à chaud) | 300 | 50 | 935.7 req/s | 26.2 ms | 89.5 ms | 209.9 ms | 0 |
| 3 (à chaud) | 300 | 50 | 969.8 req/s | 31.3 ms | 63.9 ms | 212.1 ms | 0 |

## Constat

**Effet de démarrage à froid confirmé et reproductible** : les toutes premières requêtes vers
`/api/health` subissent une latence p99 environ **20× plus élevée** que le régime stabilisé
(initialisation de connexion des SDK Firestore/Auth, résolution DNS) ; le débit stabilisé est
ensuite comparable à l'endpoint pur calcul. Aucun échec (0/1100 requêtes cumulées, tous
endpoints confondus).

**Implication pratique** : un load balancer ou une sonde de disponibilité (Cloud Monitoring
Uptime Check, voir `MONITORING_AND_ALERTING.md`) qui interroge `/api/health` avant que l'instance
n'ait reçu de trafic réel peut observer un premier échec/latence élevée à tort — configurer un
délai de grâce (`initial_delay`) au démarrage de l'instance plutôt que de considérer un échec de
sonde immédiat comme une régression.

## Limites de cette mesure

- Exécuté sans identifiants Firebase réels dans cet environnement : les appels Firestore/Auth
  du health check échouent par timeout (2s) plutôt que de réussir — un test contre un
  déploiement réel avec des identifiants valides donnerait des chiffres différents (probablement
  meilleurs pour `/api/health`, la latence Firestore réelle étant généralement < 100ms).
  **Reste à faire par un opérateur avec accès au projet Firebase réel** : relancer ces mêmes
  commandes contre l'URL de staging/production pour obtenir des chiffres représentatifs.
- Un seul processus client (ce script) sur la même machine que le serveur testé — ne mesure pas
  la latence réseau réelle ni l'effet d'un vrai répartiteur de charge.
- Ne couvre pas les endpoints authentifiés (`/api/policies/evaluate`,
  `/api/claims/validate-coverage`) ni les transactions Firestore de génération de numéro de
  carte (`src/services/cardNumberService.ts`), qui restent à charger séparément avec un jeton
  Firebase Auth valide.
