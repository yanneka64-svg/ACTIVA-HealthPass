// === AMÉLIORATION AJOUTÉE : sécurité (Revue complète 2026-09-06, finding #6 — CRITIQUE) ===
// Constat externe validé : plusieurs `subscribeToX` de src/services/firestore.ts retombent
// silencieusement sur des données de démonstration (getFullDemoData()) à la fois quand une
// collection est vide ET quand Firestore renvoie une erreur (règles, réseau, service
// indisponible). Dans le second cas, un utilisateur ne peut pas distinguer "il n'y a pas encore
// de données" d'un véritable INCIDENT DE PRODUCTION masqué par un jeu de données fictif —
// inacceptable pour une application de gestion de données de santé.
//
// Ce garde-fou centralise la décision : le repli vers les données de démonstration n'est
// autorisé QUE si la variable d'environnement VITE_ALLOW_DEMO_FALLBACK vaut explicitement
// "true" au moment du build. Elle doit être définie dans un environnement de démonstration/
// développement local uniquement (jamais dans le build de production) — voir .env.example.
// Par défaut (variable absente, comme c'est le cas pour tout build de production existant),
// cette fonction retourne `false` : aucune régression de comportement pour un environnement où
// la variable n'a jamais été définie, hormis qu'un INCIDENT réel (Firestore en erreur, ou une
// collection réellement vide) n'affiche plus de données fictives à la place — voir
// src/utils/systemStatus.ts pour la notification correspondante affichée à l'écran.
export function isDemoFallbackAllowed(): boolean {
  try {
    return import.meta.env?.VITE_ALLOW_DEMO_FALLBACK === 'true';
  } catch {
    return false;
  }
}
