import jsPDF from 'jspdf';
import { MedicalForm } from '../types';
import { drawRefinedHeaderTitle } from './pdfBranding';
// === AMÉLIORATION AJOUTÉE : restauration du logo Activa (blanc) directement sur le bandeau
// d'en-tête, et logo Globus (réseau partenaire) en pied de page, sur demande explicite.
import { ACTIVA_LOGO_WHITE_BASE64, ACTIVA_LOGO_ASPECT, GLOBUS_LOGO_BASE64, GLOBUS_LOGO_ASPECT } from '../assets/logos';

export const generateMedicalFormPDF = (form: MedicalForm) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm

  // Header Background bar - ACTIVA Blue #0A347B
  doc.setFillColor(10, 52, 123);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Emerald green accent stripe #00A859
  doc.setFillColor(0, 168, 89);
  doc.rect(0, 28, pageWidth, 2.5, 'F');

  // Header Title
  // === AMÉLIORATION AJOUTÉE : restauration du logo Activa (blanc, silhouette) posé directement
  // sur le bandeau navy, à la place de la mention texte "ACTIVA HealthPass", tel qu'il existait
  // avant et sur demande explicite.
  const activaLogoHeight = 9.5;
  const activaLogoWidth = activaLogoHeight * ACTIVA_LOGO_ASPECT;
  doc.addImage(ACTIVA_LOGO_WHITE_BASE64, 'PNG', 14, 4, activaLogoWidth, activaLogoHeight);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  drawRefinedHeaderTitle(doc, 'HEALTHCARE AUTHORIZATION & MEDICAL PRESCRIPTION VOUCHER', 14, 18);
  doc.setFontSize(7.5);
  doc.text('Direct-Billing Healthcare Network • Official ACTIVA Insurance Document', 14, 23);

  // Badge Top Right
  // === AMÉLIORATION AJOUTÉE : sur demande explicite, seul le mot "Security" est retiré du
  // libellé — le numéro lui-même reste affiché, désormais sous la mention "N°" (au lieu de
  // "Security No:"). Issue Date / Status inchangés, la ligne reprend sa place d'origine.
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.setFont('courier', 'bold');
  doc.text(`N° ${form.securityNumber}`, pageWidth - 14, 10.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Issue Date: ${form.issueDate}`, pageWidth - 14, 16, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(110, 231, 183); // emerald 300
  doc.text(`STATUS: VALIDATED / ACTIVE`, pageWidth - 14, 22, { align: 'right' });

  // Reset text color
  doc.setTextColor(30, 41, 59);

  // === AMÉLIORATION AJOUTÉE : bandeau "IN PARTNERSHIP WITH" + logo Globus retiré (sur demande
  // explicite) — le logo Activa est déjà visible directement sur le bandeau de couleur
  // ci-dessus, ce bandeau supplémentaire ne correspondait plus au document attendu.
  let currentY = 38;

  // 1. SECTION: BENEFICIARY & COVERAGE IDENTIFICATION
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, currentY, pageWidth - 28, 36, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, pageWidth - 28, 36, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(10, 46, 107);
  drawRefinedHeaderTitle(doc, '1. BENEFICIARY IDENTIFICATION & COVERAGE MODALITIES', 18, currentY + 6, { charSpace: 0.15 });

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Insured Full Name :', 18, currentY + 14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(form.memberName || 'N/A', 60, currentY + 14);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text('Health Card Number :', 18, currentY + 20);
  doc.setFont('courier', 'bold');
  doc.setTextColor(10, 52, 123);
  doc.text(form.memberCardNo || 'N/A', 60, currentY + 20);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text('Organization / Sponsor :', 18, currentY + 26);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(form.organization || 'N/A', 60, currentY + 26);

  // Right column: Outpatient / Inpatient & Balance
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text('Treatment Scope :', 120, currentY + 14);
  doc.setFont('helvetica', 'bold');
  const isOutpatient = form.coverageType === 'Outpatient';
  if (isOutpatient) {
    doc.setTextColor(10, 52, 123);
    doc.text('OUTPATIENT CARE', 155, currentY + 14);
  } else {
    doc.setTextColor(0, 168, 89);
    doc.text('INPATIENT ADMISSION', 155, currentY + 14);
  }

  // === AMÉLIORATION AJOUTÉE : "Available Balance" retiré et remplacé par la date de naissance
  // de l'assuré, et ajout du sexe (Gender), sur demande explicite — "Voucher Validity" reste
  // inchangé, simplement décalé pour laisser la place à la ligne "Gender" supplémentaire (4
  // lignes sur cette colonne au lieu de 3, espacées de 5mm au lieu de 6mm ; la hauteur de
  // l'encadré ne change pas).
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text('Date of Birth :', 120, currentY + 19);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(form.memberBirthDate || 'N/A', 155, currentY + 19);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text('Gender :', 120, currentY + 24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  const genderLabel = form.memberGender === 'F' ? 'Female' : form.memberGender === 'M' ? 'Male' : 'N/A';
  doc.text(genderLabel, 155, currentY + 24);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text('Voucher Validity :', 120, currentY + 29);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(10, 52, 123);
  doc.text('48 Hours (Standard Term)', 155, currentY + 29);

  currentY += 41;

  // 2. SECTION: HEALTHCARE PROVIDER & PRACTITIONER DETAILS
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, currentY, pageWidth - 28, 28, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, pageWidth - 28, 28, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(10, 46, 107);
  drawRefinedHeaderTitle(doc, '2. HEALTHCARE PROVIDER & CONSULTATION TYPE', 18, currentY + 6, { charSpace: 0.15 });

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Facility / Hospital :', 18, currentY + 14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(form.providerName || 'N/A', 55, currentY + 14);

  // === AMÉLIORATION AJOUTÉE : sur demande explicite, la mention "Dr. General Practitioner"
  // (ou tout autre repli fictif) n'est plus imprimée quand aucun nom n'a été saisi — l'espace
  // reste entièrement vierge, réservé à l'identification manuscrite du médecin traitant. Le
  // nom reste imprimé normalement si l'agent (ou le praticien spécialiste) en a renseigné un.
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text('Attending Physician :', 18, currentY + 21);
  if (form.doctorName) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(form.doctorName, 55, currentY + 21);
  }

  // Practitioner Type: Generalist or Specialist
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text('Consultation Type :', 120, currentY + 14);
  doc.setFont('helvetica', 'bold');
  const isSpecialist = form.practitionerType === 'Specialist' || form.practitionerType === 'Spécialiste';
  if (isSpecialist) {
    doc.setTextColor(124, 58, 237); // purple
    const specLabel = form.doctorSpecialty ? `SPECIALIST (${form.doctorSpecialty.toUpperCase()})` : 'SPECIALIST PHYSICIAN';
    doc.text(specLabel, 155, currentY + 14);
  } else {
    doc.setTextColor(10, 52, 123);
    doc.text('GENERAL PRACTITIONER', 155, currentY + 14);
  }

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text('Direct-Billing Status :', 120, currentY + 21);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 168, 89);
  doc.text('Active & Verified Network', 155, currentY + 21);

  currentY += 33;

  // 3. SECTION: MEDICAL DIAGNOSIS & PRESCRIPTIONS (PHYSICIAN SECTION)
  doc.setDrawColor(10, 52, 123);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, currentY, pageWidth - 28, 98, 2, 2, 'S');

  doc.setFillColor(10, 52, 123);
  doc.rect(14, currentY, pageWidth - 28, 7.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  drawRefinedHeaderTitle(doc, '3. PHYSICIAN FRAMEWORK — MEDICAL DIAGNOSIS & PRESCRIPTION ORDERS', 18, currentY + 5.5, { charSpace: 0.15 });

  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);

  // DIAGNOSIS
  doc.text('A. MEDICAL DIAGNOSIS / CHIEF COMPLAINT :', 18, currentY + 13.5);
  doc.setFont('helvetica', 'normal');
  if (form.doctorPrescription?.presumedDiagnosis) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(form.doctorPrescription.presumedDiagnosis, 18, currentY + 19.5);
    doc.setTextColor(71, 85, 105);
  } else {
    doc.text('__________________________________________________________________________________________________', 18, currentY + 19.5);
  }
  doc.text('__________________________________________________________________________________________________', 18, currentY + 25.5);

  // Diagnostic exams
  doc.setFont('helvetica', 'bold');
  doc.text('B. Prescribed Diagnostic Tests (Lab Bloodwork, Radiology, Ultrasound, ECG...) :', 18, currentY + 33.5);
  doc.setFont('helvetica', 'normal');
  if (form.doctorPrescription?.requestedExams) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(form.doctorPrescription.requestedExams, 18, currentY + 39.5);
    doc.setTextColor(71, 85, 105);
  } else {
    doc.text('__________________________________________________________________________________________________', 18, currentY + 39.5);
  }
  doc.text('__________________________________________________________________________________________________', 18, currentY + 45.5);

  // Prescriptions & Treatments
  doc.setFont('helvetica', 'bold');
  doc.text('C. Prescribed Treatment & Medical Orders :', 18, currentY + 53.5);
  doc.setFont('helvetica', 'normal');
  if (form.doctorPrescription?.treatmentOrder) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(form.doctorPrescription.treatmentOrder, 18, currentY + 59.5);
    doc.setTextColor(71, 85, 105);
    doc.text('2. _______________________________________________________________________________________________', 18, currentY + 65.5);
    doc.text('3. _______________________________________________________________________________________________', 18, currentY + 71.5);
  } else {
    doc.text('1. _______________________________________________________________________________________________', 18, currentY + 59.5);
    doc.text('2. _______________________________________________________________________________________________', 18, currentY + 65.5);
    doc.text('3. _______________________________________________________________________________________________', 18, currentY + 71.5);
  }
  doc.text('4. _______________________________________________________________________________________________', 18, currentY + 77.5);
  doc.text('5. _______________________________________________________________________________________________', 18, currentY + 83.5);

  currentY += 104;

  // 4. SIGNATURES (INSURED & DOCTOR)
  const sigBoxWidth = (pageWidth - 33) / 2;
  const sigBoxHeight = 38;

  // Insured Signature Box
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, sigBoxWidth, sigBoxHeight, 2, 2, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(10, 52, 123);
  doc.text('PATIENT / INSURED SIGNATURE', 18, currentY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Confirmed and agreed for medical care received.', 18, currentY + 10.5);
  doc.text('Date: ____/____/2026', 18, currentY + 33);

  // Doctor Signature Box
  doc.setDrawColor(10, 52, 123);
  doc.roundedRect(14 + sigBoxWidth + 5, currentY, sigBoxWidth, sigBoxHeight, 2, 2, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(10, 52, 123);
  doc.text('PHYSICIAN SIGNATURE & STAMP', 14 + sigBoxWidth + 9, currentY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Official stamp of practitioner / healthcare facility required.', 14 + sigBoxWidth + 9, currentY + 10.5);
  doc.text('Doctor Name: ______________________', 14 + sigBoxWidth + 9, currentY + 15.5);
  doc.text('Date: ____/____/2026', 14 + sigBoxWidth + 9, currentY + 33);

  currentY += sigBoxHeight + 4;

  // 5. BARCODE & SECURITY
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, currentY, pageWidth - 28, 13, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, currentY, pageWidth - 28, 13, 2, 2, 'S');

  // Draw simulated barcode lines
  doc.setFillColor(15, 23, 42);
  let barX = 20;
  const barY = currentY + 2.5;
  const barWidths = [1.2, 0.4, 0.8, 1.5, 0.4, 1.0, 0.4, 1.2, 0.6, 1.4, 0.4, 1.0, 0.8, 1.2, 0.4, 1.5, 0.6, 0.8, 1.2, 0.4, 1.0, 1.4, 0.4, 0.8, 1.2, 0.5, 1.5, 0.4, 0.8, 1.0];
  
  barWidths.forEach((w) => {
    doc.rect(barX, barY, w, 5.5, 'F');
    barX += w + 0.7;
  });

  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`* ${form.securityNumber} *`, 82, currentY + 6.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Secure & Authenticated Security Code — GROUPE ACTIVA ASSURANCES', 82, currentY + 10.5);

  currentY += 15.5;

  // 6. MANDATORY RETURN BANNER
  // === AMÉLIORATION AJOUTÉE : bandeau réduit (hauteur 11 → 8.5, police légèrement plus
  // petite) pour laisser la place au logo Globus réinséré juste en dessous, sur demande
  // explicite.
  const mandatoryBannerHeight = 8.5;
  doc.setFillColor(254, 242, 242);
  doc.roundedRect(14, currentY, pageWidth - 28, mandatoryBannerHeight, 2, 2, 'F');
  doc.setDrawColor(225, 29, 72);
  doc.setLineWidth(0.5);
  doc.roundedRect(14, currentY, pageWidth - 28, mandatoryBannerHeight, 2, 2, 'S');

  doc.setTextColor(190, 18, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text(
    'MANDATORY NOTICE: THIS FORM MUST BE RETURNED TO THE MEDICAL AGENT AFTER SIGNATURE',
    pageWidth / 2,
    currentY + 3.5,
    { align: 'center' }
  );
  doc.setFontSize(5.8);
  doc.text(
    'FOR COMPLETION OF HEALTHCARE AUTHORIZATION AND DIRECT-BILLING DISBURSEMENT.',
    pageWidth / 2,
    currentY + 6.7,
    { align: 'center' }
  );

  // === AMÉLIORATION AJOUTÉE : logo Globus réinséré en pied de page (légèrement agrandi),
  // positionné juste sous le bandeau "mandatory notice" désormais réduit, sur demande
  // explicite.
  const globusLogoHeight = 13;
  const globusLogoWidth = globusLogoHeight * GLOBUS_LOGO_ASPECT;
  const globusLogoX = (pageWidth - globusLogoWidth) / 2;
  const mandatoryBannerBottomY = currentY + mandatoryBannerHeight;
  const globusLogoY = Math.min(mandatoryBannerBottomY + 2, pageHeight - globusLogoHeight - 1);
  doc.addImage(GLOBUS_LOGO_BASE64, 'PNG', globusLogoX, globusLogoY, globusLogoWidth, globusLogoHeight);

  return doc;
};
