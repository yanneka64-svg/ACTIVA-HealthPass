// === ADDED IMPROVEMENT: shared PDF letterhead (partner logos + refined header typography) ===
// Centralizes two things requested across every generated PDF (medical form, settlement
// receipt, statistical/executive reports):
//   1. Inserting the ACTIVA and Globus logos (white background removed — see
//      src/assets/logoAssets.ts) as a dedicated letterhead strip below the existing colored
//      header banner, so the change is purely additive: no existing pixel-positioned text
//      in any of the 4 PDF generators had to move, only the vertical cursor that runs the
//      rest of the document is pushed down by PDF_LOGO_STRIP_HEIGHT.
//   2. A small helper for more refined, "designed" ALL-CAPS header titles — positive
//      letter-spacing via jsPDF's setCharSpace() reads as more polished/typeset than the
//      default cramped bold caps, which is what was asked ("les titres des entêtes...
//      bien affinées"). jsPDF only ships Helvetica/Times/Courier, so refinement here means
//      spacing/weight/size hierarchy, not a different typeface.
import jsPDF from 'jspdf';
import {
  ACTIVA_LOGO_PNG_BASE64,
  ACTIVA_LOGO_ASPECT_RATIO,
  GLOBUS_LOGO_PNG_BASE64,
  GLOBUS_LOGO_ASPECT_RATIO,
} from '../assets/logoAssets';

/** Height (mm) reserved for the logo strip, in addition to the existing colored banner. */
export const PDF_LOGO_STRIP_HEIGHT = 14;

/**
 * Draws a white "letterhead" strip immediately below the document's existing colored
 * header banner, with the ACTIVA logo on the left and the Globus partner logo on the
 * right (small "IN PARTNERSHIP WITH" label between them). Call this right after the
 * banner fill/stripe code, then add PDF_LOGO_STRIP_HEIGHT to whatever y-coordinate the
 * rest of the document starts at.
 */
export function drawPdfLogoStrip(doc: jsPDF, pageWidth: number, bannerBottomY: number): void {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, bannerBottomY, pageWidth, PDF_LOGO_STRIP_HEIGHT, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(0, bannerBottomY + PDF_LOGO_STRIP_HEIGHT, pageWidth, bannerBottomY + PDF_LOGO_STRIP_HEIGHT);

  const logoH = 8.5;
  const activaW = logoH * ACTIVA_LOGO_ASPECT_RATIO;
  const globusW = logoH * GLOBUS_LOGO_ASPECT_RATIO;
  const y = bannerBottomY + (PDF_LOGO_STRIP_HEIGHT - logoH) / 2;

  doc.addImage(ACTIVA_LOGO_PNG_BASE64, 'PNG', 14, y, activaW, logoH);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setCharSpace(0.3);
  doc.setTextColor(148, 163, 184);
  const label = 'IN PARTNERSHIP WITH';
  const labelWidth = doc.getTextWidth(label);
  const labelX = pageWidth - 14 - globusW - 5 - labelWidth;
  doc.text(label, labelX, y + logoH / 2 + 1.1);
  doc.setCharSpace(0);

  doc.addImage(GLOBUS_LOGO_PNG_BASE64, 'PNG', pageWidth - 14 - globusW, y, globusW, logoH);
}

/**
 * Draws an ALL-CAPS header title with a touch of letter-spacing for a more refined,
 * typeset look than jsPDF's default cramped bold caps. `x`/`y` follow jsPDF's text()
 * conventions (baseline position); pass `{ align: 'right' }` etc. via `options` as usual.
 */
export function drawRefinedHeaderTitle(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  options?: { align?: 'left' | 'center' | 'right'; charSpace?: number }
): void {
  const charSpace = options?.charSpace ?? 0.4;
  doc.setCharSpace(charSpace);
  doc.text(text, x, y, options?.align ? { align: options.align } : undefined);
  doc.setCharSpace(0);
}
