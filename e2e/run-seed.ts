// === AMÉLIORATION AJOUTÉE : tests end-to-end (préparation Go-Live, 2026-09-07) ===
// Point d'entrée exécuté dans un PROCESSUS SÉPARÉ (voir e2e/global-setup.ts) plutôt qu'importé
// directement par le runner de tests. `firebase-admin` embarque des dépendances hybrides
// CJS/ESM (jose/jwks-rsa) qui entrent en conflit avec le chargeur TypeScript propre à
// Playwright lorsqu'elles sont importées depuis global-setup.ts ("module not been linked") ;
// exécuter le seed via `tsx` en ligne de commande (comme en exploration manuelle, où cela
// fonctionne) contourne entièrement ce chargeur.
import { seedE2EData } from './seed-data';

seedE2EData()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('[e2e] Seeding failed:', err);
    process.exit(1);
  });
