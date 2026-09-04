import * as admin from 'firebase-admin';

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
}

export async function logAuditEventServer(
  db: admin.firestore.Firestore,
  entry: Omit<AuditLogEntry, 'timestamp'>
): Promise<string> {
  const auditRef = db.collection('auditLogs').doc();
  const logDoc: AuditLogEntry = {
    ...entry,
    id: auditRef.id,
    timestamp: new Date().toISOString(),
    severity: entry.severity || 'INFO',
  };

  await auditRef.set(logDoc);
  return auditRef.id;
}
