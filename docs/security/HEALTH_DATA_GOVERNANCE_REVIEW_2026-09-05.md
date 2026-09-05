# Revue de la modélisation des données et de la structuration du projet
## Au regard de la nature des données de santé, de la protection des données, de la sécurité informatique et des standards les plus élevés du domaine

Date : 2026-09-05
Périmètre : `src/types/index.ts`, `firestore.rules`, `storage.rules`, `functions/`, `server.ts`, `src/services/*`, `src/utils/excelUtils.ts`, configuration du projet.

Ce document est une **revue** (constat + recommandations), pas un correctif appliqué. Il fait
suite à l'audit de sécurité du 2026-09-05 (`AUDIT_2026-09-05_REMEDIATION.md`), qui a traité les
constats d'accès/authentification ; celui-ci porte spécifiquement sur la **modélisation des
données** et la **structuration du projet** au regard de la nature réellement sensible des
données traitées.

---

## 1. Ce que cette application traite réellement

ACTIVA HealthPass ne gère pas que des données d'assurance : elle traite, pour chaque assuré,
plusieurs catégories de données qui, dans la quasi-totalité des cadres de protection des
données (RGPD article 9, lois nationales des pays où ACTIVA opère — Ghana, Côte d'Ivoire,
Cameroun, Guinée, RDC, Sierra Leone —, et référentiels sectoriels comme HIPAA aux États-Unis),
sont classées comme **catégories particulières** appelant une protection renforcée :

| Catégorie | Champs concernés | Base légale/type |
|---|---|---|
| **Données de santé** | `MedicalForm.doctorPrescription.{presumedDiagnosis, requestedExams, treatmentOrder}`, `coverageType`, `doctorSpecialty` | Donnée de santé au sens strict — diagnostic présumé, examens demandés, traitement prescrit |
| **Données biométriques** | `Member.fingerprintScore/fingerprintSensor/fingerprintDate/nfiqQuality`, `Enrollment.fingerprintScore`, `Claim.fingerprintSampleUrl/fingerprintScore` | Empreinte digitale — donnée biométrique identifiante |
| ~~Identifiant national potentiel~~ | ~~`MedicalForm.securityNumber`~~ | **Correction post-vérification (implémentation section 3.1)** : `securityNumber` est en réalité un code-barres interne au document (format `AMID-YY-DD-XXXX`, dérivé de la date d'impression et des 4 derniers chiffres du numéro de carte — voir `medicalFormUtils.ts`), pas un identifiant national de la personne. Ligne conservée à titre de trace de la correction ; ce champ n'a pas été chiffré, cela aurait cassé la recherche et la validation de format sans bénéfice de confidentialité réel. |
| **Pièces d'identité / photos** | `Member.photoUrl`, `Enrollment.photoUrl/idDocumentUrl` | Identification visuelle, document officiel |
| **PII directe** | `birthDate`, `gender`, `phone`, `email`, `principalName`/`memberName`/`fullName`, `cardNo` | Identifiants directs |
| **Données financières liées à la santé** | `Claim.amount`, `HealthPolicy.annualPremium`, `PolicyPayment.*` | Révèlent indirectement des informations de santé (montant d'un acte = nature de l'acte) |

**Constat central de cette revue** : le modèle de données actuel **ne distingue nulle part** ces
catégories les unes des autres. Une seule collection Firestore (`medicalForms`) mélange, dans un
même document, l'identité complète de l'assuré (nom, numéro de carte, date de naissance, sexe,
numéro de sécurité) et le contenu clinique (diagnostic présumé, examens, traitement). Il n'existe
aucun champ de classification (`dataClassification`, `sensitivity`), aucune séparation
identité/clinique, et aucun traitement différencié en fonction de la sensibilité réelle de la
donnée. C'est la racine de la plupart des constats ci-dessous.

---

## 2. Modélisation des données — constats

### 2.1 Absence de séparation entre identité et contenu clinique (ÉLEVÉE)
`MedicalForm` porte, dans le **même document Firestore**, `memberName` + `memberCardNo` +
`memberBirthDate` + `memberGender` + `securityNumber` (identité directe) et
`doctorPrescription.presumedDiagnosis/requestedExams/treatmentOrder` (contenu clinique). Les
référentiels de sécurité de l'information de santé (ISO/IEC 27799, guides HDS) recommandent que
l'identité et le contenu clinique soient, autant que possible, **découplés** : soit par
pseudonymisation (un identifiant technique fait le lien, l'identité directe n'apparaît pas dans
le document clinique), soit par un cloisonnement d'accès distinct (une collection `clinicalNotes`
séparée de `memberIdentities`, avec des règles Firestore propres). Aujourd'hui, toute fuite ou
tout accès excessif à `medicalForms` expose mécaniquement l'identité ET le diagnostic ensemble —
le scénario le plus dommageable pour la personne concernée.

