# Guide d'Exploitation et Mesures Opérationnelles de Protection des Données (Go-Live Santé)
**ACTIVA HealthPass — Système de Gestion Tiers-Payant & Dossiers Médicaux**  
**Classification :** Sensible / Données de Santé (HDS / RGPD / ISO 27799)  
**Date d'entrée en vigueur :** Septembre 2026  
**Statut :** Remédiations techniques en cours de validation — Go-Live soumis à la clôture des
écarts critiques identifiés ci-dessous et à la validation des tests de sécurité (voir
`docs/security/REVUE_COMPLETE_2026-09-06.md`).

<!-- === AMÉLIORATION AJOUTÉE : exactitude documentaire (Réconciliation 2026-09-07) ===
     La version précédente de ce statut affirmait "Conforme aux exigences préalables au
     Go-Live", contredite par le code actuel sur au moins deux points repris dans le tableau
     ci-dessous (fallback client encore présent sur l'approbation des claims/enrollments,
     intégrité de l'audit trail non scellée cryptographiquement). Un document d'exploitation ne
     doit pas déclarer une conformité que le code ne démontre pas encore. -->

---

## 1. Synthèse des Remédiations Techniques Appliquées

| Domaine audité | Statut Antérieur | Statut Post-Remédiation | Mesures Techniques Implémentées |
|---|:---:|:---:|---|
| **Données Médicales** | 🔴 Risque Fail-Open | 🟢 **Sécurisé (Fail-Closed)** | `MedicalDataEncryptionError` bloquant toute écriture en cas d'indisponibilité du chiffrement ; règles Firestore refusant tout champ clinique non préfixé par `encv1:`. |
| **API & Backend** | 🔴 Architecture Hybride | 🟠 **Consolidé, fallback client résiduel** | Élimination des routes d'authentification parasites et des identifiants résiduels dans `server.ts`. `processEnrollmentDecision`/`processClaimDecision` (Cloud Functions) sont le chemin PRINCIPAL, mais `workflowService.ts` retombe encore sur une écriture Firestore directe côté client si l'appel Cloud Function échoue — les Fonctions Cloud ne sont donc pas encore les SEULES dépositaires des décisions métier. Voir `docs/security/REVUE_COMPLETE_2026-09-06.md`. |
| **Audit Trail** | 🔴 Intégrité Non Garantie | 🟠 **Hash serveur présent, non scellé cryptographiquement** | Calcul d'un sceau SHA-256 (`integrityHash`) côté serveur ET côté client sur chaque entrée. Règles Firestore interdisant l'usurpation d'UID/Rôle et l'update/delete. Un SHA-256 simple (sans HMAC à clé secrète ni chaînage de hash) reste recalculable par un acteur disposant d'un accès d'écriture suffisant — ce n'est pas encore un scellement cryptographique au sens strict. |
| **Séparation des Tâches (SoD)** | 🟠 Dépendance Client | 🟠 **Serveur en chemin principal, fallback client conservé** | `processEnrollmentDecision` et `processClaimDecision` exécutés en transactions Cloud Functions avec validation SoD stricte + immuabilité de `createdByUid` en base — mais un repli client existe encore si la Cloud Function est indisponible (décision délibérée tant que le déploiement des Cloud Functions n'est pas confirmé en production, pas un oubli). |
| **Sécurité Firestore** | 🟠 Risques Résiduels | 🟢 **Verrouillé** | Sous-collection `/clinical` étanche avec vérification regex obligatoire, exclusion stricte d'accès aux non-autorisés. |

---

## 2. Procédure Opérationnelle de Réponse aux Incidents (Data Breach Protocol)

### 2.1 Déclenchement et Niveaux de Gravité
Tout incident relatif à la sécurité des données ou à l'intégrité de la plateforme relève d'un des trois niveaux :
* **P1 - Critique (Violation confirmée de données de santé) :** Exfiltration ou exposition de dossiers cliniques, compromission de clés de chiffrement Secret Manager, compromission d'un compte superviseur ou administrateur.
* **P2 - Majeur (Incident de service ou fail-closed déclenché) :** Défaillance du service de chiffrement bloquant la saisie des formulaires médicaux, détection d'anomalie d'intégrité dans l'audit trail.
* **P3 - Mineur :** Tentatives infructueuses répétées d'accès par force brute (bloquées par le rate-limiter), anomalie de format de carte.

### 2.2 Chaîne d'Escalade et Délais
1. **T0 (Détection) :** Notification automatique par les alertes Cloud Monitoring / Firebase Alerts au Responsable Sécurité (RSSI) et au DPO.
2. **T0 + 4h (Isolement) :** Révocation immédiate des jetons Firebase Auth compromis via la console Firebase ou le script d'administration ; rotation immédiate du secret `MEDICAL_FIELD_ENCRYPTION_KEY` si nécessaire.
3. **T0 + 24h (Rapport préliminaire) :** Analyse forensique basée sur les collections `auditLogs` (vérification de la non-altération des hash SHA-256).
4. **T0 + 72h (Notification Réglementaire) :** Conformément à l'Article 33 du RGPD et à la législation locale de santé, notification officielle à l'autorité de contrôle compétente et aux personnes concernées si un risque élevé pour leurs droits est identifié.

---

## 3. Gestion des Demandes d'Exercice des Droits (DSAR - DPO Workflow)

### 3.1 Droit d'Accès et Portabilité (Art. 15 & 20 RGPD)
* **Périmètre :** Données administratives du membre (`members`), historique des adhésions (`enrollments`), historique des demandes de remboursement (`claims`), fiches médicales (`medicalForms`).
* **Procédure d'Extraction :**
  1. Vérification formelle de l'identité du demandeur (pièce d'identité officielle et numéro d'assuré AMID).
  2. Extraction chiffrée de l'ensemble des données via un compte Administrateur disposant de la délégation de déchiffrement clinique.
  3. Remise d'un export structuré (JSON ou PDF scellé) sous pli sécurisé ou canal de transmission chiffré de bout en bout.

### 3.2 Droit à l'Effacement / Droit à l'Oubli (Art. 17 RGPD) et Dérogations Santé
* **Règle Dérogatoire Obligatoire :** Les fiches médicales et justificatifs de remboursements de prestations de soins sont soumis aux obligations légales de conservation médicale et comptable (durée minimale de 10 ans pour les dossiers de prise en charge et les factures de tiers-payant).
* **Purge des Données Non Essentielles (cible, voir statut réel section 4) :**
  - À la clôture de la police d'assurance ou du contrat employeur, les données sont placées en rétention intermédiaire (`medicalFormsDeletionArchive`).
  - L'accès est strictement réservé au personnel habilité du service juridique / contentieux.
  - À l'issue du délai légal de rétention (`retentionUntil`), la purge définitive physique est exécutée.

---

## 4. Politique et Cycle de Vie des Données (Data Retention Matrix)

<!-- === AMÉLIORATION AJOUTÉE : exactitude documentaire (réconciliation avec
     docs/security/REGISTRE_DES_TRAITEMENTS.md, 2026-09-11) ===
     Ce tableau était présenté comme une politique en vigueur (purge automatisée par Cloud
     Scheduler, interdiction absolue de suppression manuelle sur auditLogs, etc.), ce qui
     contredisait directement le registre RGPD des traitements ("Durée de conservation : non
     définie à ce jour [...] nécessite de statuer sur la durée réglementaire applicable par pays
     avant toute implémentation") — un même sujet, deux statuts différents dans deux documents
     d'exploitation, sans que l'un ne renvoie à l'autre. Suivant le même principe déjà appliqué en
     tête de ce document ("Un document d'exploitation ne doit pas déclarer une conformité que le
     code ne démontre pas encore"), le tableau ci-dessous est donc requalifié en politique CIBLE,
     pas encore validée ni implémentée — voir le statut réel ci-dessous. -->

> **⚠️ Statut : politique cible (proposée), pas encore validée ni implémentée.** Le registre RGPD
> des traitements (`docs/security/REGISTRE_DES_TRAITEMENTS.md`) reste la source de vérité sur le
> statut actuel : la durée de conservation y est explicitement documentée comme **non définie à
> ce jour**, en attente d'arbitrage réglementaire par pays d'opération (ACTIVA opère dans 7 pays
> aux réglementations distinctes). Dans le code, seul `medicalForms` dispose d'une implémentation
> partielle et volontairement provisoire (`src/config/dataRetention.ts`,
> `DEFAULT_MEDICAL_FORM_RETENTION_YEARS = 10`) : elle calcule une date `retentionUntil`
> indicative pour signalement manuel, sans jamais purger automatiquement — le code lui-même
> avertit explicitement de ne pas construire de purge automatisée dessus sans validation
> conformité préalable. Aucune des autres lignes du tableau (`claims`, `auditLogs`, `accounts`) —
> ni le Cloud Scheduler, ni le transfert vers stockage froid, ni la purge après expiration —
> n'a d'implémentation correspondante à ce jour.

| Entité Firestore | Durée de Conservation Active (cible) | Durée de Rétention Intermédiaire (cible) | Modalité de Purge Définitive (cible) |
|---|---|---|---|
| `claims` (Sinistres) | Durée de validité de la police + 1 an | 10 ans (obligation légale comptable) | Purge automatisée par Cloud Scheduler |
| `medicalForms` | Durée de prise en charge active | 10 ans (dossier médical d'assurance) | Transfert archive et purge atomique par lot |
| `auditLogs` | 1 an en ligne consultable | 5 ans en stockage froid (Google Cloud Storage Archive) | Interdiction absolue de suppression manuelle |
| `accounts` (Comptes désactivés) | Immédiat (statut `isActive: false`) | 3 ans (traçabilité des opérations) | Purge après expiration de l'intérêt légitime |

---

## 5. Guide Pratique d'Exploitation et Déploiement

### 5.1 Déploiement des Règles de Sécurité et de l'Infrastructure
Les administrateurs déployant la solution doivent exécuter les commandes suivantes depuis un environnement sécurisé disposant des privilèges IAM appropriés :

```bash
# 1. Déploiement des règles Firestore durcies (SoD, Fail-Closed, Audit Anti-usurpation)
firebase deploy --only firestore:rules

# 2. Déploiement des règles de stockage Cloud Storage
firebase deploy --only storage

# 3. Déploiement des Cloud Functions autoritaires v2 (chiffrement, décisions SoD)
firebase deploy --only functions
```

### 5.2 Définition et Rotation des Clés Secrètes
La clé de chiffrement des données de santé est gérée de façon étanche via Google Cloud Secret Manager :

```bash
# Définir ou renouveler la clé de chiffrement AES-256-GCM (32 octets aléatoires encodés en hexadécimal ou base64)
firebase functions:secrets:set MEDICAL_FIELD_ENCRYPTION_KEY
```

### 5.3 Vérification Quotidienne de l'Intégrité
1. Accéder au tableau de bord des alertes dans **Cloud Monitoring**.
2. Vérifier les métriques de rejet de règles Firestore (`Rule Denials`).
3. Consulter la télémétrie des replis de service (`fallbackTelemetry`) pour s'assurer de l'absence de déclenchement du fail-closed par incident réseau.
