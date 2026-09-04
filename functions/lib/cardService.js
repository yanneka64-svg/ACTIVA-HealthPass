"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CARD_NUMBER_REGEX = exports.CARD_PREFIX = void 0;
exports.toIssueDateSegment = toIssueDateSegment;
exports.formatCardNumber = formatCardNumber;
exports.parseCardNumber = parseCardNumber;
exports.generateNextCardNumberServer = generateNextCardNumberServer;
exports.batchGenerateCardNumbersServer = batchGenerateCardNumbersServer;
exports.registerExistingCardNumberServer = registerExistingCardNumberServer;
exports.CARD_PREFIX = 'AMID';
exports.CARD_NUMBER_REGEX = /^AMID-(\d{2})(\d{2})(\d{2})-(\d{5})$/;
function pad(n, width) {
    return String(Math.max(0, Math.trunc(n))).padStart(width, '0');
}
function toIssueDateSegment(date) {
    let d;
    if (!date) {
        d = new Date();
    }
    else if (typeof date === 'string') {
        const parsed = new Date(date.length <= 10 ? `${date}T00:00:00` : date);
        d = isNaN(parsed.getTime()) ? new Date() : parsed;
    }
    else {
        d = isNaN(date.getTime()) ? new Date() : date;
    }
    const yy = pad(d.getFullYear() % 100, 2);
    const mm = pad(d.getMonth() + 1, 2);
    const dd = pad(d.getDate(), 2);
    return `${yy}${mm}${dd}`;
}
function formatCardNumber(issueDate, assuredNumber) {
    return `${exports.CARD_PREFIX}-${toIssueDateSegment(issueDate)}-${pad(assuredNumber, 5)}`;
}
function parseCardNumber(cardNo) {
    if (!cardNo)
        return null;
    const match = exports.CARD_NUMBER_REGEX.exec(cardNo.trim());
    if (!match)
        return null;
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31)
        return null;
    return { issueDate: `${match[1]}${match[2]}${match[3]}`, assuredNumber: parseInt(match[4], 10) };
}
/**
 * Server-side atomic generation of next card number
 */
async function generateNextCardNumberServer(db, ctx) {
    const countersRef = db.doc('counters/cardNumbers');
    return db.runTransaction(async (tx) => {
        const countersSnap = await tx.get(countersRef);
        const counters = countersSnap.exists ? countersSnap.data() || {} : {};
        const nextAssured = (counters.lastAssuredNumber || 0) + 1;
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
        tx.set(countersRef, {
            lastAssuredNumber: nextAssured,
            formatVersion: 'v2',
            updatedAt: new Date().toISOString(),
        }, { merge: true });
        return cardNumber;
    });
}
/**
 * Server-side atomic batch generation of consecutive card numbers without gaps
 */
async function batchGenerateCardNumbersServer(db, count, ctxList) {
    if (count <= 0)
        return [];
    const countersRef = db.doc('counters/cardNumbers');
    return db.runTransaction(async (tx) => {
        const countersSnap = await tx.get(countersRef);
        const counters = countersSnap.exists ? countersSnap.data() || {} : {};
        let currentAssured = (counters.lastAssuredNumber || 0);
        const generated = [];
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
        tx.set(countersRef, {
            lastAssuredNumber: currentAssured,
            formatVersion: 'v2',
            updatedAt: new Date().toISOString(),
        }, { merge: true });
        return generated;
    });
}
/**
 * Case A: Register an existing card number (manual entry, existing excel row, admin entry).
 * 1. Validates strict format (AMID-YYMMDD-NNNNN with valid calendar date)
 * 2. Verifies it is not already assigned to another insured member
 * 3. Records it in cardNumberRegistry if not already present
 * 4. Raises the global counter if parsed.assuredNumber > currentAssured (never lowers it)
 */
async function registerExistingCardNumberServer(db, cardNumber, ctx) {
    const parsed = parseCardNumber(cardNumber);
    if (!parsed) {
        throw new Error(`Invalid card number format: "${cardNumber}". Expected AMID-YYMMDD-NNNNN with valid calendar date.`);
    }
    const countersRef = db.doc('counters/cardNumbers');
    const regRef = db.doc(`cardNumberRegistry/${cardNumber}`);
    await db.runTransaction(async (tx) => {
        const regSnap = await tx.get(regRef);
        if (regSnap.exists) {
            throw new Error(`Card number ${cardNumber} is already assigned to another insured member.`);
        }
        const countersSnap = await tx.get(countersRef);
        const counters = countersSnap.exists ? countersSnap.data() || {} : {};
        const currentAssured = (counters.lastAssuredNumber || 0);
        tx.set(regRef, {
            id: cardNumber,
            cardNumber,
            issueDate: parsed.issueDate,
            assuredNumber: pad(parsed.assuredNumber, 5),
            organization: ctx.organization ?? null,
            memberId: ctx.memberId ?? null,
            insuredName: ctx.insuredName ?? null,
            assignedBy: ctx.assignedBy ?? null,
            assignedByName: ctx.assignedByName ?? null,
            assignedAt: new Date().toISOString(),
            method: ctx.method || 'MANUAL',
        });
        if (parsed.assuredNumber > currentAssured) {
            tx.set(countersRef, {
                lastAssuredNumber: parsed.assuredNumber,
                formatVersion: 'v2',
                updatedAt: new Date().toISOString(),
            }, { merge: true });
        }
    });
    return { success: true, cardNumber };
}
//# sourceMappingURL=cardService.js.map