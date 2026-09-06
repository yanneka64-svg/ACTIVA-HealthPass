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

// === AMÉLIORATION AJOUTÉE : nouveau modèle "Settlement Slip & Direct Billing Voucher"
// (maquette fournie par l'utilisateur) — miroir de la logique déjà utilisée par
// InvoicesView.tsx (slipBreakdownRows) pour que l'écran, l'impression et le PDF affichent
// exactement le même détail par acte médical. Les factures antérieures à ce correctif n'ont
// pas de `medicalActs` : repli sur une ligne unique dérivée de careType/amount/coveredAmount.
function getBreakdownRows(invoice: InvoiceItem): { description: string; category: string; billed: number; covered: number }[] {
  if (invoice.medicalActs && invoice.medicalActs.length > 0) {
    return invoice.medicalActs.map((act) => ({
      description: act.name,
      category: act.category || invoice.careType,
      billed: act.amount,
      covered: (act.amount * (invoice.coveragePercentage || 80)) / 100,
    }));
  }
  return [
    {
      description: invoice.careType,
      category: invoice.careType,
      billed: invoice.amount,
      covered:
        invoice.coveredAmount !== undefined
          ? invoice.coveredAmount
          : (invoice.amount * (invoice.coveragePercentage || 80)) / 100,
    },
  ];
}

function getSlipClaimRef(invoice: InvoiceItem): string {
  return invoice.claimId || `SIN-${invoice.id.substring(0, 8)}`;
}

