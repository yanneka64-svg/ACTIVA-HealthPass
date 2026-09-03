// === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System ===
// Système centralisé, sécurisé et transactionnel de génération des numéros uniques de
// cartes d'assurés (format AMID-XXXXX-XXXX), sur demande explicite. Voir le commentaire en
// tête de src/types/index.ts pour les types partagés.
//
// Architecture (adaptée à l'existant — HealthPass n'a pas de Cloud Functions, uniquement le
// SDK client Firestore) :
//   - `counters/cardNumbers`  : document unique, les deux compteurs indépendants
//     (lastPrintedCardNumber / lastInsuredNumber). Mis à jour UNIQUEMENT via une
//     runTransaction (jamais setDoc direct hors transaction), pour rester correct sous
//     attribution simultanée (section 14) — Firestore relit et réessaie automatiquement une
//     transaction en cas de conflit d'écriture concurrent.
//   - `cardNumberRegistry/{cardNumber}` : un document par numéro complet déjà attribué.
//     L'EXISTENCE du document EST la contrainte d'unicité (section 13) — deux transactions
//     concurrentes qui tentent de créer le même id de document ne peuvent jamais toutes les
//     deux réussir. Sert aussi de trace d'audit (section 17/29). Les règles Firestore
//     interdisent update/delete sur cette collection : un numéro consommé est immuable et
//     n'est jamais réattribué (section 15), même si l'assuré est ensuite supprimé.
import { collection, doc, getDoc, getDocs, query, runTransaction, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CardAssignmentMethod, CardNumberAssignment, CardNumberCounters, CardNumberPreviewRow, Member } from '../types';

export const CARD_PREFIX = 'AMID';
export const CARD_NUMBER_REGEX = /^AMID-(\d{5})-(\d{4})$/;

const COUNTERS_REF = doc(db, 'counters', 'cardNumbers');
const REGISTRY_COLLECTION = 'cardNumberRegistry';

function pad(n: number, width: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(width, '0');
}

/** Builds the official "AMID-XXXXX-XXXX" string from the two independent sequences. */
export function formatCardNumber(printed: number, insured: number): string {
  return `${CARD_PREFIX}-${pad(printed, 5)}-${pad(insured, 4)}`;
}

/**
 * Parses a card number string against the strict official format. Returns null (never
 * throws) for anything that doesn't match exactly — missing prefix, wrong digit counts,
 * missing dashes, etc. (section 12).
 */
export function parseCardNumber(cardNo: string | undefined | null): { printed: number; insured: number } | null {
  if (!cardNo) return null;
  const match = CARD_NUMBER_REGEX.exec(cardNo.trim());
  if (!match) return null;
  return { printed: parseInt(match[1], 10), insured: parseInt(match[2], 10) };
}

export function isValidCardNumberFormat(cardNo: string | undefined | null): boolean {
  return parseCardNumber(cardNo) !== null;
}

async function readCounters(): Promise<CardNumberCounters> {
  const snap = await getDoc(COUNTERS_REF);
  return snap.exists()
    ? (snap.data() as CardNumberCounters)
    : { lastPrintedCardNumber: 0, lastInsuredNumber: 0 };
}

/** Public read-only accessor for the current counters — used by the Admin "Card Number
 *  Management" panel and by post-import summaries (section 20 / 22). */
export async function getCurrentCounters(): Promise<CardNumberCounters> {
  return readCounters();
}

/** Convenience: the card number that WOULD be generated next, without reserving it. Purely
 *  informational (a concurrent enrollment could still claim it first) — never treat this as
 *  a reservation. */
export async function previewNextCardNumber(): Promise<string> {
  const counters = await readCounters();
  return formatCardNumber((counters.lastPrintedCardNumber || 0) + 1, (counters.lastInsuredNumber || 0) + 1);
}

/** Read-only availability check (registry doc existence) — used by live-preview UI only,
 *  never as the sole guard before an actual write (the transactional functions below
 *  re-check inside the transaction, which is the real, race-safe guarantee). */
export async function isCardNumberTaken(cardNumber: string): Promise<boolean> {
  const snap = await getDoc(doc(db, REGISTRY_COLLECTION, cardNumber));
  return snap.exists();
}

interface AssignmentContext {
  organization?: string | null;
  memberId?: string | null;
  insuredName?: string | null;
  assignedBy?: string | null;
  assignedByName?: string | null;
  method: CardAssignmentMethod;
}

