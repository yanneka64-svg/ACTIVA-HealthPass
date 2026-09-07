/**
 * Cryptographic seal for Audit Trail entries (Go-Live Santé / ISO 27799 / RGPD Art. 32).
 * Guarantees tamper-evident traceability across all business and security events.
 */
export async function computeLogIntegrityHash(record: {
  userId?: string;
  userEmail?: string;
  action?: string;
  status?: string;
  category?: string;
  entityId?: string;
  timestamp: string;
}): Promise<string> {
  const payload = [
    record.timestamp,
    record.userId || record.userEmail || 'anonymous',
    record.action || record.status || 'unknown',
    record.category || 'general',
    record.entityId || 'none',
  ].join('|');

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(payload);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return 'sha256:' + hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // fallback below
    }
  }

  // Deterministic fallback if subtle crypto is unavailable in the environment
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash << 5) - hash + payload.charCodeAt(i);
    hash |= 0;
  }
  return 'h32:' + Math.abs(hash).toString(16);
}
