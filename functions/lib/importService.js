"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processBulkMemberImportServer = processBulkMemberImportServer;
const cardService_1 = require("./cardService");
async function processBulkMemberImportServer(db, rows, performedBy) {
    const report = [];
    const seenInFile = new Set();
    // 1. Fetch current counters atomically
    const countersRef = db.doc('counters/cardNumbers');
    const countersSnap = await countersRef.get();
    const counters = countersSnap.exists ? countersSnap.data() || {} : {};
    let lastAssuredNumber = counters.lastAssuredNumber || 0;
    const today = new Date();
    // 2. Pre-gather and query provided card numbers against Firestore
    const rawProvidedCards = rows
        .map((r) => (r.cardNoRaw || '').trim())
        .filter((c) => Boolean(c));
    const existingInFirestore = new Set();
    // Query in chunks of 30 for Firestore getAll
    for (let i = 0; i < rawProvidedCards.length; i += 30) {
        const chunk = rawProvidedCards.slice(i, i + 30);
        const docRefs = chunk.map((c) => db.doc(`cardNumberRegistry/${c}`));
        if (docRefs.length > 0) {
            const snaps = await db.getAll(...docRefs);
            snaps.forEach((snap) => {
                if (snap.exists) {
                    existingInFirestore.add(snap.id);
                }
            });
        }
    }
    const validItemsToInsert = [];
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
        let itemAssuredNumber;
        if (!finalCardNo) {
            // Case B: Generate next sequential number
            lastAssuredNumber += 1;
            finalCardNo = (0, cardService_1.formatCardNumber)(today, lastAssuredNumber);
            itemAssuredNumber = lastAssuredNumber;
        }
        else {
            // Case A: Validate provided number
            const parsed = (0, cardService_1.parseCardNumber)(finalCardNo);
            if (!parsed) {
                report.push({
                    rowIndex: i,
                    principalName: name,
                    organization: org,
                    cardNo: finalCardNo,
                    status: 'FAILED',
                    reason: 'Invalid card number format (expected AMID-YYMMDD-NNNNN with valid date)',
                });
                continue;
            }
            // Check duplicate within Excel file
            if (seenInFile.has(finalCardNo)) {
                report.push({
                    rowIndex: i,
                    principalName: name,
                    organization: org,
                    cardNo: finalCardNo,
                    status: 'SKIPPED',
                    reason: 'Duplicate card number within Excel import dataset',
                });
                continue;
            }
            // Check duplicate in Firestore
            if (existingInFirestore.has(finalCardNo)) {
                report.push({
                    rowIndex: i,
                    principalName: name,
                    organization: org,
                    cardNo: finalCardNo,
                    status: 'SKIPPED',
                    reason: `Card number ${finalCardNo} is already assigned in Firestore registry`,
                });
                continue;
            }
            itemAssuredNumber = parsed.assuredNumber;
            // Monotonically bump global counter if historical number exceeds running sequence
            if (parsed.assuredNumber > lastAssuredNumber) {
                lastAssuredNumber = parsed.assuredNumber;
            }
        }
        seenInFile.add(finalCardNo);
        // Prepare member document
        const memberDocId = `MEM-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 6)}`;
        const memberDoc = {
            id: memberDocId,
            cardNo: finalCardNo,
            principalName: name,
            organization: org,
            status: 'Actif',
            relationship: row.relationship || 'Principal',
            birthDate: row.birthDate || '1990-01-01',
            gender: row.gender || 'M',
            phone: row.phone || '',
            email: row.email || '',
            hasPhoto: false,
            hasBiometrics: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            importedBy: performedBy.uid,
        };
        const registryDoc = {
            id: finalCardNo,
            cardNumber: finalCardNo,
            issueDate: (0, cardService_1.toIssueDateSegment)(today),
            assuredNumber: finalCardNo.slice(-5),
            organization: org,
            insuredName: name,
            assignedBy: performedBy.uid,
            assignedByName: performedBy.name,
            assignedAt: new Date().toISOString(),
            method: 'EXCEL_IMPORT',
        };
        validItemsToInsert.push({
            memberDoc,
            registryDoc,
            assignedAssuredNumber: itemAssuredNumber,
        });
        report.push({
            rowIndex: i,
            principalName: name,
            organization: org,
            cardNo: finalCardNo,
            status: 'SUCCESS',
        });
    }
    // 3. Commit writes in chunks with atomic counter updates
    // Firestore limit: 500 ops per batch. Each item is 2 ops (member + registry).
    // 150 items = 300 ops + 1 op (counter) = 301 ops per batch, safely under 500.
    const CHUNK_SIZE = 150;
    let runningMaxCounter = counters.lastAssuredNumber || 0;
    for (let c = 0; c < validItemsToInsert.length; c += CHUNK_SIZE) {
        const batch = db.batch();
        const chunk = validItemsToInsert.slice(c, c + CHUNK_SIZE);
        chunk.forEach((item) => {
            batch.set(db.doc(`members/${item.memberDoc.id}`), item.memberDoc);
            batch.set(db.doc(`cardNumberRegistry/${item.registryDoc.id}`), item.registryDoc);
            if (item.assignedAssuredNumber > runningMaxCounter) {
                runningMaxCounter = item.assignedAssuredNumber;
            }
        });
        // Atomically commit the updated counter alongside this chunk!
        batch.set(countersRef, {
            lastAssuredNumber: runningMaxCounter,
            formatVersion: 'v2',
            updatedAt: new Date().toISOString(),
        }, { merge: true });
        await batch.commit();
    }
    // 4. Log audit event
    try {
        const auditRef = db.collection('auditLogs').doc();
        await auditRef.set({
            id: auditRef.id,
            timestamp: new Date().toISOString(),
            userId: performedBy.uid,
            userName: performedBy.name,
            userRole: performedBy.role,
            action: 'BULK_MEMBER_IMPORT',
            category: 'Data Management',
            entityId: `BATCH-${Date.now()}`,
            entityType: 'import_batch',
            details: `Bulk import completed: ${validItemsToInsert.length} created, ${report.filter((r) => r.status === 'SKIPPED').length} skipped, ${report.filter((r) => r.status === 'FAILED').length} failed out of ${rows.length} total rows.`,
        });
    }
    catch (e) {
        // Non-blocking log
    }
    const successCount = validItemsToInsert.length;
    const skippedCount = report.filter((r) => r.status === 'SKIPPED').length;
    const failureCount = report.filter((r) => r.status === 'FAILED').length;
    return {
        totalProcessed: rows.length,
        successCount,
        failureCount,
        skippedCount,
        report,
    };
}
//# sourceMappingURL=importService.js.map