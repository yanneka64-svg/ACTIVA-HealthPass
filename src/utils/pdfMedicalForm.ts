import jsPDF from 'jspdf';
import { MedicalForm } from '../types';
import { drawPdfLogoStrip, drawRefinedHeaderTitle, PDF_LOGO_STRIP_HEIGHT } from './pdfBranding';

export const generateMedicalFormPDF = (form: MedicalForm) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm

  // Header Background bar
  doc.setFillColor(10, 46, 107); // ACTIVA Blue #0a2e6b
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Green accent stripe
  doc.setFillColor(0, 168, 89); // ACTIVA Green #00A859
  doc.rect(0, 28, pageWidth, 3, 'F');

  // Header Title
  // === AMÉLIORATION AJOUTÉE : léger espacement des lettres (setCharSpace via
  // drawRefinedHeaderTitle) sur le titre principal pour un rendu plus soigné/typographié
  // qu'une capitale grasse compacte par défaut.
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  drawRefinedHeaderTitle(doc, 'ACTIVA HealthPass', 14, 12, { charSpace: 0.2 });

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  drawRefinedHeaderTitle(doc, 'HEALTHCARE AUTHORIZATION & MEDICAL PRESCRIPTION VOUCHER', 14, 18);
  doc.setFontSize(7.5);
  doc.text('Direct-Billing Healthcare Network • Official ACTIVA Insurance Document', 14, 23);

  // Security Badge Top Right
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Security No: ${form.securityNumber}`, pageWidth - 14, 11, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Issue Date: ${form.issueDate}`, pageWidth - 14, 17, { align: 'right' });
  doc.text(`Status: VALIDATED / ACTIVE`, pageWidth - 14, 23, { align: 'right' });

  // Reset text color
  doc.setTextColor(30, 41, 59);

  // === AMÉLIORATION AJOUTÉE : bandeau logos ACTIVA + Globus sous le bandeau de couleur
  // existant (aucune ligne de texte positionnée en dur ci-dessus n'a été déplacée) — voir
  // pdfBranding.ts. Le curseur vertical qui alimente le reste du document est décalé
  // d'autant (38 -> 38 + PDF_LOGO_STRIP_HEIGHT).
  drawPdfLogoStrip(doc, pageWidth, 31);

  let currentY = 38 + PDF_LOGO_STRIP_HEIGHT;

  // 1. SECTION: BENEFICIARY & COVERAGE IDENTIFICATION
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, currentY, pageWidth - 28, 36, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, pageWidth - 28, 36, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(10, 46, 107);
  drawRefinedHeaderTitle(doc, '1. BENEFICIARY IDENTIFICATION & COVERAGE MODALITIES', 18, currentY + 6, { charSpace: 0.15 });

  doc.setTextColor(51, 65, 85);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Insured Full Name :', 18, currentY + 14);
  doc.setFont('helvetica', 'bold');
  doc.text(form.memberName || 'N/A', 65, currentY + 14);

  doc.setFont('helvetica', 'normal');
  doc.text('Health Card Number :', 18, currentY + 20);
  doc.setFont('helvetica', 'bold');
  doc.text(form.memberCardNo || 'N/A', 65, currentY + 20);

  doc.setFont('helvetica', 'normal');
  doc.text('Organization / Sponsor :', 18, currentY + 26);
  doc.setFont('helvetica', 'bold');
  doc.text(form.organization || 'N/A', 65, currentY + 26);

  // Right column: Outpatient / Inpatient & Balance
  doc.setFont('helvetica', 'normal');
  doc.text('Treatment Scope :', 120, currentY + 14);
  doc.setFont('helvetica', 'bold');
  const isOutpatient = form.coverageType === 'Outpatient';
  if (isOutpatient) {
    doc.setTextColor(10, 46, 107);
    doc.text('OUTPATIENT CARE', 155, currentY + 14);
  } else {
    doc.setTextColor(0, 168, 89);
    doc.text('INPATIENT ADMISSION', 155, currentY + 14);
  }

  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.text('Available Balance :', 120, currentY + 20);
  doc.setFont('helvetica', 'bold');
  const bal = isOutpatient ? form.outpatientBalanceUSD : form.inpatientBalanceUSD;
  doc.text(`$${bal ?? 600} USD`, 155, currentY + 20);

  doc.setFont('helvetica', 'normal');
  doc.text('Voucher Validity :', 120, currentY + 26);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(10, 46, 107);
  doc.text('48 Hours (Standard Term)', 155, currentY + 26);

  currentY += 41;

  // 2. SECTION: HEALTHCARE PROVIDER & PRACTITIONER DETAILS
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, currentY, pageWidth - 28, 28, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, pageWidth - 28, 28, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(10, 46, 107);
  drawRefinedHeaderTitle(doc, '2. HEALTHCARE PROVIDER & CONSULTATION TYPE', 18, currentY + 6, { charSpace: 0.15 });

  doc.setTextColor(51, 65, 85);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Facility / Hospital :', 18, currentY + 14);
  doc.setFont('helvetica', 'bold');
  doc.text(form.providerName || 'N/A', 58, currentY + 14);

  doc.setFont('helvetica', 'normal');
  doc.text('Attending Physician :', 18, currentY + 21);
  doc.setFont('helvetica', 'bold');
  doc.text(form.doctorName || 'Dr. _______________________', 58, currentY + 21);

  // Practitioner Type: Generalist or Specialist
  doc.setFont('helvetica', 'normal');
  doc.text('Consultation Type :', 120, currentY + 14);
  doc.setFont('helvetica', 'bold');
  const isSpecialist = form.practitionerType === 'Specialist' || form.practitionerType === 'Spécialiste';
  if (isSpecialist) {
    doc.setTextColor(10, 46, 107);
    const specLabel = form.doctorSpecialty ? `SPECIALIST (${form.doctorSpecialty.toUpperCase()})` : 'SPECIALIST PHYSICIAN';
    doc.text(specLabel, 155, currentY + 14);
  } else {
    doc.setTextColor(10, 46, 107);
    doc.text('GENERAL PRACTITIONER', 155, currentY + 14);
  }

  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.text('Direct-Billing Status :', 120, currentY + 21);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 168, 89);
  doc.text('Active & Verified Network', 155, currentY + 21);

  currentY += 33;

  // 3. SECTION: MEDICAL DIAGNOSIS & PRESCRIPTIONS (PHYSICIAN SECTION)
  doc.setDrawColor(10, 46, 107);
  doc.setLineWidth(0.4);
  // === AMÉLIORATION AJOUTÉE : box height reduced 98→88 (reclaims unused bottom padding) to
  // offset the +PDF_LOGO_STRIP_HEIGHT added earlier, keeping the document within the A4 page.
  doc.roundedRect(14, currentY, pageWidth - 28, 88, 2, 2, 'S');

  doc.setFillColor(10, 46, 107);
  doc.rect(14, currentY, pageWidth - 28, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  drawRefinedHeaderTitle(doc, '3. PHYSICIAN FRAMEWORK — MEDICAL DIAGNOSIS & PRESCRIPTION ORDERS', 18, currentY + 5.5, { charSpace: 0.15 });

  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);

  // DIAGNOSIS
  doc.text('A. MEDICAL DIAGNOSIS / CHIEF COMPLAINT :', 18, currentY + 14);
  doc.setFont('helvetica', 'normal');
  if (form.doctorPrescription?.presumedDiagnosis) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(form.doctorPrescription.presumedDiagnosis, 18, currentY + 20);
    doc.setTextColor(51, 65, 85);
  } else {
    doc.text('__________________________________________________________________________________________________', 18, currentY + 20);
  }
  doc.text('__________________________________________________________________________________________________', 18, currentY + 26);

  // Diagnostic exams
  doc.setFont('helvetica', 'bold');
  doc.text('B. Prescribed Diagnostic Tests (Lab Bloodwork, Radiology, Ultrasound, ECG...) :', 18, currentY + 34);
  doc.setFont('helvetica', 'normal');
  if (form.doctorPrescription?.requestedExams) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(form.doctorPrescription.requestedExams, 18, currentY + 40);
    doc.setTextColor(51, 65, 85);
  } else {
    doc.text('__________________________________________________________________________________________________', 18, currentY + 40);
  }
  doc.text('__________________________________________________________________________________________________', 18, currentY + 46);

  // Prescriptions & Treatments
  doc.setFont('helvetica', 'bold');
  doc.text('C. Prescribed Treatment & Medical Orders :', 18, currentY + 54);
  doc.setFont('helvetica', 'normal');
  if (form.doctorPrescription?.treatmentOrder) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(form.doctorPrescription.treatmentOrder, 18, currentY + 60);
    doc.setTextColor(51, 65, 85);
    doc.text('2. _______________________________________________________________________________________________', 18, currentY + 66);
    doc.text('3. _______________________________________________________________________________________________', 18, currentY + 72);
  } else {
    doc.text('1. _______________________________________________________________________________________________', 18, currentY + 60);
    doc.text('2. _______________________________________________________________________________________________', 18, currentY + 66);
    doc.text('3. _______________________________________________________________________________________________', 18, currentY + 72);
  }
  doc.text('4. _______________________________________________________________________________________________', 18, currentY + 78);
  doc.text('5. _______________________________________________________________________________________________', 18, currentY + 84);

  currentY += 94;

  // 4. SIGNATURES (INSURED & DOCTOR)
  const sigBoxWidth = (pageWidth - 33) / 2;
  const sigBoxHeight = 40;

  // Insured Signature Box
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, sigBoxWidth, sigBoxHeight, 2, 2, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(10, 46, 107);
  doc.text('PATIENT / INSURED SIGNATURE', 18, currentY + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Confirmed and agreed for medical care received.', 18, currentY + 11);
  doc.text('Date: ____/____/2026', 18, currentY + 35);

  // Doctor Signature Box
  doc.setDrawColor(10, 46, 107);
  doc.roundedRect(14 + sigBoxWidth + 5, currentY, sigBoxWidth, sigBoxHeight, 2, 2, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(10, 46, 107);
  doc.text('PHYSICIAN SIGNATURE & STAMP', 14 + sigBoxWidth + 9, currentY + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Official stamp of practitioner / healthcare facility required.', 14 + sigBoxWidth + 9, currentY + 11);
  doc.text('Doctor Name: ______________________', 14 + sigBoxWidth + 9, currentY + 16);
  doc.text('Date: ____/____/2026', 14 + sigBoxWidth + 9, currentY + 35);

  currentY += sigBoxHeight + 5;

  // 5. BARCODE & SECURITY
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, currentY, pageWidth - 28, 14, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, currentY, pageWidth - 28, 14, 2, 2, 'S');

  // Draw simulated barcode lines
  doc.setFillColor(15, 23, 42);
  let barX = 22;
  const barY = currentY + 3;
  const barWidths = [1.2, 0.4, 0.8, 1.5, 0.4, 1.0, 0.4, 1.2, 0.6, 1.4, 0.4, 1.0, 0.8, 1.2, 0.4, 1.5, 0.6, 0.8, 1.2, 0.4, 1.0, 1.4, 0.4, 0.8, 1.2, 0.5, 1.5, 0.4, 0.8, 1.0];
  
  barWidths.forEach((w) => {
    doc.rect(barX, barY, w, 6, 'F');
    barX += w + 0.8;
  });

  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`* ${form.securityNumber} *`, 85, currentY + 7.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Secure & Authenticated Security Code — GROUPE ACTIVA ASSURANCES', 85, currentY + 11.5);

  currentY += 17;

  // 6. MANDATORY RETURN BANNER
  doc.setFillColor(254, 242, 242);
  doc.roundedRect(14, currentY, pageWidth - 28, 12, 2, 2, 'F');
  doc.setDrawColor(225, 29, 72);
  doc.setLineWidth(0.6);
  doc.roundedRect(14, currentY, pageWidth - 28, 12, 2, 2, 'S');

  doc.setTextColor(190, 18, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(
    'MANDATORY NOTICE: THIS FORM MUST BE RETURNED TO THE MEDICAL AGENT AFTER SIGNATURE',
    pageWidth / 2,
    currentY + 5,
    { align: 'center' }
  );
  doc.setFontSize(7.5);
  doc.text(
    'FOR COMPLETION OF HEALTHCARE AUTHORIZATION AND DIRECT-BILLING DISBURSEMENT.',
    pageWidth / 2,
    currentY + 9.5,
    { align: 'center' }
  );

  return doc;
};
