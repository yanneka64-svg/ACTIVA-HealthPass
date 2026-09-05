import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, DocumentData } from 'firebase-admin/firestore';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// === AMÉLIORATION AJOUTÉE : sécurité (Phase 1.1/1.7) ===
// Constat de docs/security/CODE_AUDIT_MAP.md (section 3.2) : AUCUNE route de ce serveur ne
// vérifiait le jeton Firebase Auth envoyé par `src/services/apiClient.ts` (`Authorization:
// Bearer ...`) — chaque route était donc accessible anonymement — et `/api/policies/evaluate`
// / `/api/claims/validate-coverage` recalculaient un statut à partir de valeurs ENTIÈREMENT
// fournies par le client, sans jamais lire les données réelles en base (aucune garantie
// d'intégrité malgré les apparences). Corrigé ci-dessous : initialisation tolérante du SDK
// Admin (n'empêche jamais le démarrage du serveur ni les routes qui n'en ont pas besoin —
// `/api/health`, `/api/cards/verify-format`, `/api/cards/continuity-report` restent
// inchangées), middleware de vérification de jeton pour les routes sensibles, et lecture
// systématique de l'état réel en base plutôt que confiance dans le payload client.
// Aucun appelant n'existe aujourd'hui pour ces routes (apiClient.ts est du code mort, voir
// CODE_AUDIT_MAP.md) : ce correctif ferme une faille avant qu'elle ne soit jamais exploitée
// en production, sans aucun risque de régression sur un usage existant.
let adminInitError: string | null = null;
try {
  if (!getApps().length) {
    initializeApp();
  }
} catch (e: any) {
  adminInitError = e?.message || 'Firebase Admin SDK initialization failed';
  console.warn('[server.ts] Firebase Admin SDK not available:', adminInitError);
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
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'ACTIVA HealthPass API & Continuity Gateway',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  });
});

// === AMÉLIORATION AJOUTÉE : sécurité (audit 2026-09-05, SEC-01/SEC-05) ===
// Les routes /api/auth/lookup-account et /api/auth/verify-legacy-credentials qui existaient
// ici ont été SUPPRIMÉES. Elles dupliquaient — avec un niveau de sécurité inférieur — ce que
// la Cloud Function callable `resolveLoginIdentifier` (functions/src/index.ts) fait déjà
// correctement (rate limiting persistant dans Firestore au lieu d'un Map en mémoire perdu à
// chaque redémarrage, vérification PBKDF2 via l'Admin SDK, jamais de hash/sel renvoyé).
// Constat critique lors de cet audit : la fonction `getNamedDb()`/`ensureServerServiceAuth()`
// que ces deux routes utilisaient authentifiait le serveur avec un e-mail ET UN MOT DE PASSE
// CODÉS EN DUR directement dans ce fichier source ('yannick.ekani_test@activa.local' /
// 'ActivaJKC8Q@!2025'), donc versionnés dans l'historique Git. Ce secret doit être considéré
// comme compromis : un administrateur doit changer ce mot de passe dans Firebase Auth
// indépendamment de cette suppression de code. Aucun appelant n'existe pour ces deux routes
// dans src/ (apiClient.ts, seul appelant historique, a également été retiré — voir
// docs/security/CODE_AUDIT_MAP.md section 3.2 et STRUCT-02) : suppression sans régression.

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
  } catch {
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
    } catch {
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

// === AMÉLIORATION AJOUTÉE : sécurité (Phase 1.7/2.3) — cette route renvoyait auparavant
// {success:true, entry:{...}} SANS JAMAIS RIEN ÉCRIRE (ni Firestore, ni fichier) : un pur
// simulacre (voir CODE_AUDIT_MAP.md section 3.2). Écrit désormais réellement dans `auditLogs`
// via le SDK Admin. Le jeton d'authentification est vérifié s'il est fourni (pour obtenir un
// uid de confiance), mais reste OPTIONNEL sur cette route — cohérent avec
// `auditLogs.create: if true` dans firestore.rules, qui doit rester ouvert pour journaliser un
// échec de connexion avant authentification (voir LoginView.tsx) ; aucun appelant existant
// (apiClient.ts est mort) — aucune régression possible.
app.post('/api/audit/log', async (req: Request, res: Response) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  let verifiedUid: string | null = null;
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token && !adminInitError) {
    try {
      verifiedUid = (await getAuth().verifyIdToken(token)).uid;
    } catch {
      // Invalid/expired token: log anonymously rather than reject — this endpoint must also
      // support pre-authentication events (e.g. failed login attempts).
    }
  }

  const entry = {
    ...req.body,
    userId: verifiedUid || req.body?.userId || 'anonymous',
    serverTimestamp: new Date().toISOString(),
    ip: clientIp,
    userAgent,
    verifiedServerSide: true,
  };

  if (adminInitError) {
    return res.status(503).json({ error: 'Server-side audit logging is not configured (Admin SDK unavailable).' });
  }
  try {
    const ref = await getFirestore().collection('auditLogs').add(entry);
    res.json({ success: true, id: ref.id, entry });
  } catch (e: any) {
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
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ACTIVA HealthPass full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
