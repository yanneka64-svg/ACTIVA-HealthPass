// === AMÉLIORATION AJOUTÉE : test (revue 2026-09-11, section 2.6 — exports en masse non
// maîtrisés) === Preuve reproductible que les exports Excel/CSV/PDF portant des données
// personnelles/de santé (src/utils/excelUtils.ts) respectent désormais une limite de volume et
// portent une mention de confidentialité, sans dépendre d'un environnement DOM/navigateur (pas
// de jsdom dans ce projet) : ces 4 helpers sont purs (workbook/chaîne/document jsPDF en mémoire),
// donc testables directement en environnement Node.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import {
  MAX_EXPORT_ROWS,
  EXPORT_CONFIDENTIALITY_NOTICE,
  assertExportVolumeAllowed,
  addExportConfidentialityNoticeSheet,
  withExportConfidentialityNoticeCSV,
  drawExportConfidentialityFooter,
} from '../src/utils/excelUtils';

describe('assertExportVolumeAllowed — limite de volume sur les exports', () => {
  const originalWindow = (globalThis as any).window;

  beforeEach(() => {
    (globalThis as any).window = { alert: vi.fn() };
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  it('autorise un export sous la limite, sans alerte', () => {
    expect(assertExportVolumeAllowed(10, 'Test Export')).toBe(true);
    expect(assertExportVolumeAllowed(MAX_EXPORT_ROWS, 'Test Export')).toBe(true);
    expect((globalThis as any).window.alert).not.toHaveBeenCalled();
  });

  it('bloque un export au-delà de la limite et alerte avec un message exploitable', () => {
    const result = assertExportVolumeAllowed(MAX_EXPORT_ROWS + 1, 'Benefit Claims');
    expect(result).toBe(false);
    expect((globalThis as any).window.alert).toHaveBeenCalledTimes(1);
    const message = (globalThis as any).window.alert.mock.calls[0][0] as string;
    expect(message).toContain('Benefit Claims');
    expect(message).toContain('blocked');
    expect(message).toContain('narrow your filters');
  });

  it("ne lève jamais d'exception même sans window disponible (repli silencieux)", () => {
    (globalThis as any).window = undefined;
    expect(() => assertExportVolumeAllowed(MAX_EXPORT_ROWS + 1, 'Test Export')).not.toThrow();
    expect(assertExportVolumeAllowed(MAX_EXPORT_ROWS + 1, 'Test Export')).toBe(false);
  });
});

describe('addExportConfidentialityNoticeSheet — filigrane Excel', () => {
  it('ajoute un onglet "Notice" et le place en première position', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{ A: 1 }]);
    XLSX.utils.book_append_sheet(wb, ws, 'Data');

    addExportConfidentialityNoticeSheet(wb);

    expect(wb.SheetNames[0]).toBe('Notice');
    expect(wb.SheetNames).toContain('Data');
    expect(wb.SheetNames.length).toBe(2);
  });

  it('le contenu de l\'onglet "Notice" porte le texte de confidentialité', () => {
    const wb = XLSX.utils.book_new();
    addExportConfidentialityNoticeSheet(wb);
    const noticeSheet = wb.Sheets['Notice'];
    const rows = XLSX.utils.sheet_to_json<{ Notice: string }>(noticeSheet, { header: 1 }) as unknown as string[][];
    expect(rows[0][0]).toBe(EXPORT_CONFIDENTIALITY_NOTICE);
  });
});

describe('withExportConfidentialityNoticeCSV — filigrane CSV', () => {
  it('préfixe le contenu CSV existant sans le modifier', () => {
    const original = 'Header1,Header2\n"a","b"';
    const result = withExportConfidentialityNoticeCSV(original);
    expect(result.endsWith(original)).toBe(true);
    expect(result.split('\n')[0]).toContain('CONFIDENTIAL');
  });
});

describe('drawExportConfidentialityFooter — filigrane PDF', () => {
  it('dessine le pied de page de confidentialité sur chaque page du document', () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.text('Page 1 content', 10, 10);
    doc.addPage();
    doc.text('Page 2 content', 10, 10);

    const textSpy = vi.spyOn(doc, 'text');
    drawExportConfidentialityFooter(doc);

    // Called once per page (2 pages) with the confidentiality text.
    const footerCalls = textSpy.mock.calls.filter((call) => String(call[0]).includes('CONFIDENTIAL'));
    expect(footerCalls.length).toBe(2);
  });

  it('ne lève pas d\'exception sur un document à une seule page', () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    expect(() => drawExportConfidentialityFooter(doc)).not.toThrow();
  });
});
