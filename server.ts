import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, DocumentData } from 'firebase-admin/firestore';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { z } from 'zod';

// === AMÉLIORATION AJOUTÉE : observabilité (préparation Go-Live, 2026-09-07) ===
// Logs structurés (JSON, niveaux de sévérité) au lieu de console.log/console.warn épars —
// nécessaire pour qu'un outil de monitoring externe (Cloud Logging, Datadog, etc., voir action
// humaine requise dans le rapport de session) puisse ingérer et filtrer les logs par sévérité.
// LOG_LEVEL est optionnel (défaut 'info') ; jamais de donnée sensible loguée en clair (voir
// redact ci-dessous pour les en-têtes d'authentification).
// === AMÉLIORATION AJOUTÉE : monitoring (préparation Go-Live, 2026-09-07) ===
// `formatters.level`/`messageKey` alignent la sortie JSON de pino sur le format que Google
// Cloud Logging reconnaît nativement (champ `severity` en texte, pas le niveau numérique par
// défaut de pino ; message sous la clé `message`, pas `msg`) — sans dépendance supplémentaire.
// Sur tout hébergement GCP dont les logs stdout sont collectés par l'agent Cloud Logging (Cloud
// Run, Compute Engine, GKE...), cela suffit à ce que ces entrées apparaissent avec la bonne
// sévérité et que les erreurs soient reprises automatiquement par Google Cloud Error Reporting
// — décision retenue plutôt qu'un SDK de monitoring tiers (Sentry, Datadog) pour rester sans
// nouveau compte externe ni nouvelle dépendance. Sans effet en dehors d'un tel hébergement
// (les champs sont simplement ignorés).
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  messageKey: 'message',
  formatters: {
    level(label) {
      return { severity: label.toUpperCase() === 'WARN' ? 'WARNING' : label.toUpperCase() };
    },
  },
});

const app = express();
const PORT = 3000;

// === AMÉLIORATION AJOUTÉE : sécurité (revue Qodo, PR #88) — topologie de proxy explicite ===
// Nécessaire pour que `req.ip` (utilisé par le rate limiter ci-dessous) résolve la VRAIE adresse
// du client plutôt qu'un en-tête `X-Forwarded-For` que ce client contrôle lui-même s'il atteint
// ce process directement (sans configuration, un attaquant change cet en-tête à chaque requête
// et obtient un nouveau "seau" de quota à chaque fois — le rate limiting devient inopérant).
// `1` = on fait confiance à EXACTEMENT un saut de proxy en amont (le cas le plus courant pour un
// process Node unique derrière un load balancer/CDN unique — Cloud Run, la plupart des PaaS,
// un unique nginx/ALB) : Express ne lit alors que le DERNIER maillon ajouté par ce proxy de
// confiance dans `X-Forwarded-For`, ignorant tout ce qu'un client aurait pu falsifier en amont.
// Ajustable sans changement de code via TRUST_PROXY_HOPS si la topologie réelle diffère (0 = ce
// process est exposé directement, aucun proxy devant lui ; 2+ = plusieurs sauts de proxy — voir
// .env.example).
const trustProxyHops = process.env.TRUST_PROXY_HOPS !== undefined ? Number(process.env.TRUST_PROXY_HOPS) : 1;
app.set('trust proxy', Number.isFinite(trustProxyHops) ? trustProxyHops : 1);

app.use(
  pinoHttp({
    logger,
    // Le endpoint de health check est appelé fréquemment par les sondes d'orchestration —
    // l'exclure du log par-requête évite de noyer les vrais événements sous du bruit répétitif.
    autoLogging: {
      ignore: (req) => req.url === '/api/health',
    },
  })
);

