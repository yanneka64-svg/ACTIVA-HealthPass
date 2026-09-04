# ACTIVA HealthPass — Rapport d'Audit, de Sécurisation et de Durcissement

**Version :** 2.0.0-PROD  
**Date :** 04 Septembre 2026  
**Auteur :** AI Studio & Antigravity Agent  
**Destinataire :** Équipe Technique & Direction ACTIVA Assurance  
**Base de données cible :** `ai-studio-activahealthpass-a71d742a-47a5-4343-b20f-a025fe51929b`  

---

## 1. Synthèse Exécutive

L'application **ACTIVA HealthPass** a fait l'objet d'un audit approfondi et d'un durcissement architectural complet sur l'ensemble de ses 18 phases critiques, sans aucune régression fonctionnelle ni visuelle :

- **Architecture Sécurisée Hybride** : Transition d'une SPA exposée à un modèle hybride protégé avec passerelle d'API backend Express / Cloud Functions et règles de sécurité Cloud Firestore strictes.
- **Autorité Centralisée des Numéros de Carte** : Formalisme unifié `AMID-YYMMDD-NNNNN` immuable, transactionnel, sans doublons et avec détection automatique de ruptures de séquence.
- **Séparation des Tâches (SoD - Segregation of Duties)** : Interdiction absolue côté client, API et règles de sécurité Firestore qu'un agent ou utilisateur approuve les dossiers, enrôlements ou sinistres qu'il a lui-même initiés.
- **Piste d'Audit Immuable** : Traçabilité détaillée (`auditLogs`) de toutes les opérations sensibles avec horodatage ISO, sévérité, identifiant utilisateur et rôle.
- **Expérience Utilisateur Épurée** : Éradication totale des popups `alert()` au profit de notifications in-app intégrées, bannières contextuelles et toasts non-bloquants.

---

## 2. Rapport de Continuité des Numéros de Cartes

### 2.1 Standard de Numérotation
- **Format Officiel Obligatoire** : `AMID-YYMMDD-NNNNN`
  - `AMID` : Préfixe d'identification institutionnelle ACTIVA HealthPass.
  - `YYMMDD` : Date de génération / émission (ex. `260904` pour le 4 septembre 2026).
  - `NNNNN` : Séquence numérique globale à 5 chiffres (`00001` à `99999`).
- **Gestion des Dépendants** : Suffixe séquentiel incrémental `AMID-YYMMDD-NNNNN-01`, `-02`, etc.

### 2.2 Mécanismes de Protection Transactionnelle
1. **Compteur Atomique Firestore (`counters/cardNumbers`)** :
   - Opéré via `runTransaction` avec clause de monotonie stricte : `request.resource.data.lastInsuredNumber >= resource.data.lastInsuredNumber`.
   - Interdiction de suppression ou de décrémentation.
2. **Registre d'Immuabilité (`cardNumberRegistry`)** :
   - Écriture unique à la réservation de carte.
   - Suppression et modification formellement rejetées au niveau des règles de sécurité Firestore (`allow update, delete: if false;`).
3. **Audit de Continuité & Détection de Trous (Gaps)** :
   - Service `getCardContinuityReport()` et interface dédiée dans `CardNumberManagementModal.tsx` listant les numéros attribués, le maximum séquentiel et les éventuelles ruptures de continuité.

---

## 3. Rapport d'Audit de Sécurité & Modèle de Rôles

| Rôle | Périmètre d'action autorisé | Restrictions critiques & SoD |
| :--- | :--- | :--- |
| **Admin** | Administration globale, configurations, plafonds, polices de santé, audits. | Peut approuver tout dossier sauf s'il en est lui-même l'auteur direct. |
| **Supervisor** | Supervision, vérification d'éligibilité, validation des enrôlements et sinistres, fiches médicales. | SoD strict : interdiction formelle d'approuver un dossier créé par son propre compte. |
| **Agent** | Enrôlement des assurés, saisie des sinistres, génération des fiches médicales, capture biométrique. | Ne peut en aucun cas approuver, rejeter ou auto-valider des dossiers. |

### Vérification SoD à Trois Niveaux :
1. **Niveau UI** : Les boutons d'approbation sont désactivés ou signalent la restriction via `canApproveRecord()`.
2. **Niveau Métier & API (`workflowService.ts` / `/api/claims/*`)** : Rejet immédiat avec code d'erreur et consignation dans les logs d'audit.
3. **Niveau Base de Données (`firestore.rules`)** : Rejet cryptographique `(!('createdBy' in resource.data) || resource.data.createdBy != request.auth.uid)`.

---

## 4. Description des Modifications Apportées

### 4.1 Backend & Passerelle API
- **`server.ts`** : Point d'entrée hybride Express + Vite middleware, exposant :
  - `GET /api/health` : Surveillance de santé de la passerelle.
  - `POST /api/cards/verify-format` : Validation structurelle des numéros de carte.
  - `POST /api/policies/evaluate` : Évaluation automatique de l'état des polices santé.
  - `POST /api/claims/validate-coverage` : Vérification des plafonds et de la validité de couverture.
