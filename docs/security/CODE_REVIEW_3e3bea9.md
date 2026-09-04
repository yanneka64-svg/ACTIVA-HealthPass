# Revue de code — commit `3e3bea9` "chore: implement security audit and hardening"

Revue demandée explicitement avant tout déploiement. Périmètre : `firestore.rules`,
`functions/src/*.ts`, `server.ts`, `src/lib/firebase.ts`, et vérification de ce qui est
réellement câblé au frontend. Aucune correction appliquée à ce stade — constats uniquement,
classés par sévérité.

---

## 🔴 HIGH — `healthPolicies` : la mise à jour de `coverageBlocked` n'est pas vérifiée

**Fichier** : `firestore.rules`, règle `match /healthPolicies/{organizationName}`

```js
allow update: if isSignedIn() && isActiveUser() && (
  isAdmin() ||
  request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'coverageBlocked', 'updatedAt', 'lastEvaluatedAt'])
);
```

Cette règle autorise **n'importe quel utilisateur actif connecté (y compris un Agent)** à modifier
`coverageBlocked` et `status`, tant qu'il ne touche à aucun autre champ. Elle vérifie QUELS
champs changent, jamais QUELLE VALEUR est écrite. Concrètement : un Agent peut, via un simple
appel direct au SDK Firestore (sans passer par l'interface), envoyer
`updateDoc(doc(db,'healthPolicies','MonOrg'), { coverageBlocked: false, updatedAt: ... })` et
lever instantanément le blocage de couverture d'une police Suspendue/Expirée — exactement le
scénario que la Phase 6 du brief demande d'empêcher ("le refus doit être garanti côté serveur").
`policyBlocksCoverage()` (utilisée pour bloquer `claims`/`medicalForms`) lit précisément ce
champ : le contourner ici contourne tout le mécanisme de blocage.

**Recommandation** : soit restreindre cette mise à jour à `isAdmin() || isSupervisor()`, soit
(mieux, pour garder l'auto-synchronisation cliente actuelle utilisable par tous les rôles)
déplacer le calcul de `coverageBlocked`/`status` vers une Cloud Function/trigger qui est la
SEULE à pouvoir écrire ces deux champs, et retirer ce chemin d'écriture direct pour les
utilisateurs non-Admin.

---

## 🔴 HIGH — Le compteur de cartes (`counters/cardNumbers`) n'est pas réellement protégé contre la régression

**Fichier** : `firestore.rules`, règle `match /counters/{counterId}`

```js
allow update: if isSignedIn() && isActiveUser() && (
  !('lastInsuredNumber' in resource.data) ||
  !('lastInsuredNumber' in request.resource.data) ||
  request.resource.data.lastInsuredNumber >= resource.data.lastInsuredNumber
);
```

Le champ réellement utilisé partout dans le code (client `cardNumberService.ts`, Cloud
Function `functions/src/cardService.ts`, `functions/src/importService.ts`, et le type
`CardNumberCounters` dans `src/types/index.ts`) s'appelle **`lastAssuredNumber`**, jamais
`lastInsuredNumber`. Comme ce champ n'existe donc jamais sous ce nom, la condition
`!('lastInsuredNumber' in resource.data)` est **toujours vraie**, ce qui rend toute la garde
anti-régression inopérante : n'importe quel utilisateur actif peut faire reculer le compteur
(`lastAssuredNumber: 1`) sans que cette règle ne s'y oppose — ouvrant la voie à une réattribution
de numéros de carte déjà consommés, exactement ce que le brief interdit formellement ("NE PAS
réattribuer un numéro déjà consommé").

**Recommandation** : corriger le nom du champ dans la règle (`lastAssuredNumber` au lieu de
`lastInsuredNumber`).

---

## 🟠 MEDIUM — Les Cloud Functions et l'API serveur (`server.ts`) ne sont appelées par AUCUN code frontend

Recherche exhaustive (`httpsCallable`, `getFunctions`, et les noms des fonctions
`generateCardNumber`/`batchGenerateCardNumbers`/`evaluatePolicy`/`syncPolicy`/
`processClaimDecision`/`validateHealthcareAccess`/`processBulkMemberImport`/`logAuditEvent`)
dans tout `src/` : **zéro résultat**. `src/services/policyEngine.ts` définit bien
`evaluatePolicyWithServer()` (qui appelle `fetch('/api/policies/evaluate', ...)`, la route
Express de `server.ts`), mais cette fonction elle-même **n'est appelée nulle part** — le code
existant continue d'utiliser exclusivement `getPolicyCoverageStatus()`/`hasHealthcareAccess()`
(la version 100 % cliente, inchangée).

Concrètement, à ce stade : la génération de carte, l'évaluation de police, la décision sur un
claim, et l'import massif s'exécutent encore **exactement comme avant ce commit**, entièrement
côté client — seul `firestore.rules` (qui, lui, est réellement appliqué par Firestore quel que
soit le code frontend) a un effet réel aujourd'hui. Les 5 modules `functions/src/*.ts` et
`server.ts` sont du code mort tant qu'ils ne sont pas explicitement appelés depuis le frontend
ET déployés (voir point suivant).

**Recommandation** : soit câbler progressivement le frontend vers ces fonctions (en gardant
l'interface existante, comme le préconise la Phase 5 du brief), soit documenter clairement que
ce code est un socle non encore activé, pour ne pas laisser croire que le contrôle est déjà
déplacé côté serveur.

---

## 🟠 MEDIUM — Même câblé, `server.ts` n'a pas de chemin de déploiement connu

Aucun `firebase.json` à la racine, aucun `netlify.toml`. Or votre déploiement de production est
Netlify (confirmé plus tôt dans cette session), qui sert `dist/` en statique — il n'exécute pas
`dist/server.cjs` (un serveur Express) sans configuration additionnelle (Netlify Functions avec
un adaptateur, ou un service Node séparé). Si `evaluatePolicyWithServer()` était un jour appelé
depuis l'UI, son `fetch('/api/policies/evaluate')` retournerait probablement une 404 en
production, et la fonction retombe silencieusement sur le calcul local (`catch { }` dans
`policyEngine.ts`) — un faux sentiment de sécurité serveur sans protection réelle.

**Recommandation** : clarifier la cible de déploiement réelle de ces endpoints (Cloud Functions
déployées séparément et appelées en `httpsCallable`, ou un service Node hébergé ailleurs que
Netlify) avant de considérer cette couche comme active.

---

## 🟠 MEDIUM — Logique de police divergente entre client et serveur

**Fichiers** : `src/services/policyEngine.ts` (`getPolicyCoverageStatus`) vs
`functions/src/policyService.ts` (`evaluatePolicyServer`)

Le moteur serveur, lorsqu'un paiement est en retard MAIS encore dans le délai de grâce,
retourne immédiatement `{ status: 'Active', coverageBlocked: false }` **sans jamais vérifier
`manuallySuspended`** ensuite. Le moteur client, lui, vérifie la suspension manuelle
indépendamment du statut de paiement. Résultat : une police à la fois "en retard de paiement
mais dans le délai de grâce" ET "suspendue manuellement" serait évaluée `Active` par le
serveur, mais `Suspended` par le client — exactement la divergence que le brief demande
d'éviter ("aucun flux ne puisse diverger").

De plus, le moteur serveur bloque sur un paiement en retard dès `diffPastDue > graceDays`,
**sans vérifier `outstandingAmount > 0`** (le moteur client l'exige). Une police dont le solde
dû est déjà à 0 mais dont la date est passée serait donc bloquée à tort côté serveur.

**Recommandation** : aligner `evaluatePolicyServer` sur l'ordre de règles et les conditions
exactes de `getPolicyCoverageStatus` (source de vérité actuelle), ou factoriser en un seul
moteur partagé pour éliminer le risque de divergence future.

---

## 🟠 MEDIUM — `medicalForms` : suppression ouverte à tout utilisateur actif, sans notion de propriétaire

**Fichier** : `firestore.rules`, `match /medicalForms/{formId}` → `allow delete: if isSignedIn() && isActiveUser();`

Ce commit ajoute une vraie fonctionnalité de suppression de fiche médicale côté Agent
(`AgentMedicalFormView.tsx`, `onDeleteMedicalForm`/`onClearAllMedicalForms`) — la règle a donc
été volontairement assouplie par rapport à ma Phase 1 (qui la réservait à `isAdmin()`), ce qui
est cohérent avec cette nouvelle fonctionnalité. Cependant, le type `MedicalForm` ne porte
toujours aucun champ `createdBy` : la règle ne peut donc pas restreindre la suppression au
créateur du document — **tout Agent actif peut supprimer la fiche médicale de n'importe quel
autre Agent**, pas seulement les siennes. `medicalForms` est explicitement identifiée comme
sensible en Phase 7 du brief ("Protection des données médicales").

**Recommandation** : ajouter un champ `createdBy` (uid) à la création des `medicalForms` (comme
c'est déjà fait pour `claims`/`enrollments`), puis restreindre `delete` à
`isAdmin() || resource.data.createdBy == request.auth.uid`.

---

## 🟡 LOW — Incohérence de la règle SoD entre trois couches

Trois implémentations légèrement différentes de "pas d'auto-approbation" coexistent :

1. `AUDIT_AND_HARDENING_REPORT.md` (documentation) : "Admin... Peut approuver tout dossier
   **sauf s'il en est lui-même l'auteur direct**" — donc Admin inclus dans la restriction.
2. `functions/src/claimsService.ts` (`processClaimDecisionServer`) : bloque l'auto-approbation
   **pour tout rôle, Admin inclus** (`if (claim.createdBy === payload.approverId) throw`) —
   cohérent avec la documentation, mais rappel : cette fonction n'est jamais appelée (voir plus
   haut).
3. `firestore.rules` (`claims`/`enrollments` update) : `isAdmin() || (!statusChanging) ||
   (isSupervisor() && notSelf)` — **`isAdmin()` court-circuite AVANT toute vérification
   d'auto-approbation** : un Admin qui aurait créé son propre dossier (la matrice de permissions
   l'y autorise) peut se l'approuver lui-même via la règle réellement appliquée aujourd'hui,
   contrairement à ce que documente le rapport et à ce qu'implémente la Cloud Function.

**Recommandation** : aligner `firestore.rules` sur le comportement documenté et sur la Cloud
Function (retirer le court-circuit `isAdmin()` du test d'auto-approbation, ne le garder que
pour les updates qui ne changent pas le statut).

---

## 🟡 LOW — Import massif : incrément de compteur hors transaction (risque de doublon en cas d'import concurrent)

**Fichier** : `functions/src/importService.ts`, `processBulkMemberImportServer`

Contrairement à `generateNextCardNumberServer`/`batchGenerateCardNumbersServer` (qui utilisent
`db.runTransaction`), cette fonction lit `counters/cardNumbers` une seule fois **hors
transaction**, distribue les numéros en mémoire, puis écrit membres/registre par lots et met à
jour le compteur à la fin par un `set()` simple. Deux imports simultanés (ou un import concurrent
à une génération manuelle) pourraient lire le même compteur de départ et produire des numéros de
carte en double — précisément le scénario que le brief demande d'empêcher explicitement
("empêcher les doublons en cas de... import concurrent"). Actuellement sans conséquence
puisque cette fonction n'est pas appelée (voir plus haut), mais à corriger avant tout câblage.

**Recommandation** : envelopper la lecture du compteur + les écritures du registre + la mise à
jour finale du compteur dans une seule `runTransaction`, ou au minimum re-vérifier chaque numéro
contre le registre juste avant écriture dans une transaction courte par lot.

---

## 🟡 LOW — `testConnection()` échoue systématiquement (inoffensif, mais bruit inutile)

**Fichier** : `src/lib/firebase.ts`

Le nouvel appel `getDocFromServer(doc(db, "test", "connection"))`, exécuté au chargement de
chaque page, cible une collection `test` qui n'a aucune règle dédiée dans `firestore.rules` —
donc refusée par défaut (`permission-denied`) pour tout le monde, tout le temps, y compris un
Admin connecté. Le `catch` ne traite explicitement que le message "the client is offline" ; le
cas `permission-denied` (le cas réel ici) est silencieusement ignoré — sans casser
l'application, mais sans jamais accomplir ce que la fonction est censée vérifier, et en
générant un appel réseau et une entrée d'erreur Firestore inutiles à chaque chargement.

**Recommandation** : soit ajouter une règle dédiée et sans risque pour `test/connection`
(lecture par tout utilisateur connecté), soit retirer cet appel.

---

## Ce qui a été vérifié comme correct

- La transaction de génération de carte (`generateNextCardNumberServer`,
  `batchGenerateCardNumbersServer`) est correctement atomique et protège bien contre les
  doublons en écriture concurrente.
- `isActiveUser()` (nouveau) applique bien Phase 1's demande "vérifier isActive lorsque
  nécessaire", absente de ma propre implémentation précédente.
- L'amorce de Custom Claims (`request.auth.token.role`/`isActive`, avec repli sur
  `accounts/{uid}` si absent) est une base saine pour la Phase 2, rétro-compatible avec les
  comptes existants (aucun claim n'étant encore réellement attribué, le repli s'applique
  systématiquement aujourd'hui — comportement inchangé).
- Les changements dans `ExcelImportModal.tsx` (remplacement d'un `alert()` par une bannière
  d'erreur inline) sont une amélioration UX correcte et sans risque.

## Prochaine étape proposée

Confirmer lesquels de ces constats corriger et dans quel ordre — je recommande de traiter les
deux 🔴 HIGH en priorité (contournement réel du blocage de couverture, et compteur de cartes non
protégé), puisqu'ils sont exploitables **dès aujourd'hui**, indépendamment de tout déploiement
de Cloud Functions.
