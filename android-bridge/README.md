# android-bridge — ébauche non testée

## Statut

**Ébauche (sketch), pas un projet Android fonctionnel.** Écrit sans toolchain Android
disponible dans cet environnement (pas de Gradle/JDK Android, pas d'émulateur, pas d'accès au
`.aar` du SDK dans ce dépôt) — jamais compilé, jamais exécuté, jamais testé sur un vrai
terminal. À reprendre dans Android Studio avant toute mise en production.

## Ce que c'est

La "coquille" Android que `src/services/hfSecurityBridge.ts` (dépôt principal) attend pour
piloter réellement le capteur d'empreinte physique **HFSecurity FP08** (voir
`HF_SECURITY_DEVICE_INFO` dans ce même fichier). Le FP08 est un terminal Android autonome, pas
un lecteur USB standard : aucune API web (WebUSB/WebHID/WebAuthn) ne peut piloter son capteur
directement depuis un navigateur. Cette coquille doit :

1. Héberger l'app web ACTIVA HealthPass dans une `WebView` plein écran.
2. Exposer un objet JavaScript `window.HFSecurityBridge` avec une méthode
   `captureFingerprint(requestId, finger)`, appelée par `hfSecurityBridge.ts` côté web.
3. Piloter le SDK natif HFSecurity (`com.hfteco.finger.FingerSDK`, fourni par
   `libNewHFFingerSDK_v3.0.4_c9.aar`) pour déclencher une vraie capture sur le capteur.
4. Rappeler la page web via `window.__hfSecurityCaptureCallback(requestId, resultJson)` (succès)
   ou `window.__hfSecurityErrorCallback(requestId, message)` (échec).

Tant que cette coquille n'existe pas (ou que l'app web tourne dans un navigateur classique),
`isHFSecurityBridgeAvailable()` renvoie `false` et `BiometricFingerprintModal.tsx` continue
d'utiliser sa capture simulée existante — comportement web strictement inchangé.

## D'où vient ce code

L'utilisateur a fourni le projet source Android de référence du terminal lui-même
("MidX", `com.hf.newmidx`, version 1.0.10) — l'app de démo/référence qui tourne nativement sur
le FP08 et embarque déjà ce même SDK. Le contrat natif ci-dessous est confirmé par lecture de
`MidX/app/src/main/java/com/hf/newmidx/fingerprint/FingerPrintWithDBActivity.java` **et** par
décompilation directe (`javap`) des classes du `.aar` (`libNewHFFingerSDK_v3.0.4_c9.aar`) — pas
une supposition sur la seule doc produit.

## Contrat natif confirmé (`com.hfteco.finger.FingerSDK`)

```java
public class FingerSDK {
    public static final int RESULT_OK;
    public static final int RESULT_FAIL;

    public FingerSDK(Activity context, OnSdkInitListener listener);
    public void launch();   // à la reprise de l'activité hôte
    public void release();  // à sa mise en pause

    public void captureBytes(FingerSDK.TEMPLEATES type, OnCaptureBytesListener listener);
    public int compareTemplateBytes(FingerSDK.TEMPLEATES type, byte[] t1, byte[] t2);
    public int compareBitmap(Bitmap b1, Bitmap b2); // variante non explorée
}

public interface OnSdkInitListener {
    void initResult(int code, String message);
}

public interface OnCaptureBytesListener {
    void capture(int code, byte[] bytes, Bitmap image, byte[] template);
}

public enum FingerSDK.TEMPLEATES {
    GAT_1012_2019, ISO_19794_2_2005, ISO_19794_2_2011,
    ANSI_378_2004, ANSI_378_2009, ISO_On_card;

    public static List<TEMPLEATES> getTempleatesList();
}
```

Le SDK n'a **aucune notion de "quel doigt"** — `captureBytes` prend juste un format de
template. `finger` (right_thumb / left_thumb, voir `BiometricFingerprintModal.tsx`) reste une
convention purement applicative : c'est la coquille qui doit se souvenir de quel doigt a été
demandé et le renvoyer tel quel dans le résultat.

