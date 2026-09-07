#!/usr/bin/env node
// === AMÉLIORATION AJOUTÉE : tests de charge (préparation Go-Live, 2026-09-07) ===
// Générateur de charge minimal, sans dépendance nouvelle (fetch natif Node 20+, Promise.all) —
// délibérément préféré à une librairie externe (autocannon, k6...) pour ne pas élargir la
// surface de dépendances/vulnérabilités d'un simple outil de diagnostic ponctuel, jamais exécuté
// en production. Usage :
//
//   node scripts/loadtest.mjs [--url http://localhost:3000] [--concurrency 20] [--requests 500] [--endpoint /api/health]
//
// Contre l'environnement local (npm run dev), ou contre un déploiement staging/production réel
// en passant --url. N'exerce QUE des endpoints publics (sans authentification) par défaut :
// /api/health (GET) et /api/cards/verify-format (POST) — voir server.ts.

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]?.replace(/^--/, '');
  if (key) args.set(key, process.argv[i + 1]);
}

const BASE_URL = args.get('url') || 'http://localhost:3000';
const CONCURRENCY = parseInt(args.get('concurrency') || '20', 10);
const TOTAL_REQUESTS = parseInt(args.get('requests') || '500', 10);
const ENDPOINT = args.get('endpoint') || '/api/health';

function buildRequest() {
  if (ENDPOINT === '/api/cards/verify-format') {
    return {
      url: `${BASE_URL}${ENDPOINT}`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardNumber: 'AMID-260907-00001' }),
      },
    };
  }
  return { url: `${BASE_URL}${ENDPOINT}`, init: { method: 'GET' } };
}

function percentile(sortedLatencies, p) {
  if (sortedLatencies.length === 0) return 0;
  const idx = Math.min(sortedLatencies.length - 1, Math.ceil((p / 100) * sortedLatencies.length) - 1);
  return sortedLatencies[Math.max(0, idx)];
}

async function fireOne() {
  const { url, init } = buildRequest();
  const t0 = performance.now();
  try {
    const res = await fetch(url, init);
    await res.arrayBuffer(); // drain body, matches real client behavior
    return { ok: res.ok, status: res.status, ms: performance.now() - t0 };
  } catch (err) {
    return { ok: false, status: 0, ms: performance.now() - t0, error: err.message };
  }
}

async function worker(counterRef, results) {
  while (counterRef.remaining > 0) {
    counterRef.remaining -= 1;
    results.push(await fireOne());
  }
}

async function main() {
  console.log(`[loadtest] ${BASE_URL}${ENDPOINT} — ${TOTAL_REQUESTS} requêtes, concurrence ${CONCURRENCY}`);
  const results = [];
  const counterRef = { remaining: TOTAL_REQUESTS };
  const t0 = performance.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(counterRef, results)));
  const totalMs = performance.now() - t0;

  const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
  const failures = results.filter((r) => !r.ok);
  const statusCounts = {};
  for (const r of results) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;

  console.log('');
  console.log(`Durée totale        : ${(totalMs / 1000).toFixed(2)} s`);
  console.log(`Débit               : ${(results.length / (totalMs / 1000)).toFixed(1)} req/s`);
  console.log(`Latence moyenne     : ${(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1)} ms`);
  console.log(`Latence p50         : ${percentile(latencies, 50).toFixed(1)} ms`);
  console.log(`Latence p95         : ${percentile(latencies, 95).toFixed(1)} ms`);
  console.log(`Latence p99         : ${percentile(latencies, 99).toFixed(1)} ms`);
  console.log(`Latence max         : ${latencies[latencies.length - 1]?.toFixed(1)} ms`);
  console.log(`Échecs              : ${failures.length} / ${results.length}`);
  console.log(`Répartition statuts : ${JSON.stringify(statusCounts)}`);

  if (failures.length > 0) {
    console.log('');
    console.log('Exemples d\'échecs :', failures.slice(0, 3));
  }
}

main();
