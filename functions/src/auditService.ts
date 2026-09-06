import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

export interface AuditLogEntry {
  id?: string;
  timestamp: string;
  userId: string;
  userName?: string;
  userRole: string;
  action: string;
  category: string;
  entityId?: string;
  entityType?: string;
  details: string;
  ip?: string;
  userAgent?: string;
  severity?: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  integrityHash?: string;
}

export async function logAuditEventServer(
  db: admin.firestore.Firestore,
  entry: Omit<AuditLogEntry, 'timestamp'>
): Promise<string> {
  const auditRef = db.collection('auditLogs').doc();
  const timestamp = new Date().toISOString();
  
  const payload = [
    timestamp,
    entry.userId || 'system',
    entry.action,
    entry.category,
    entry.entityId || 'none',
  ].join('|');
  const integrityHash = 'sha256:' + crypto.createHash('sha256').update(payload).digest('hex');

  const logDoc: AuditLogEntry = {
    ...entry,
    id: auditRef.id,
    timestamp,
    severity: entry.severity || 'INFO',
    integrityHash,
  };

  await auditRef.set(logDoc);
  return auditRef.id;
}
