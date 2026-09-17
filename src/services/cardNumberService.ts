// === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System ===
// Système centralisé et transactionnel d'unicité des numéros de cartes d'assurés, sur
// demande explicite. Voir le commentaire en tête de src/types/index.ts pour les types
// partagés.
//
// === AMÉLIORATION AJOUTÉE (v3 — saisie/import manuel, 2026-09-09) : sur demande explicite
// ("dorénavant les numéros de carte seront intégrés manuellement soit au moment de
// l'enrôlement ou alors ils seront importés dans un template existant lors de
// l'importation au niveau de l'interface admin. le format des cartes porte une série de 11
// caractères"), toute génération automatique est retirée (génération séquentielle,
// compteur `counters/cardNumbers`, structure "AMID-YYMMDD-NNNNN", outils Admin de
// génération en lot / migration de format / validation de séquence). Le format devient une
// suite libre de 11 caractères alphanumériques (A-Z, 0-9), saisie manuellement à
// l'enrôlement ou déjà présente dans le fichier importé — jamais générée par
// l'application. Ce qui RESTE inchangé, car toujours nécessaire pour la saisie/l'import
// manuel : la contrainte d'unicité transactionnelle et le registre d'audit.
//
// Architecture (adaptée à l'existant — HealthPass n'a pas de Cloud Functions, uniquement le
// SDK client Firestore) :
//   - `cardNumberRegistry/{cardNumber}` : un document par numéro complet déjà attribué.
//     L'EXISTENCE du document EST la contrainte d'unicité (section 13) — deux transactions
//     concurrentes qui tentent de créer le même id de document ne peuvent jamais toutes les
//     deux réussir. Sert aussi de trace d'audit (section 17/29). Les règles Firestore
//     interdisent update/delete sur cette collection : un numéro consommé est immuable et
//     n'est jamais réattribué (section 15), même si l'assuré est ensuite supprimé.
import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  CardAssignmentMethod,
  CardNumberAssignment,
  CardNumberPreviewRow,
} from '../types';

// 11 caractères alphanumériques (majuscules + chiffres), sans préfixe ni tiret imposé — la
// personne saisit ou importe librement une suite de 11 caractères (retour utilisateur,
// 2026-09-09).
export const CARD_NUMBER_REGEX = /^[A-Z0-9]{11}$/;

const REGISTRY_COLLECTION = 'cardNumberRegistry';

/** Normalise (trim + majuscules) avant validation/comparaison — la casse ne doit jamais
 *  faire la différence entre deux numéros par ailleurs identiques. */
export function normalizeCardNumber(cardNo: string | undefined | null): string {
  return (cardNo || '').trim().toUpperCase();
}

export function isValidCardNumberFormat(cardNo: string | undefined | null): boolean {
  return CARD_NUMBER_REGEX.test(normalizeCardNumber(cardNo));
}

/** Read-only availability check (registry doc existence) — used by live-preview UI only,
 *  never as the sole guard before an actual write (the transactional functions below
 *  re-check inside the transaction, which is the real, race-safe guarantee). */
export async function isCardNumberTaken(cardNumber: string): Promise<boolean> {
  const snap = await getDoc(doc(db, REGISTRY_COLLECTION, normalizeCardNumber(cardNumber)));
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

function buildAssignmentDoc(cardNumber: string, ctx: AssignmentContext): CardNumberAssignment {
  return {
    id: cardNumber,
    cardNumber,
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
 * Reserves a manually-entered or imported card number (enrollment form, Admin member form,
 * Excel import commit) — validates the 11-character alphanumeric format, rejects it if
 * already assigned to someone else, and records the assignment. Race-safe: runs inside a
 * Firestore transaction that re-checks the registry, so two concurrent submissions of the
 * same number can never both succeed.
 */
export async function reserveExistingCardNumber(cardNumber: string, ctx: AssignmentContext): Promise<void> {
  const normalized = normalizeCardNumber(cardNumber);
  if (!CARD_NUMBER_REGEX.test(normalized)) {
    throw new Error(`Invalid card number format: "${cardNumber}". Expected 11 alphanumeric characters (A-Z, 0-9).`);
  }

  await runTransaction(db, async (tx) => {
    const registryRef = doc(db, REGISTRY_COLLECTION, normalized);
    const registrySnap = await tx.get(registryRef);
    if (registrySnap.exists()) {
      throw new Error('This card number is already assigned to another insured member.');
    }
    tx.set(registryRef, buildAssignmentDoc(normalized, ctx));
  });
}

/**
 * Dry-run planner for Excel import previews (section 10) — reads the uniqueness registry
 * (read-only, no writes) and computes what WOULD happen for each row, without consuming
 * anything (section 23: nothing is definitively consumed until the import is confirmed).
 * === AMÉLIORATION AJOUTÉE (v3) : plus aucune génération pour les lignes vides — chaque
 * ligne DOIT désormais fournir son propre numéro (déjà présent dans le template importé),
 * sinon elle est marquée invalide au lieu d'être complétée automatiquement.
 */
export async function planCardNumbersForImport(
  rows: { insuredName: string; cardNoRaw: string; organization?: string }[]
): Promise<{ preview: CardNumberPreviewRow[]; finalCardNumbers: (string | null)[] }> {
  const seenInFile = new Set<string>();
  const preview: CardNumberPreviewRow[] = [];
  const finalCardNumbers: (string | null)[] = [];

  for (let i = 0; i < rows.length; i++) {
    const { insuredName, cardNoRaw, organization } = rows[i];
    const trimmed = normalizeCardNumber(cardNoRaw);

    if (!trimmed) {
      preview.push({
        rowIndex: i,
        insuredName,
        organization,
        cardNoExcel: '—',
        cardNoFinal: '—',
        action: 'None',
        status: 'Invalid',
        reason: 'Card number required (auto-generation is disabled — fill in the template).',
      });
      finalCardNumbers.push(null);
      continue;
    }

    if (!CARD_NUMBER_REGEX.test(trimmed)) {
      preview.push({
        rowIndex: i,
        insuredName,
        organization,
        cardNoExcel: trimmed,
        cardNoFinal: '—',
        action: 'None',
        status: 'Invalid',
        reason: 'Invalid format (expected 11 alphanumeric characters, A-Z / 0-9)',
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
  }

  return { preview, finalCardNumbers };
}

/**
 * Confirm-time commit for an Excel import batch (section 14/23): actually reserves each
 * planned card number transactionally, one at a time, in row order. If the database state
 * drifted since the preview (e.g. another user's concurrent enrollment claimed a number in
 * between), the affected row fails with a clear reason instead of silently overwriting
 * anyone.
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

/** Même logique de dérivation que MembersView.tsx::deriveDependentCardNo, dupliquée
 *  volontairement ici (fichier service, ne doit pas dépendre d'une vue) pour reconstruire le
 *  numéro "virtuel" actuel d'un ayant droit qui n'a jamais eu de cardNo explicitement stocké. */
export function deriveDependentCardNoFallback(primaryCardNo: string, offset: number): string {
  if (!primaryCardNo) return `ACT-DEP-${offset}`;
  const match = primaryCardNo.match(/^(.*?)-(\d+)$/);
  if (match) {
    const prefix = match[1];
    const num = parseInt(match[2], 10);
    return `${prefix}-${num + offset}`;
  }
  return `${primaryCardNo}-${offset}`;
}
