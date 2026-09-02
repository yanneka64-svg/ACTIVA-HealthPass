import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { InvoiceItem, Language } from '../types';
import { drawPdfLogoStrip, PDF_LOGO_STRIP_HEIGHT } from './pdfBranding';
import {
  ACTIVA_LOGO_PNG_BASE64,
  ACTIVA_LOGO_ASPECT_RATIO,
  GLOBUS_LOGO_PNG_BASE64,
  GLOBUS_LOGO_ASPECT_RATIO,
} from '../assets/logoAssets';

/**
 * Formatter for monetary values according to active currency mode (USD / LRD / DUAL)
 */
function getActiveCurrencyFormatter(lang: Language = 'en') {
  const currencyMode = (typeof localStorage !== 'undefined' ? localStorage.getItem('activa_currency_mode') : 'USD') || 'USD';
  const rate = parseFloat((typeof localStorage !== 'undefined' ? localStorage.getItem('activa_lrd_usd_rate') : '') || '195.0');
  const isEn = lang === 'en';

  return (amt: number) => {
    if (currencyMode === 'LRD') {
      return `L$ ${(amt * rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (currencyMode === 'DUAL') {
      return `$ ${amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (L$ ${(amt * rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    }
    return `$ ${amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
}

/**
 * Generates and downloads a direct high-quality PDF version of the Coverage Voucher / Settlement Slip.
 */
export function downloadBordereauPDF(invoice: InvoiceItem, lang: Language = 'en'): void {
  const doc = new jsPDF();
  const formatCurrency = getActiveCurrencyFormatter(lang);

  // ACTIVA Blue top banner
  doc.setFillColor(10, 46, 107); // #0a2e6b
  doc.rect(0, 0, 210, 26, 'F');

  // Emerald green accent stripe
  doc.setFillColor(0, 168, 89); // #00A859
  doc.rect(0, 26, 210, 3, 'F');

  // Header Titles
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('ACTIVA HealthPass', 14, 13);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Health • Safety • Serenity — Healthcare Insurance', 14, 19);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(
    'Direct-Billing Settlement Slip',
    196,
    13,
    { align: 'right' }
  );

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Ref: ${invoice.reference}`,
    196,
    19,
    { align: 'right' }
  );

  // === AMÉLIORATION AJOUTÉE : bandeau logos ACTIVA + Globus sous le bandeau de couleur
  // existant (voir pdfBranding.ts). Comme ce document utilise des coordonnées Y fixes
  // (pas de "currentY" cumulatif), seuls les DEUX repères qui suivent immédiatement le
  // bandeau (38 et 42) sont décalés de PDF_LOGO_STRIP_HEIGHT ; tout le reste du document
  // est déjà positionné de façon relative (finalY1/finalY2 issus d'autoTable), donc il
  // se décale automatiquement sans qu'aucune autre ligne n'ait besoin d'être touchée.
  drawPdfLogoStrip(doc, 210, 29);

  // Section: Beneficiary & Provider info cards
  doc.setTextColor(10, 46, 107);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('1. File & Policy Identification', 14, 38 + PDF_LOGO_STRIP_HEIGHT);

  autoTable(doc, {
    startY: 42 + PDF_LOGO_STRIP_HEIGHT,
    theme: 'grid',
    head: [[
      'Beneficiary & Insured',
      'Healthcare Facility & Prescriber',
    ]],
    body: [[
      `Name: ${invoice.patientName}\nCard No.: ${invoice.cardNo}\nOrganization: ${invoice.organization}\nFamily Head: ${invoice.familyHead}`,
      `Facility: ${invoice.provider}\nPrescriber: ${invoice.prescribingDoctor || 'Medical Staff'}\nCare Date: ${invoice.serviceDate}\nStatus: APPROVED & COMPLIANT`,
    ]],
    headStyles: {
      fillColor: [13, 63, 143],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [30, 41, 59],
      cellPadding: 4,
    },
  });

  const finalY1 = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY : 80;

  // Section: Medical Act Table
  doc.setTextColor(10, 46, 107);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('2. Medical Act & Coverage Breakdown', 14, finalY1 + 10);

  autoTable(doc, {
    startY: finalY1 + 14,
    theme: 'striped',
    head: [[
      'Care Description',
      'Care Date',
      'Coverage Rate',
      'Total Billed',
      'ACTIVA Share',
    ]],
    body: [[
      invoice.careType,
      invoice.serviceDate,
      `${invoice.coveragePercentage} %`,
      formatCurrency(invoice.amount),
      formatCurrency(invoice.amount),
    ]],
    headStyles: {
      fillColor: [0, 168, 89], // #00A859
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold' },
      1: { halign: 'center' },
      2: { halign: 'center', fontStyle: 'bold', textColor: [0, 168, 89] },
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold', textColor: [13, 63, 143] },
    },
    styles: { fontSize: 9 },
  });

  const finalY2 = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY : 120;

  // Highlight Box: Total Amount
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(0, 168, 89);
  doc.setLineWidth(0.5);
  doc.rect(14, finalY2 + 8, 182, 20, 'FD');

  doc.setTextColor(6, 95, 70);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `TOTAL COVERED AMOUNT (${invoice.coveragePercentage}%)`,
    20,
    finalY2 + 17
  );

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'Guaranteed payment under ACTIVA HealthPass convention',
    20,
    finalY2 + 23
  );

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(4, 120, 87);
  doc.text(formatCurrency(invoice.amount), 190, finalY2 + 20, { align: 'right' });

  // Signatures Section
  const sigY = finalY2 + 38;
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);

  // Line 1: Healthcare Facility
  doc.line(14, sigY + 15, 65, sigY + 15);
  doc.text('Healthcare Facility Stamp', 14, sigY);
  doc.text(invoice.provider, 14, sigY + 20);

  // Line 2: Beneficiary
  doc.line(80, sigY + 15, 130, sigY + 15);
  doc.text('Insured Signature', 80, sigY);
  doc.text(invoice.patientName, 80, sigY + 20);

  // Line 3: ACTIVA
  doc.line(145, sigY + 15, 196, sigY + 15);
  doc.text('ACTIVA Medical Visa', 145, sigY);
  doc.text('Approved & Certified', 145, sigY + 20);

  // Footer
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `ACTIVA HealthPass — Official Direct-Settlement Voucher — Reference: ${invoice.reference}`,
    105,
    285,
    { align: 'center' }
  );

  doc.save(`ACTIVA_Settlement_Slip_${invoice.reference}.pdf`);
}