function buildAssignmentDoc(cardNumber: string, printed: number, insured: number, ctx: AssignmentContext): CardNumberAssignment {
  return {
    id: cardNumber,
    cardNumber,
    printedCardNumber: pad(printed, 5),
    insuredNumber: pad(insured, 4),
    organization: ctx.organization ?? null,
    memberId: ctx.memberId ?? null,
    insuredName: ctx.insuredName ?? null,
    assignedBy: ctx.assignedBy ?? null,
    assignedByName: ctx.assignedByName ?? null,
    assignedAt: new Date().toISOString(),
    method: ctx.method,
  };
}

/**
 * CASE where no card number exists yet (enrollment / admin creation / blank Excel row) —
 * atomically generates the next AMID-XXXXX-XXXX, reserves it in the uniqueness registry, and
 * advances the counters. Optionally accepts a printed-card-number override (section 6 — the
 * agent typed the physical card's printed number); the insured sequential segment is ALWAYS
 * auto-generated, never manually entered (section 5).
 */
export async function generateNextCardNumber(
  ctx: AssignmentContext & { printedCardNumberOverride?: string }
): Promise<string> {
  return runTransaction(db, async (tx) => {
    const countersSnap = await tx.get(COUNTERS_REF);
    const counters: CardNumberCounters = countersSnap.exists()
      ? (countersSnap.data() as CardNumberCounters)
      : { lastPrintedCardNumber: 0, lastInsuredNumber: 0 };

    let nextPrinted: number;
    const override = ctx.printedCardNumberOverride?.trim();
    if (override) {
      const overrideNum = parseInt(override, 10);
      if (isNaN(overrideNum) || overrideNum <= 0 || String(overrideNum).length > 5) {
        throw new Error('Invalid printed card number.');
      }
      nextPrinted = overrideNum;
    } else {
      nextPrinted = (counters.lastPrintedCardNumber || 0) + 1;
    }
    const nextInsured = (counters.lastInsuredNumber || 0) + 1;
    const cardNumber = formatCardNumber(nextPrinted, nextInsured);

    const registryRef = doc(db, REGISTRY_COLLECTION, cardNumber);
    const registrySnap = await tx.get(registryRef);
    if (registrySnap.exists()) {
      // Extremely unlikely (the counter is monotonic) but defensive: a manually-typed printed
      // override could in principle collide with a number already consumed via that same
      // override elsewhere. Never silently overwrite — surface it.
      throw new Error('This card number is already assigned to another insured member.');
    }

    tx.set(registryRef, buildAssignmentDoc(cardNumber, nextPrinted, nextInsured, ctx));
    tx.set(
      COUNTERS_REF,
      {
        lastPrintedCardNumber: Math.max(counters.lastPrintedCardNumber || 0, nextPrinted),
        lastInsuredNumber: nextInsured,
        updatedAt: new Date().toISOString(),
      } as CardNumberCounters,
      { merge: true }
    );

    return cardNumber;
  });
}

/**
 * CASE where a card number is already provided (existing manual number, Excel row that
 * already has a Card No., admin retyping a historical number) — validates the format,
 * rejects it if already assigned to someone else, reserves it, and raises the counters to at
 * least this number (never lowers them — historical/explicit numbers always take priority
 * over the running counter, section 32).
 */
export async function reserveExistingCardNumber(cardNumber: string, ctx: AssignmentContext): Promise<void> {
  const parsed = parseCardNumber(cardNumber);
  if (!parsed) {
    throw new Error(`Invalid card number format: "${cardNumber}". Expected AMID-XXXXX-XXXX.`);
  }

  await runTransaction(db, async (tx) => {
    const registryRef = doc(db, REGISTRY_COLLECTION, cardNumber);
    const registrySnap = await tx.get(registryRef);
    if (registrySnap.exists()) {
      throw new Error('This card number is already assigned to another insured member.');
    }

    const countersSnap = await tx.get(COUNTERS_REF);
    const counters: CardNumberCounters = countersSnap.exists()
      ? (countersSnap.data() as CardNumberCounters)
      : { lastPrintedCardNumber: 0, lastInsuredNumber: 0 };

    tx.set(registryRef, buildAssignmentDoc(cardNumber, parsed.printed, parsed.insured, ctx));
    tx.set(
      COUNTERS_REF,
      {
        lastPrintedCardNumber: Math.max(counters.lastPrintedCardNumber || 0, parsed.printed),
        lastInsuredNumber: Math.max(counters.lastInsuredNumber || 0, parsed.insured),
        updatedAt: new Date().toISOString(),
      } as CardNumberCounters,
      { merge: true }
    );
  });
}

