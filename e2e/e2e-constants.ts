// === AMÉLIORATION AJOUTÉE : tests end-to-end (préparation Go-Live, 2026-09-07) ===
// Constantes pures (aucun import firebase-admin) partagées par global-setup.ts, helpers.ts et
// seed-data.ts. Séparées de seed-data.ts car ce dernier importe firebase-admin, dont les
// dépendances hybrides CJS/ESM (jose/jwks-rsa) entrent en conflit avec le chargeur TypeScript
// de Playwright dès que le fichier est importé — même partiellement — par un fichier que
// Playwright charge lui-même (global-setup.ts, ou tout fichier *.spec.ts via helpers.ts).
export const E2E_PROJECT_ID = 'gen-lang-client-0957905786';
export const E2E_DATABASE_ID = 'ai-studio-activahealthpass-a71d742a-47a5-4343-b20f-a025fe51929b';
export const E2E_ORG = 'E2E Test Organization';

export const E2E_AGENT = {
  email: 'e2e.agent@activa.local',
  password: 'E2eAgentPass!2026',
  fullName: 'E2E Test Agent',
  username: 'e2e.agent',
};

export const E2E_SUPERVISOR = {
  email: 'e2e.supervisor@activa.local',
  password: 'E2eSupervisorPass!2026',
  fullName: 'E2E Test Supervisor',
  username: 'e2e.supervisor',
};
