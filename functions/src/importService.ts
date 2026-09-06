import * as admin from 'firebase-admin';
import { formatCardNumber, parseCardNumber, toIssueDateSegment } from './cardService';

export interface ImportRowInput {
  principalName: string;
  cardNoRaw?: string;
  organization: string;
  birthDate?: string;
  gender?: string;
  relationship?: string;
  phone?: string;
  email?: string;
}

export interface ImportReportItem {
  rowIndex: number;
  principalName: string;
  organization: string;
  cardNo: string;
  status: 'SUCCESS' | 'SKIPPED' | 'FAILED';
  reason?: string;
}

export interface ImportExecutionResult {
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  report: ImportReportItem[];
}

interface PlannedRow {
  rowIndex: number;
  name: string;
  org: string;
  row: ImportRowInput;
  finalCardNo: string;
}

// === AMÉLIORATION AJOUTÉE : correctif LOW (revue de code du 3e3bea9) ===
// L'incrément du compteur de cartes se faisait auparavant hors transaction (une lecture, puis
// à la toute fin un `set()` séparé après tous les lots d'écriture) : deux imports concurrents
// (ou un import concurrent à generateNextCardNumberServer) pouvaient lire le même compteur de
// départ et produire des numéros de carte en double — précisément le scénario que le brief
// demande explicitement d'empêcher ("empêcher les doublons en cas de... import concurrent").
// La réservation de la plage de numéros est désormais atomique (une seule transaction), et les
// numéros de carte SAISIS MANUELLEMENT dans le fichier sont maintenant aussi vérifiés contre
// le VRAI registre Firestore (pas seulement contre les doublons internes au fichier importé) —
// auparavant, un numéro déjà consommé lors d'un import précédent aurait été silencieusement
// écrasé, en violation du principe d'immuabilité du registre.
export async function processBulkMemberImportServer(
  db: admin.firestore.Firestore,
  rows: ImportRowInput[],
  performedBy: { uid: string; name: string; role: string }
): Promise<ImportExecutionResult> {
  const report: ImportReportItem[] = [];
  const seenCardNumbers = new Set<string>();
  const today = new Date();
  const countersRef = db.doc('counters/cardNumbers');

  const { plannedRows } = await db.runTransaction(async (tx) => {
    const countersSnap = await tx.get(countersRef);
    const counters = countersSnap.exists ? countersSnap.data() || {} : {};
    let currentAssured = (counters.lastAssuredNumber as number) || 0;

    const planned: PlannedRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = (row.principalName || '').trim();
      const org = (row.organization || '').trim();

      if (!name || !org) {
        report.push({
          rowIndex: i,
          principalName: name || 'Unknown',
          organization: org || 'Unknown',
          cardNo: '—',
          status: 'FAILED',
          reason: 'Missing required principal name or organization',
        });
        continue;
      }

      let finalCardNo = (row.cardNoRaw || '').trim();

      if (!finalCardNo) {
        // Generate next sequential number (reserved atomically within this transaction).
        currentAssured += 1;
        finalCardNo = formatCardNumber(today, currentAssured);
      } else {
        // Validate provided number
        const parsed = parseCardNumber(finalCardNo);
        if (!parsed) {
          report.push({
            rowIndex: i,
            principalName: name,
            organization: org,
            cardNo: finalCardNo,
            status: 'FAILED',
            reason: 'Invalid card number format (expected AMID-YYMMDD-NNNNN)',
          });
          continue;
        }
        if (seenCardNumbers.has(finalCardNo)) {
          report.push({
            rowIndex: i,
            principalName: name,
            organization: org,
            cardNo: finalCardNo,
            status: 'FAILED',
            reason: 'Duplicate card number within import dataset',
          });
          continue;
        }
        // Verify against the REAL registry — a provided number could already be consumed by
        // an earlier import or enrollment, not just duplicated within this file.
        const existingSnap = await tx.get(db.doc(`cardNumberRegistry/${finalCardNo}`));
        if (existingSnap.exists) {
          report.push({
            rowIndex: i,
            principalName: name,
            organization: org,
            cardNo: finalCardNo,
            status: 'FAILED',
            reason: 'Card number already assigned to another insured member',
          });
          continue;
        }

        // Bump sequential counter if historical number exceeds running sequence
        if (parsed.assuredNumber > currentAssured) {
          currentAssured = parsed.assuredNumber;
        }
      }

      seenCardNumbers.add(finalCardNo);
      planned.push({ rowIndex: i, name, org, row, finalCardNo });
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

    return { plannedRows: planned };
  });

  // === AMÉLIORATION AJOUTÉE : sécurité/robustesse (Revue complète 2026-09-06, finding B — HAUTE) ===
  // Problème : l'ancien ID `MEM-${Date.now().toString().slice(-6)}-${Math.random()...}` ne
  // couvre qu'environ 1,68 million de combinaisons (6 chiffres d'horodatage x 4 caractères
  // aléatoires en base36). Avec jusqu'à 5000 lignes par import (voir la limite validée dans
  // index.ts), le paradoxe des anniversaires donne plusieurs collisions attendues par import
  // maximal — un `batch.set` sur un ID déjà pris écrase silencieusement le membre existant, sans
  // aucune erreur (Firestore `set()` sans options remplace le document entier). Correctif :
  // `db.collection('members').doc().id`, l'ID auto-généré Firestore (aléatoire cryptographique
  // sur ~1.3×10^36 combinaisons), utilisé partout ailleurs dans le code pour ce même besoin
  // (voir par ex. l'ID de facture généré dans claimsService.ts). Aucune régression : le format
  // de l'ID de membre n'est contractuel nulle part dans le code — seul `cardNo` (le numéro de
  // carte affiché à l'utilisateur, inchangé par ce correctif) a un format garanti.
  const membersToCreate = plannedRows.map((p) => ({
    id: db.collection('members').doc().id,
    cardNo: p.finalCardNo,
    principalName: p.name,
    organization: p.org,
    status: 'Active',
    relationship: p.row.relationship || 'Primary',
    birthDate: p.row.birthDate || '1990-01-01',
    gender: p.row.gender || 'M',
    phone: p.row.phone || '',
    email: p.row.email || '',
    hasPhoto: false,
    hasBiometrics: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    importedBy: performedBy.uid,
  }));

  const registryDocsToCreate = plannedRows.map((p) => ({
    id: p.finalCardNo,
    cardNumber: p.finalCardNo,
    issueDate: toIssueDateSegment(today),
    assuredNumber: p.finalCardNo.slice(-5),
    organization: p.org,
    insuredName: p.name,
    assignedBy: performedBy.uid,
    assignedByName: performedBy.name,
    assignedAt: new Date().toISOString(),
    method: 'EXCEL_IMPORT',
  }));

  for (const p of plannedRows) {
    report.push({
      rowIndex: p.rowIndex,
      principalName: p.name,
      organization: p.org,
      cardNo: p.finalCardNo,
      status: 'SUCCESS',
    });
  }
  report.sort((a, b) => a.rowIndex - b.rowIndex);

  // Commit writes in chunks (Firestore 500 limit) — the counter and every card number are
  // already atomically reserved above, so this part can safely run outside a transaction.
  const CHUNK_SIZE = 400;
  for (let c = 0; c < membersToCreate.length; c += CHUNK_SIZE) {
    const batch = db.batch();
    const membersChunk = membersToCreate.slice(c, c + CHUNK_SIZE);
    const registryChunk = registryDocsToCreate.slice(c, c + CHUNK_SIZE);

    membersChunk.forEach((m) => {
      batch.set(db.doc(`members/${m.id}`), m);
    });
    registryChunk.forEach((r) => {
      batch.set(db.doc(`cardNumberRegistry/${r.id}`), r);
    });

    await batch.commit();
  }

  return {
    totalProcessed: rows.length,
    successCount: membersToCreate.length,
    failureCount: rows.length - membersToCreate.length,
    skippedCount: 0,
    report,
  };
}