/**
 * Migration / validation pass (sections 3, 18): scans EVERY member already in the database
 * (never just the last-created one), determines the true historical maximum for each
 * sequence, backfills the uniqueness registry for any historical number not yet indexed (so
 * duplicate detection works retroactively for cards created before this system existed), and
 * raises the persisted counters to at least that maximum — never lowers them. Idempotent and
 * safe to re-run at any time (the Admin "Validate Card Number Sequence" button does exactly
 * that); also self-bootstraps the counters on first use if they don't exist yet.
 */
export async function migrateCardNumberCounters(members: Member[]): Promise<CardNumberCounters> {
  let maxPrinted = 0;
  let maxInsured = 0;
  const validEntries: { cardNo: string; printed: number; insured: number; member: Member }[] = [];

  for (const m of members) {
    const parsed = parseCardNumber(m.cardNo);
    if (!parsed) continue; // malformed/legacy numbers are left exactly as-is, never touched
    validEntries.push({ cardNo: m.cardNo, printed: parsed.printed, insured: parsed.insured, member: m });
    if (parsed.printed > maxPrinted) maxPrinted = parsed.printed;
    if (parsed.insured > maxInsured) maxInsured = parsed.insured;
  }

  // Backfill the registry for historical numbers not yet indexed (does not overwrite an
  // existing registry entry, so re-running this is always safe).
  for (const entry of validEntries) {
    const regRef = doc(db, REGISTRY_COLLECTION, entry.cardNo);
    const regSnap = await getDoc(regRef);
    if (!regSnap.exists()) {
      await setDoc(
        regRef,
        buildAssignmentDoc(entry.cardNo, entry.printed, entry.insured, {
          organization: entry.member.organization,
          memberId: entry.member.id,
          insuredName: entry.member.principalName,
          assignedBy: 'system-migration',
          assignedByName: 'System Migration',
          method: 'MIGRATION',
        })
      );
    }
  }

  return runTransaction(db, async (tx) => {
    const countersSnap = await tx.get(COUNTERS_REF);
    const current: CardNumberCounters = countersSnap.exists()
      ? (countersSnap.data() as CardNumberCounters)
      : { lastPrintedCardNumber: 0, lastInsuredNumber: 0 };
    const next: CardNumberCounters = {
      lastPrintedCardNumber: Math.max(current.lastPrintedCardNumber || 0, maxPrinted),
      lastInsuredNumber: Math.max(current.lastInsuredNumber || 0, maxInsured),
      updatedAt: new Date().toISOString(),
    };
    tx.set(COUNTERS_REF, next, { merge: true });
    return next;
  });
}

/**
 * Dry-run planner for Excel import previews (section 10) — reads the current counters and
 * the uniqueness registry (read-only, no writes) and computes what WOULD happen for each row,
 * without consuming anything (section 23: nothing is definitively consumed until the import
 * is confirmed). Blank rows are assigned sequential numbers in row order; explicit numbers are
 * validated for format and checked for duplicates (in-file and in the database). The running
 * counter only ever advances — gaps left by explicit historical numbers are never
 * auto-filled (section 19), it always continues strictly after the known maximum (section 3).
 */
