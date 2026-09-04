# Incident : échec de connexion Superviseur / Agent (4 sept. 2026)

## Symptôme rapporté

> « Lorsque j'essaye de me connecter sur le compte superviseur ou sur le compte agent, je
> reçois le message suivant » — capture d'écran montrant "Invalid username or password.
> Please verify your credentials." pour le nom d'utilisateur `yannick.ekani` (pas d'e-mail
> complet, pas de `@`).

## Ce qui a été vérifié dans le code (aucune régression trouvée côté dépôt)

- `firestore.rules` (tel qu'il est dans ce dépôt) autorise la lecture de `accounts` sans
  authentification : `allow read: if true;` — nécessaire car `LoginView.tsx` doit pouvoir
  chercher le compte correspondant au nom d'utilisateur saisi **avant** que l'utilisateur ne
  soit authentifié auprès de Firebase Auth.
- La logique de recherche/correspondance de compte dans `LoginView.tsx` (comparaison sur
  `email`, `username`, `authEmail`) est cohérente avec les champs réellement écrits par
  `AccountsView.tsx` à la création d'un compte.
- Aucun des changements apportés pendant cette session (câblage des Cloud Functions,
  correctifs de règles sur `healthPolicies`/`counters`/`claims`/`enrollments`/`medicalForms`,
  `src/lib/firebase.ts`) ne touche `LoginView.tsx`, `AccountsView.tsx`, ni les règles sur
  `accounts` — ce n'est donc très probablement pas une régression introduite par ce travail.
- `tsc --noEmit` et `npm run build` restent propres après les correctifs de ce document.

## Cause la plus probable : les règles Firestore du dépôt n'ont jamais pu être déployées

Constat déterminant : **il n'existait aucun `firebase.json` dans ce dépôt** avant ce commit.
Sans lui, la commande standard `firebase deploy --only firestore:rules` n'a jamais pu être
exécutée correctement depuis ce dépôt par qui que ce soit (moi y compris — je n'ai jamais eu
d'accès de déploiement Firebase dans cet environnement, comme documenté depuis
`PHASE0_AUDIT.md`).

Pire : `firebase-applet-config.json` révèle que l'application utilise une **base Firestore
nommée**, pas la base `(default)` :

```
"firestoreDatabaseId": "ai-studio-activahealthpass-a71d742a-47a5-4343-b20f-a025fe51929b"
```

Sans un `firebase.json` référençant explicitement cette base, une commande de déploiement de
règles lancée « à l'aveugle » viserait la base `(default)` — pas celle réellement utilisée par
l'app. Autrement dit, **toutes les évolutions de `firestore.rules` faites dans ce dépôt
pendant cette session (Phase 1, correctifs de sécurité, durcissement SoD...) ont pu n'avoir
strictement aucun effet sur les règles réellement appliquées en production**, si elles n'ont
jamais été copiées manuellement dans la console Firebase pour la bonne base.

Si les règles réellement actives sur cette base sont plus restrictives que celles du dépôt
(par exemple un ancien brouillon, ou le modèle par défaut Firebase qui refuse tout accès non
authentifié), alors la requête de pré-authentification `getDocs(collection(db, 'accounts'))`
dans `LoginView.tsx` échoue silencieusement pour **tout** utilisateur non encore connecté —
ce qui correspond exactement au symptôme observé : un nom d'utilisateur sans `@` (qui dépend
entièrement de cette recherche pour retrouver l'e-mail Firebase Auth réel) échoue, alors qu'un
utilisateur qui se connecte avec son adresse e-mail complète peut réussir malgré tout (son
adresse est essayée directement auprès de Firebase Auth, sans dépendre de cette recherche).

## Correctifs appliqués dans ce commit

1. **`firebase.json` + `.firebaserc` créés** (absents auparavant), ciblant explicitement le
   projet (`gen-lang-client-0957905786`) et la base Firestore nommée ci-dessus, pour que
   `firebase deploy --only firestore:rules` (exécuté par quelqu'un disposant d'un accès CLI
   Firebase réel — pas disponible dans cet environnement) déploie enfin les règles au bon
   endroit.
2. **`LoginView.tsx` — diagnostic amélioré, sans changement de comportement pour les cas qui
   fonctionnaient déjà** : l'échec de la recherche `accounts` (auparavant un simple
   `console.warn` silencieux) est désormais mémorisé ; s'il s'avère qu'aucune tentative de
   connexion Firebase Auth n'aboutit non plus, le message affiché à l'utilisateur devient
   « Unable to verify your account right now... » au lieu du message générique « Invalid
   username or password », et l'erreur réelle est journalisée dans la console navigateur
   (`console.error`) — ce qui permettra de confirmer ou d'infirmer cette hypothèse en un coup
   d'œil lors de la prochaine tentative, au lieu de devoir deviner.

## Action recommandée (nécessite un accès que je n'ai pas dans cet environnement)

1. Depuis un poste avec la Firebase CLI connectée à ce projet :
   `firebase deploy --only firestore:rules` (une fois ce commit récupéré, `firebase.json`
   ciblera automatiquement la bonne base).
2. À défaut, ouvrir la console Firebase → Firestore Database → sélectionner la base
   `ai-studio-activahealthpass-a71d742a-47a5-4343-b20f-a025fe51929b` → onglet Rules → coller
   manuellement le contenu actuel de `firestore.rules` → Publier.
3. Vérifier ensuite que la connexion Superviseur/Agent fonctionne. Si le nouveau message
   « Unable to verify your account right now » apparaît malgré tout après le déploiement,
   cela écarterait cette hypothèse et indiquerait plutôt un problème de données (compte
   inexistant dans `accounts`, ou mot de passe incorrect) — auquel cas le message resterait
   « Invalid username or password » ou « Incorrect password », qui sont distincts.
