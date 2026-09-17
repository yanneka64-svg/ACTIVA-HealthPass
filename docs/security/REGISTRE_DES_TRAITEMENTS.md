# Registre des traitements — ACTIVA HealthPass

Date de création : 2026-09-06. Registre minimal (constat 2.7 de la revue de gouvernance des
données de santé) — à faire valider et compléter par le responsable de traitement (ACTIVA
Insurance Group) ; ce document décrit ce que le code fait réellement, pas une position légale
définitive.

## 1. Traitement : Gestion des dossiers d'assurance santé et des sinistres

**Finalité** : gestion de l'affiliation des assurés (adhésions), traitement des demandes de
remboursement (claims), émission de formulaires médicaux d'autorisation de soins, suivi des
polices d'assurance santé et des primes, pour le compte des organisations clientes d'ACTIVA
Insurance Group dans les pays où le groupe opère (Liberia, Cameroun, Côte d'Ivoire, Ghana,
Guinée, RDC, Sierra Leone).

**Base légale (à confirmer par le responsable de traitement)** : exécution du contrat
d'assurance souscrit par l'organisation cliente au bénéfice de l'assuré ; à défaut, intérêt
légitime d'ACTIVA à gérer les prestations d'assurance santé qu'elle assure. Aucun consentement
explicite distinct de l'assuré n'est actuellement recueilli ni tracé dans l'application — si un
usage secondaire (statistiques externes, partage avec un tiers non-assureur) devait être
introduit, une base légale et/ou un consentement dédié devraient être documentés avant sa mise
en œuvre.

**Catégories de personnes concernées** : assurés principaux et personnes à charge
(conjoint/enfants) des organisations clientes ; personnel ACTIVA (Agent, Superviseur, Admin)
utilisant l'application.

**Catégories de données traitées** (voir `src/types/dataClassification.ts` pour le détail
champ par champ) :
- Identité : nom, date de naissance, sexe, téléphone, e-mail, numéro de carte d'assuré.
- Santé (catégorie particulière) : diagnostic présumé, examens demandés, traitement prescrit,
  modalité de soin (ambulatoire/hospitalisation).
- Biométrie (catégorie particulière) : empreinte digitale (score, capteur, date, qualité NFIQ).
- Documents d'identité : photo, pièce d'identité scannée.
- Financier lié à la santé : montants de sinistres, primes, paiements.

**Destinataires** : personnel ACTIVA habilité selon son rôle (Agent : périmètre assigné ;
Superviseur/Admin : organisation(s) assignée(s) ou toutes si aucun périmètre n'est configuré —
voir DATA-01/MODEL-02 dans le rapport d'audit précédent) ; les prestataires de soins partenaires
reçoivent le formulaire médical imprimé/partagé au moment du soin (hors application, sur support
physique/PDF remis à l'assuré).

**Sous-traitants** : Google Cloud Platform (Firebase Firestore, Cloud Storage, Cloud Functions,
Firebase Authentication) — hébergement et infrastructure technique. **Aucun accord de
sous-traitance (DPA) spécifique à ce traitement n'a pu être confirmé dans le cadre de cette
revue** (action de gouvernance, hors périmètre du code — voir section 3.2 du rapport de revue).

**Durée de conservation** : **non définie à ce jour**. Aucun champ de rétention n'existe dans le
modèle de données ; les dossiers sont conservés indéfiniment jusqu'à suppression manuelle par un
Admin (voir 2.4 dans le rapport de revue — point volontairement reporté, nécessite de statuer sur
la durée réglementaire applicable par pays avant toute implémentation).

**Mesures de sécurité en place** (voir `docs/security/AUDIT_2026-09-05_REMEDIATION.md` et
`docs/security/HEALTH_DATA_GOVERNANCE_REVIEW_2026-09-05.md` pour le détail) :
- Authentification par compte nominatif, hachage des mots de passe (PBKDF2), rate limiting
  serveur sur les tentatives de connexion.
- Cloisonnement d'accès par rôle et par organisation cliente (Firestore Security Rules).
- Chiffrement applicatif du contenu clinique des formulaires médicaux (clé exclusivement
  serveur).
- Journalisation des connexions, des actions métier sensibles (approbations, rejets,
  suppressions en masse) et des exports de données.
- Archivage immuable avant toute suppression de dossier médical.
- Séparation des tâches (un même utilisateur ne peut approuver un dossier qu'il a lui-même créé).

**Droits des personnes concernées** : **non instrumentés dans l'application**. Aucun mécanisme
n'existe aujourd'hui pour qu'un assuré exerce un droit d'accès, de rectification ou d'effacement
directement — ces demandes devraient être traitées manuellement par le personnel ACTIVA habilité
via les écrans d'administration existants (modification/suppression d'un dossier), en l'absence
d'un flux dédié.

## 2. Traitement : Comptes et accès du personnel ACTIVA

**Finalité** : gestion des comptes utilisateurs internes (Agent, Superviseur, Admin) et de leurs
habilitations d'accès à l'application.

**Base légale** : intérêt légitime d'ACTIVA à sécuriser l'accès à ses systèmes d'information ;
le cas échéant, exécution du contrat de travail/mandat liant la personne à ACTIVA.

**Catégories de données** : identifiant, e-mail professionnel, nom complet, rôle, périmètre
d'organisations assigné, historique de connexion (IP, user-agent, localisation approximative).

**Durée de conservation** : non définie — comptes conservés jusqu'à désactivation/suppression
manuelle par un Admin.

**Mesures de sécurité** : voir traitement 1 — mêmes mécanismes (authentification, rate limiting,
journalisation).

---

*Ce registre doit être revu et complété par le responsable de traitement désigné chez ACTIVA
Insurance Group, en particulier sur : la base légale exacte par pays d'opération, la durée de
conservation réglementaire, l'accord de sous-traitance avec Google Cloud, et la mise en place
d'un canal formel d'exercice des droits des personnes concernées.*
