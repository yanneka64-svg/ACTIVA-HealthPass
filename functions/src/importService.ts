import * as admin from 'firebase-admin';
import { formatCardNumber, parseCardNumber, toIssueDateSegment, CARD_NUMBER_REGEX } from './cardService';

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

export async function processBulkMemberImportServer(
  db: admin.firestore.Firestore,
  rows: ImportRowInput[],
  performedBy: { uid: string; name: string; role: string }
): Promise<ImportExecutionResult> {
  const report: ImportReportItem[] = [];
  const seenCardNumbers = new Set<string>();

  // 1. Fetch current counters
  const countersRef = db.doc('counters/cardNumbers');
  const countersSnap = await countersRef.get();
  const counters = countersSnap.exists ? countersSnap.data() || {} : {};
  let lastAssuredNumber = (counters.lastAssuredNumber as number) || 0;

  const today = new Date();
  const membersToCreate: any[] = [];
  const registryDocsToCreate: any[] = [];

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
      // Generate next sequential number
      lastAssuredNumber += 1;
      finalCardNo = formatCardNumber(today, lastAssuredNumber);
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

      // Bump sequential counter if historical number exceeds running sequence
      if (parsed.assuredNumber > lastAssuredNumber) {
        lastAssuredNumber = parsed.assuredNumber;
      }
    }

    seenCardNumbers.add(finalCardNo);

    // Prepare member document
    const memberDocId = `MEM-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 6)}`;
    membersToCreate.push({
      id: memberDocId,
      cardNo: finalCardNo,
      principalName: name,
      organization: org,
      status: 'Active',
      relationship: row.relationship || 'Primary',
      birthDate: row.birthDate || '1990-01-01',
      gender: row.gender || 'M',
      phone: row.phone || '',
      email: row.email || '',
      hasPhoto: false,
      hasBiometrics: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      importedBy: performedBy.uid,
    });

    registryDocsToCreate.push({
      id: finalCardNo,
      cardNumber: finalCardNo,
      issueDate: toIssueDateSegment(today),
      assuredNumber: finalCardNo.slice(-5),
      organization: org,
      insuredName: name,
      assignedBy: performedBy.uid,
      assignedByName: performedBy.name,
      assignedAt: new Date().toISOString(),
      method: 'EXCEL_IMPORT',
    });

    report.push({
      rowIndex: i,
      principalName: name,
      organization: org,
      cardNo: finalCardNo,
      status: 'SUCCESS',
    });
  }

  // Commit writes in chunks (Firestore 500 limit)
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

  // Update counter
  await countersRef.set(
    {
      lastAssuredNumber,
      formatVersion: 'v2',
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return {
    totalProcessed: rows.length,
    successCount: membersToCreate.length,
    failureCount: rows.length - membersToCreate.length,
    skippedCount: 0,
    report,
  };
}