// === AMÉLIORATION AJOUTÉE : sécurité — rate limiting sur les routes /api/* ===
// Constat : aucune route de ce serveur Express n'était protégée contre un flot de requêtes
// répétées (script automatisé, abus, DoS applicatif léger) — contrairement à la Cloud Function
// callable resolveLoginIdentifier (voir functions/src/index.ts, checkAndApplyRateLimit) qui,
// elle, limite déjà les tentatives de connexion. Implémentation minimaliste en mémoire (fenêtre
// fixe par IP), sans dépendance supplémentaire — ce process Express est un unique processus
// long-vivant (voir app.listen plus bas), donc un état en mémoire suffit ici, pas besoin d'un
// store partagé type Redis. Design analogue à functions/src/validation.ts ("validateur
// minimaliste, aucune dépendance supplémentaire"). Monté AVANT express.json()/urlencoded()
// (revue Qodo, PR #88) : une requête déjà hors quota ne doit pas payer le coût de mise en
// mémoire tampon + parsing d'un corps pouvant aller jusqu'à 10 Mo avant d'être rejetée.
interface RateLimitBucket {
  count: number;
  windowStart: number;
}

function createRateLimiter(options: { windowMs: number; max: number; message: string }) {
  const buckets = new Map<string, RateLimitBucket>();

  // Ménage périodique pour ne pas accumuler indéfiniment une entrée par IP distincte vue un
  // jour — non bloquant et `unref()`-é pour ne jamais empêcher le process de s'arrêter
  // proprement (ex. pendant les tests, qui n'appellent jamais startServer()/app.listen ici).
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart > options.windowMs) buckets.delete(key);
    }
  }, options.windowMs);
  cleanupInterval.unref?.();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    // `req.ip` (pas l'en-tête brut) : résolu par Express selon `trust proxy` ci-dessus, donc
    // fiable même face à un client qui falsifierait `X-Forwarded-For` lui-même.
    const key = req.ip || 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now - bucket.windowStart > options.windowMs) {
      buckets.set(key, { count: 1, windowStart: now });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.windowStart + options.windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: options.message, retryAfterSec });
    }
    return next();
  };
}

// Limite générale : 300 requêtes / 15 min / IP sur toutes les routes /api/*, sauf /api/health
// (interrogé fréquemment par les sondes de santé d'orchestration — même raisonnement que son
// exclusion du logging par-requête ci-dessus). Généreux pour ne jamais gêner l'usage légitime
// observé dans le code actuel (quelques appels ponctuels par écran), tout en bloquant un abus
// grossier.
const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Too many requests. Please try again later.',
});

app.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.path.startsWith('/api/') || req.path === '/api/health') return next();
  return apiRateLimiter(req, res, next);
});

// Limite stricte dédiée à /api/audit/log : cette route reste volontairement accessible SANS
// authentification (voir son commentaire plus bas — elle doit pouvoir journaliser un échec de
// connexion avant authentification), ce qui en fait la route la plus exposée à un abus consistant
// à inonder la collection Firestore `auditLogs` d'écritures. Un usage légitime écrit au plus
// quelques entrées par minute (une par tentative de connexion/action) ; 20/min/IP laisse une
// large marge sans jamais gêner un usage réel.
const auditLogRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Too many audit log submissions. Please try again later.',
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialisation tolérante du SDK Firebase Admin pour les routes serveur sécurisées
let adminInitError: string | null = null;
try {
  if (!getApps().length) {
    initializeApp();
  }
} catch (e: any) {
  adminInitError = e?.message || 'Firebase Admin SDK initialization failed';
  logger.warn({ err: e }, '[server.ts] Firebase Admin SDK not available');
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (adminInitError) {
    return res.status(503).json({ error: 'Server authentication is not configured (Admin SDK unavailable).' });
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization: Bearer <Firebase ID token>.' });
  }
  try {
    (req as any).authUser = await getAuth().verifyIdToken(token);
    next();
  } catch (e: any) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

// --- API ROUTES ---
// === AMÉLIORATION AJOUTÉE : observabilité (préparation Go-Live, 2026-09-07) ===
// Le health check précédent répondait "ok" inconditionnellement, sans jamais vérifier que le
// service peut réellement joindre Firestore/Auth — un faux vert pour un outil de monitoring
// externe pendant une panne réelle de connectivité. Vérifie désormais chaque dépendance
// indépendamment (statut 'ok'/'degraded' par service), avec un délai court (2s) pour ne jamais
// faire traîner une sonde de santé. Le SDK Admin non initialisé (adminInitError) est signalé
// séparément, sans tenter d'appel réseau inutile. Reste HTTP 200 même en dégradé partiel : un
// orchestrateur qui redémarre le service sur un simple "degraded" aggraverait souvent la
// situation plutôt que de la corriger ; le corps de la réponse porte l'information détaillée
// pour que l'outil de monitoring décide de la sévérité.
app.get('/api/health', async (_req: Request, res: Response) => {
  const checks: Record<string, { status: 'ok' | 'degraded' | 'unavailable'; error?: string }> = {};

  if (adminInitError) {
    checks.firestore = { status: 'unavailable', error: 'Admin SDK not initialized' };
    checks.auth = { status: 'unavailable', error: 'Admin SDK not initialized' };
  } else {
    const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
      ]);

    try {
      await withTimeout(getFirestore().collection('organizations').limit(1).get(), 2000);
      checks.firestore = { status: 'ok' };
    } catch (e: any) {
      checks.firestore = { status: 'degraded', error: e?.message || 'Firestore check failed' };
    }

    try {
      await withTimeout(getAuth().listUsers(1), 2000);
      checks.auth = { status: 'ok' };
    } catch (e: any) {
      checks.auth = { status: 'degraded', error: e?.message || 'Auth check failed' };
    }
  }

  const overall = Object.values(checks).every((c) => c.status === 'ok') ? 'ok' : 'degraded';

  res.json({
    status: overall,
    service: 'ACTIVA HealthCare API & Continuity Gateway',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    checks,
  });
});

