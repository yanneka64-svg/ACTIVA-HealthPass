import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    // === AMÉLIORATION AJOUTÉE : empreinte de build injectée à la compilation — un identifiant
    // unique par exécution de `vite build` (donc par déploiement en production). L'app la
    // compare à la valeur stockée localement au démarrage pour déconnecter automatiquement les
    // sessions ouvertes sur une ancienne version, sans jamais toucher un onglet déjà en cours
    // d'utilisation (voir src/App.tsx / checkBuildVersionAndLogoutIfStale). ===
    define: {
      __APP_BUILD_ID__: JSON.stringify(String(Date.now())),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