### 2.2 Aucun champ de classification de la donnée (ÉLEVÉE)
Aucune interface TypeScript ne porte de champ `sensitivity`/`dataClass`/`piiLevel`. Sans cette
classification explicite dans le modèle, il est structurellement impossible d'appliquer des
contrôles différenciés (chiffrement renforcé, rétention plus courte, journalisation systématique
des accès) de façon automatisée et vérifiable — chaque nouvelle fonctionnalité doit
« redécouvrir » manuellement qu'un champ est sensible.

### 2.3 Donnée biométrique traitée comme un attribut ordinaire (ÉLEVÉE)
`fingerprintScore`/`fingerprintSensor`/`nfiqQuality` sont des colonnes ordinaires de `Member`,
`Enrollment`, `Claim` — au même niveau que `phone` ou `email`. Aucune règle Firestore ni aucun
commentaire de code ne les traite différemment des autres champs. Les standards de protection des
données biométriques (RGPD art. 9, guides CNIL sur la biométrie) demandent une base légale et des
garanties spécifiques (le score/gabarit ne devrait pas être exportable en masse au même titre
qu'un numéro de téléphone — voir 2.6 sur les exports).

### 2.4 Aucun champ de rétention ni de cycle de vie de la donnée (ÉLEVÉE)
Aucune collection ne porte de champ `retentionUntil`/`scheduledDeletionAt`. Le principe de
limitation de la conservation (RGPD art. 5-1-e, et équivalents dans les lois nationales
africaines citées) exige qu'une donnée de santé ne soit conservée que le temps nécessaire à la
finalité (souvent encadré par la réglementation assurantielle locale — typiquement plusieurs
années après la fin du contrat, mais **pas indéfiniment**). Aujourd'hui, une donnée médicale
entrée en 2020 et une donnée entrée hier sont traitées à l'identique, indéfiniment, sans mécanisme
d'archivage, d'anonymisation différée ni de purge programmée.

### 2.5 Suppression = suppression physique irréversible, y compris en masse (CRITIQUE)
`FirestoreService.deleteMedicalForm` et surtout `FirestoreService.deleteAllMedicalForms`
(`src/services/firestore.ts`) suppriment définitivement, sans sauvegarde ni marquage, tout ou
partie de la collection `medicalForms` — exposée dans l'interface via un bouton « Clear All
History » (voir commentaire dans `firestore.rules`, section `medicalForms`). Deux problèmes
distincts et cumulés :
- **Disponibilité/intégrité** : une erreur de manipulation ou un compte Admin compromis peut
  effacer l'historique médical complet d'une organisation en un clic, sans aucun filet
  (pas de corbeille, pas de sauvegarde différée, pas de confirmation à deux facteurs pour une
  opération de cette ampleur).
- **Conformité** : un effacement de masse non tracé dans un journal d'audit dédié et immuable
  (au-delà du log générique déjà en place) prive l'organisation de toute capacité de reconstituer
  ce qui a été supprimé, par qui, et pourquoi — alors que c'est précisément ce qu'un contrôle
  réglementaire ou une plainte d'assuré exigerait de produire.

### 2.6 Exports en masse non maîtrisés (ÉLEVÉE)
`src/utils/excelUtils.ts` (2 274 lignes) génère des fichiers Excel/PDF en clair, côté navigateur,
à partir des données de claims/reports/policies — sans filigrane, sans chiffrement de fichier,
sans limitation du volume exporté, et sans journalisation de **ce qui a été exporté** (seul le
fait qu'un export a eu lieu peut être déduit indirectement). Le correctif SEC-07 de l'audit
précédent conditionne déjà le bouton Export au rôle (Admin/Supervisor), mais rien n'empêche un
Supervisor légitime d'exporter, en un clic, l'intégralité des claims d'une organisation — y
compris les montants qui, recoupés avec `careType`, peuvent révéler la nature d'un acte médical —
vers un fichier local non protégé, sans trace de ce qui est parti.

### 2.7 Absence de traçabilité de la base légale / du consentement (MOYENNE)
Aucun champ ne trace la base légale du traitement (contrat d'assurance, obligation légale) ni,
le cas échéant, un consentement explicite de l'assuré pour des usages allant au-delà de la
gestion du sinistre (ex. statistiques, partage avec un tiers). Pour une activité d'assurance, la
base légale contractuelle couvre probablement l'essentiel du traitement — mais cela devrait être
**documenté explicitement** (registre des traitements) plutôt qu'implicite, et tout usage
secondaire (reporting agrégé, partage avec un partenaire) devrait pouvoir s'appuyer sur une base
identifiée.

### 2.8 Doublon de source de vérité (MODEL-04, déjà identifié, toujours ouvert)
`AccountsView.tsx`, `LoginView.tsx` et `App.tsx` continuent d'écrire directement sur `accounts`
via le SDK Firestore, en parallèle de `FirestoreService`. Pour une collection qui porte
désormais (depuis le dernier correctif de sécurité) la seule vérité d'accès aux données de santé
via `hasOrgAccess()`, cette duplication augmente le risque qu'un futur correctif de sécurité soit
appliqué à un seul des chemins d'écriture et pas à l'autre — un risque déjà matérialisé une fois
dans cet audit (voir SEC-01).

---

## 3. Protection des données — constats au regard des standards

### 3.1 Chiffrement au repos : uniquement au niveau infrastructure (MOYENNE)
Firestore et Cloud Storage chiffrent nativement au repos (clés gérées par Google) — c'est le
niveau attendu par défaut, et il est bien en place. Mais pour les champs les plus sensibles
identifiés en section 1 (diagnostic, numéro de sécurité, gabarit biométrique), les standards les
plus élevés (ISO 27799, exigences type HDS/HIPAA) recommandent un **chiffrement applicatif
supplémentaire au niveau du champ**, pour que même un accès Firestore mal configuré (ce qui s'est
déjà produit deux fois dans ce projet — `accounts` en lecture publique, puis `storage` sans
cloisonnement) n'expose pas directement le contenu clinique en clair. Aujourd'hui, aucun champ
n'est chiffré côté application.

### 3.2 Résidence et transfert des données (À VÉRIFIER — hors code)
Le projet utilise une base Firestore nommée sur Google Cloud (`gen-lang-client-0957905786`),
sans indication dans le dépôt de sa région de déploiement. ACTIVA opère dans sept pays (Liberia,
Cameroun, Côte d'Ivoire, Ghana, Guinée, RDC, Sierra Leone), dont plusieurs disposent de lois de
protection des données avec des exigences de localisation ou de transfert transfrontalier
(notamment le Ghana — Data Protection Act 2012 — et la Côte d'Ivoire). Aucun élément du dépôt ne
permet de confirmer : (a) la région Firestore réellement utilisée, (b) l'existence d'un contrat de
sous-traitance (Data Processing Agreement) formalisé avec Google Cloud couvrant le traitement de
données de santé, (c) une analyse d'impact (DPIA/AIPD) documentée pour ce traitement. C'est un
point de gouvernance, pas de code — mais il conditionne la conformité de tout ce qui précède.

### 3.3 Dépendance IA inutilisée mais présente (FAIBLE, mais à corriger)
`package.json` déclare `@google/genai` (SDK Gemini) et `GEMINI_API_KEY` est référencée dans
`.env.example` — vestiges du template Google AI Studio dont ce projet est issu. **Aucun appel
réel** à cette API n'a été trouvé dans `src/`. C'est positif (aucune donnée de santé n'est
aujourd'hui envoyée à un service d'IA tiers), mais la dépendance inutilisée reste une surface
d'attaque et une confusion potentielle : si un développeur l'active un jour pour une
fonctionnalité (résumé de dossier, aide au diagnostic...), il le ferait sans qu'aucun DPA avec le
fournisseur d'IA ni aucune anonymisation préalable ne soit exigée par le code — rien ne
matérialise ce garde-fou.

### 3.4 Aucune protection applicative contre l'abus (App Check / WAF) (MOYENNE)
`firebase-applet-config.json` a `recaptchaSiteKey: ""` — Firebase App Check n'est pas configuré.
Pour une application de santé exposée publiquement (écran de connexion accessible sans
authentification préalable), App Check est la protection standard contre les clients non
légitimes (scripts automatisés, clones de l'API) qui viendrait compléter le rate limiting déjà en
place côté Cloud Function (`resolveLoginIdentifier`).

### 3.5 Aucun en-tête de sécurité HTTP applicatif (MOYENNE)
`server.ts` (Express) ne pose aucun en-tête de sécurité (`Content-Security-Policy`,
`X-Frame-Options`, `Strict-Transport-Security`, `X-Content-Type-Options`) — ni via un middleware
dédié (`helmet` n'est pas une dépendance du projet) ni manuellement. Pour une application
manipulant des données de santé, une CSP stricte réduit significativement l'impact d'une faille
XSS qui exposerait le contenu de l'application (y compris les diagnostics affichés à l'écran).

### 3.6 Journalisation des accès en lecture absente (MOYENNE, limite structurelle documentée)
`auditLogs` trace les connexions et les actions métier (approbations, rejets) mais **pas les
consultations** d'un dossier médical individuel — architecture typique d'une SPA Firestore
(chaque lecture passe par le SDK client, hors du contrôle d'un serveur qui pourrait la
journaliser). Les référentiels de sécurité de l'information de santé les plus exigeants (ISO
27799, HIPAA §164.312(b)) attendent une capacité de reconstituer qui a consulté le dossier d'un
patient donné, pas seulement qui l'a modifié. Combler cet écart demanderait une bascule
architecturale (lectures via Cloud Function/API plutôt que SDK client direct) — un chantier de
fond, pas un correctif ponctuel, mais à inscrire dans une trajectoire si le niveau de conformité
visé est élevé.

---

## 4. Structuration du projet — constats

### 4.1 Deux implémentations parallèles de la même logique métier serveur
`server.ts` (Express) et `functions/` (Cloud Functions) réimplémentent chacun, avec des
divergences mineures mais réelles, l'évaluation de police (`evaluatePolicyFromRecord` vs
`evaluatePolicyServer`) et un jeu de routes qui se recoupent partiellement. Depuis le dernier
audit, `server.ts` a perdu ses routes d'authentification (supprimées), mais conserve
`/api/policies/evaluate` et `/api/claims/validate-coverage`, alors que `functions/` porte
`evaluatePolicy`/`validateCoverage` — deux sources de vérité serveur pour la même règle métier,
avec le risque qu'un correctif futur (ex. un nouveau statut de police) soit appliqué à l'une et
oublié dans l'autre.

### 4.2 Absence de couche de validation/chiffrement centralisée pour les champs sensibles
`functions/src/validation.ts` valide déjà les types/formats des payloads entrants (bonne
pratique). Rien d'équivalent n'existe côté **écriture des champs sensibles identifiés en
section 1** — aucun point de passage obligé qui appliquerait, par exemple, un chiffrement
applicatif au champ `presumedDiagnosis` avant écriture. Une politique de sécurité des données de
santé mature centralise ce traitement (un seul module `sensitiveFields.ts` que tout chemin
d'écriture doit utiliser), plutôt que de compter sur chaque écran à faire le bon choix.

### 4.3 Séparation des environnements
Un seul projet Firebase (`gen-lang-client-0957905786`) semble servir à la fois de cible de
développement et de production (le fichier `firebase.json` ne référence qu'un seul projet, et
`.firebaserc` ne définit qu'un alias `default`). Pour une donnée de santé, l'absence d'un
environnement de recette isolé (déjà relevé comme INFRA-04 dans l'audit précédent) signifie que
tout test, y compris de bonne foi, s'exécute contre la base contenant potentiellement de vraies
données d'assurés.

---

## 5. Priorisation des recommandations

*Mise à jour au fil de l'implémentation — voir l'historique git de ce fichier pour le détail des
correctifs appliqués.*

### Critique — à traiter avant toute extension de la base d'utilisateurs
1. ✅ **CORRIGÉ** (commit `d5646fc`) — **Sécuriser la suppression de masse des dossiers
   médicaux** (2.5). Découverte plus grave que documentée initialement : un `useEffect` dans
   `App.tsx` déclenchait `deleteAllMedicalForms()` automatiquement à CHAQUE chargement de
   l'application pour tout compte Admin (garde-fou `useRef` ne survivant pas à un rechargement
   de page) — retiré entièrement. `deleteMedicalForm`/`deleteAllMedicalForms` archivent
   désormais chaque document (contenu intégral + qui/quand/pourquoi) dans la collection
   immuable `medicalFormsDeletionArchive` avant toute suppression physique, avec traitement par
   lots et audit structuré. La suppression en masse côté UI exige un motif et la saisie exacte
   d'une phrase de confirmation.

### Élevée
2. ⏸️ **REPORTÉ** (décision explicite du 2026-09-05) — **Séparer identité et contenu clinique**
   dans `medicalForms` (2.1) : restructuration de schéma à risque de régression réel (création,
   affichage, historique, PDF), nécessite un créneau de validation visuelle dédié.
3. ⏸️ Non traité — **Champ de classification** (2.2) sur chaque type sensible.
4. ✅ **CORRIGÉ** (commit `5868cab`) — **Chiffrement applicatif des champs les plus sensibles**
   (3.1), avec clé exclusivement côté serveur (Cloud Function, jamais dans le navigateur) :
   `presumedDiagnosis`/`requestedExams`/`treatmentOrder` de `medicalForms`. Correction
   importante par rapport au constat initial : `securityNumber` s'est avéré, après vérification,
   être un code-barres interne au document (pas un identifiant national) — volontairement exclu
   du chiffrement, qui aurait cassé la recherche/le scan sans bénéfice réel (voir section 1,
   note de correction). Nécessite le déploiement de la Cloud Function et la configuration du
   secret pour prendre effet.
5. ⏸️ **REPORTÉ** (décision explicite du 2026-09-05, vu la découverte du point 1) — **Politique
   de rétention et de purge programmée** (2.4) : aucun nouveau mécanisme de suppression
   automatisée ne sera construit sans un point dédié sur les durées réglementaires par pays et
   les garde-fous exigés.
6. ✅ **CORRIGÉ** (commit `5d44ca5`) — **Encadrer les exports en masse** (2.6) : chaque export
   (rapports, polices, claims, membres) écrit désormais une entrée d'audit structurée
   (qui/quoi/quand) dans `auditLogs`.

### Moyenne
7. Activer Firebase App Check (3.4).
8. Ajouter des en-têtes de sécurité HTTP (3.5, `helmet` ou équivalent).
9. Retirer la dépendance `@google/genai` inutilisée, ou documenter formellement l'interdiction
   d'y faire transiter des données de santé tant qu'aucun DPA n'est en place (3.3).
10. Documenter explicitement la base légale de traitement par finalité (2.7) — registre des
    traitements, même minimal.
11. Faire converger les deux implémentations serveur dupliquées (4.1).

### Nécessite une décision de gouvernance, pas seulement du code
12. Confirmer la région Firestore/Storage réellement utilisée et l'aligner sur les exigences de
    résidence des pays d'opération (3.2).
13. Formaliser un accord de sous-traitance (DPA) avec Google Cloud couvrant explicitement le
    traitement de données de santé, et conduire une analyse d'impact (DPIA/AIPD) documentée pour
    ce traitement (3.2).
14. Définir un environnement de recette isolé de la production (4.3).
15. Trancher la trajectoire cible pour la journalisation des accès en lecture aux dossiers
    médicaux (3.6) — implique potentiellement de faire transiter les lectures sensibles par une
    Cloud Function plutôt que par le SDK client direct, un changement d'architecture, pas un
    correctif.

---

## 6. Ce qui est déjà solide et ne doit pas être perdu de vue

Cette revue est volontairement critique ; il est important de noter que l'audit de sécurité
précédent a déjà posé des fondations correctes qui bénéficient directement à cette analyse : le
cloisonnement par organisation (`hasOrgAccess()`), la séparation des tâches côté serveur sur les
décisions de claims/enrollments, le hachage PBKDF2 des mots de passe, le rate limiting serveur, et
le schéma imposé sur `auditLogs`. Les recommandations ci-dessus s'appuient sur ces fondations et
ne les remettent pas en cause — elles portent sur un niveau d'exigence supplémentaire, propre à la
nature spécifiquement médicale des données traitées, au-delà du contrôle d'accès déjà traité.