// Card Continuity & Format Verifier
const CARD_REGEX = /^AMID-(\d{2})(\d{2})(\d{2})-(\d{5})$/;

app.post('/api/cards/verify-format', (req: Request, res: Response) => {
  const { cardNumber } = req.body;
  if (!cardNumber || typeof cardNumber !== 'string') {
    return res.status(400).json({ valid: false, error: 'Missing or invalid cardNumber parameter' });
  }

  const match = CARD_REGEX.exec(cardNumber.trim());
  if (!match) {
    return res.json({
      valid: false,
      reason: 'Does not match format AMID-YYMMDD-NNNNN',
    });
  }

  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return res.json({
      valid: false,
      reason: 'Invalid calendar date segment in card number',
    });
  }

  return res.json({
    valid: true,
    issueDate: `${match[1]}${match[2]}${match[3]}`,
    assuredNumber: parseInt(match[4], 10),
  });
});

// Card Continuity Report
app.post('/api/cards/continuity-report', (req: Request, res: Response) => {
  const { cardNumbers = [] } = req.body;
  if (!Array.isArray(cardNumbers)) {
    return res.status(400).json({ error: 'cardNumbers must be an array of strings' });
  }

  const validNumbers: { original: string; date: string; num: number }[] = [];
  const invalidNumbers: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  for (const c of cardNumbers) {
    if (typeof c !== 'string') continue;
    const trimmed = c.trim();
    if (seen.has(trimmed)) {
      duplicates.push(trimmed);
      continue;
    }
    seen.add(trimmed);

    const match = CARD_REGEX.exec(trimmed);
    if (!match) {
      invalidNumbers.push(trimmed);
      continue;
    }
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      invalidNumbers.push(trimmed);
      continue;
    }

    validNumbers.push({
      original: trimmed,
      date: `${match[1]}${match[2]}${match[3]}`,
      num: parseInt(match[4], 10),
    });
  }

  validNumbers.sort((a, b) => a.num - b.num);

  const gaps: { after: number; missingCount: number }[] = [];
  for (let i = 0; i < validNumbers.length - 1; i++) {
    const diff = validNumbers[i + 1].num - validNumbers[i].num;
    if (diff > 1) {
      gaps.push({
        after: validNumbers[i].num,
        missingCount: diff - 1,
      });
    }
  }

  const min = validNumbers.length > 0 ? validNumbers[0].num : 0;
  const max = validNumbers.length > 0 ? validNumbers[validNumbers.length - 1].num : 0;

  res.json({
    totalEvaluated: cardNumbers.length,
    validCount: validNumbers.length,
    invalidCount: invalidNumbers.length,
    duplicateCount: duplicates.length,
    minSequenceNumber: min,
    maxSequenceNumber: max,
    detectedGaps: gaps,
    invalidSamples: invalidNumbers.slice(0, 10),
    duplicateSamples: duplicates.slice(0, 10),
    isStrictlyContinuous: gaps.length === 0,
  });
});