/**
 * Creates and prints an official ACTIVA HealthPass Coverage Settlement Slip (Bordereau de Prise en Charge)
 * Using robust fallback mechanisms (Popup Print window -> In-page printing -> Direct PDF automatic generation).
 */
export function printBordereauSlip(invoice: InvoiceItem, lang: Language = 'en'): void {
  const formatCurrency = getActiveCurrencyFormatter(lang);

  const currentDate = new Date().toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Coverage Voucher - ${invoice.reference}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            background: #ffffff;
            margin: 0;
            padding: 20px;
            font-size: 13px;
            line-height: 1.5;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px solid #0a2e6b;
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          /* === AMÉLIORATION AJOUTÉE : bandeau logos (ACTIVA + partenaire Globus), miroir de
             la version PDF (pdfBranding.ts). Nouvelle règle CSS indépendante — ne modifie
             en rien la disposition flex existante de .header ci-dessus. */
          .letterhead-logos {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0 14px 0;
            margin-bottom: 4px;
            border-bottom: 1px solid #e2e8f0;
          }
          .letterhead-logos img {
            height: 26px;
            width: auto;
            display: block;
          }
          .letterhead-partner {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .letterhead-partner .label {
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.6px;
            text-transform: uppercase;
            color: #94a3b8;
          }
          .brand-title {
            font-size: 24px;
            font-weight: 900;
            color: #0a2e6b;
            letter-spacing: -0.5px;
            margin: 0;
          }
          .brand-title span {
            color: #00A859;
          }
          .brand-tagline {
            font-size: 10px;
            color: #64748b;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 3px;
          }
          .doc-badge {
            text-align: right;
          }
          .doc-badge h2 {
            margin: 0;
            font-size: 16px;
            font-weight: 800;
            color: #0a2e6b;
            text-transform: uppercase;
            /* AMÉLIORATION AJOUTÉE : léger espacement des lettres pour un titre plus soigné */
            letter-spacing: 0.4px;
          }
          .doc-badge .ref {
            font-family: monospace;
            font-size: 12px;
            font-weight: 700;
            color: #00A859;
            margin-top: 2px;
          }
          .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 20px;
          }
          .info-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 14px;
          }
          .info-card h4 {
            margin: 0 0 10px 0;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            color: #0a2e6b;
            letter-spacing: 0.5px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 6px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 6px;
            font-size: 12px;
          }
          .info-row:last-child {
            margin-bottom: 0;
          }
          .info-label {
            color: #64748b;
            font-weight: 600;
          }
          .info-val {
            font-weight: 700;
            color: #0f172a;
            text-align: right;
          }
          .table-container {
            margin-bottom: 24px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }
          th {
            background-color: #0a2e6b;
            color: #ffffff;
            font-weight: 700;
            text-align: left;
            padding: 10px 12px;
            font-size: 11px;
            text-transform: uppercase;
            /* AMÉLIORATION AJOUTÉE : léger espacement des lettres pour des entêtes plus affinées */
            letter-spacing: 0.4px;
          }
          td {
            padding: 10px 12px;
            border-bottom: 1px solid #e2e8f0;
            color: #334155;
          }
          tr:nth-child(even) td {
            background-color: #f8fafc;
          }
          .amount-highlight {
            background: #ecfdf5;
            border: 2px solid #00A859;
            border-radius: 8px;
            padding: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
          }
          .amount-highlight .label {
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            color: #065f46;
          }
          .amount-highlight .sub {
            font-size: 11px;
            color: #047857;
          }
          .amount-highlight .value {
            font-size: 18px;
            font-weight: 900;
            color: #047857;
          }
          .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 16px;
            margin-top: 32px;
            padding-top: 16px;
          }
          .sig-box {
            border-top: 1px dashed #cbd5e1;
            padding-top: 8px;
            text-align: center;
            font-size: 11px;
            color: #64748b;
          }
          .sig-box strong {
            display: block;
            color: #334155;
            margin-bottom: 30px;
          }
          .footer {
            margin-top: 36px;
            text-align: center;
            font-size: 10px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
            padding-top: 12px;
          }
          .stamp {
            display: inline-block;
            border: 2px solid #00A859;
            color: #00A859;
            font-weight: 900;
            padding: 4px 8px;
            border-radius: 6px;
            text-transform: uppercase;
            font-size: 10px;
            letter-spacing: 0.5px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="brand-title">ACTIVA <span>HealthPass</span></h1>
            <div class="brand-tagline">Health • Safety • Serenity — Healthcare Insurance</div>
          </div>
          <div class="doc-badge">
            <h2>Settlement Slip</h2>
            <div class="ref">REF. ${invoice.reference}</div>
            <div style="font-size: 10px; color: #64748b; margin-top: 4px;">
              Date: ${currentDate}
            </div>
          </div>
        </div>

        <!-- AMÉLIORATION AJOUTÉE : bandeau logos ACTIVA + Globus, juste sous l'entête
             existant — nouveau bloc, la structure/flex du .header ci-dessus est intacte. -->
        <div class="letterhead-logos">
          <img src="${ACTIVA_LOGO_PNG_BASE64}" alt="ACTIVA" style="aspect-ratio: ${ACTIVA_LOGO_ASPECT_RATIO};" />
          <div class="letterhead-partner">
            <span class="label">In partnership with</span>
            <img src="${GLOBUS_LOGO_PNG_BASE64}" alt="Globus" style="aspect-ratio: ${GLOBUS_LOGO_ASPECT_RATIO};" />
          </div>
        </div>

        <div class="grid-2">
          <!-- Beneficiary Information -->
          <div class="info-card">
            <h4>Beneficiary & Insured Details</h4>
            <div class="info-row">
              <span class="info-label">Beneficiary Name :</span>
              <span class="info-val">${invoice.patientName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Health Card No. :</span>
              <span class="info-val">${invoice.cardNo}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Organization :</span>
              <span class="info-val">${invoice.organization}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Family Head :</span>
              <span class="info-val">${invoice.familyHead}</span>
            </div>
          </div>

          <!-- Healthcare Provider Information -->
          <div class="info-card">
            <h4>Healthcare Facility & Prescription</h4>
            <div class="info-row">
              <span class="info-label">Provider Facility :</span>
              <span class="info-val">${invoice.provider}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Prescribing Doctor :</span>
              <span class="info-val">${invoice.prescribingDoctor || 'Medical Staff'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Care Date :</span>
              <span class="info-val">${invoice.serviceDate}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Status :</span>
              <span class="info-val"><span class="stamp">APPROVED</span></span>
            </div>
          </div>
        </div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Care Category / Medical Act</th>
                <th style="text-align: center;">Care Date</th>
                <th style="text-align: center;">Coverage Rate</th>
                <th style="text-align: right;">Total Billed</th>
                <th style="text-align: right;">Covered by ACTIVA</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="font-weight: 700; color: #0a2e6b;">${invoice.careType}</td>
                <td style="text-align: center;">${invoice.serviceDate}</td>
                <td style="text-align: center; font-weight: 700; color: #00A859;">${invoice.coveragePercentage}%</td>
                <td style="text-align: right; font-weight: 600;">${formatCurrency(invoice.amount)}</td>
                <td style="text-align: right; font-weight: 800; color: #00A859;">${formatCurrency(invoice.amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="amount-highlight">
          <div>
            <div class="label">Total Net Payable by ACTIVA (${invoice.coveragePercentage}%)</div>
            <div class="sub">Guaranteed payment under ACTIVA HealthPass convention terms</div>
          </div>
          <div class="value">${formatCurrency(invoice.amount)}</div>
        </div>

        <div class="signatures">
          <div class="sig-box">
            <strong>Healthcare Provider Stamp</strong>
            <span>${invoice.provider}</span>
          </div>
          <div class="sig-box">
            <strong>Insured Beneficiary</strong>
            <span>${invoice.patientName}</span>
          </div>
          <div class="sig-box">
            <strong>ACTIVA Medical Controller</strong>
            <span>Authorized & Signed</span>
          </div>
        </div>

        <div class="footer">
          ACTIVA Insurance — HealthPass Official Direct-Settlement Document — Digitally verified via Biometrics & Policy Registry
        </div>
      </body>
    </html>
  `;

  // Always generate and download the high-quality PDF document as an infallible guarantee
  downloadBordereauPDF(invoice, lang);

  // Also attempt native browser print via popup or iframe
  try {
    const printPopup = window.open('', '_blank', 'width=850,height=900');
    if (printPopup && !printPopup.closed) {
      printPopup.document.open();
      printPopup.document.write(htmlContent);
      printPopup.document.close();
      setTimeout(() => {
        try {
          printPopup.focus();
          printPopup.print();
        } catch {
          // Handled by PDF fallback
        }
      }, 300);
      return;
    }
  } catch (err) {
    console.warn('Popup blocked, attempting iframe print fallback', err);
  }

  // Fallback iframe print
  try {
    const printWindow = document.createElement('iframe');
    printWindow.style.position = 'fixed';
    printWindow.style.right = '0';
    printWindow.style.bottom = '0';
    printWindow.style.width = '0';
    printWindow.style.height = '0';
    printWindow.style.border = '0';
    document.body.appendChild(printWindow);

    const doc = printWindow.contentWindow?.document || printWindow.contentDocument;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();

      setTimeout(() => {
        try {
          printWindow.contentWindow?.focus();
          printWindow.contentWindow?.print();
        } catch (e) {
          console.warn('Iframe print blocked by sandbox', e);
        } finally {
          setTimeout(() => {
            if (document.body.contains(printWindow)) {
              document.body.removeChild(printWindow);
            }
          }, 2000);
        }
      }, 350);
    }
  } catch (e) {
    console.warn('Iframe print error', e);
  }
}
