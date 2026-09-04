import * as admin from 'firebase-admin';

export const CARD_PREFIX = 'AMID';
export const CARD_NUMBER_REGEX = /^AMID-(\d{2})(\d{2})(\d{2})-(\d{5})$/;

function pad(n: number, width: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(width, '0');
}

export function toIssueDateSegment(date?: Date | string | null): string {
  let d: Date;
  if (!date) {
    d = new Date();
  } else if (typeof date === 'string') {
    const parsed = new Date(date.length <= 10 ? `${date}T00:00:00` : date);
    d = isNaN(parsed.getTime()) ? new Date() : parsed;
  } else {
    d = isNaN(date.getTime()) ? new Date() : date;
  }
  const yy = pad(d.getFullYear() % 100, 2);
  const mm = pad(d.getMonth() + 1, 2);
  const dd = pad(d.getDate(), 2);
  return `${yy}${mm}${dd}`;
}

export function formatCardNumber(issueDate: Date | string | null | undefined, assuredNumber: number): string {
  return `${CARD_PREFIX}-${toIssueDateSegment(issueDate)}-${pad(assuredNumber, 5)}`;
}

export function parseCardNumber(cardNo: string | undefined | null): { issueDate: string; assuredNumber: number } | null {
  if (!cardNo) return null;
  const match = CARD_NUMBER_REGEX.exec(cardNo.trim());
  if (!match) return null;
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { issueDate: `${match[1]}${match[2]}${match[3]}`, assuredNumber: parseInt(match[4], 10) };
}

export interface AssignmentContext {
  organization?: string | null;
  memberId?: string | null;
  insuredName?: string | null;
  assignedBy?: string | null;
  assignedByName?: string | null;
  method: 'AUTO_ENROLLMENT' | 'ADMIN_CREATION' | 'EXCEL_IMPORT' | 'MANUAL' | 'MIGRATION';
}

/**
 * Server-side atomic generation of next card number
 */
export async function generateNextCardNumberServer(
  db: admin.firestore.Firestore,
  ctx: AssignmentContext
): Promise<string> {
  const countersRef = db.doc('counters/cardNumbers');

  return db.runTransaction(async (tx) => {
    const countersSnap = await tx.get(countersRef);
    const counters = countersSnap.exists ? countersSnap.data() || {} : {};
    const nextAssured = ((counters.lastAssuredNumber as number) || 0) + 1;
    const cardNumber = formatCardNumber(new Date(), nextAssured);

    const registryRef = db.doc(`cardNumberRegistry/${cardNumber}`);
    const registrySnap = await tx.get(registryRef);
    if (registrySnap.exists) {
      throw new Error(`Integrity constraint violation: card number ${cardNumber} already exists in registry.`);
    }

    const assignmentDoc = {
      id: cardNumber,
      cardNumber,
      issueDate: toIssueDateSegment(new Date()),
      assuredNumber: pad(nextAssured, 5),
      organization: ctx.organization ?? null,
      memberId: ctx.memberId ?? null,
      insuredName: ctx.insuredName ?? null,
      assignedBy: ctx.assignedBy ?? null,
      assignedByName: ctx.assignedByName ?? null,
      assignedAt: new Date().toISOString(),
      method: ctx.method,
    };

    tx.set(registryRef, assignmentDoc);
    tx.set(
      countersRef,
      {
        lastAssuredNumber: nextAssured,
        formatVersion: 'v2',
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return cardNumber;
  });
}

/**
 * Server-side atomic batch generation of consecutive card numbers without gaps
 */
export async function batchGenerateCardNumbersServer(
  db: admin.firestore.Firestore,
  count: number,
  ctxList: AssignmentContext[]
): Promise<string[]> {
  if (count <= 0) return [];
  const countersRef = db.doc('counters/cardNumbers');

  return db.runTransaction(async (tx) => {
    const countersSnap = await tx.get(countersRef);
    const counters = countersSnap.exists ? countersSnap.data() || {} : {};
    let currentAssured = ((counters.lastAssuredNumber as number) || 0);

    const generated: string[] = [];
    const today = new Date();

    for (let i = 0; i < count; i++) {
      currentAssured += 1;
      const cardNo = formatCardNumber(today, currentAssured);
      const regRef = db.doc(`cardNumberRegistry/${cardNo}`);
      const regSnap = await tx.get(regRef);
      if (regSnap.exists) {
        throw new Error(`Integrity conflict: Card number ${cardNo} already registered.`);
      }

      const ctx = ctxList[i] || { method: 'EXCEL_IMPORT' };
      tx.set(regRef, {
        id: cardNo,
        cardNumber: cardNo,
        issueDate: toIssueDateSegment(today),
        assuredNumber: pad(currentAssured, 5),
        organization: ctx.organization ?? null,
        memberId: ctx.memberId ?? null,
        insuredName: ctx.insuredName ?? null,
        assignedBy: ctx.assignedBy ?? null,
        assignedByName: ctx.assignedByName ?? null,
        assignedAt: new Date().toISOString(),
        method: ctx.method,
      });

      generated.push(cardNo);
    }

    tx.set(
      countersRef,
      {
        lastAssuredNumber: currentAssured,
        formatVersion: 'v2',
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return generated;
  });
}
