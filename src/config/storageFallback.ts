// === AMÉLIORATION AJOUTÉE : sécurité (Revue complète 2026-09-06, finding #7 — HIGH) ===
// Constat externe validé : `uploadPhotoOrFallback` (src/utils/storageUtils.ts) retombait
// silencieusement sur le stockage de la photo en base64 DIRECTEMENT dans le document Firestore
// si l'upload vers Firebase Storage échouait pour quelque raison que ce soit (règles Storage non
// déployées, réseau, quota). Pour une application de santé, ce repli réintroduit exactement les
// risques que le passage à Storage visait à éliminer : dépassement de la limite ~1 MiB par
// document Firestore, données biométriques dupliquées hors du chemin d'accès cloisonné par
// organisation (storage.rules), absence de politique de rétention centralisée sur ce contenu.
//
// Décision explicite de cette revue : basculer en fail-closed PAR DÉFAUT (un échec d'upload
// Storage bloque désormais la sauvegarde avec un message clair, au lieu de la faire réussir
// silencieusement avec une photo mal stockée) — MAIS conserver un interrupteur de secours
// explicite, car le statut réel du déploiement de storage.rules sur le projet Firebase de
// production n'est pas vérifiable depuis ce dépôt (voir les notes de déploiement historiques
// dans storageUtils.ts). Si Storage s'avère ne pas être opérationnel une fois ce correctif
// déployé, VITE_ALLOW_STORAGE_BASE64_FALLBACK="true" restaure l'ancien comportement sans
// nouveau déploiement de code le temps de corriger la configuration Storage — jamais activé par
// défaut.
export function isBase64PhotoFallbackAllowed(): boolean {
  try {
    return import.meta.env?.VITE_ALLOW_STORAGE_BASE64_FALLBACK === 'true';
  } catch {
    return false;
  }
}
