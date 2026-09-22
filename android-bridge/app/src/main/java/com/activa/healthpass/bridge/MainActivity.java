package com.activa.healthpass.bridge;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
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

    // === AMÉLIORATION AJOUTÉE : placeholder — à remplacer par l'URL réelle de déploiement
    // d'ACTIVA HealthPass avant tout build réel (voir README.md, section "Ce qui manque encore").
    private static final String WEBAPP_URL = "https://REPLACE-WITH-ACTIVA-HEALTHPASS-DEPLOY-URL.example/";

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

        // Le SDK a besoin de l'Activity pour son propre cycle de vie (permissions USB, etc.) —
        // contrat confirmé par lecture du projet source MidX + décompilation du .aar.
        fingerSDK = new FingerSDK(this, (code, message) -> {
            // === AMÉLIORATION AJOUTÉE : TODO — remonter un échec d'init au bridge JS une fois
            // le point ouvert du score de qualité tranché (voir README.md). Pour l'instant,
            // seul un log est prévu ; ne bloque pas le chargement de la WebView.
            if (code != FingerSDK.RESULT_OK) {
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
