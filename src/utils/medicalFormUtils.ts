import { MedicalForm } from '../types';

/**
 * Utility functions for ACTIVA Medical Form security numbers.
 * New official structure: AMID-XX (year of print) XX (day of print)-XXXX (insured number)
 * Standard code format: AMID-YY-DD-XXXX (e.g. AMID-26-03-5410 or AMID-26-22-5410)
 */

/**
 * Extracts a 4-digit insured number (XXXX) from a member's card number or member ID.
 * Examples:
 * - "ACT-2026-55410" -> "5410"
 * - "ACT-2026-9043"  -> "9043"
 * - "AMID-00001-0001" -> "0001"
 * - "ACT-2026-66219" -> "6219"
 * - "mem-4"          -> "0004"
 */
export function extractInsuredNumber(cardNo?: string, memberId?: string): string {
  if (!cardNo && !memberId) {
    return '0001';
  }

  const raw = cardNo || memberId || '';

  // Check if it's in standard hyphenated format with a clear suffix
  // e.g. AMID-00001-0001 or ACT-2026-55410
  const parts = raw.split('-');
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].trim();
    const lastDigits = lastPart.replace(/\D/g, '');
    if (lastDigits.length === 4) {
      return lastDigits;
    }
    if (lastDigits.length > 4) {
      return lastDigits.slice(-4);
    }
    if (lastDigits.length > 0) {
      return lastDigits.padStart(4, '0');
    }
  }

  // Fallback: extract all digits and take last 4 digits
  const allDigits = raw.replace(/\D/g, '');
  if (allDigits.length >= 4) {
    return allDigits.slice(-4);
  }
  if (allDigits.length > 0) {
    return allDigits.padStart(4, '0');
  }

  return '0001';
}

/**
 * Generates an official Medical Form Security Number adhering to:
 * AMID-XX (année d’impression) XX (jour d’mpression)-XXXX (numéro de l’assuré)
 * Result format: AMID-YY-DD-XXXX (e.g. AMID-26-03-5410)
 */
export function generateMedicalFormSecurityNumber(options?: {
  date?: Date | string;
  memberCardNo?: string;
  memberId?: string;
}): string {
  let dateObj = new Date();
  if (options?.date) {
    if (options.date instanceof Date) {
      dateObj = options.date;
    } else {
      const parsed = new Date(options.date);
      if (!isNaN(parsed.getTime())) {
        dateObj = parsed;
      }
    }
  }

  // XX: 2-digit year of printing (e.g. "26" for 2026)
  const year2Digits = String(dateObj.getFullYear()).slice(-2);

  // XX: 2-digit day of printing (e.g. "03" for 3rd, "22" for 22nd)
  const day2Digits = String(dateObj.getDate()).padStart(2, '0');

  // XXXX: 4-digit insured number (numéro de l'assuré)
  const insuredNo = extractInsuredNumber(options?.memberCardNo, options?.memberId);

  return `AMID-${year2Digits}-${day2Digits}-${insuredNo}`;
}

/**
 * Checks if a security number is already formatted according to the new AMID standard.
 */
export function isNewSecurityNumberFormat(secNum?: string): boolean {
  if (!secNum) return false;
  // Accepts AMID-XX-XX-XXXX or AMID-XX XX-XXXX
  return /^AMID-\d{2}[-\s]\d{2}-\w{4}$/i.test(secNum.trim());
}

/**
 * Normalizes an existing medical form to the new AMID security number structure.
 */
export function normalizeMedicalFormSecurityNumber(form: Partial<MedicalForm>): string {
  if (form.securityNumber && isNewSecurityNumberFormat(form.securityNumber)) {
    // If it has a space instead of dash, standardize to hyphenated
    return form.securityNumber.trim().replace(/\s+/, '-');
  }

  const dateToUse = form.issueDate || form.createdAt || new Date();
  return generateMedicalFormSecurityNumber({
    date: dateToUse,
    memberCardNo: form.memberCardNo,
    memberId: form.memberId,
  });
}

/**
 * Helper to check if a search term matches a security number, flexibly tolerating
 * dashes, spaces, or raw digits.
 */
export function matchesSecurityNumberSearch(securityNumber: string, query: string): boolean {
  if (!query) return true;
  const cleanQuery = query.toLowerCase().trim();
  const cleanSec = (securityNumber || '').toLowerCase().trim();

  // Direct substring match
  if (cleanSec.includes(cleanQuery)) return true;

  // Normalized (without spaces and hyphens) match
  const strippedSec = cleanSec.replace(/[-\s]/g, '');
  const strippedQuery = cleanQuery.replace(/[-\s]/g, '');
  if (strippedQuery.length > 0 && strippedSec.includes(strippedQuery)) return true;

  return false;
}
