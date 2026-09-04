import { auth } from '../lib/firebase';
import { AssignmentContext } from '../../functions/src/cardService';
import { ClaimDecisionPayload } from '../../functions/src/claimsService';
import { EnrollmentDecisionPayload } from '../../functions/src/enrollmentsService';
import { ImportRowInput, ImportExecutionResult } from '../../functions/src/importService';
import { AuditLogEntry } from '../../functions/src/auditService';
import { HealthPolicy } from '../../functions/src/policyService';

/**
 * Helper to get current user authorization header
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const token = await currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (e) {
    // Non-blocking
  }

  return headers;
}

/**
 * Centralized Client for Secure Backend Operations
 * Routes all critical operations through the backend server / Cloud Functions
 */
export const ApiClient = {
  /**
   * Generates the next sequential card number via backend server authority
   */
  async generateNextCardNumber(ctx: AssignmentContext): Promise<string> {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/cards/generate-next', {
      method: 'POST',
      headers,
      body: JSON.stringify(ctx),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to generate card number' }));
      throw new Error(err.error || err.message || 'Server failed to generate card number');
    }

    const data = await res.json();
    return data.cardNumber;
  },

  /**
   * Registers an existing card number (Case A) via backend server authority
   */
  async registerExistingCardNumber(cardNumber: string, ctx: AssignmentContext): Promise<void> {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/cards/register-existing', {
      method: 'POST',
      headers,
      body: JSON.stringify({ cardNumber, ...ctx }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to register existing card number' }));
      throw new Error(err.error || err.message || 'Server failed to register existing card number');
    }
  },

  /**
   * Batch generates N card numbers without gaps
   */
  async batchGenerateCardNumbers(count: number, ctxList: AssignmentContext[] = []): Promise<string[]> {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/cards/batch-generate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ count, ctxList }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to batch generate card numbers' }));
      throw new Error(err.error || err.message || 'Server failed to batch generate card numbers');
    }

    const data = await res.json();
    return data.cardNumbers || [];
  },

  /**
   * Processes claim approval or rejection through the single server-side authority
   */
  async processClaimDecision(payload: ClaimDecisionPayload): Promise<{ success: boolean; invoiceId?: string }> {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/claims/process-decision', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to process claim decision' }));
      throw new Error(err.error || err.message || 'Server failed to process claim decision');
    }

    return await res.json();
  },

  /**
   * Processes enrollment approval or rejection through the single server-side authority
   */
  async processEnrollmentDecision(payload: EnrollmentDecisionPayload): Promise<{ success: boolean; memberId?: string }> {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/enrollments/process-decision', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to process enrollment decision' }));
      throw new Error(err.error || err.message || 'Server failed to process enrollment decision');
    }

    return await res.json();
  },

  /**
   * Processes Excel bulk member import on the server with atomic batching and collision verification
   */
  async processBulkMemberImport(rows: ImportRowInput[]): Promise<ImportExecutionResult> {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/import/bulk-members', {
      method: 'POST',
      headers,
      body: JSON.stringify({ rows }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to process bulk member import' }));
      throw new Error(err.error || err.message || 'Server failed to process bulk member import');
    }

    const data = await res.json();
    return data.result;
  },

  /**
   * Appends an immutable audit log entry via the backend server
   */
  async logAuditEvent(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<string> {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/audit/log', {
      method: 'POST',
      headers,
      body: JSON.stringify(entry),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to record audit log' }));
      throw new Error(err.error || err.message || 'Server failed to record audit log');
    }

    const data = await res.json();
    return data.id || data.entry?.id || '';
  },

  /**
   * Evaluates organization health policy on the server
   */
  async evaluatePolicy(policy: HealthPolicy): Promise<any> {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/policies/evaluate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ policy }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to evaluate policy' }));
      throw new Error(err.error || err.message || 'Server failed to evaluate policy');
    }

    return await res.json();
  },

  /**
   * Validates healthcare access for a given organization or member
   */
  async validateHealthcareAccess(params: { organization?: string; coverageBlocked?: boolean; memberStatus?: string }): Promise<{ allowed: boolean; reason?: string }> {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/claims/validate-coverage', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to validate healthcare access' }));
      throw new Error(err.error || err.message || 'Server failed to validate healthcare access');
    }

    return await res.json();
  },
};