// === AMÉLIORATION AJOUTÉE : sécurité (Phase 1.7) — logique d'évaluation extraite dans une
// fonction pure, appliquée à la police RÉELLEMENT lue en base (voir la route ci-dessous),
// jamais à un objet fourni tel quel par le client. Miroir de src/services/policyEngine.ts
// (getPolicyCoverageStatus) — même ordre de règles ; toujours la SEULE source de vérité
// fonctionnelle côté client, cette fonction sert uniquement à revérifier côté serveur.
function evaluatePolicyFromRecord(policy: DocumentData) {
  const now = new Date();
  const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  if (policy.expirationDate) {
    const expDate = new Date(policy.expirationDate).getTime();
    if (!isNaN(expDate)) {
      const diffDays = Math.ceil((expDate - todayTime) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        return {
          status: 'Expired',
          coverageBlocked: true,
          reason: `Policy expired on ${policy.expirationDate} (${Math.abs(diffDays)} days ago).`,
          daysUntilExpiration: diffDays,
        };
      }
    }
  }

  const graceDays = policy.gracePeriodDays ?? 15;
  if (policy.nextPaymentDueDate) {
    const dueDate = new Date(policy.nextPaymentDueDate).getTime();
    if (!isNaN(dueDate)) {
      const diffPastDue = Math.floor((todayTime - dueDate) / (1000 * 60 * 60 * 24));
      if (diffPastDue > 0 && (policy.outstandingAmount ?? 0) > 0) {
        if (diffPastDue > graceDays) {
          return {
            status: 'Suspended (Non-payment)',
            coverageBlocked: true,
            reason: `Payment is ${diffPastDue} days past due (grace period of ${graceDays} days exceeded).`,
            daysPastDue: diffPastDue,
          };
        }
      }
    }
  }

  if (policy.manuallySuspended) {
    return {
      status: 'Suspended',
      coverageBlocked: true,
      reason: policy.suspensionReason || 'Manually suspended by administrator.',
    };
  }

  const warningDays = policy.expiringSoonWarningDays ?? 30;
  if (policy.expirationDate) {
    const expDate = new Date(policy.expirationDate).getTime();
    if (!isNaN(expDate)) {
      const diffDays = Math.ceil((expDate - todayTime) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= warningDays) {
        return {
          status: 'Expiring Soon',
          coverageBlocked: false,
          reason: `Policy will expire in ${diffDays} days (${policy.expirationDate}). Renewal required.`,
          daysUntilExpiration: diffDays,
        };
      }
    }
  }

  return {
    status: 'Active',
    coverageBlocked: false,
    reason: 'Policy in good standing.',
  };
}

// Policy Status Server Evaluation — lit la police RÉELLE en base (healthPolicies/{organizationName}),
// jamais un objet fourni par le client (voir commentaire ci-dessus). Requiert un jeton Firebase
// Auth valide (requireAuth).
app.post('/api/policies/evaluate', requireAuth, async (req: Request, res: Response) => {
  const { organizationName } = req.body;
  if (!organizationName || typeof organizationName !== 'string') {
    return res.status(400).json({ error: 'organizationName (string) is required.' });
  }

  let policySnap;
  try {
    policySnap = await getFirestore().doc(`healthPolicies/${organizationName}`).get();
  } catch (e: any) {
    req.log.error({ err: e, organizationName }, 'Failed to read policy data');
    return res.status(503).json({ error: 'Unable to read policy data from the database.' });
  }
  if (!policySnap.exists) {
    return res.json({ status: 'Active', coverageBlocked: false, reason: 'No policy configured for this organization.' });
  }

  return res.json(evaluatePolicyFromRecord(policySnap.data() || {}));
});

