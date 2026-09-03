/// <reference types="vite/client" />

// === AMÉLIORATION AJOUTÉE : identifiant de build injecté par vite.config.ts (define), utilisé
// pour détecter un nouveau déploiement et déconnecter automatiquement les sessions périmées.
declare const __APP_BUILD_ID__: string;