function isSlipApproved(invoice: InvoiceItem): boolean {
  return invoice.status === 'valid' || (invoice.status as string) === 'approved';
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

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text(
    'Settlement Slip & Direct Billing Voucher',
    196,
    12,
    { align: 'right' }
  );

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Voucher Ref: ${invoice.reference}`, 196, 17, { align: 'right' });
  doc.text(`Claim Ref: ${getSlipClaimRef(invoice)}`, 196, 21, { align: 'right' });

  // === AMÉLIORATION AJOUTÉE : bandeau logos ACTIVA + Globus sous le bandeau de couleur
  // existant (voir pdfBranding.ts). Comme ce document utilise des coordonnées Y fixes
  // (pas de "currentY" cumulatif), seuls les DEUX repères qui suivent immédiatement le
  // bandeau (38 et 42) sont décalés de PDF_LOGO_STRIP_HEIGHT ; tout le reste du document
  // est déjà positionné de façon relative (finalY1/finalY2 issus d'autoTable), donc il
  // se décale automatiquement sans qu'aucune autre ligne n'ait besoin d'être touchée.
  drawPdfLogoStrip(doc, 210, 29);

  // === AMÉLIORATION AJOUTÉE : cachet "APPROVED & COVERED" (maquette fournie par
  // l'utilisateur) — jsPDF ne gère pas nativement l'opacité, une teinte vert clair rotative
  // approche visuellement l'effet de tampon semi-transparent de l'aperçu écran/impression.
  if (isSlipApproved(invoice)) {
    doc.setTextColor(190, 227, 205);
    doc.setFontSize(21);
    doc.setFont('helvetica', 'bold');
    doc.text('APPROVED & COVERED', 105, 58 + PDF_LOGO_STRIP_HEIGHT, { align: 'center', angle: 18 });
  }

  // Section: Beneficiary & Coverage Identification (nouveaux libellés, maquette fournie)
  const infoY = 40 + PDF_LOGO_STRIP_HEIGHT;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(14, infoY, 196, infoY);

  const infoRow = (label: string, leftVal: string, rightLabel: string, rightVal: string, y: number) => {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(label.toUpperCase(), 14, y);
    doc.text(rightLabel.toUpperCase(), 105, y);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(leftVal || 'N/A', 14, y + 5);
    doc.text(rightVal || 'N/A', 105, y + 5);
  };

  infoRow('Beneficiary Name', invoice.patientName, 'Healthcare Facility', invoice.provider, infoY + 8);
  infoRow('HealthPass Card No.', invoice.cardNo || invoice.patientPolicyNumber || 'N/A', 'Date of Service', invoice.serviceDate, infoY + 22);
  infoRow('Organization', invoice.organization, 'Prescriber / Practitioner', invoice.prescribingDoctor || 'Medical Staff', infoY + 36);

  const infoEndY = infoY + 46;

  // Section: Medical Benefits Coverage Breakdown (une ligne par acte médical)
  doc.setTextColor(10, 46, 107);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Medical Benefits Coverage Breakdown', 14, infoEndY);

  const breakdownRows = getBreakdownRows(invoice);

  autoTable(doc, {
    startY: infoEndY + 4,
    theme: 'striped',
    head: [[
      'Act / Service Description',
      'Category',
      'Billed Amount',
      'Covered Amount',
    ]],
    body: breakdownRows.map((row) => [
      row.description,
      row.category,
      formatCurrency(row.billed),
      formatCurrency(row.covered),
    ]),
    headStyles: {
      fillColor: [0, 168, 89], // #00A859
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold' },
      1: { halign: 'left' },
      2: { halign: 'right' },
      3: { halign: 'right', fontStyle: 'bold', textColor: [13, 63, 143] },
    },
    styles: { fontSize: 9 },
  });

  const finalY2 = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY : 120;
  const totalCovered = breakdownRows.reduce((sum, row) => sum + row.covered, 0);

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
  doc.text(formatCurrency(totalCovered), 190, finalY2 + 20, { align: 'right' });

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
          /* === AMELIORATION AJOUTEE : cachet "APPROVED & COVERED" (maquette fournie par
             l'utilisateur), superpose en filigrane sur l'en-tete + le bloc d'identification du
             bordereau. Portee volontairement limitee a .voucher-top (pas toute la carte, dont
             la hauteur varie avec le nombre de lignes du tableau d'actes medicaux) pour que le
             cachet reste toujours centre sur cette zone, quel que soit le contenu en dessous. */
          .voucher-card {
            position: relative;
          }
          .voucher-top {
            position: relative;
          }
          .watermark {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-18deg);
            border: 4px solid rgba(0, 168, 89, 0.25);
            color: rgba(0, 168, 89, 0.25);
            font-weight: 900;
            font-size: 28px;
            letter-spacing: 2px;
            text-transform: uppercase;
            padding: 8px 20px;
            border-radius: 10px;
            white-space: nowrap;
            pointer-events: none;
            z-index: 0;
          }
          .voucher-top > *:not(.watermark) {
            position: relative;
            z-index: 1;
          }
        </style>
      </head>
      <body>
        <div class="voucher-card">
          <div class="voucher-top">
            ${isSlipApproved(invoice) ? '<div class="watermark">Approved &amp; Covered</div>' : ''}

            <div class="header">
              <div>
                <h1 class="brand-title">ACTIVA <span>HealthPass</span></h1>
                <div class="brand-tagline">Health • Safety • Serenity — Healthcare Insurance</div>
              </div>
              <div class="doc-badge">
                <h2>Settlement Slip &amp; Direct Billing Voucher</h2>
                <div class="ref">Voucher Reference: ${invoice.reference}</div>
                <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
                  Claim Ref: ${getSlipClaimRef(invoice)}
                </div>
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
              <h4>Beneficiary Details</h4>
              <div class="info-row">
                <span class="info-label">Beneficiary Name :</span>
                <span class="info-val">${invoice.patientName}</span>
              </div>
              <div class="info-row">
                <span class="info-label">HealthPass Card No. :</span>
                <span class="info-val">${invoice.cardNo || invoice.patientPolicyNumber || 'N/A'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Organization :</span>
                <span class="info-val">${invoice.organization}</span>
              </div>
            </div>

            <!-- Healthcare Provider Information -->
            <div class="info-card">
              <h4>Healthcare Facility</h4>
              <div class="info-row">
                <span class="info-label">Healthcare Facility :</span>
                <span class="info-val">${invoice.provider}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Date of Service :</span>
                <span class="info-val">${invoice.serviceDate}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Prescriber / Practitioner :</span>
                <span class="info-val">${invoice.prescribingDoctor || 'Medical Staff'}</span>
              </div>
            </div>
            </div>
          </div>

          <div class="table-container">
            <h4 style="margin: 0 0 10px 0; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #0a2e6b; letter-spacing: 0.5px;">
              Medical Benefits Coverage Breakdown
            </h4>
            <table>
              <thead>
                <tr>
                  <th>Act / Service Description</th>
                  <th>Category</th>
                  <th style="text-align: right;">Billed Amount</th>
                  <th style="text-align: right;">Covered Amount</th>
                </tr>
              </thead>
              <tbody>
                ${getBreakdownRows(invoice)
                  .map(
                    (row) => `
                <tr>
                  <td style="font-weight: 700; color: #0a2e6b;">${row.description}</td>
                  <td>${row.category}</td>
                  <td style="text-align: right; font-weight: 600;">${formatCurrency(row.billed)}</td>
                  <td style="text-align: right; font-weight: 800; color: #00A859;">${formatCurrency(row.covered)}</td>
                </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>

          <div class="amount-highlight">
            <div>
              <div class="label">Total Net Payable by ACTIVA (${invoice.coveragePercentage}%)</div>
              <div class="sub">Guaranteed payment under ACTIVA HealthPass convention terms</div>
            </div>
            <div class="value">${formatCurrency(getBreakdownRows(invoice).reduce((sum, row) => sum + row.covered, 0))}</div>
          </div>
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

  // === AMÉLIORATION AJOUTÉE : "Imprimer" ne doit plus déclencher un téléchargement du fichier.
  // Auparavant, downloadBordereauPDF() était systématiquement appelé "as an infallible guarantee",
  // ce qui téléchargeait le PDF à chaque clic sur Imprimer, en plus de l'aperçu d'impression.
  // Le téléchargement reste disponible via le bouton "Download" dédié (downloadBordereauPDF),
  // qui n'est plus appelé ici — seul l'aperçu/dialogue d'impression natif du navigateur est ouvert.
  // Le PDF (downloadBordereauPDF) n'est utilisé qu'en tout dernier recours si l'impression HTML
  // native échoue complètement (popup ET iframe bloqués), pour ne jamais laisser l'utilisateur
  // sans rien du tout.

  // Attempt native browser print via popup or iframe
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
          // Handled by PDF fallback below
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
          console.warn('Iframe print blocked by sandbox, falling back to PDF download', e);
          // Last-resort fallback only: both popup and iframe print failed.
          downloadBordereauPDF(invoice, lang);
        } finally {
          setTimeout(() => {
            if (document.body.contains(printWindow)) {
              document.body.removeChild(printWindow);
            }
          }, 2000);
        }
      }, 350);
      return;
    }
  } catch (e) {
    console.warn('Iframe print error, falling back to PDF download', e);
  }

  // Both popup and iframe print attempts failed outright (blocked or unsupported):
  // fall back to the PDF download as a last resort so the user isn't left with nothing.
  downloadBordereauPDF(invoice, lang);
}