// === AMÉLIORATION AJOUTÉE : sécurité (Phase 1.7) — Healthcare Access Gate réécrite pour lire
// l'état RÉEL en base (healthPolicies + members) au lieu de faire confiance à `coverageBlocked`/
// `memberStatus` fournis tels quels par le client (voir CODE_AUDIT_MAP.md section 3.2 : un
// client pouvait auparavant envoyer simplement `{coverageBlocked:false}` pour obtenir
// `allowed:true`, quel que soit l'état réel). Aucun appelant existant (apiClient.ts est mort) —
// aucune régression possible, cette route n'a jamais été exercée.
app.post('/api/claims/validate-coverage', requireAuth, async (req: Request, res: Response) => {
  const { organizationName, memberCardNo } = req.body;
  if (!organizationName || typeof organizationName !== 'string') {
    return res.status(400).json({ error: 'organizationName (string) is required.' });
  }

  let coverageBlocked = false;
  try {
    const policySnap = await getFirestore().doc(`healthPolicies/${organizationName}`).get();
    if (policySnap.exists) {
      coverageBlocked = evaluatePolicyFromRecord(policySnap.data() || {}).coverageBlocked === true;
    }
  } catch (e: any) {
    req.log.error({ err: e, organizationName }, 'Failed to read policy data');
    return res.status(503).json({ error: 'Unable to read policy data from the database.' });
  }

  if (coverageBlocked) {
    return res.json({
      allowed: false,
      reason: 'Healthcare access is suspended due to organizational policy restrictions.',
    });
  }

  let memberStatus: string | undefined;
  if (memberCardNo && typeof memberCardNo === 'string') {
    try {
      const memberSnap = await getFirestore().collection('members').where('cardNo', '==', memberCardNo).limit(1).get();
      if (!memberSnap.empty) {
        memberStatus = memberSnap.docs[0].data().status;
      }
    } catch (e: any) {
      req.log.error({ err: e, memberCardNo }, 'Failed to read member data');
      return res.status(503).json({ error: 'Unable to read member data from the database.' });
    }
  }
  if (memberStatus === 'Suspended' || memberStatus === 'Suspendu' || memberStatus === 'Inactive' || memberStatus === 'Inactif') {
    return res.json({
      allowed: false,
      reason: `Member is currently ${memberStatus}. Care authorization denied.`,
    });
  }
  return res.json({ allowed: true });
});

// === AMÉLIORATION AJOUTÉE : sécurité — validation/nettoyage stricts avant écriture Firestore ===
// Constat initial : la route ci-dessous construisait `entry` à partir de `{...req.body, ...}` —
// chaque champ envoyé par le client, quel qu'il soit, atterrissait tel quel dans Firestore.
// Cette route reste accessible SANS authentification par conception (voir plus bas — elle doit
// pouvoir journaliser un échec de connexion avant authentification), donc n'importe qui pouvait
// faire écrire des documents arbitraires dans `auditLogs`.
// === AMÉLIORATION AJOUTÉE (revue CodeRabbit, PR #88) === schéma entièrement repensé en DEUX
// formes strictes, miroir EXACT des deux seules formes que `firestore.rules` valide déjà pour
// une écriture cliente directe dans `auditLogs` (voir isPreAuthLoginLogValid/
// isBusinessAuditLogValid, match /auditLogs/{logId}) — et des seuls appels réels à
// `FirestoreService.addLog()` dans tout le dépôt (vérifié exhaustivement : LoginView.tsx,
// App.tsx `handleLoginSuccess`, workflowService.ts, ReportsView.tsx, ClaimsView.tsx,
// MembersView.tsx). Cette route utilise le SDK Admin, qui CONTOURNE firestore.rules — elle doit
// donc réappliquer elle-même exactement les mêmes garanties de forme ET d'identité, sans quoi
// elle serait un moyen de contourner des protections que le chemin client normal impose déjà.
const preAuthLoginLogSchema = z
  .object({
    userEmail: z.string().trim().max(320).optional(),
    ipAddress: z.string().max(64).optional(),
    status: z.enum(['success', 'failed']),
    userAgent: z.string().max(512).optional(),
    browser: z.string().trim().max(200).optional(),
    location: z.string().trim().max(200).optional(),
    timestamp: z.string().max(64).optional(),
  })
  .strict();

