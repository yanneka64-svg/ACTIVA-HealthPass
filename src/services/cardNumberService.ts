// === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System ===
// Système centralisé, sécurisé et transactionnel de génération des numéros uniques de
// cartes d'assurés, sur demande explicite. Voir le commentaire en tête de src/types/index.ts
// pour les types partagés.
//
// === AMÉLIORATION AJOUTÉE (v2) : nouvelle structure AMID-YYMMDD-NNNNN — sur demande
// explicite, remplace l'ancienne structure AMID-XXXXX-XXXX (deux compteurs indépendants
// "printed"/"insured"). Le premier segment (6 chiffres) est désormais la DATE D'ÉMISSION de
// la carte (année/mois/jour) — plus un compteur — et le second segment (5 chiffres,
// "assuredNumber") reste une séquence globale unique, partagée par les assurés principaux ET
// leurs ayants droit, jamais réutilisée. migrateAllCardsToNewCardNumberFormat() effectue la
// migration ponctuelle de toutes les cartes déjà existantes vers cette nouvelle structure
// (voir plus bas) ; migrateCardNumberCounters() reste le filet de sécurité habituel qui
// relève le compteur au maximum réellement présent en base.
//
// Architecture (adaptée à l'existant — HealthPass n'a pas de Cloud Functions, uniquement le
// SDK client Firestore) :
//   - `counters/cardNumbers`  : document unique, l'unique séquence restante (assuredNumber).
//     Mis à jour UNIQUEMENT via une runTransaction (jamais setDoc direct hors transaction),
//     pour rester correct sous attribution simultanée (section 14) — Firestore relit et
//     réessaie automatiquement une transaction en cas de conflit d'écriture concurrent.
//   - `cardNumberRegistry/{cardNumber}` : un document par numéro complet déjà attribué.
//     L'EXISTENCE du document EST la contrainte d'unicité (section 13) — deux transactions
//     concurrentes qui tentent de créer le même id de document ne peuvent jamais toutes les
//     deux réussir. Sert aussi de trace d'audit (section 17/29). Les règles Firestore
//     interdisent update/delete sur cette collection : un numéro consommé est immuable et
//     n'est jamais réattribué (section 15), même si l'assuré est ensuite supprimé.
import { collection, doc, getDoc, getDocs, query, runTransaction, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  CardAssignmentMethod,
  CardNumberAssignment,
  CardNumberCounters,
  CardNumberPreviewRow,
  Member,
  Claim,
  InvoiceItem,
  MedicalForm,
  Enrollment,
} from '../types';

export const CARD_PREFIX = 'AMID';
// AMID-YYMMDD-NNNNN : 6 chiffres de date (année, mois, jour) puis 5 chiffres de numéro
// d'assuré. Validation du calendrier (mois 01-12, jour 01-31) en plus du format brut, pour
// rejeter par exemple "AMID-261399-00001" (mois 13 inexistant).
export const CARD_NUMBER_REGEX = /^AMID-(\d{2})(\d{2})(\d{2})-(\d{5})$/;

const COUNTERS_REF = doc(db, 'counters', 'cardNumbers');
const REGISTRY_COLLECTION = 'cardNumberRegistry';
const MIGRATION_LOG_COLLECTION = 'cardNumberMigrationLog';

function pad(n: number, width: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(width, '0');
}

/** "YYMMDD" (6 chiffres) à partir d'une Date ou d'une chaîne "YYYY-MM-DD"/ISO. Retombe sur la
 *  date du jour si la valeur fournie est absente ou invalide — ne bloque jamais l'émission. */
