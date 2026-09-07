# Monitoring et alerting — ACTIVA HealthPass

Complète `docs/security/REVUE_COMPLETE_2026-09-06.md` (décision : Google Cloud Error Reporting,
pas de SDK tiers — voir ce document pour le raisonnement) avec la configuration concrète de
l'alerting, absente jusqu'ici : les logs structurés (`server.ts` via pino, Cloud Functions via
`firebase-functions/logger`) et Cloud Error Reporting détectent les erreurs, mais rien ne
**notifie** activement un humain aujourd'hui. Commandes `gcloud` fournies dans le même esprit que
`DEPLOYMENT_GUIDE.md` (section 3) : à exécuter une fois par un opérateur disposant d'un accès
GCP réel — cette session n'en a pas et n'a donc rien pu appliquer ni vérifier en conditions
réelles.

## 1. Canal de notification (préalable)

Un canal doit exister avant de créer la moindre politique d'alerte. Remplacer l'e-mail
placeholder :

```bash
export PROJECT_ID="gen-lang-client-0957905786"
export ALERT_EMAIL="<e-mail-astreinte-a-definir>"

gcloud alpha monitoring channels create \
  --project="${PROJECT_ID}" \
  --display-name="ACTIVA HealthPass — Astreinte" \
  --type=email \
  --channel-labels=email_address="${ALERT_EMAIL}"
```

Noter l'ID de canal retourné (`projects/.../notificationChannels/...`), réutilisé ci-dessous.

## 2. Sonde de disponibilité (Uptime Check) sur `/api/health`

Référencée mais non détaillée dans `DEPLOYMENT_GUIDE.md` (checklist Go-Live, dernier point).
Suppose que `server.ts` est déployé sur une URL HTTPS stable (Cloud Run ou équivalent — voir la
limite documentée dans `docs/security/REVUE_COMPLETE_2026-09-06.md` : cette session n'a pas pu
déterminer où `server.ts` tourne réellement en production).

```bash
export APP_HOSTNAME="<hôte-de-production-a-definir>"   # sans le schéma https://

gcloud monitoring uptime create "activa-healthpass-api-health" \
  --project="${PROJECT_ID}" \
  --resource-type=uptime-url \
  --hostname="${APP_HOSTNAME}" \
  --path="/api/health" \
  --protocol=https \
  --period=5 \
  --timeout=10
```

**Attention au faux positif de démarrage à froid** : les mesures de
`docs/ci-cd/LOAD_TESTING.md` montrent une latence nettement plus élevée sur les toutes premières
requêtes vers `/api/health` après démarrage d'une instance (initialisation des SDK
Firestore/Auth). Un `timeout` de 10s (au lieu du défaut plus court) absorbe cet effet ; ne pas
alerter sur un échec isolé (voir la politique combinée ci-dessous, seuil > 1 échec consécutif).

## 3. Politique d'alerte — sonde de disponibilité

```bash
export CHANNEL_ID="<id-du-canal-créé-à-l'étape-1>"
export UPTIME_CHECK_ID="<id-retourné-par-la-commande-précédente>"

gcloud alpha monitoring policies create \
  --project="${PROJECT_ID}" \
  --notification-channels="${CHANNEL_ID}" \
  --display-name="ACTIVA HealthPass — /api/health indisponible" \
  --condition-display-name="Échec de la sonde de disponibilité" \
  --condition-filter="resource.type=\"uptime_url\" AND metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.label.\"host\"=\"${APP_HOSTNAME}\"" \
  --condition-threshold-value=1 \
  --condition-threshold-comparison=COMPARISON_LT \
  --condition-threshold-duration=300s \
  --aggregation-alignment-period=300s \
  --aggregation-per-series-aligner=ALIGN_FRACTION_TRUE \
  --documentation="La sonde /api/health a échoué de façon soutenue (5 min). Vérifier d'abord le corps de la réponse (checks.firestore / checks.auth) avant d'escalader — voir server.ts."
```

Le seuil de 5 minutes soutenues (plutôt qu'un échec isolé) absorbe volontairement l'effet de
démarrage à froid documenté ci-dessus.

## 4. Politique d'alerte — taux d'erreur Cloud Functions

Cloud Error Reporting regroupe déjà les erreurs par service ; cette politique alerte activement
sur un taux anormal plutôt que de nécessiter une consultation manuelle du dashboard.

```bash
gcloud alpha monitoring policies create \
  --project="${PROJECT_ID}" \
  --notification-channels="${CHANNEL_ID}" \
  --display-name="ACTIVA HealthPass — Taux d'erreur Cloud Functions élevé" \
  --condition-display-name="Erreurs Cloud Functions > 5% sur 10 min" \
  --condition-filter="resource.type=\"cloud_function\" AND metric.type=\"cloudfunctions.googleapis.com/function/execution_count\" AND metric.label.\"status\"!=\"ok\"" \
  --condition-threshold-value=0.05 \
  --condition-threshold-comparison=COMPARISON_GT \
  --condition-threshold-duration=600s \
  --aggregation-alignment-period=600s \
  --aggregation-per-series-aligner=ALIGN_RATE \
  --documentation="Taux d'erreur anormal sur au moins une Cloud Function. Consulter Cloud Error Reporting pour la stack trace groupée avant d'intervenir."
```

## 5. Vérification post-configuration

```bash
gcloud alpha monitoring policies list --project="${PROJECT_ID}" --format="table(displayName,enabled)"
```

Confirmer que les deux politiques apparaissent et sont `enabled: true`. Déclencher un test
manuel (ex. arrêter temporairement l'instance de staging) avant le Go-Live pour vérifier que la
notification arrive réellement au canal configuré — non fait ici, hors de portée de cette
session (aucun accès GCP réel).

## Limite de cette session

Aucune de ces commandes n'a été exécutée ni vérifiée contre un projet GCP réel : cette session
n'a pas d'accès Firebase/GCP authentifié (voir `docs/security/BACKEND_AUDIT_2026-09-06_REMEDIATION.md`,
point récurrent sur l'absence de preuve de déploiement réel). Ce document fournit les commandes
prêtes à l'emploi ; leur exécution et leur vérification restent une action humaine.