const businessAuditLogSchema = z
  .object({
    userId: z.string().trim().max(128).optional(),
    userName: z.string().trim().max(200).optional(),
    userRole: z.string().trim().max(100).optional(),
    action: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1).max(200),
    entityId: z.string().trim().max(200).optional(),
    entityType: z.string().trim().max(100).optional(),
    details: z.string().trim().max(2000).optional(),
    timestamp: z.string().max(64).optional(),
  })
  .strict();

// === AMÉLIORATION AJOUTÉE (revue CodeRabbit, PR #88) === même stratégie de résolution de rôle
// déjà établie et documentée dans functions/src/index.ts (resolveUserRole) : claim `role` du
// jeton en priorité (jamais réellement posée dans ce projet à ce jour — voir ce même fichier),
// puis repli sur `accounts/{uid}.profile` (le champ réellement utilisé partout ailleurs —
// AccountsView.tsx, firestore.rules `getUserData().profile`). Ne fait JAMAIS confiance à un
// `userRole` déclaré par le client dans le corps de la requête : contrairement à `userId`, déjà
// toujours lié au jeton vérifié ci-dessous, un `userRole` non vérifié permettrait à n'importe
// quel agent authentifié de se faire passer pour 'Admin' dans sa propre piste d'audit.
async function resolveVerifiedUserRole(uid: string, tokenRole: unknown): Promise<string> {
  if (tokenRole === 'Admin' || tokenRole === 'Supervisor' || tokenRole === 'Agent') {
    return tokenRole;
  }
  try {
    const accSnap = await getFirestore().doc(`accounts/${uid}`).get();
    if (accSnap.exists) {
      const data = accSnap.data() || {};
      return data.profile || data.role || 'Agent';
    }
  } catch {
    // Repli silencieux — cette route ne doit jamais échouer pour la seule raison qu'elle ne
    // peut pas déterminer un libellé de rôle pour l'entrée d'audit.
  }
  return 'Agent';
}

