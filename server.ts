import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- API ROUTES ---
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'ACTIVA HealthPass API & Continuity Gateway',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
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

// Policy Status Server Evaluation
app.post('/api/policies/evaluate', (req: Request, res: Response) => {
  const { policy } = req.body;
  if (!policy) {
    return res.status(400).json({ error: 'policy object required' });
  }

  const now = new Date();
  const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // 1. Expiration check
  if (policy.expirationDate) {
    const expDate = new Date(policy.expirationDate).getTime();
    if (!isNaN(expDate)) {
      const diffDays = Math.ceil((expDate - todayTime) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        return res.json({
          status: 'Expired',
          coverageBlocked: true,
          reason: `Policy expired on ${policy.expirationDate} (${Math.abs(diffDays)} days ago).`,
          daysUntilExpiration: diffDays,
        });
      }
    }
  }

  // 2. Overdue payment & grace period
  const graceDays = policy.gracePeriodDays ?? 15;
  if (policy.nextPaymentDueDate) {
    const dueDate = new Date(policy.nextPaymentDueDate).getTime();
    if (!isNaN(dueDate)) {
      const diffPastDue = Math.floor((todayTime - dueDate) / (1000 * 60 * 60 * 24));
      if (diffPastDue > 0) {
        if (diffPastDue > graceDays) {
          return res.json({
            status: 'Suspended (Non-payment)',
            coverageBlocked: true,
            reason: `Payment is ${diffPastDue} days past due (grace period of ${graceDays} days exceeded).`,
            daysPastDue: diffPastDue,
          });
        } else {
          return res.json({
            status: 'Active',
            coverageBlocked: false,
            reason: `Payment is ${diffPastDue} days past due, within grace period (${graceDays} days).`,
            daysPastDue: diffPastDue,
            isInGracePeriod: true,
          });
        }
      }
    }
  }

  // 3. Manual suspension
  if (policy.manuallySuspended) {
    return res.json({
      status: 'Suspended',
      coverageBlocked: true,
      reason: policy.suspensionReason || 'Manually suspended by administrator.',
    });
  }

  // 4. Renewal Warning
  const warningDays = policy.expiringSoonWarningDays ?? 30;
  if (policy.expirationDate) {
    const expDate = new Date(policy.expirationDate).getTime();
    if (!isNaN(expDate)) {
      const diffDays = Math.ceil((expDate - todayTime) / (1000 * 60 * 60 * 24));
      if (diffDays <= warningDays) {
        return res.json({
          status: 'Expiring Soon',
          coverageBlocked: false,
          reason: `Policy will expire in ${diffDays} days (${policy.expirationDate}). Renewal required.`,
          daysUntilExpiration: diffDays,
        });
      }
    }
  }

  return res.json({
    status: 'Active',
    coverageBlocked: false,
    reason: 'Policy in good standing.',
  });
});

// Healthcare Access Gate
app.post('/api/claims/validate-coverage', (req: Request, res: Response) => {
  const { coverageBlocked, memberStatus } = req.body;
  if (coverageBlocked === true) {
    return res.json({
      allowed: false,
      reason: 'Healthcare access is suspended due to organizational policy restrictions.',
    });
  }
  if (memberStatus === 'Suspended' || memberStatus === 'Suspendu' || memberStatus === 'Inactive' || memberStatus === 'Inactif') {
    return res.json({
      allowed: false,
      reason: `Member is currently ${memberStatus}. Care authorization denied.`,
    });
  }
  return res.json({ allowed: true });
});

// Server-stamped Audit Event
app.post('/api/audit/log', (req: Request, res: Response) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const entry = {
    ...req.body,
    serverTimestamp: new Date().toISOString(),
    ip: clientIp,
    userAgent,
    verifiedServerSide: true,
  };

  res.json({
    success: true,
    entry,
  });
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
