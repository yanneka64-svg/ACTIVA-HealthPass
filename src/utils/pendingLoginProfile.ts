// === AMÉLIORATION AJOUTÉE : sécurité (retour utilisateur, 2026-09-07) ===
// Petit registre en mémoire (jamais persisté sur disque/localStorage) qui transmet le profil
// sélectionné sur la page de connexion (LoginView.tsx, sélecteur "Connect as") jusqu'au listener
// global onAuthStateChanged (App.tsx) — seul endroit qui connaît le VRAI rôle du compte
// (accounts/{uid}.profile) et qui décide si le tableau de bord s'affiche. Sans ce pont, une
// vérification faite uniquement dans LoginView ne pouvait bloquer que ses propres effets de bord
// (son, journal d'audit) : le listener global authentifiait et affichait quand même le tableau de
// bord du VRAI rôle du compte, quel que soit le profil choisi dans la liste déroulante.
//
// Volontairement non "consommé" à la première lecture : tant que le profil sélectionné ne
// correspond pas au rôle réel, chaque mise à jour Firestore du compte (accounts/{uid}) doit
// continuer à être bloquée par App.tsx, pas seulement la toute première — sinon un écrit
// Firestore sans rapport survenant pendant que l'écran de blocage est affiché authentifierait
// silencieusement l'utilisateur sous son vrai rôle. Il n'est effacé qu'à la déconnexion complète
// (App.tsx, branche `!firebaseUser`) ou lorsque le rôle réel finit par correspondre.
let pendingLoginProfile: string | null = null;

export function setPendingLoginProfile(profile: string | null): void {
  pendingLoginProfile = profile;
}

export function getPendingLoginProfile(): string | null {
  return pendingLoginProfile;
}

export function clearPendingLoginProfile(): void {
  pendingLoginProfile = null;
}
