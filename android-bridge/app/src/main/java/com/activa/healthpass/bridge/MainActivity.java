package com.activa.healthpass.bridge;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;

import com.hfteco.finger.FingerSDK;

/**
 * === AMÉLIORATION AJOUTÉE : ébauche non testée (2026-09-22) — voir README.md à la racine de
 * android-bridge/ pour le statut complet.
 *
 * Héberge la WebView plein écran qui charge l'app web ACTIVA HealthPass, et gère le cycle de
 * vie de FingerSDK (init/launch/release) tel qu'observé dans le projet source MidX fourni par
 * l'utilisateur (FingerPrintWithDBActivity.java) : le SDK est instancié une fois dans
 * onCreate(), puis launch() est appelé à chaque reprise de l'activité et release() à chaque
 * mise en pause — jamais recréé entre les deux.
 *
 * Non vérifié : jamais compilé ni exécuté sur un vrai terminal FP08 (pas de toolchain Android
 * disponible dans l'environnement où cette ébauche a été écrite).
 */
public class MainActivity extends AppCompatActivity {

    // === AMÉLIORATION AJOUTÉE : URL de production confirmée par l'utilisateur (2026-09-22) —
    // remplace le placeholder. C'est aussi l'origine à laquelle shouldOverrideUrlLoading()
    // ci-dessous restreint la navigation ; toute autre valeur ici doit être approuvée avec le
    // même soin (voir le commentaire de sécurité juste en dessous).
    private static final String WEBAPP_URL = "https://activahealthcare.netlify.app/";

    private WebView webView;
    private FingerSDK fingerSDK;
    private HFSecurityJsBridge jsBridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        setContentView(webView);

        // === AMÉLIORATION AJOUTÉE : revue automatisée (2026-09-22) — `HFSecurityBridge` (via
        // addJavascriptInterface, ligne plus bas) est accessible à TOUTE page que cette WebView
        // charge, sans restriction d'origine intégrée au mécanisme lui-même. Sans ce
        // WebViewClient, une redirection ou une navigation vers un contenu non maîtrisé pourrait
        // déclencher une capture d'empreinte et recevoir le template biométrique via les
        // callbacks globaux. On bloque donc toute navigation principale qui quitterait l'origine
        // de déploiement configurée (WEBAPP_URL) — limite connue : ceci ne restreint pas
        // addJavascriptInterface lui-même (accessible à tout code JS déjà exécuté dans la page
        // autorisée, y compris une iframe qu'elle embarquerait) ; un remplacement complet par un
        // pont `postMessage` origine-vérifiée serait nécessaire pour une garantie plus forte,
        // hors scope de cette ébauche (voir README.md).
        final String allowedHost = Uri.parse(WEBAPP_URL).getHost();
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                boolean sameOrigin = "https".equals(url.getScheme()) && allowedHost != null
                        && allowedHost.equals(url.getHost());
                if (!sameOrigin) {
                    android.util.Log.w("HFSecurityBridge", "Navigation bloquée hors origine autorisée: " + url);
                    return true; // bloque la navigation, ne charge pas l'URL
                }
                return false; // laisse la WebView charger l'URL (même origine)
            }
        });

        // Le SDK a besoin de l'Activity pour son propre cycle de vie (permissions USB, etc.) —
        // contrat confirmé par lecture du projet source MidX + décompilation du .aar. `fingerSDK`
        // doit être assigné AVANT de construire `jsBridge` (qui le reçoit par référence dans son
        // constructeur) : l'inverse lui aurait passé `null`.
        fingerSDK = new FingerSDK(this, (code, message) -> {
            // === AMÉLIORATION AJOUTÉE : revue automatisée (2026-09-22) — `jsBridge` était
            // auparavant construit avec `fingerSDK` déjà en main mais sans jamais être informé
            // du résultat de cette init asynchrone : `captureFingerprint` traitait toute
            // instance non-null comme prête, y compris pendant l'init ou après un échec (code
            // != RESULT_OK), un capteur alors réellement inutilisable. `setReady`/
            // `setInitFailed` rendent cet état interrogeable par captureFingerprint.
            if (code == FingerSDK.RESULT_OK) {
                jsBridge.setReady();
            } else {
                jsBridge.setInitFailed(message);
                android.util.Log.w("HFSecurityBridge", "FingerSDK init a échoué: " + message);
            }
        });

        jsBridge = new HFSecurityJsBridge(webView, fingerSDK);
        webView.addJavascriptInterface(jsBridge, "HFSecurityBridge");

        webView.loadUrl(WEBAPP_URL);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Reproduit le pattern confirmé du projet source MidX : launch() à chaque reprise.
        if (fingerSDK != null) {
            fingerSDK.launch();
        }
    }

    @Override
    protected void onPause() {
        if (fingerSDK != null) {
            fingerSDK.release();
        }
        super.onPause();
    }
}
