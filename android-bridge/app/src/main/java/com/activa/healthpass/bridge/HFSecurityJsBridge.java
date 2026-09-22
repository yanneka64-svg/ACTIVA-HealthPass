package com.activa.healthpass.bridge;

import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.hfteco.finger.FingerSDK;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * === AMÉLIORATION AJOUTÉE : ébauche non testée (2026-09-22) — voir README.md à la racine de
 * android-bridge/ pour le statut complet.
 *
 * Objet exposé côté web comme `window.HFSecurityBridge` (voir addJavascriptInterface dans
 * MainActivity et le contrat TypeScript dans src/services/hfSecurityBridge.ts du dépôt
 * principal). Traduit un appel JS captureFingerprint(requestId, finger) en un appel natif
 * FingerSDK.captureBytes(...), puis rappelle la page via
 * window.__hfSecurityCaptureCallback(requestId, resultJson) ou
 * window.__hfSecurityErrorCallback(requestId, message).
 *
 * Non vérifié : jamais compilé ni exécuté sur un vrai terminal FP08.
 */
public class HFSecurityJsBridge {

    private final WebView webView;
    private final FingerSDK fingerSDK;

    public HFSecurityJsBridge(WebView webView, FingerSDK fingerSDK) {
        this.webView = webView;
        this.fingerSDK = fingerSDK;
    }

    @JavascriptInterface
    public void captureFingerprint(String requestId, String finger) {
        if (fingerSDK == null) {
            callError(requestId, "FingerSDK non initialisé");
            return;
        }

        // Le SDK natif n'a aucune notion de "quel doigt" (voir README.md) — `finger` est une
        // pure convention côté web, mémorisée ici uniquement pour être renvoyée telle quelle
        // dans le résultat.
        fingerSDK.captureBytes(FingerSDK.TEMPLEATES.ANSI_378_2004, (code, bytes, image, template) -> {
            if (code != FingerSDK.RESULT_OK) {
                callError(requestId, "Échec de capture (code natif " + code + ")");
                return;
            }
            if (template == null || template.length == 0) {
                callError(requestId, "Capture réussie mais template vide");
                return;
            }

            try {
                JSONObject result = new JSONObject();
                // Base64 plutôt qu'ISO8859-1 — voir la recommandation dans
                // hfSecurityBridge.ts (transport JSON sans risque de perte d'octets).
                result.put("template", Base64.encodeToString(template, Base64.NO_WRAP));
                result.put("finger", finger);

                // === AMÉLIORATION AJOUTÉE : TODO — point ouvert non résolu (voir README.md,
                // section "Point ouvert : le score de qualité"). OnCaptureBytesListener.capture
                // ne porte aucun paramètre de score confirmé par décompilation du .aar ; jamais
                // vérifié sur un vrai capteur faute de matériel disponible ici. Ne PAS fabriquer
                // une valeur : à trancher avant tout build réel, soit en dérivant `score` d'une
                // source confirmée (ex. instrumentation du paramètre `bytes` ci-dessus sur un
                // vrai capteur), soit en rendant ce champ optionnel côté hfSecurityBridge.ts.
                result.put("score", JSONObject.NULL);

                callSuccess(requestId, result.toString());
            } catch (JSONException e) {
                callError(requestId, "Erreur de sérialisation JSON: " + e.getMessage());
            }
        });
    }

    private void callSuccess(String requestId, String resultJson) {
        String js = "window.__hfSecurityCaptureCallback && window.__hfSecurityCaptureCallback("
                + JSONObject.quote(requestId) + "," + resultJson + ");";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private void callError(String requestId, String message) {
        String js = "window.__hfSecurityErrorCallback && window.__hfSecurityErrorCallback("
                + JSONObject.quote(requestId) + "," + JSONObject.quote(message) + ");";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }
}
