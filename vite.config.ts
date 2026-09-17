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
    // === AMÉLIORATION AJOUTÉE : découpage explicite des dépendances tierces en chunks dédiés
    // (voir FRONTEND_CRITICAL_ANALYSIS.md §4.2) — react/react-dom et le SDK Firebase changent
    // rarement d'une version à l'autre de l'application, contrairement au code applicatif
    // (App.tsx, services, vues) qui change à chaque déploiement. Sans ce découpage, Rollup les
    // mélange dans le même chunk "index" que le code applicatif : le navigateur d'un utilisateur
    // doit alors retélécharger la totalité de React et Firebase à chaque nouveau déploiement,
    // même si ni l'un ni l'autre n'a changé. Ce changement ne modifie que la RÉPARTITION du code
    // déjà présent entre fichiers de sortie — aucun code applicatif, aucun comportement,
    // n'est modifié. Les vues restent découpées séparément comme avant (React.lazy dans
    // App.tsx, inchangé) ; xlsx/jsPDF/html2canvas étaient déjà automatiquement isolés par
    // Rollup dans leurs propres chunks (vérifié : ils n'apparaissent pas dans le chunk
    // principal) et n'ont donc pas besoin d'être ajoutés ici.
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
                return 'vendor-react';
              }
              if (id.includes('/firebase/') || id.includes('/@firebase/')) {
                return 'vendor-firebase';
              }
            }
          },
        },
      },
    },
  };
});