## ⚠️ Point ouvert : le score de qualité

`OnCaptureBytesListener.capture(int, byte[], Bitmap, byte[])` — confirmé par décompilation — ne
porte **aucun paramètre de score**. Le contrat web (`FingerprintCaptureResult.score`, 0-100)
suppose pourtant un score disponible à chaque capture. Pistes non vérifiées faute de capteur
physique disponible ici :

- Le premier `byte[] bytes` (distinct du dernier `byte[] template`) encode peut-être une image
  brute porteuse d'une métrique de qualité — à instrumenter/logguer sur un vrai capteur.
- `FingerSDK` a un champ privé `MIN_MINUTIAE_COUNT` et une méthode privée `capture()` distincte
  de `captureBytes` — suggère qu'un score/nombre de minuties existe en interne sans être exposé
  par cet appel public.
- Contacter le support HFSecurity (www.hfsecurity.cn) pour la doc SDK complète si l'exploration
  ci-dessus ne suffit pas.

**Avant de finaliser cette coquille**, décider soit de dériver `score` d'une source confirmée,
soit de rendre ce champ optionnel côté `hfSecurityBridge.ts` (changement à faire dans le dépôt
principal, pas ici).

## Fichiers de cette ébauche

- `app/src/main/java/com/activa/healthpass/bridge/MainActivity.java` — héberge la `WebView`,
  gère le cycle de vie de `FingerSDK` (init/launch/release), installe le pont JS.
- `app/src/main/java/com/activa/healthpass/bridge/HFSecurityJsBridge.java` — l'objet
  `@JavascriptInterface` exposé comme `window.HFSecurityBridge`, traduit
  `captureBytes(...)` → callbacks JS (`__hfSecurityCaptureCallback`/`__hfSecurityErrorCallback`).
- `app/src/main/AndroidManifest.xml` — permissions/features minimales (dont
  `android.hardware.usb.host`, requis par l'app de référence — le SDK gère la communication USB
  avec le capteur en interne, confirmé par décompilation : méthodes privées
  `checkUsbDevices()`/`setupFingerDevice()`/`fingerprintPower(boolean)`).
- `app/build.gradle`, `build.gradle`, `settings.gradle` — config Gradle sketch, alignée sur les
  valeurs réelles du projet MidX (compileSdk/minSdk/targetSdk, `api fileTree(...)` pour le
  `.aar`) mais avec un `applicationId` propre à ACTIVA plutôt que `com.hf.newmidx`.

## Ce qui manque encore pour un vrai build

- `app/libs/libNewHFFingerSDK_v3.0.4_c9.aar` — le `.aar` réel n'est **pas** commité ici
  (binaire tiers, 1,9 Mo, licence du fabricant non clarifiée) : à copier depuis le projet source
  MidX fourni par l'utilisateur avant tout `./gradlew build`.
- Résoudre le point ouvert du score de qualité ci-dessus.
- ~~Remplacer l'URL chargée par la `WebView`~~ — fait (2026-09-22) : `MainActivity.WEBAPP_URL`
  pointe désormais vers `https://activahealthcare.netlify.app/`, confirmée par l'utilisateur comme
  l'URL de production ; c'est aussi l'origine à laquelle la navigation principale est restreinte
  (voir le commentaire de sécurité dans `MainActivity.java`).
- ~~Icône de lancement~~ — fait (2026-09-22) : icône adaptative vectorielle fournie
  (`res/mipmap-anydpi-v26/ic_launcher.xml` + `res/drawable/ic_launcher_*.xml`), simple placeholder
  fonctionnel (pas une charte graphique définitive) qui couvre API 26+. `minSdk` étant 24, une
  icône raster de repli pour API 24-25 (`res/mipmap-hdpi/`, etc.) resterait recommandée avant un
  vrai déploiement, mais son absence ne bloque plus la liaison des ressources au build.
- Build, installation et test sur un vrai terminal FP08 — rien de tout cela n'a pu être vérifié
  depuis cet environnement.
