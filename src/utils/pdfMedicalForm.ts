import jsPDF from 'jspdf';
import { MedicalForm } from '../types';

export const generateMedicalFormPDF = (form: MedicalForm) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm

  // Header Background bar - ACTIVA Blue #0A347B
  doc.setFillColor(10, 52, 123);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Emerald green accent stripe #00A859
  doc.setFillColor(0, 168, 89);
  doc.rect(0, 28, pageWidth, 2.5, 'F');

  // Header Title - Refined Typography
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('ACTIVA HealthPass', 14, 11);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 245, 230);
  doc.text('HEALTHCARE AUTHORIZATION & MEDICAL PRESCRIPTION VOUCHER', 14, 17);
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 220, 255);
  doc.text('Direct-Billing Healthcare Network • Official ACTIVA Insurance Document', 14, 22);

  // Security Badge Top Right
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.setFont('courier', 'bold');
  doc.text(`Security No: ${form.securityNumber}`, pageWidth - 14, 10.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Issue Date: ${form.issueDate}`, pageWidth - 14, 16, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(110, 231, 183); // emerald 300
  doc.text(`STATUS: VALIDATED / ACTIVE`, pageWidth - 14, 22, { align: 'right' });

  // Reset text color
  doc.setTextColor(30, 41, 59);

  let currentY = 37;

  // 1. SECTION: BENEFICIARY & COVERAGE IDENTIFICATION
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, currentY, pageWidth - 28, 36, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, pageWidth - 28, 36, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(10, 52, 123);
  doc.text('1. BENEFICIARY IDENTIFICATION & COVERAGE MODALITIES', 18, currentY + 6);

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

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text('Available Balance :', 120, currentY + 20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 168, 89);
  const bal = isOutpatient ? form.outpatientBalanceUSD : form.inpatientBalanceUSD;
  doc.text(`$${bal ?? 600} USD`, 155, currentY + 20);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text('Voucher Validity :', 120, currentY + 26);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(10, 52, 123);
  doc.text('48 Hours (Standard Term)', 155, currentY + 26);

  currentY += 41;

  // 2. SECTION: HEALTHCARE PROVIDER & PRACTITIONER DETAILS
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, currentY, pageWidth - 28, 28, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, pageWidth - 28, 28, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(10, 52, 123);
  doc.text('2. HEALTHCARE PROVIDER & CONSULTATION TYPE', 18, currentY + 6);

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Facility / Hospital :', 18, currentY + 14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(form.providerName || 'N/A', 55, currentY + 14);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text('Attending Physician :', 18, currentY + 21);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(form.doctorName || 'Dr. _______________________', 55, currentY + 21);

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
  doc.setFontSize(8.5);
  doc.text('3. PHYSICIAN FRAMEWORK — MEDICAL DIAGNOSIS & PRESCRIPTION ORDERS', 18, currentY + 5);

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
  doc.setFillColor(254, 242, 242);
  doc.roundedRect(14, currentY, pageWidth - 28, 11, 2, 2, 'F');
  doc.setDrawColor(225, 29, 72);
  doc.setLineWidth(0.5);
  doc.roundedRect(14, currentY, pageWidth - 28, 11, 2, 2, 'S');

  doc.setTextColor(190, 18, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(
    'MANDATORY NOTICE: THIS FORM MUST BE RETURNED TO THE MEDICAL AGENT AFTER SIGNATURE',
    pageWidth / 2,
    currentY + 4.5,
    { align: 'center' }
  );
  doc.setFontSize(7);
  doc.text(
    'FOR COMPLETION OF HEALTHCARE AUTHORIZATION AND DIRECT-BILLING DISBURSEMENT.',
    pageWidth / 2,
    currentY + 8.5,
    { align: 'center' }
  );

  return doc;
};