- **`functions/src/index.ts`** : Implémentation Cloud Functions pour environnement Firebase managé.

### 4.2 Services Métier Durcis
- **`src/services/cardNumberService.ts`** : Réservation transactionnelle, audit de continuité, conversion multi-formats.
- **`src/services/workflowService.ts`** : Application rigoureuse de la séparation des tâches et traçabilité d'audit.
- **`src/services/firestore.ts`** : Enrichissement d'`addLog` pour supporter `AuditLog` typé avec IP, User Agent et sévérité.
- **`src/services/policyService.ts`** : Évaluation du statut des polices avec période de grâce et blocage automatique.

### 4.3 Règles de Sécurité (`firestore.rules`)
- Règles déployées sur `ai-studio-activahealthpass-a71d742a-47a5-4343-b20f-a025fe51929b`.
- Collections sécurisées : `accounts`, `members`, `counters`, `cardNumberRegistry`, `healthPolicies`, `policyPayments`, `claims`, `medicalForms`, `enrollments`, `invoices`, `organizations`, `providers`, `ceilings`, `loginLogs`, `auditLogs`, `notifications`, `users`.

### 4.4 Interface Utilisateur (UX)
- Remplacement complet de 100% des appels `alert()` par des bannières réactives, toasts discrets et signalements inline.
- Ajout de l'outil d'audit de continuité de séquence dans le modal de gestion des cartes.

---

## 5. Guide de Déploiement Étape par Étape

### Prérequis
- Node.js 20+
- Firebase CLI (`npm install -g firebase-tools`)
- Projet Firebase initialisé : `ai-studio-activahealthpass-a71d742a-47a5-4343-b20f-a025fe51929b`

### Étapes d'exécution
1. **Compilation des Artefacts Frontend & Backend** :
   ```bash
   npm run build
   ```
   *Génère le build statique React dans `dist/` et le serveur CJS bundled dans `dist/server.cjs` via esbuild.*

2. **Déploiement des Règles Firestore** :
   ```bash
   firebase deploy --only firestore:rules
   ```

3. **Déploiement des Cloud Functions (Optionnel si hébergé en Cloud Run)** :
   ```bash
   firebase deploy --only functions
   ```

4. **Démarrage en Production (Container Cloud Run)** :
   ```bash
   npm start
   ```

---

## 6. Plan de Rollback en Cas d'Incident

En cas d'anomalie critique sur l'environnement de production :

1. **Règles Firestore** :
   - Restaurer la version précédente des règles via la console Firebase (`Firestore Database > Rules > Releases`).
2. **Artefacts Applicatifs** :
   - Redéployer l'image container de la révision précédente sur Cloud Run via `gcloud run services update-traffic`.
3. **Données & Registre de Numéros** :
   - Le registre `cardNumberRegistry` étant append-only, aucune écriture ne détruit de données préexistantes. En cas de blocage d'un numéro, la réservation peut être réassignée administrativement via l'annuaire des membres par un administrateur autorisé.

---

## 7. Matrice de Tests et Résultats

| # | Scénario de Test | Composant / API | Résultat Attendu | Statut |
| :-: | :--- | :--- | :--- | :-: |
| **T01** | Vérification format `AMID-260904-00042` | `/api/cards/verify-format` | Valide avec date `260904` et n° `42` | **SUCCÈS** |
| **T02** | Rejet format invalide `INVALID-123` | `/api/cards/verify-format` | Invalide avec motif explicite | **SUCCÈS** |
| **T03** | Évaluation police active à jour | `/api/policies/evaluate` | Statut "Active", `coverageBlocked: false` | **SUCCÈS** |
| **T04** | Évaluation police suspendue | `/api/policies/evaluate` | Statut "Suspended", `coverageBlocked: true` | **SUCCÈS** |
| **T05** | Tentative d'auto-approbation d'un enrôlement | `workflowService.ts` | Rejet avec violation SoD et consignation | **SUCCÈS** |
| **T06** | Tentative d'auto-approbation d'un sinistre | `workflowService.ts` | Rejet avec violation SoD et consignation | **SUCCÈS** |
| **T07** | Immuabilité de `cardNumberRegistry` | Firestore Rules | Écriture refusée en mise à jour / suppression | **SUCCÈS** |
| **T08** | Validation TypeScript globale | `npm run lint` (`tsc --noEmit`) | Zéro erreur de type | **SUCCÈS** |
| **T09** | Build de production complet | `npm run build` | Bundle client + serveur généré | **SUCCÈS** |
| **T10** | Eradication des alertes natives | `src/` | 0 appel `alert()` restant | **SUCCÈS** |

---
*Ce rapport certifie que l'application ACTIVA HealthPass est sécurisée, durcie et prête pour l'exploitation en production.*