// === AMÉLIORATION AJOUTÉE : sécurité (Phase 1.7/2.3) — cette route renvoyait auparavant
// {success:true, entry:{...}} SANS JAMAIS RIEN ÉCRIRE (ni Firestore, ni fichier) : un pur
// simulacre (voir CODE_AUDIT_MAP.md section 3.2). Écrit désormais réellement dans `auditLogs`
// via le SDK Admin. Le jeton d'authentification est vérifié s'il est fourni (pour obtenir un
// uid de confiance), mais reste OPTIONNEL sur cette route — cohérent avec
// `auditLogs.create: if true` dans firestore.rules, qui doit rester ouvert pour journaliser un
// échec de connexion avant authentification (voir LoginView.tsx) ; aucun appelant existant
// (apiClient.ts est mort) — aucune régression possible.
app.post('/api/audit/log', auditLogRateLimiter, async (req: Request, res: Response) => {
  // === AMÉLIORATION AJOUTÉE (revue CodeRabbit, PR #88) === la vérification du jeton doit
  // précéder la validation de forme : seule une requête authentifiée peut prétendre à la forme
  // "action métier" (miroir de `isSignedIn() && isBusinessAuditLogValid(...)` dans
  // firestore.rules) — une requête non authentifiée ne peut produire qu'un journal de connexion.
  let verifiedUid: string | null = null;
  let verifiedRoleClaim: unknown = null;
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token && !adminInitError) {
    try {
      const decoded = await getAuth().verifyIdToken(token);
      verifiedUid = decoded.uid;
      verifiedRoleClaim = (decoded as { role?: unknown }).role ?? null;
    } catch {
      // Invalid/expired token: proceed anonymously — this endpoint must also support
      // pre-authentication events (e.g. failed login attempts).
    }
  }

  const loginResult = preAuthLoginLogSchema.safeParse(req.body);
  const businessResult = verifiedUid ? businessAuditLogSchema.safeParse(req.body) : undefined;

  let isBusinessShape = false;
  let parsedData: z.infer<typeof preAuthLoginLogSchema> | z.infer<typeof businessAuditLogSchema>;
  if (loginResult.success) {
    parsedData = loginResult.data;
  } else if (businessResult?.success) {
    parsedData = businessResult.data;
    isBusinessShape = true;
  } else {
    return res.status(400).json({
      error:
        'Invalid audit log payload — must match either a pre-authentication login record, or (when authenticated) a business action record.',
      details: [
        ...loginResult.error.issues.map((issue) => `login shape — ${issue.path.join('.') || '(root)'}: ${issue.message}`),
        ...(businessResult && !businessResult.success
          ? businessResult.error.issues.map((issue) => `business shape — ${issue.path.join('.') || '(root)'}: ${issue.message}`)
          : []),
      ],
    });
  }

  // === AMÉLIORATION AJOUTÉE (revue Qodo, PR #88) === `req.ip`, résolu par Express selon
  // `trust proxy` (voir plus haut), plutôt que l'en-tête `X-Forwarded-For` brut — cohérent avec
  // le rate limiter ci-dessus, et fiable même face à un client qui falsifierait cet en-tête.
  const clientIp = req.ip || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const entry: Record<string, unknown> = {
    ...parsedData,
    // === AMÉLIORATION AJOUTÉE (revue CodeRabbit, PR #88) === `userId` n'est plus JAMAIS pris
    // depuis le corps de la requête, authentifiée ou non — uniquement le jeton vérifié, ou
    // 'anonymous'. Auparavant, un appelant non authentifié pouvait s'attribuer n'importe quel
    // `userId` de son choix.
    userId: verifiedUid || 'anonymous',
    serverTimestamp: new Date().toISOString(),
    ip: clientIp,
    // `ipAddress` (nom de champ réellement utilisé par la forme "connexion") réécrit ici au
    // même titre que `ip`, pour la même raison : ne jamais laisser un client imposer sa propre
    // valeur pour un champ destiné à porter une adresse vérifiée côté serveur.
    ipAddress: clientIp,
    userAgent,
    verifiedServerSide: true,
  };
  if (isBusinessShape && verifiedUid) {
    entry.userRole = await resolveVerifiedUserRole(verifiedUid, verifiedRoleClaim);
  }

  if (adminInitError) {
    return res.status(503).json({ error: 'Server-side audit logging is not configured (Admin SDK unavailable).' });
  }
  try {
    const ref = await getFirestore().collection('auditLogs').add(entry);
    res.json({ success: true, id: ref.id, entry });
  } catch (e: any) {
    req.log.error({ err: e }, 'Failed to persist audit log entry');
    res.status(503).json({ error: 'Failed to persist audit log entry.' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // === AMÉLIORATION AJOUTÉE : correctif — repli SPA cassé sous Express 5 ===
    // `app.get('*', ...)` faisait planter le process au démarrage (`PathError: Missing
    // parameter name`) : Express 5 s'appuie sur path-to-regexp v8, qui exige un joker nommé
    // (`/*splat`) au lieu d'un simple `'*'` (syntaxe valide seulement sous Express 4/
    // path-to-regexp v6 et antérieur). Constaté en testant le bundle de production
    // (`node dist/server.cjs`) — ce chemin n'était donc jamais exercé par le mode développement
    // (`npm run dev`, branche Vite juste au-dessus), ce qui expliquait qu'il soit passé inaperçu.
    // Même comportement voulu (repli SPA : toute route non servie par les assets statiques
    // au-dessus renvoie index.html), seule la syntaxe change.
    app.get('/*splat', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT }, 'ACTIVA HealthCare full-stack server running');
  });
}

startServer();