function toIssueDateSegment(date: Date | string | undefined | null): string {
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

/** Builds the official "AMID-YYMMDD-NNNNN" string. `issueDate` accepts a Date, an
 *  "YYYY-MM-DD"/ISO string, or nothing (defaults to today). */
export function formatCardNumber(issueDate: Date | string | undefined | null, assuredNumber: number): string {
  return `${CARD_PREFIX}-${toIssueDateSegment(issueDate)}-${pad(assuredNumber, 5)}`;
}

/**
 * Parses a card number string against the strict official format. Returns null (never
 * throws) for anything that doesn't match exactly — missing prefix, wrong digit counts,
 * missing dashes, an impossible calendar date, etc. (section 12).
 */
export function parseCardNumber(cardNo: string | undefined | null): { issueDate: string; assuredNumber: number } | null {
  if (!cardNo) return null;
  const match = CARD_NUMBER_REGEX.exec(cardNo.trim());
  if (!match) return null;
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { issueDate: `${match[1]}${match[2]}${match[3]}`, assuredNumber: parseInt(match[4], 10) };
}

export function isValidCardNumberFormat(cardNo: string | undefined | null): boolean {
  return parseCardNumber(cardNo) !== null;
}

async function readCounters(): Promise<CardNumberCounters> {
  const snap = await getDoc(COUNTERS_REF);
  return snap.exists() ? (snap.data() as CardNumberCounters) : { lastAssuredNumber: 0 };
}

/** Public read-only accessor for the current counters — used by the Admin "Card Number
 *  Management" panel and by post-import summaries (section 20 / 22). */
export async function getCurrentCounters(): Promise<CardNumberCounters> {
  return readCounters();
}

/** Convenience: the card number that WOULD be generated next (today's date), without
 *  reserving it. Purely informational (a concurrent enrollment could still claim it first) —
 *  never treat this as a reservation. */
export async function previewNextCardNumber(): Promise<string> {
  const counters = await readCounters();
  return formatCardNumber(new Date(), (counters.lastAssuredNumber || 0) + 1);
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

function buildAssignmentDoc(cardNumber: string, issueDateSegment: string, assuredNumber: number, ctx: AssignmentContext): CardNumberAssignment {
  return {
    id: cardNumber,
    cardNumber,
    issueDate: issueDateSegment,
    assuredNumber: pad(assuredNumber, 5),
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
 * atomically generates the next AMID-YYMMDD-NNNNN (today's date + the next assured number),
 * reserves it in the uniqueness registry, and advances the counter. The date segment is
 * always today's date at the moment of issuance — never manually entered (section 5).
 */
export async function generateNextCardNumber(ctx: AssignmentContext): Promise<string> {
  return runTransaction(db, async (tx) => {
    const countersSnap = await tx.get(COUNTERS_REF);
    const counters: CardNumberCounters = countersSnap.exists()
      ? (countersSnap.data() as CardNumberCounters)
      : { lastAssuredNumber: 0 };

    const nextAssured = (counters.lastAssuredNumber || 0) + 1;
    const cardNumber = formatCardNumber(new Date(), nextAssured);

    const registryRef = doc(db, REGISTRY_COLLECTION, cardNumber);
    const registrySnap = await tx.get(registryRef);
    if (registrySnap.exists()) {
      // Extremely unlikely (the counter is monotonic) but defensive — never silently
      // overwrite.
      throw new Error('This card number is already assigned to another insured member.');
    }

    tx.set(registryRef, buildAssignmentDoc(cardNumber, toIssueDateSegment(new Date()), nextAssured, ctx));
    tx.set(
      COUNTERS_REF,
      { lastAssuredNumber: nextAssured, formatVersion: 'v2', updatedAt: new Date().toISOString() } as CardNumberCounters,
      { merge: true }
    );

    return cardNumber;
  });
}

/**
 * Atomically generates N consecutive card numbers in a single transaction,
 * guaranteeing no gaps and recording each number in the uniqueness registry.
 */
export async function batchGenerateCardNumbers(
  count: number,
  ctxList: AssignmentContext[] = []
): Promise<string[]> {
  if (count <= 0) return [];
  return runTransaction(db, async (tx) => {
    const countersSnap = await tx.get(COUNTERS_REF);
    const counters: CardNumberCounters = countersSnap.exists()
      ? (countersSnap.data() as CardNumberCounters)
      : { lastAssuredNumber: 0 };

    let currentAssured = counters.lastAssuredNumber || 0;
    const generated: string[] = [];
    const today = new Date();

    for (let i = 0; i < count; i++) {
      currentAssured += 1;
      const cardNumber = formatCardNumber(today, currentAssured);
      const registryRef = doc(db, REGISTRY_COLLECTION, cardNumber);
      const registrySnap = await tx.get(registryRef);
      if (registrySnap.exists()) {
        throw new Error(`Integrity constraint violation: card number ${cardNumber} already assigned.`);
      }

      const ctx = ctxList[i] || { method: 'MANUAL' as CardAssignmentMethod };
      tx.set(registryRef, buildAssignmentDoc(cardNumber, toIssueDateSegment(today), currentAssured, ctx));
      generated.push(cardNumber);
    }

    tx.set(
      COUNTERS_REF,
      {
        lastAssuredNumber: currentAssured,
        formatVersion: 'v2',
        updatedAt: new Date().toISOString(),
      } as CardNumberCounters,
      { merge: true }
    );

    return generated;
  });
}

export interface CardContinuityReport {
  totalEvaluated: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  minSequenceNumber: number;
  maxSequenceNumber: number;
  detectedGaps: { after: number; missingCount: number }[];
  invalidSamples: string[];
  duplicateSamples: string[];
  isStrictlyContinuous: boolean;
  generatedAt: string;
}

/**
 * Continuity & audit inspection for card numbers across members and dependents.
 * Verifies sequence integrity, gap analysis, and detects duplicates or format anomalies.
 */
export async function getCardContinuityReport(members: Member[]): Promise<CardContinuityReport> {
  const allCardNumbers: string[] = [];
  members.forEach((m) => {
    if (m.cardNo) allCardNumbers.push(m.cardNo);
    (m.dependents || []).forEach((d) => {
      if (d.cardNo) allCardNumbers.push(d.cardNo);
    });
  });

  try {
    const res = await fetch('/api/cards/continuity-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardNumbers: allCardNumbers }),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        ...data,
        generatedAt: new Date().toISOString(),
      };
    }
  } catch {
    // Local fallback
  }

  const validNumbers: { original: string; date: string; num: number }[] = [];
  const invalidNumbers: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  for (const c of allCardNumbers) {
    const trimmed = c.trim();
    if (seen.has(trimmed)) {
      duplicates.push(trimmed);
      continue;
    }
    seen.add(trimmed);

    const parsed = parseCardNumber(trimmed);
    if (!parsed) {
      invalidNumbers.push(trimmed);
      continue;
    }
    validNumbers.push({
      original: trimmed,
      date: parsed.issueDate,
      num: parsed.assuredNumber,
    });
  }

  validNumbers.sort((a, b) => a.num - b.num);

  const gaps: { after: number; missingCount: number }[] = [];
  for (let i = 0; i < validNumbers.length - 1; i++) {
    const diff = validNumbers[i + 1].num - validNumbers[i].num;
    if (diff > 1) {
      gaps.push({ after: validNumbers[i].num, missingCount: diff - 1 });
    }
  }

  return {
    totalEvaluated: allCardNumbers.length,
    validCount: validNumbers.length,
    invalidCount: invalidNumbers.length,
    duplicateCount: duplicates.length,
    minSequenceNumber: validNumbers.length > 0 ? validNumbers[0].num : 0,
    maxSequenceNumber: validNumbers.length > 0 ? validNumbers[validNumbers.length - 1].num : 0,
    detectedGaps: gaps,
    invalidSamples: invalidNumbers.slice(0, 10),
    duplicateSamples: duplicates.slice(0, 10),
    isStrictlyContinuous: gaps.length === 0,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * CASE where a card number is already provided (existing manual number, Excel row that
 * already has a Card No., admin retyping a historical number) — validates the format,
 * rejects it if already assigned to someone else, reserves it, and raises the counter to at
 * least this number (never lowers it — historical/explicit numbers always take priority over
 * the running counter, section 32).
 */
export async function reserveExistingCardNumber(cardNumber: string, ctx: AssignmentContext): Promise<void> {
  const parsed = parseCardNumber(cardNumber);
  if (!parsed) {
    throw new Error(`Invalid card number format: "${cardNumber}". Expected AMID-YYMMDD-NNNNN.`);
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
      : { lastAssuredNumber: 0 };

    tx.set(registryRef, buildAssignmentDoc(cardNumber, parsed.issueDate, parsed.assuredNumber, ctx));
    tx.set(
      COUNTERS_REF,
      {
        lastAssuredNumber: Math.max(counters.lastAssuredNumber || 0, parsed.assuredNumber),
        formatVersion: 'v2',
        updatedAt: new Date().toISOString(),
      } as CardNumberCounters,
      { merge: true }
    );
  });
}

/**
 * Migration / validation pass (sections 3, 18): scans EVERY member already in the database
 * (never just the last-created one), determines the true historical maximum assured number
 * (new-format numbers only — legacy/malformed numbers are left exactly as-is, never touched),
 * backfills the uniqueness registry for any new-format number not yet indexed, and raises the
 * persisted counter to at least that maximum — never lowers it. Idempotent and safe to re-run
 * at any time (the Admin "Validate Card Number Sequence" button does exactly that).
 */
export async function migrateCardNumberCounters(members: Member[]): Promise<CardNumberCounters> {
  let maxAssured = 0;
  const validEntries: { cardNo: string; issueDate: string; assuredNumber: number; member: Member }[] = [];

  for (const m of members) {
    const parsed = parseCardNumber(m.cardNo);
    if (!parsed) continue;
    validEntries.push({ cardNo: m.cardNo, issueDate: parsed.issueDate, assuredNumber: parsed.assuredNumber, member: m });
    if (parsed.assuredNumber > maxAssured) maxAssured = parsed.assuredNumber;
  }

  for (const entry of validEntries) {
    const regRef = doc(db, REGISTRY_COLLECTION, entry.cardNo);
    const regSnap = await getDoc(regRef);
    if (!regSnap.exists()) {
      await setDoc(
        regRef,
        buildAssignmentDoc(entry.cardNo, entry.issueDate, entry.assuredNumber, {
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
      : { lastAssuredNumber: 0 };
    const next: CardNumberCounters = {
      lastAssuredNumber: Math.max(current.lastAssuredNumber || 0, maxAssured),
      formatVersion: 'v2',
      updatedAt: new Date().toISOString(),
    };
    tx.set(COUNTERS_REF, next, { merge: true });
    return next;
  });
}

/**
 * Dry-run planner for Excel import previews (section 10) — reads the current counter and the
 * uniqueness registry (read-only, no writes) and computes what WOULD happen for each row,
 * without consuming anything (section 23: nothing is definitively consumed until the import
 * is confirmed). Blank rows are assigned today's date + the next sequential assured number, in
 * row order; explicit numbers are validated for format and checked for duplicates (in-file and
 * in the database). The running counter only ever advances — gaps left by explicit historical
 * numbers are never auto-filled (section 19), it always continues strictly after the known
 * maximum (section 3).
 */
export async function planCardNumbersForImport(
  rows: { insuredName: string; cardNoRaw: string; organization?: string }[]
): Promise<{ preview: CardNumberPreviewRow[]; finalCardNumbers: (string | null)[] }> {
  const counters = await readCounters();
  let simAssured = counters.lastAssuredNumber || 0;
  const today = new Date();

  const seenInFile = new Set<string>();
  const preview: CardNumberPreviewRow[] = [];
  const finalCardNumbers: (string | null)[] = [];

  for (let i = 0; i < rows.length; i++) {
    const { insuredName, cardNoRaw, organization } = rows[i];
    const trimmed = (cardNoRaw || '').trim();

    if (!trimmed) {
      // CASE 2 (section 8): blank -> generate the next number in sequence.
      simAssured += 1;
      const generated = formatCardNumber(today, simAssured);
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
        reason: 'Invalid format (expected AMID-YYMMDD-NNNNN)',
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
    simAssured = Math.max(simAssured, parsed.assuredNumber);
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
      // "not-already-taken, then bump counter to at least this value" transaction is correct
      // for both cases.
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

// === AMÉLIORATION AJOUTÉE : migration ponctuelle vers la structure AMID-YYMMDD-NNNNN ===
// Renumérote TOUTES les cartes déjà existantes (assurés principaux ET ayants droit) — sur
// demande explicite, avec les choix suivants confirmés par l'utilisateur :
//   1. Renumérotation complète : chaque assuré (principal ou ayant droit) reçoit un tout
//      nouveau numéro d'assuré (5 chiffres), attribué séquentiellement dans l'ordre actuel
//      (date de création de sa fiche assuré, la plus ancienne en premier ; au sein d'une
//      même fiche, le principal puis ses ayants droit dans leur ordre d'affichage actuel).
//   2. Date d'émission : reprend la date de création de la fiche de l'assuré principal
//      concerné (les ayants droit n'ont pas leur propre date de création dans le modèle de
//      données existant — celle de leur assuré principal est utilisée pour eux aussi).
//   3. Répercussion partout : toute donnée référençant un ancien numéro (sinistres, factures,
//      fiches médicales, inscriptions) est mise à jour vers le nouveau numéro correspondant.
//
// Important — limite honnête de l'architecture actuelle (pas de Cloud Functions, uniquement
// le SDK client) : Firestore ne permet pas une transaction atomique unique portant sur des
// milliers de documents répartis sur plusieurs collections. Cette migration s'exécute donc en
// plusieurs lots successifs (writeBatch, ≤450 opérations chacun) plutôt qu'en une seule
// opération atomique globale. Pour rester sûre malgré cela :
//   - Le mapping ancien->nouveau numéro est d'abord écrit intégralement dans
//     `cardNumberMigrationLog/{ancienNuméro}` AVANT toute autre modification — si le
//     processus est interrompu, ce journal permet de savoir exactement quoi corriger.
//   - L'opération est idempotente : toute fiche dont le `cardNo` correspond DÉJÀ au nouveau
//     format est ignorée (jamais re-migrée), ce qui rend un nouvel essai après interruption
//     sûr à relancer tel quel.
export interface CardFormatMigrationSummary {
  totalUnits: number;
  migratedMembers: number;
  migratedDependents: number;
  claimsUpdated: number;
  invoicesUpdated: number;
  medicalFormsUpdated: number;
  enrollmentsUpdated: number;
  alreadyMigrated: number;
}

interface MigrationUnit {
  oldCardNo: string;
  newCardNo: string;
  issueDateBasis: string; // createdAt du membre parent, pour le segment YYMMDD
  organization: string;
  memberId: string;
  insuredName: string;
}

async function writeInBatches(ops: { type: 'set' | 'delete'; ref: ReturnType<typeof doc>; data?: any }[]) {
  const CHUNK = 450;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = writeBatch(db);
    ops.slice(i, i + CHUNK).forEach((op) => {
      if (op.type === 'delete') batch.delete(op.ref);
      else batch.set(op.ref, op.data, { merge: true });
    });
    // eslint-disable-next-line no-await-in-loop -- chunks must apply in order
    await batch.commit();
  }
}

export async function migrateAllCardsToNewCardNumberFormat(
  members: Member[],
  claims: Claim[],
  invoices: InvoiceItem[],
  medicalForms: MedicalForm[],
  enrollments: Enrollment[],
  assignedBy: { uid?: string | null; name?: string | null }
): Promise<CardFormatMigrationSummary> {
  // 1. Determine "current order": oldest member first (createdAt ascending), tie-broken by
  // the existing card number string for a fully deterministic order.
  const orderedMembers = [...members].sort((a, b) => {
    const da = a.createdAt || '';
    const db_ = b.createdAt || '';
    if (da !== db_) return da.localeCompare(db_);
    return (a.cardNo || '').localeCompare(b.cardNo || '');
  });

  let alreadyMigrated = 0;
  const units: MigrationUnit[] = [];
  let nextAssured = 0;

  // Bootstrap the counter from whatever new-format numbers may already exist (safe re-run).
  const currentCounters = await readCounters();
  nextAssured = currentCounters.lastAssuredNumber || 0;

  for (const m of orderedMembers) {
    const alreadyNewFormat = isValidCardNumberFormat(m.cardNo);
    if (alreadyNewFormat) {
      alreadyMigrated++;
    } else {
      nextAssured += 1;
      const newCardNo = formatCardNumber(m.createdAt, nextAssured);
      units.push({
        oldCardNo: m.cardNo,
        newCardNo,
        issueDateBasis: m.createdAt,
        organization: m.organization,
        memberId: m.id,
        insuredName: m.principalName,
      });
    }

    // Dependents — reconstruct their current (possibly implicit/derived) card number exactly
    // as the rest of the app displays it today, then give each their own new-format number.
    (m.dependents || []).forEach((dep, idx) => {
      const oldDepCardNo = dep.cardNo || deriveDependentCardNoFallback(m.cardNo, idx + 1);
      if (isValidCardNumberFormat(oldDepCardNo)) {
        alreadyMigrated++;
        return;
      }
      nextAssured += 1;
      const newDepCardNo = formatCardNumber(m.createdAt, nextAssured);
      units.push({
        oldCardNo: oldDepCardNo,
        newCardNo: newDepCardNo,
        issueDateBasis: m.createdAt,
        organization: m.organization,
        memberId: m.id,
        insuredName: dep.fullName,
      });
    });
  }

  if (units.length === 0) {
    return {
      totalUnits: 0,
      migratedMembers: 0,
      migratedDependents: 0,
      claimsUpdated: 0,
      invoicesUpdated: 0,
      medicalFormsUpdated: 0,
      enrollmentsUpdated: 0,
      alreadyMigrated,
    };
  }

  const oldToNew = new Map(units.map((u) => [u.oldCardNo, u.newCardNo]));

  // 2. Durable log FIRST — survives an interruption partway through.
  await writeInBatches(
    units.map((u) => ({
      type: 'set' as const,
      ref: doc(db, MIGRATION_LOG_COLLECTION, encodeURIComponent(u.oldCardNo)),
      data: { oldCardNo: u.oldCardNo, newCardNo: u.newCardNo, migratedAt: new Date().toISOString() },
    }))
  );

  // 3. Members — principal cardNo + each dependent's cardNo.
  let migratedMembers = 0;
  let migratedDependents = 0;
  const memberOps: { type: 'set'; ref: ReturnType<typeof doc>; data: any }[] = [];
  for (const m of orderedMembers) {
    const newPrincipal = oldToNew.get(m.cardNo);
    let anyDependentChanged = false;
    const newDependents = (m.dependents || []).map((dep, idx) => {
      const oldDepCardNo = dep.cardNo || deriveDependentCardNoFallback(m.cardNo, idx + 1);
      const mapped = oldToNew.get(oldDepCardNo);
      if (mapped) {
        migratedDependents++;
        anyDependentChanged = true;
        return { ...dep, cardNo: mapped };
      }
      return dep;
    });

    if (newPrincipal || anyDependentChanged) {
      if (newPrincipal) migratedMembers++;
      memberOps.push({
        type: 'set',
        ref: doc(db, 'members', m.id),
        data: { ...(newPrincipal ? { cardNo: newPrincipal } : {}), dependents: newDependents },
      });
    }
  }
  await writeInBatches(memberOps);

  // 4. Cascade to every collection that stores a card number as a plain string reference.
  const cascade = async (
    coll: string,
    items: any[],
    fields: string[]
  ): Promise<number> => {
    const ops: { type: 'set'; ref: ReturnType<typeof doc>; data: any }[] = [];
    for (const item of items) {
      const patch: any = {};
      let touched = false;
      for (const field of fields) {
        const mapped = oldToNew.get(item[field]);
        if (mapped) {
          patch[field] = mapped;
          touched = true;
        }
      }
      if (touched) ops.push({ type: 'set', ref: doc(db, coll, item.id), data: patch });
    }
    await writeInBatches(ops);
    return ops.length;
  };

  const claimsUpdated = await cascade('claims', claims, ['memberCardNo']);
  const invoicesUpdated = await cascade('invoices', invoices, ['cardNo']);
  const medicalFormsUpdated = await cascade('medicalForms', medicalForms, ['memberCardNo']);
  const enrollmentsUpdated = await cascade('enrollments', enrollments, ['cardNo', 'mainInsuredCardNo']);

  // 5. Rebuild the uniqueness registry: old-format entries are retired (deleted — the new
  // format can never collide with them anyway, different digit-group widths, but a clean
  // slate avoids confusion), new-format entries are created for every migrated unit.
  const oldRegistrySnap = await getDocs(collection(db, REGISTRY_COLLECTION));
  await writeInBatches(oldRegistrySnap.docs.map((d) => ({ type: 'delete' as const, ref: d.ref })));

  await writeInBatches(
    units.map((u) => {
      const parsed = parseCardNumber(u.newCardNo)!;
      return {
        type: 'set' as const,
        ref: doc(db, REGISTRY_COLLECTION, u.newCardNo),
        data: buildAssignmentDoc(u.newCardNo, parsed.issueDate, parsed.assuredNumber, {
          organization: u.organization,
          memberId: u.memberId,
          insuredName: u.insuredName,
          assignedBy: assignedBy.uid,
          assignedByName: assignedBy.name,
          method: 'MIGRATION',
        }),
      };
    })
  );

  // 6. Counter — the highest assured number now in use.
  await runTransaction(db, async (tx) => {
    tx.set(
      COUNTERS_REF,
      { lastAssuredNumber: nextAssured, formatVersion: 'v2', updatedAt: new Date().toISOString() } as CardNumberCounters,
      { merge: true }
    );
  });

  return {
    totalUnits: units.length,
    migratedMembers,
    migratedDependents,
    claimsUpdated,
    invoicesUpdated,
    medicalFormsUpdated,
    enrollmentsUpdated,
    alreadyMigrated,
  };
}

/** Même logique de dérivation que MembersView.tsx::deriveDependentCardNo, dupliquée
 *  volontairement ici (fichier service, ne doit pas dépendre d'une vue) pour reconstruire le
 *  numéro "virtuel" actuel d'un ayant droit qui n'a jamais eu de cardNo explicitement stocké. */
function deriveDependentCardNoFallback(primaryCardNo: string, offset: number): string {
  if (!primaryCardNo) return `ACT-DEP-${offset}`;
  const match = primaryCardNo.match(/^(.*?)-(\d+)$/);
  if (match) {
    const prefix = match[1];
    const num = parseInt(match[2], 10);
    return `${prefix}-${num + offset}`;
  }
  return `${primaryCardNo}-${offset}`;
}