export async function planCardNumbersForImport(
  rows: { insuredName: string; cardNoRaw: string; organization?: string }[]
): Promise<{ preview: CardNumberPreviewRow[]; finalCardNumbers: (string | null)[] }> {
  const counters = await readCounters();
  let simPrinted = counters.lastPrintedCardNumber || 0;
  let simInsured = counters.lastInsuredNumber || 0;

  const seenInFile = new Set<string>();
  const preview: CardNumberPreviewRow[] = [];
  const finalCardNumbers: (string | null)[] = [];

  for (let i = 0; i < rows.length; i++) {
    const { insuredName, cardNoRaw, organization } = rows[i];
    const trimmed = (cardNoRaw || '').trim();

    if (!trimmed) {
      // CASE 2 (section 8): blank -> generate the next number in sequence.
      simPrinted += 1;
      simInsured += 1;
      const generated = formatCardNumber(simPrinted, simInsured);
      preview.push({ rowIndex: i, insuredName, organization, cardNoExcel: '—', cardNoFinal: generated, action: 'Generated', status: 'Valid' });
      finalCardNumbers.push(generated);
      seenInFile.add(generated);
      continue;
    }

    // CASE 1 (section 8): a number is already provided.
    const parsed = parseCardNumber(trimmed);
    if (!parsed) {
      preview.push({
        rowIndex: i,
        insuredName,
        organization,
        cardNoExcel: trimmed,
        cardNoFinal: '—',
        action: 'None',
        status: 'Invalid',
        reason: 'Invalid format (expected AMID-XXXXX-XXXX)',
      });
      finalCardNumbers.push(null);
      continue;
    }
    if (seenInFile.has(trimmed)) {
      preview.push({
        rowIndex: i,
        insuredName,
        organization,
        cardNoExcel: trimmed,
        cardNoFinal: '—',
        action: 'None',
        status: 'Duplicate',
        reason: 'Duplicate within this file',
      });
      finalCardNumbers.push(null);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop -- sequential by design, see file header
    const taken = await isCardNumberTaken(trimmed);
    if (taken) {
      preview.push({
        rowIndex: i,
        insuredName,
        organization,
        cardNoExcel: trimmed,
        cardNoFinal: '—',
        action: 'None',
        status: 'Duplicate',
        reason: 'This card number is already assigned to another insured member.',
      });
      finalCardNumbers.push(null);
      continue;
    }

    preview.push({ rowIndex: i, insuredName, organization, cardNoExcel: trimmed, cardNoFinal: trimmed, action: 'Kept', status: 'Valid' });
    finalCardNumbers.push(trimmed);
    seenInFile.add(trimmed);
    // An explicit historical number pulls the running sequence forward so that any
    // subsequently-generated row continues after it too (section 32 — existing data wins).
    simPrinted = Math.max(simPrinted, parsed.printed);
    simInsured = Math.max(simInsured, parsed.insured);
  }

  return { preview, finalCardNumbers };
}

/**
 * Confirm-time commit for an Excel import batch (section 14/23): actually reserves each
 * planned card number transactionally, one at a time, in row order — the deliberate sequential
 * (not parallel) execution keeps counter transactions from contending with each other and
 * guarantees the final assigned order matches the preview whenever nothing else has
 * generated a number in the meantime. If the database state drifted since the preview (e.g.
 * another user's concurrent enrollment claimed a number in between), the affected row fails
 * with a clear reason instead of silently overwriting anyone.
 */
export async function commitPlannedCardNumbers(
  rows: { insuredName: string; cardNoFinal: string | null; wasExplicit: boolean; organization?: string | null; memberId?: string | null }[],
  assignedBy: { uid?: string | null; name?: string | null },
  method: CardAssignmentMethod
): Promise<{ committed: Map<number, string>; failures: { rowIndex: number; reason: string }[] }> {
  const committed = new Map<number, string>();
  const failures: { rowIndex: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.cardNoFinal) continue; // already excluded at planning time (invalid/duplicate)
    try {
      const ctx: AssignmentContext = {
        organization: row.organization,
        memberId: row.memberId,
        insuredName: row.insuredName,
        assignedBy: assignedBy.uid,
        assignedByName: assignedBy.name,
        method,
      };
      // The final number (kept or generated) was already decided at planning time — commit
      // simply has to reserve that exact string for real; reserveExistingCardNumber's
      // "not-already-taken, then bump counters to at least this value" transaction is
      // correct for both cases.
      // eslint-disable-next-line no-await-in-loop -- sequential by design, see file header
      await reserveExistingCardNumber(row.cardNoFinal, ctx);
      committed.set(i, row.cardNoFinal);
    } catch (err: any) {
      failures.push({ rowIndex: i, reason: err?.message || 'Could not reserve this card number.' });
    }
  }

  return { committed, failures };
}

/**
 * Thin convenience wrapper over commitPlannedCardNumbers that takes the exact
 * CardNumberPreviewRow[] produced by planCardNumbersForImport / shown in the import preview
 * table — used by ExcelImportModal.tsx when the admin clicks "Confirm Import". Rows with
 * action 'None' (invalid/duplicate, already excluded from the preview's "final" number) are
 * skipped automatically.
 */
export async function commitCardNumberPreview(
  preview: CardNumberPreviewRow[],
  assignedBy: { uid?: string | null; name?: string | null },
  method: CardAssignmentMethod
): Promise<{ committed: Map<number, string>; failures: { rowIndex: number; reason: string }[] }> {
  return commitPlannedCardNumbers(
    preview.map((row) => ({
      insuredName: row.insuredName,
      cardNoFinal: row.action === 'None' ? null : row.cardNoFinal,
      wasExplicit: row.action === 'Kept',
      organization: row.organization,
    })),
    assignedBy,
    method
  );
}
