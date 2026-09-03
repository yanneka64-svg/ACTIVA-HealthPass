import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Member, Organization, Provider, Claim, InvoiceItem, DependentItem, DependentRelationship, HealthPolicy, PolicyPayment, CardNumberPreviewRow } from '../types';
import { drawPdfLogoStrip, drawRefinedHeaderTitle, PDF_LOGO_STRIP_HEIGHT } from './pdfBranding';
import { planCardNumbersForImport } from '../services/cardNumberService';

// Normalization helper: remove accents, lowercase, trim, remove symbols
export function normalizeHeader(header: string): string {
  return (header || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Check if any alias in list matches normalized column name
export function matchHeaderAlias(header: string, aliases: string[]): boolean {
  const norm = normalizeHeader(header);
  return aliases.some(alias => {
    const normAlias = normalizeHeader(alias);
    return norm === normAlias || norm.includes(normAlias) || normAlias.includes(norm);
  });
}

// === AMÉLIORATION AJOUTÉE : sécurité (audit) — protection contre l'injection de formule
// Excel/CSV ("CSV/Formula Injection", OWASP). Une valeur provenant de données saisies par
// un utilisateur (nom d'assuré, nom d'organisation, commentaire de réclamation...) et
// commençant par =, +, -, @ ou une tabulation/retour chariot est interprétée comme une
// FORMULE par Excel/Google Sheets à l'ouverture du fichier exporté, ce qui peut exécuter du
// code externe (ex: `=WEBSERVICE(...)`, `=cmd|'/c calc'!A1`) sur le poste de la personne qui
// ouvre l'export. On neutralise cela en préfixant ces valeurs d'une apostrophe droite (') —
// convention Excel standard pour forcer l'interprétation en texte brut — ce qui n'altère
// jamais une valeur légitime (un nom d'organisation ne commence normalement pas par ces
// caractères) et reste invisible à l'affichage dans la cellule.
function sanitizeExcelCellValue<T>(value: T): T {
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) {
    return (`'${value}` as unknown) as T;
  }
  return value;
}

// Applique sanitizeExcelCellValue() à chaque champ de chaque ligne d'un tableau de données
// juste avant sa conversion en feuille Excel (XLSX.utils.json_to_sheet). Ne modifie ni les
// clés (en-têtes de colonnes) ni la structure des données — uniquement les valeurs texte à
// risque.
function sanitizeRowsForExcel<T extends Record<string, any>>(rows: T[]): T[] {
  return rows.map((row) => {
    const sanitized: Record<string, any> = {};
    for (const key of Object.keys(row)) {
      sanitized[key] = sanitizeExcelCellValue(row[key]);
    }
    return sanitized as T;
  });
}

// Download blob helper
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ================= MEMBER IMPORT =================
const MEMBER_COLUMN_MAPPINGS = {
  cardNo: ['card no', 'card number', 'card id', 'member id', 'matricule', 'no carte', 'numero carte', 'id carte', 'carte'],
  principalName: ['primary insured name', 'primary insured', 'principal name', 'member name', 'insured name', 'full name', 'name', 'assure principal', 'principal', 'nom principal', 'nom et prenom'],
  birthDate: ['date of birth', 'birth date', 'dob', 'birthdate', 'date de naissance', 'naissance'],
  spouseName: ['spouse name', 'spouse', 'partner', 'conjoint', 'nom conjoint', 'epoux', 'epouse'],
  spouseDob: ['spouse date of birth', 'spouse dob', 'spouse birth date', 'date de naissance conjoint', 'dob conjoint'],
  child1Name: ['child 1 name', 'child 1', 'enfant 1', 'nom enfant 1', 'child1'],
  child1Dob: ['child 1 date of birth', 'child 1 dob', 'child1 dob', 'dob child 1', 'date de naissance enfant 1'],
  child2Name: ['child 2 name', 'child 2', 'enfant 2', 'nom enfant 2', 'child2'],
  child2Dob: ['child 2 date of birth', 'child 2 dob', 'child2 dob', 'dob child 2', 'date de naissance enfant 2'],
  child3Name: ['child 3 name', 'child 3', 'enfant 3', 'nom enfant 3', 'child3'],
  child3Dob: ['child 3 date of birth', 'child 3 dob', 'child3 dob', 'dob child 3', 'date de naissance enfant 3'],
  child4Name: ['child 4 name', 'child 4', 'enfant 4', 'nom enfant 4', 'child4'],
  child4Dob: ['child 4 date of birth', 'child 4 dob', 'child4 dob', 'dob child 4', 'date de naissance enfant 4'],
  childrenLegacy: ['children', 'dependents', 'child', 'kids', 'enfants', 'enfant', 'ayants droit'],
  // === AMÉLIORATION AJOUTÉE : le fichier "Staff" réel du client (voir demande utilisateur)
  // utilise une colonne "N° of Dependant" — un simple décompte, pas le détail des ayants
  // droit (celui-ci arrive via le fichier Dépendants séparé). On la reconnaît spécifiquement
  // ici pour ne pas la confondre avec `childrenLegacy` (liste de noms séparés par virgules).
  dependentsCount: ['n of dependant', 'no of dependant', 'nbr of dependant', 'number of dependant', 'number of dependants', 'nb dependant', 'nb dependants', 'nombre de dependants', 'nombre dependants', 'dependant count', 'dependent count', 'nb ayants droit', 'nombre ayants droit'],
  organization: ['organization', 'company', 'employer', 'policy holder', 'organisation', 'entreprise', 'societe', 'police'],
  biometrics: ['biometrics', 'biometrie', 'fingerprint', 'empreinte', 'afis', 'biometric status'],
  relationship: ['relationship', 'family status', 'role', 'lien', 'lien de parente', 'statut familial', 'qualite'],
  status: ['status', 'active status', 'membership status', 'statut', 'etat'],
};

// Dependent-specific Column Mappings (for dedicated dependents template / capture 3)
const DEPENDENT_COLUMN_MAPPINGS = {
  principalCardNo: ['principal card no', 'primary card no', 'parent card no', 'card no principal', 'no carte principal', 'matricule principal'],
  principalName: ['primary insured name', 'primary insured', 'principal name', 'assure principal', 'nom principal'],
  dependentCardNo: ['dependent card no', 'dependent card number', 'card no dependent', 'no carte dependant', 'no carte ayant droit'],
  dependentName: ['dependent name', 'dependent full name', 'full name', 'nom dependant', 'nom ayant droit', 'nom complet'],
  relationship: ['relationship', 'family relation', 'lien', 'lien de parente', 'qualite', 'statut'],
  birthDate: ['date of birth', 'birth date', 'dob', 'date de naissance', 'naissance'],
  gender: ['gender', 'sex', 'sexe', 'genre'],
  organization: ['organization', 'company', 'employer', 'organisation', 'entreprise'],
  biometrics: ['biometrics', 'biometrie', 'fingerprint', 'empreinte'],
};

export interface ImportResult<T> {
  success: boolean;
  created: number;
  updated: number;
  ignored: number;
  missingHeaders: string[];
  errors: string[];
  parsedItems: T[];
  // === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — présent
  // uniquement pour l'import de membres (Capture 2). Prévisualisation obligatoire (section
  // 10) : chaque ligne indique le n° de carte Excel, le n° final calculé, l'action
  // (Conservé/Généré/Aucun) et le statut (Valid/Duplicate/Invalid). Rien n'est réservé tant
  // que l'import n'est pas confirmé — voir cardNumberService.planCardNumbersForImport /
  // commitPlannedCardNumbers et ExcelImportModal.tsx.
  cardNumberPreview?: CardNumberPreviewRow[];
}

// Calculate age from YYYY-MM-DD
function parseAgeFromDob(dob?: string): number | undefined {
  if (!dob) return undefined;
  try {
    const d = new Date(dob);
    if (isNaN(d.getTime())) return undefined;
    const today = new Date(2026, 7, 31);
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) {
      age--;
    }
    return age >= 0 ? age : undefined;
  } catch {
    return undefined;
  }
}

// Format raw Excel date or string into YYYY-MM-DD
function formatExcelDate(val: any): string {
  if (!val) return '';
  if (typeof val === 'number') {
    // Excel serial date format
    const dateObj = XLSX.SSF.parse_date_code(val);
    if (dateObj) {
      const y = dateObj.y;
      const m = String(dateObj.m).padStart(2, '0');
      const d = String(dateObj.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  const str = String(val).trim();
  if (!str) return '';
  // Match standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // Match DD/MM/YYYY or DD-MM-YYYY
  const parts = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
  if (parts) {
    const d = parts[1].padStart(2, '0');
    const m = parts[2].padStart(2, '0');
    const y = parts[3];
    return `${y}-${m}-${d}`;
  }
  return str;
}

export async function parseMemberExcel(
  file: File,
  existingMembers: Member[]
): Promise<ImportResult<Member>> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result;
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];

        // Parse raw rows
        const rawJson: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          resolve({
            success: false,
            created: 0,
            updated: 0,
            ignored: 0,
            missingHeaders: [],
            errors: ['The selected file is empty or unreadable.'],
            parsedItems: [],
          });
          return;
        }

        const headers = Object.keys(rawJson[0]);

        // FIX: Check if this is a dedicated dependents sheet (Capture 3).
        // Was using matchHeaderAlias(), which does a BIDIRECTIONAL substring match
        // (norm.includes(alias) OR alias.includes(norm)) — since every principals-only
        // file (Capture 2) has a "Card No." column, and "card no" is itself a substring of
        // the alias "principal card no" (and "dependent card no" / "parent card no"), EVERY
        // Capture 2 upload was being misclassified as a dependents sheet and then rejected
        // for lacking "Dependent Full Name" — the exact bug reported ("Missing Required
        // Columns: Dependent Full Name" on a principals-only import). Detection now checks
        // for the actual distinguishing words ("dependent", "principal card", "parent
        // card") appearing IN the header, one-directional only — "Card No." alone no longer
        // matches, while genuine Capture 3 headers ("Dependent Card No.", "Dependent Full
        // Name", "Principal Card No.") still do.
        const isDedicatedDependentsSheet = headers.some((h) => {
          const norm = normalizeHeader(h);
          return norm.includes('dependent') || norm.includes('principal card') || norm.includes('parent card');
        });

        if (isDedicatedDependentsSheet) {
          // Process as Dedicated Dependents Sheet (Capture 3)
          return resolve(parseDedicatedDependentsRows(rawJson, headers, existingMembers));
        }

        // Process as Primary Insured Sheet (Capture 2)
        const headerMap: { [key in keyof typeof MEMBER_COLUMN_MAPPINGS]?: string } = {};
        for (const [field, aliases] of Object.entries(MEMBER_COLUMN_MAPPINGS)) {
          const matchedHeader = headers.find(h => matchHeaderAlias(h, aliases));
          if (matchedHeader) {
            headerMap[field as keyof typeof MEMBER_COLUMN_MAPPINGS] = matchedHeader;
          }
        }

        // Required headers validation: cardNo and principalName
        const missingHeaders: string[] = [];
        if (!headerMap.cardNo) missingHeaders.push('Card No.');
        if (!headerMap.principalName) missingHeaders.push('Primary Insured Name');

        if (missingHeaders.length > 0) {
          resolve({
            success: false,
            created: 0,
            updated: 0,
            ignored: 0,
            missingHeaders,
            errors: [`Missing required columns: ${missingHeaders.join(', ')}`],
            parsedItems: [],
          });
          return;
        }

        let created = 0;
        let updated = 0;
        let ignored = 0;
        const updatedList: Member[] = [...existingMembers];

        // === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — sur demande
        // explicite. Pré-passe : détermine, pour chaque ligne portant un nom d'assuré, le
        // numéro de carte final — conservé si déjà présent dans le fichier (après validation
        // du format et vérification qu'il n'est pas déjà attribué à quelqu'un d'autre, en
        // base ou ailleurs dans ce même fichier), généré automatiquement sinon (CASE 2,
        // section 8 — auparavant une ligne sans "Card No." était silencieusement ignorée).
        // Rien n'est réservé en base à ce stade : c'est un calcul en lecture seule (voir
        // planCardNumbersForImport), destiné à alimenter la prévisualisation obligatoire
        // avant import (section 10) — cardNumberPreview ci-dessous. La réservation réelle des
        // numéros a lieu uniquement lorsque l'import est confirmé (voir
        // cardNumberService.commitPlannedCardNumbers, appelé par l'appelant de cette fonction).
        const rowsForPlanning = rawJson
          .map((row, idx) => ({
            idx,
            insuredName: headerMap.principalName ? String(row[headerMap.principalName] || '').trim() : '',
            cardNoRaw: headerMap.cardNo ? String(row[headerMap.cardNo] || '').trim() : '',
            organization: headerMap.organization ? String(row[headerMap.organization] || '').trim() : undefined,
          }))
          .filter((r) => r.insuredName); // une ligne sans nom reste "ignored" comme avant, hors planification

        const { preview: cardNumberPreview, finalCardNumbers } = await planCardNumbersForImport(
          rowsForPlanning.map((r) => ({ insuredName: r.insuredName, cardNoRaw: r.cardNoRaw, organization: r.organization }))
        );
        const finalCardNoByRowIdx = new Map<number, string | null>();
        rowsForPlanning.forEach((r, i) => finalCardNoByRowIdx.set(r.idx, finalCardNumbers[i]));

        for (let rowIdx = 0; rowIdx < rawJson.length; rowIdx++) {
          const row = rawJson[rowIdx];
          const principalVal = String(row[headerMap.principalName!] || '').trim();

          if (!principalVal) {
            ignored++;
            continue;
          }

          const plannedCardNo = finalCardNoByRowIdx.get(rowIdx);
          if (!plannedCardNo) {
            // Invalid format or duplicate (in-file or already in the database) — already
            // reported in cardNumberPreview above; skip creating/updating this row.
            ignored++;
            continue;
          }
          const cardNoVal = plannedCardNo;

          const orgVal = headerMap.organization ? String(row[headerMap.organization] || '').trim() : 'TotalEnergies Liberia Ltd';
          const dobVal = headerMap.birthDate ? formatExcelDate(row[headerMap.birthDate]) : '1985-06-15';
          const statusRaw = headerMap.status ? String(row[headerMap.status] || '').trim().toLowerCase() : 'active';
          const status = (statusRaw.includes('inact') || statusRaw.includes('suspend')) ? (statusRaw.includes('suspend') ? 'Suspendu' : 'Inactif') : 'Actif';
          
          // === AMÉLIORATION AJOUTÉE : lecture de "N° of Dependant" (décompte déclaré) ===
          const dependentsCountRaw = headerMap.dependentsCount ? row[headerMap.dependentsCount] : undefined;
          const dependentsCountParsed = dependentsCountRaw !== undefined && dependentsCountRaw !== ''
            ? Number(dependentsCountRaw)
            : undefined;
          const declaredDependentsCountVal = (dependentsCountParsed !== undefined && !isNaN(dependentsCountParsed))
            ? dependentsCountParsed
            : undefined;

          const biometricsRaw = headerMap.biometrics ? String(row[headerMap.biometrics] || '').trim().toLowerCase() : '';
          const hasBiometrics = biometricsRaw ? !biometricsRaw.includes('no') && !biometricsRaw.includes('non') && !biometricsRaw.includes('false') : true;

          // Extract Spouse & Dependents
          const builtDependents: any[] = [];
          const childrenNames: string[] = [];

          // 1. Spouse
          const spouseVal = headerMap.spouseName ? String(row[headerMap.spouseName] || '').trim() : '';
          const spouseDob = headerMap.spouseDob ? formatExcelDate(row[headerMap.spouseDob]) : '';
          if (spouseVal) {
            const spAge = parseAgeFromDob(spouseDob);
            builtDependents.push({
              id: `dep-${cardNoVal}-sp`,
              cardNo: `${cardNoVal}-SP`,
              fullName: spouseVal,
              birthDate: spouseDob || '1988-04-12',
              age: spAge || 38,
              relationship: 'Spouse',
              gender: 'F',
              hasBiometrics: true,
            });
          }

          // 2. Children 1 to 4 (Capture 2 specific columns)
          const childrenDefs = [
            { nameKey: headerMap.child1Name, dobKey: headerMap.child1Dob, tag: 'C1', gender: 'M' },
            { nameKey: headerMap.child2Name, dobKey: headerMap.child2Dob, tag: 'C2', gender: 'F' },
            { nameKey: headerMap.child3Name, dobKey: headerMap.child3Dob, tag: 'C3', gender: 'M' },
            { nameKey: headerMap.child4Name, dobKey: headerMap.child4Dob, tag: 'C4', gender: 'F' },
          ];

          childrenDefs.forEach((ch, idx) => {
            const cName = ch.nameKey ? String(row[ch.nameKey] || '').trim() : '';
            if (cName) {
              const cDob = ch.dobKey ? formatExcelDate(row[ch.dobKey]) : '';
              const cAge = parseAgeFromDob(cDob);
              childrenNames.push(cName);
              builtDependents.push({
                id: `dep-${cardNoVal}-${ch.tag.toLowerCase()}`,
                cardNo: `${cardNoVal}-${ch.tag}`,
                fullName: cName,
                birthDate: cDob || `${2026 - (10 - idx * 2)}-06-01`,
                age: cAge || (10 - idx * 2),
                relationship: 'Child',
                gender: ch.gender,
                hasBiometrics: (cAge || (10 - idx * 2)) >= 6,
              });
            }
          });

          // 3. Fallback: Legacy comma-separated children
          if (childrenNames.length === 0 && headerMap.childrenLegacy) {
            const rawLegacy = String(row[headerMap.childrenLegacy] || '').trim();
            if (rawLegacy) {
              const items = rawLegacy.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
              items.forEach((childStr, cIdx) => {
                const match = childStr.match(/^(.*?)(?:\s*\((.*?)\))?$/);
                const name = match && match[1] ? match[1].trim() : childStr;
                const ageStr = match && match[2] ? match[2].trim() : undefined;
                const parsedAge = ageStr ? parseInt(ageStr, 10) : undefined;
                childrenNames.push(name);
                builtDependents.push({
                  id: `dep-${cardNoVal}-c${cIdx + 1}`,
                  cardNo: `${cardNoVal}-C${cIdx + 1}`,
                  fullName: name,
                  birthDate: parsedAge ? `${2026 - parsedAge}-06-01` : '2018-09-10',
                  age: parsedAge || 8,
                  relationship: 'Child',
                  gender: cIdx % 2 === 0 ? 'M' : 'F',
                  hasBiometrics: (parsedAge || 8) >= 6,
                });
              });
            }
          }

          const existingIndex = updatedList.findIndex(
            m => m.cardNo.toLowerCase() === cardNoVal.toLowerCase() ||
                 (m.principalName.toLowerCase() === principalVal.toLowerCase() && m.organization.toLowerCase() === orgVal.toLowerCase())
          );

          if (existingIndex >= 0) {
            // Merge into existing member
            const existing = updatedList[existingIndex];
            
            // Merge dependents without duplicates
            const mergedDependents = [...(existing.dependents || [])];
            builtDependents.forEach((newDep) => {
              const idx = mergedDependents.findIndex(d => d.fullName.toLowerCase() === newDep.fullName.toLowerCase() || d.cardNo.toLowerCase() === newDep.cardNo.toLowerCase());
              if (idx >= 0) {
                mergedDependents[idx] = { ...mergedDependents[idx], ...newDep };
              } else {
                mergedDependents.push(newDep);
              }
            });

            const mergedChildren = Array.from(new Set([...(existing.children || []), ...childrenNames]));

            const updatedMember: Member = {
              ...existing,
              principalName: principalVal,
              organization: orgVal,
              birthDate: dobVal || existing.birthDate,
              spouseName: spouseVal || existing.spouseName,
              children: mergedChildren,
              dependents: mergedDependents,
              status: existing.status || (status as any),
              hasBiometrics: hasBiometrics ?? existing.hasBiometrics,
              declaredDependentsCount: declaredDependentsCountVal ?? existing.declaredDependentsCount,
              fingerprintScore: existing.fingerprintScore || 96,
              outpatientBalanceUSD: existing.outpatientBalanceUSD ?? 1000,
              outpatientCeilingUSD: existing.outpatientCeilingUSD ?? 1000,
              inpatientBalanceUSD: existing.inpatientBalanceUSD ?? 10000,
              inpatientCeilingUSD: existing.inpatientCeilingUSD ?? 10000,
            };

            updatedList[existingIndex] = updatedMember;
            updated++;
          } else {
            // Create New Member
            const newMember: Member = {
              id: `mem-imp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              cardNo: cardNoVal,
              principalName: principalVal,
              spouseName: spouseVal || undefined,
              children: childrenNames,
              dependents: builtDependents,
              birthDate: dobVal || '1985-06-15',
              relationship: 'Principal',
              organization: orgVal || 'TotalEnergies Liberia Ltd',
              status: status as any,
              hasPhoto: false,
              hasBiometrics: hasBiometrics,
              declaredDependentsCount: declaredDependentsCountVal,
              fingerprintScore: 97,
              fingerprintDate: new Date().toISOString().split('T')[0],
              outpatientBalanceUSD: 1000,
              outpatientCeilingUSD: 1000,
              inpatientBalanceUSD: 10000,
              inpatientCeilingUSD: 10000,
              gender: 'M',
              createdAt: new Date().toISOString().split('T')[0],
            };

            updatedList.unshift(newMember);
            created++;
          }
        }

        resolve({
          success: true,
          created,
          updated,
          ignored,
          missingHeaders: [],
          errors: [],
          parsedItems: updatedList,
          cardNumberPreview,
        });
      } catch (err: any) {
        resolve({
          success: false,
          created: 0,
          updated: 0,
          ignored: 0,
          missingHeaders: [],
          errors: [`Excel parsing error: ${err.message || 'Corrupted file'}`],
          parsedItems: [],
        });
      }
    };

    reader.onerror = () => {
      resolve({
        success: false,
        created: 0,
        updated: 0,
        ignored: 0,
        missingHeaders: [],
        errors: ['Unable to read the uploaded file.'],
        parsedItems: [],
      });
    };

    reader.readAsArrayBuffer(file);
  });
}

// Parse Dedicated Dependents Rows (Capture 3 Model)
function parseDedicatedDependentsRows(
  rawJson: Record<string, any>[],
  headers: string[],
  existingMembers: Member[]
): ImportResult<Member> {
  const headerMap: { [key in keyof typeof DEPENDENT_COLUMN_MAPPINGS]?: string } = {};
  for (const [field, aliases] of Object.entries(DEPENDENT_COLUMN_MAPPINGS)) {
    const matchedHeader = headers.find(h => matchHeaderAlias(h, aliases));
    if (matchedHeader) {
      headerMap[field as keyof typeof DEPENDENT_COLUMN_MAPPINGS] = matchedHeader;
    }
  }

  const missingHeaders: string[] = [];
  if (!headerMap.principalCardNo && !headerMap.principalName) missingHeaders.push('Principal Card No. or Primary Insured Name');
  if (!headerMap.dependentName) missingHeaders.push('Dependent Full Name');

  if (missingHeaders.length > 0) {
    return {
      success: false,
      created: 0,
      updated: 0,
      ignored: 0,
      missingHeaders,
      errors: [`Missing required columns for Dependents: ${missingHeaders.join(', ')}`],
      parsedItems: [],
    };
  }

  let created = 0;
  let updated = 0;
  let ignored = 0;
  const updatedList: Member[] = [...existingMembers];

  rawJson.forEach((row) => {
    const parentCardVal = headerMap.principalCardNo ? String(row[headerMap.principalCardNo] || '').trim() : '';
    const parentNameVal = headerMap.principalName ? String(row[headerMap.principalName] || '').trim() : '';
    const depCardVal = headerMap.dependentCardNo ? String(row[headerMap.dependentCardNo] || '').trim() : '';
    const depNameVal = headerMap.dependentName ? String(row[headerMap.dependentName] || '').trim() : '';
    const relVal = headerMap.relationship ? String(row[headerMap.relationship] || 'Child').trim() : 'Child';
    const dobVal = headerMap.birthDate ? formatExcelDate(row[headerMap.birthDate]) : '';
    const genderVal = headerMap.gender ? String(row[headerMap.gender] || 'M').trim().toUpperCase() : 'M';
    const orgVal = headerMap.organization ? String(row[headerMap.organization] || '').trim() : '';
    const biometricsRaw = headerMap.biometrics ? String(row[headerMap.biometrics] || '').trim().toLowerCase() : '';
    const hasBiometrics = biometricsRaw ? !biometricsRaw.includes('no') && !biometricsRaw.includes('non') : true;

    if (!depNameVal) {
      ignored++;
      return;
    }

    // Find parent principal
    let parentIndex = -1;
    if (parentCardVal) {
      parentIndex = updatedList.findIndex(m => m.cardNo.toLowerCase() === parentCardVal.toLowerCase());
    }
    if (parentIndex < 0 && parentNameVal) {
      parentIndex = updatedList.findIndex(m => m.principalName.toLowerCase() === parentNameVal.toLowerCase());
    }

    const age = parseAgeFromDob(dobVal);
    const assignedDepCard = depCardVal || (parentCardVal ? `${parentCardVal}-D${Date.now().toString().slice(-3)}` : `DEP-${Date.now().toString().slice(-4)}`);

    const relLower = relVal.toLowerCase();
    const resolvedRel: DependentRelationship = (relLower.includes('conjoint') || relLower.includes('spouse') || relLower.includes('wife') || relLower.includes('husband'))
      ? 'spouse'
      : (relLower.includes('parent') || relLower.includes('pere') || relLower.includes('mere'))
      ? 'parent'
      : 'child';

    const newDepItem: DependentItem = {
      id: `dep-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      cardNo: assignedDepCard,
      fullName: depNameVal,
      birthDate: dobVal || '2015-05-10',
      age: age || 10,
      relationship: resolvedRel,
      gender: (genderVal.startsWith('F') || genderVal.startsWith('W')) ? 'F' : 'M',
      hasBiometrics: hasBiometrics,
    };

    if (parentIndex >= 0) {
      // Attach to existing principal
      const parent = updatedList[parentIndex];
      const existingDeps: DependentItem[] = [...(parent.dependents || [])];
      const matchDepIndex = existingDeps.findIndex(
        d => d.fullName.toLowerCase() === depNameVal.toLowerCase() || (d.cardNo && d.cardNo.toLowerCase() === assignedDepCard.toLowerCase())
      );

      if (matchDepIndex >= 0) {
        existingDeps[matchDepIndex] = { ...existingDeps[matchDepIndex], ...newDepItem };
      } else {
        existingDeps.push(newDepItem);
      }

      const isSpouse = newDepItem.relationship === 'spouse';
      const updatedChildren = isSpouse ? (parent.children || []) : Array.from(new Set([...(parent.children || []), depNameVal]));

      updatedList[parentIndex] = {
        ...parent,
        spouseName: isSpouse ? depNameVal : parent.spouseName,
        children: updatedChildren,
        dependents: existingDeps,
      };
      updated++;
    } else {
      // Create new principal with this dependent attached
      const fallbackCardNo = parentCardVal || `ACT-2026-${Math.floor(10000 + Math.random() * 90000)}`;
      const fallbackPrincipalName = parentNameVal || `Primary of ${depNameVal}`;
      const isSpouse = newDepItem.relationship === 'spouse';

      const newPrincipal: Member = {
        id: `mem-imp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        cardNo: fallbackCardNo,
        principalName: fallbackPrincipalName,
        spouseName: isSpouse ? depNameVal : undefined,
        children: isSpouse ? [] : [depNameVal],
        dependents: [newDepItem],
        birthDate: '1985-01-01',
        relationship: 'Principal',
        organization: orgVal || 'TotalEnergies Liberia Ltd',
        status: 'Actif',
        hasPhoto: false,
        hasBiometrics: true,
        fingerprintScore: 95,
        outpatientBalanceUSD: 1000,
        outpatientCeilingUSD: 1000,
        inpatientBalanceUSD: 10000,
        inpatientCeilingUSD: 10000,
        gender: 'M',
        createdAt: new Date().toISOString().split('T')[0],
      };
      updatedList.unshift(newPrincipal);
      created++;
    }
  });

  return {
    success: true,
    created,
    updated,
    ignored,
    missingHeaders: [],
    errors: [],
    parsedItems: updatedList,
  };
}

// Generate Primary Insured Template (Capture 2 Model)
// === AMÉLIORATION AJOUTÉE : template aligné sur le fichier réel du client ===
// Auparavant ce template proposait des colonnes "Spouse Name/DOB" et "Child 1-4 Name/DOB"
// qui n'existent pas dans les fichiers Excel réellement utilisés en production (ex :
// "Samaritain Purse - Staff.xlsx"). Le fichier réel du client a la structure suivante :
// Card No. | Primary Insured Name | Date of Birth | N° of Dependant | Organization |
// Biometrics | Statut — avec le détail des ayants droit importé séparément via le template
// Dépendants (bouton "Template Dépendants"). Le template ci-dessous reproduit exactement
// cette structure ; parseMemberExcel() (plus haut dans ce fichier) sait déjà lire chacune de
// ces colonnes (cardNo, principalName, birthDate, dependentsCount, organization, biometrics,
// status), donc un fichier rempli à partir de ce template s'intègre correctement dans
// l'application. Les anciennes colonnes Spouse/Child restent reconnues par le parseur si un
// ancien fichier les contient encore (rétrocompatibilité), seul le template téléchargeable
// change.
export function generateMemberTemplateExcel() {
  const wsData = [
    [
      'Card No.',
      'Primary Insured Name',
      'Date of Birth',
      'N° of Dependant',
      'Organization',
      'Biometrics',
      'Statut',
    ],
    [
      'AMID-00001-0001',
      'Samuel DOE',
      '14/05/1985',
      2,
      'Firestone Natural Rubber Co',
      '',
      '',
    ],
    [
      'AMID-00002-0002',
      'Grace KOLLIE',
      '20/11/1992',
      1,
      'ArcelorMittal Mining Liberia',
      '',
      '',
    ],
    [
      'AMID-00003-0003',
      'Alexander FREEMAN',
      '03/07/1980',
      0,
      'TotalEnergies Liberia Ltd',
      '',
      '',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Primary Insured');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([wbout], { type: 'application/octet-stream' }), 'ACTIVA_Template_Assures_Principaux.xlsx');
}

// Generate Dedicated Dependents Template (Capture 3 Model)
export function generateDependentsTemplateExcel() {
  const wsData = [
    [
      'Principal Card No.',
      'Primary Insured Name',
      'Dependent Card No.',
      'Dependent Full Name',
      'Relationship',
      'Date of Birth',
      'Gender',
      'Organization',
      'Biometrics',
    ],
    [
      'ACT-2026-10350',
      'Samuel DOE',
      'ACT-2026-10350-SP',
      'Mary DOE',
      'Spouse',
      '1988-09-22',
      'F',
      'Firestone Natural Rubber Co',
      'Yes',
    ],
    [
      'ACT-2026-10350',
      'Samuel DOE',
      'ACT-2026-10350-C1',
      'Lucas DOE',
      'Child',
      '2014-03-10',
      'M',
      'Firestone Natural Rubber Co',
      'Yes',
    ],
    [
      'ACT-2026-10350',
      'Samuel DOE',
      'ACT-2026-10350-C2',
      'Emma DOE',
      'Child',
      '2017-08-19',
      'F',
      'Firestone Natural Rubber Co',
      'Yes',
    ],
    [
      'ACT-2026-10351',
      'Grace KOLLIE',
      'ACT-2026-10351-SP',
      'Joseph KOLLIE',
      'Spouse',
      '1990-04-15',
      'M',
      'ArcelorMittal Mining Liberia',
      'Yes',
    ],
    [
      'ACT-2026-10351',
      'Grace KOLLIE',
      'ACT-2026-10351-C1',
      'Nathan KOLLIE',
      'Child',
      '2019-06-12',
      'M',
      'ArcelorMittal Mining Liberia',
      'Yes',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dependents');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([wbout], { type: 'application/octet-stream' }), 'ACTIVA_Template_Dependants.xlsx');
}

// ================= ADDED IMPROVEMENT: MULTI-ORGANIZATION IMPORT ("Staff / Deps" workbook) =================
// Dedicated import for the legacy HR workbooks structured like the client's provided file:
// a pair of sheets "<Organization> - Staff" / "<Organization> - Deps" PER employer, instead
// of a single flat sheet. This format is INCOMPATIBLE with parseMemberExcel() above (which
// only reads the 1st sheet and a single organization): parseMemberExcel /
// generateMemberTemplateExcel are therefore left untouched (still available for simple,
// single-sheet imports) — this block adds a second, additional import path.
//
// Matching rules inferred from the client's real file:
// - Sheet "<Org> - Staff": 'Card No.', 'Primary Insured Name', 'Date of Birth', then
//   optionally 'Contact', 'Spouse Name' + 'Spouse Date of Birth', and pairs of
//   'Child N Name' + 'Child N Date of Birth' (N = 1..9). This is the ONLY source of a
//   dependent's name (the spouse's/child's name appears nowhere on the "Deps" sheet).
// - Sheet "<Org> - Deps" (same 7 columns everywhere): 'Card No.' (card OWNED by the
//   dependent), 'Relationship' ('Spouse' or 'Child N' — N matches exactly the 'Child N
//   Name' column on the Staff sheet), 'Date of Birth', 'Primary Insured' (the PRINCIPAL's
//   name, not the dependent's), 'Primary Card No.', 'Organization', 'Biometrics'. This is
//   the ONLY source of each dependent's individual card number — essential for
//   identifying them / processing claims on their behalf.
// - The organization is inferred from the sheet name (everything before " - Staff"/" - Deps").
//
// The result feeds both `dependents[]` (structured, with its own cardNo — used by
// eligibilityService and the Agent search) AND the legacy `spouseName`/`children` fields
// (string "Name (age yrs)", same convention as parseMemberExcel / generateMemberTemplateExcel,
// to stay compatible with the existing display in AgentIdentificationView / MembersView).
// Merges with members already in the database by card number, like parseMemberExcel: a
// re-import of the same file updates rather than duplicates.

const STAFF_SHEET_SUFFIX = /\s*-\s*staff\s*$/i;
const DEPS_SHEET_SUFFIX = /\s*-\s*deps\s*$/i;
const CHILD_NAME_HEADER = /^child\s*(\d+)\s*name$/i;
const CHILD_DOB_HEADER = /^child\s*(\d+)\s*(?:date of birth|dob|birth date)$/i;
const CHILD_RELATIONSHIP_NUMBER = /child\s*(\d+)/i;

// Converts an Excel cell value (JS Date object, Excel serial number, or free text)
// into 'YYYY-MM-DD'. Returns '' if the value is empty/unreadable, letting the caller decide
// on the default value (same logic as parseMemberExcel, which already uses fallbacks).
export function excelCellToISODate(raw: any): string {
  if (raw === undefined || raw === null || raw === '') return '';
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return '';
    return raw.toISOString().split('T')[0];
  }
  if (typeof raw === 'number' && isFinite(raw)) {
    try {
      const parsed = (XLSX as any).SSF?.parse_date_code?.(raw);
      if (parsed && parsed.y) {
        const mm = String(parsed.m).padStart(2, '0');
        const dd = String(parsed.d).padStart(2, '0');
        return `${parsed.y}-${mm}-${dd}`;
      }
    } catch {
      // ignore, fall through to string parsing below
    }
  }
  const str = String(raw).trim();
  if (!str) return '';
  const asDate = new Date(str);
  if (!isNaN(asDate.getTime())) {
    return asDate.toISOString().split('T')[0];
  }
  return '';
}

function calcAgeFromISODate(iso: string): number | undefined {
  if (!iso) return undefined;
  const birth = new Date(iso);
  if (isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

// Cosmetic "ALL CAPS" -> "Title Case" normalization (e.g. "ORANGE LIBERIA" ->
// "Orange Liberia"), applied ONLY when the sheet name is entirely uppercase. Names already
// in mixed case (e.g. "Samaritain Purse") are left unchanged. Purely cosmetic: organization
// comparisons elsewhere in the app are already case-insensitive (.toLowerCase().trim()), so
// this doesn't affect any business logic.
function titleCaseIfAllCaps(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed || !/[A-Z]/.test(trimmed) || trimmed !== trimmed.toUpperCase()) return trimmed;
  return trimmed
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// If an organization with the same name (case-insensitive) already exists in
// `existingOrganizations` (e.g. "Orange Liberia Telecom" created from the Organizations
// screen), we reuse that EXACT name instead of the name inferred from the sheet, so that
// ceilings/eligibilityService/OrganizationsView correctly find the existing organization.
// Otherwise we keep the name inferred from the sheet.
function reconcileOrganizationName(sheetOrgName: string, existingOrganizations: Organization[]): string {
  const match = existingOrganizations.find(
    (o) => o.name.toLowerCase().trim() === sheetOrgName.toLowerCase().trim()
  );
  return match ? match.name : sheetOrgName;
}

// === AMÉLIORATION AJOUTÉE : fusion non destructive des ayants droit (dépendants) =========
// Avant ce correctif, ré-importer un fichier remplaçait ENTIÈREMENT le tableau
// `dependents[]`/`children[]` existant dès que la ligne du fichier en contenait au moins un
// — supprimant silencieusement tout ayant droit ajouté manuellement dans l'application et
// absent de ce fichier Excel précis. `mergeDependentsForImport` fusionne au lieu de
// remplacer : chaque dépendant importé est apparié à un dépendant existant (par numéro de
// carte s'il existe des deux côtés, sinon par relation + nom complet), et seuls les champs
// VIDES du dépendant existant sont complétés depuis l'import (jamais écrasés s'ils sont déjà
// renseignés) — cohérent avec la règle "seules les informations manquantes sont mises à
// jour". Un dépendant importé sans correspondance est ajouté (ex. nouvel enfant) ; un
// dépendant existant absent de l'import est conservé tel quel (jamais supprimé par un import).
function mergeDependentsForImport(
  existingDeps: DependentItem[],
  importedDeps: DependentItem[]
): DependentItem[] {
  const matchDependent = (imported: DependentItem): DependentItem | undefined => {
    if (imported.cardNo) {
      const byCard = existingDeps.find((d) => d.cardNo && d.cardNo.toLowerCase() === imported.cardNo!.toLowerCase());
      if (byCard) return byCard;
    }
    return existingDeps.find(
      (d) =>
        d.relationship === imported.relationship &&
        d.fullName.trim().toLowerCase() === imported.fullName.trim().toLowerCase()
    );
  };

  const mergedByExistingId = new Map<DependentItem, DependentItem>();

  importedDeps.forEach((imported) => {
    const existing = matchDependent(imported);
    if (!existing) {
      mergedByExistingId.set(imported, imported);
      return;
    }
    mergedByExistingId.set(existing, {
      ...existing,
      // Fields intentionally kept from the EXISTING record when already present — an
      // import only fills in what's missing, it never overwrites a known value.
      cardNo: existing.cardNo || imported.cardNo,
      birthDate: existing.birthDate || imported.birthDate,
      age: existing.age ?? imported.age,
      gender: existing.gender || imported.gender,
      // A biometric capture already on file must never be "un-captured" by a re-import.
      hasBiometrics: existing.hasBiometrics || imported.hasBiometrics || false,
    });
  });

  // Existing dependents that this import didn't mention at all (e.g. added manually from
  // the Insured Members screen, or from a previous file covering a different subset) are
  // preserved unchanged — an import is additive/enriching, never destructive.
  existingDeps.forEach((existing) => {
    if (!mergedByExistingId.has(existing)) {
      mergedByExistingId.set(existing, existing);
    }
  });

  return Array.from(mergedByExistingId.values());
}

export interface MultiOrgImportResult extends ImportResult<Member> {
  organizationsFound: string[];
  newOrganizationsDetected: string[];
  orphanDependents: number;
}

interface DepsSheetEntry {
  relationshipRaw: string;
  cardNo: string;
  birthDate: string;
  hasBiometrics: boolean;
}

export async function parseActivaMultiOrgExcel(
  file: File,
  existingMembers: Member[],
  existingOrganizations: Organization[] = []
): Promise<MultiOrgImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        // cellDates: true => "Date of Birth" columns arrive as usable JS Date objects
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const sheetNames = workbook.SheetNames;
        const staffSheetNames = sheetNames.filter((n) => STAFF_SHEET_SUFFIX.test(n));

        if (staffSheetNames.length === 0) {
          resolve({
            success: false,
            created: 0,
            updated: 0,
            ignored: 0,
            missingHeaders: [],
            errors: ['No "<Organization> - Staff" sheet found. Expected sheet names such as "Orange Liberia - Staff" / "Orange Liberia - Deps" (see downloadable template).'],
            parsedItems: [],
            organizationsFound: [],
            newOrganizationsDetected: [],
            orphanDependents: 0,
          });
          return;
        }

        const errors: string[] = [];
        const organizationsFound: string[] = [];
        const newOrganizationsDetected: string[] = [];
        let created = 0;
        let updated = 0;
        let ignored = 0;
        let orphanDependents = 0;
        const updatedList: Member[] = [...existingMembers];

        for (const staffSheetName of staffSheetNames) {
          const sheetOrgName = staffSheetName.replace(STAFF_SHEET_SUFFIX, '').trim();
          if (!sheetOrgName) {
            errors.push(`Sheet "${staffSheetName}": could not determine the organization name from the sheet name, sheet skipped.`);
            continue;
          }
          const organization = reconcileOrganizationName(titleCaseIfAllCaps(sheetOrgName), existingOrganizations);
          organizationsFound.push(organization);
          if (!existingOrganizations.some((o) => o.name.toLowerCase().trim() === organization.toLowerCase().trim())) {
            newOrganizationsDetected.push(organization);
          }

          const staffSheet = workbook.Sheets[staffSheetName];
          const staffRows: Record<string, any>[] = XLSX.utils.sheet_to_json(staffSheet, { defval: '' });
          if (staffRows.length === 0) continue;

          const staffHeaders = Object.keys(staffRows[0]);
          const cardNoHeader = staffHeaders.find((h) => matchHeaderAlias(h, MEMBER_COLUMN_MAPPINGS.cardNo));
          const nameHeader = staffHeaders.find((h) => matchHeaderAlias(h, MEMBER_COLUMN_MAPPINGS.principalName));
          const dobHeader = staffHeaders.find((h) => matchHeaderAlias(h, MEMBER_COLUMN_MAPPINGS.birthDate));
          const contactHeader = staffHeaders.find((h) => /contact|phone|telephone/i.test(h));
          const spouseDobHeader = staffHeaders.find((h) => /spouse/i.test(h) && /date|dob/i.test(h));
          const spouseNameHeader = staffHeaders.find(
            (h) => matchHeaderAlias(h, MEMBER_COLUMN_MAPPINGS.spouseName) && h !== spouseDobHeader
          );
          // === AMÉLIORATION AJOUTÉE : la colonne "Biometrics" du principal (présente sur le
          // modèle réel du client, ex. Samaritain Purse - Staff) n'était lue nulle part —
          // seule celle de la feuille "Deps" (pour les ayants droit) l'était. Le statut
          // biométrique du principal en dépendait donc uniquement des dépendants.
          const staffBiometricsHeader = staffHeaders.find((h) => /biometric/i.test(h));

          if (!cardNoHeader || !nameHeader) {
            errors.push(`Sheet "${staffSheetName}": missing "Card No." / "Primary Insured Name" column, sheet skipped.`);
            continue;
          }

          // Detect "Child N Name" / "Child N Date of Birth" column pairs (N = however many exist)
          const childColumns: { n: number; nameHeader: string; dobHeader?: string }[] = [];
          staffHeaders.forEach((h) => {
            const m = h.match(CHILD_NAME_HEADER);
            if (m) {
              const n = parseInt(m[1], 10);
              const dobHeaderMatch = staffHeaders.find((h2) => {
                const m2 = h2.match(CHILD_DOB_HEADER);
                return !!m2 && parseInt(m2[1], 10) === n;
              });
              childColumns.push({ n, nameHeader: h, dobHeader: dobHeaderMatch });
            }
          });
          childColumns.sort((a, b) => a.n - b.n);

          // Index the matching "<Org> - Deps" sheet (if any) by principal card number.
          const depsSheetName = sheetNames.find(
            (n) => DEPS_SHEET_SUFFIX.test(n) && n.replace(DEPS_SHEET_SUFFIX, '').trim().toLowerCase() === sheetOrgName.toLowerCase()
          );
          const depsByPrincipalCard = new Map<string, DepsSheetEntry[]>();
          if (depsSheetName) {
            const depsRows: Record<string, any>[] = XLSX.utils.sheet_to_json(workbook.Sheets[depsSheetName], { defval: '' });
            if (depsRows.length > 0) {
              const depsHeaders = Object.keys(depsRows[0]);
              const depPrincipalCardHeader = depsHeaders.find((h) => /primary\s*card/i.test(h));
              // Explicit exclusion of "Primary Card No.": without it, alias-based detection
              // (which matches "card no" as a substring) could latch onto it depending on the
              // file's column order, instead of the dependent's actual "Card No." column.
              const depCardHeader = depsHeaders.find((h) => h !== depPrincipalCardHeader && matchHeaderAlias(h, MEMBER_COLUMN_MAPPINGS.cardNo));
              const depRelHeader = depsHeaders.find((h) => matchHeaderAlias(h, MEMBER_COLUMN_MAPPINGS.relationship));
              const depDobHeader = depsHeaders.find((h) => matchHeaderAlias(h, MEMBER_COLUMN_MAPPINGS.birthDate));
              const depBiometricsHeader = depsHeaders.find((h) => /biometric/i.test(h));

              depsRows.forEach((row) => {
                const principalCardNo = depPrincipalCardHeader ? String(row[depPrincipalCardHeader] || '').trim() : '';
                if (!principalCardNo) return;
                const key = principalCardNo.toLowerCase();
                const biomRaw = depBiometricsHeader ? String(row[depBiometricsHeader] || '').trim().toLowerCase() : '';
                const entry: DepsSheetEntry = {
                  relationshipRaw: depRelHeader ? String(row[depRelHeader] || '').trim() : '',
                  cardNo: depCardHeader ? String(row[depCardHeader] || '').trim() : '',
                  birthDate: depDobHeader ? excelCellToISODate(row[depDobHeader]) : '',
                  hasBiometrics: biomRaw === 'yes' || biomRaw === 'true' || biomRaw === '1',
                };
                if (!depsByPrincipalCard.has(key)) depsByPrincipalCard.set(key, []);
                depsByPrincipalCard.get(key)!.push(entry);
              });
            }
          }

          staffRows.forEach((row) => {
            const cardNoVal = String(row[cardNoHeader] || '').trim();
            const principalVal = String(row[nameHeader] || '').trim();
            if (!cardNoVal || !principalVal) {
              ignored++;
              return;
            }

            const existingIndex = updatedList.findIndex((m) => m.cardNo.toLowerCase() === cardNoVal.toLowerCase());
            const existingMember = existingIndex >= 0 ? updatedList[existingIndex] : undefined;

            const birthDate = dobHeader ? excelCellToISODate(row[dobHeader]) : '';
            const phone = contactHeader ? String(row[contactHeader] || '').trim() : '';
            const spouseNameVal = spouseNameHeader ? String(row[spouseNameHeader] || '').trim() : '';
            const spouseDobVal = spouseDobHeader ? excelCellToISODate(row[spouseDobHeader]) : '';
            const staffBiometricsRaw = staffBiometricsHeader ? String(row[staffBiometricsHeader] || '').trim().toLowerCase() : '';
            const principalHasBiometrics = staffBiometricsRaw === 'yes' || staffBiometricsRaw === 'true' || staffBiometricsRaw === '1';

            const depRows = depsByPrincipalCard.get(cardNoVal.toLowerCase()) || [];
            const matchedDepRows = new Set<DepsSheetEntry>();

            const dependents: DependentItem[] = [];
            const childrenLegacy: string[] = [];

            if (spouseNameVal) {
              const depMatch = depRows.find((d) => d.relationshipRaw.toLowerCase() === 'spouse');
              if (depMatch) matchedDepRows.add(depMatch);
              dependents.push({
                id: `dep-imp-${cardNoVal}-sp`,
                cardNo: depMatch?.cardNo || undefined,
                fullName: spouseNameVal,
                relationship: 'spouse',
                birthDate: spouseDobVal || depMatch?.birthDate || undefined,
                hasBiometrics: depMatch?.hasBiometrics || false,
              });
            }

            childColumns.forEach(({ n, nameHeader: childNameH, dobHeader: childDobH }) => {
              const childName = String(row[childNameH] || '').trim();
              if (!childName) return;
              const childDob = childDobH ? excelCellToISODate(row[childDobH]) : '';
              const depMatch = depRows.find((d) => {
                const m = d.relationshipRaw.match(CHILD_RELATIONSHIP_NUMBER);
                return !!m && parseInt(m[1], 10) === n;
              });
              if (depMatch) matchedDepRows.add(depMatch);
              const finalDob = childDob || depMatch?.birthDate || '';
              const age = calcAgeFromISODate(finalDob);
              childrenLegacy.push(age !== undefined ? `${childName} (${age} yrs)` : childName);
              dependents.push({
                id: `dep-imp-${cardNoVal}-c${n}`,
                cardNo: depMatch?.cardNo || undefined,
                fullName: childName,
                relationship: 'child',
                birthDate: finalDob || undefined,
                hasBiometrics: depMatch?.hasBiometrics || false,
              });
            });

            // Deps-sheet rows for this principal that no Staff-sheet column could be matched to
            // (their own name is nowhere in the workbook) — counted and reported, never guessed.
            depRows.forEach((d) => {
              if (!matchedDepRows.has(d)) orphanDependents++;
            });

            // === AMÉLIORATION AJOUTÉE : fusion non destructive au lieu d'un remplacement pur
            // et simple — voir mergeDependentsForImport ci-dessus. `children` (libellé texte
            // hérité) est régénéré à partir du jeu FUSIONNÉ afin de rester cohérent avec
            // `dependents`, plutôt que de refléter uniquement ce que ce fichier contient.
            const mergedDependents = mergeDependentsForImport(existingMember?.dependents || [], dependents);
            const mergedChildrenLegacy = mergedDependents
              .filter((d) => d.relationship === 'child')
              .map((d) => {
                const age = d.birthDate ? calcAgeFromISODate(d.birthDate) : undefined;
                return age !== undefined ? `${d.fullName} (${age} yrs)` : d.fullName;
              });

            const memberObj: Member = {
              id: existingMember ? existingMember.id : `mem-imp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              cardNo: cardNoVal,
              // === AMÉLIORATION AJOUTÉE : "seules les informations manquantes sont mises à
              // jour" — si le membre existe déjà, sa valeur actuelle est conservée en
              // priorité ; la valeur importée ne sert qu'à compléter un champ VIDE. Un
              // renommage/changement légitime (ex. mariage) doit donc passer par une
              // modification manuelle dans l'application plutôt qu'un simple ré-import.
              principalName: existingMember?.principalName || principalVal,
              spouseName: existingMember?.spouseName || spouseNameVal || undefined,
              children: mergedChildrenLegacy.length > 0 ? mergedChildrenLegacy : existingMember?.children || [],
              dependents: mergedDependents,
              birthDate: existingMember?.birthDate || birthDate || '1985-01-01',
              relationship: existingMember?.relationship || 'Primary',
              organization: existingMember?.organization || organization,
              status: existingMember?.status || 'Active',
              hasPhoto: existingMember?.hasPhoto || false,
              hasBiometrics: existingMember?.hasBiometrics || principalHasBiometrics || mergedDependents.some((d) => d.hasBiometrics),
              phone: existingMember?.phone || phone || undefined,
              outpatientBalanceUSD: existingMember?.outpatientBalanceUSD ?? 1000,
              outpatientCeilingUSD: existingMember?.outpatientCeilingUSD ?? 1000,
              inpatientBalanceUSD: existingMember?.inpatientBalanceUSD ?? 10000,
              inpatientCeilingUSD: existingMember?.inpatientCeilingUSD ?? 10000,
              gender: existingMember?.gender,
              createdAt: existingMember?.createdAt || new Date().toISOString().split('T')[0],
            };

            if (existingMember) {
              updatedList[existingIndex] = memberObj;
              updated++;
            } else {
              updatedList.unshift(memberObj);
              created++;
            }
          });
        }

        resolve({
          success: true,
          created,
          updated,
          ignored,
          missingHeaders: [],
          errors,
          parsedItems: updatedList,
          organizationsFound: Array.from(new Set(organizationsFound)),
          newOrganizationsDetected: Array.from(new Set(newOrganizationsDetected)),
          orphanDependents,
        });
      } catch (err: any) {
        resolve({
          success: false,
          created: 0,
          updated: 0,
          ignored: 0,
          missingHeaders: [],
          errors: [`Excel parsing error: ${err.message || 'Corrupted file'}`],
          parsedItems: [],
          organizationsFound: [],
          newOrganizationsDetected: [],
          orphanDependents: 0,
        });
      }
    };

    reader.onerror = () => {
      resolve({
        success: false,
        created: 0,
        updated: 0,
        ignored: 0,
        missingHeaders: [],
        errors: ['Unable to read the uploaded file.'],
        parsedItems: [],
        organizationsFound: [],
        newOrganizationsDetected: [],
        orphanDependents: 0,
      });
    };

    reader.readAsArrayBuffer(file);
  });
}

// Downloadable workbook template, reproducing EXACTLY the structure expected by
// parseActivaMultiOrgExcel() above (a pair of sheets "<Organization> - Staff" /
// "<Organization> - Deps"), with an instructions sheet and a concrete example. To add an
// organization, simply duplicate the 2 example sheets and rename "Example Org" to the
// organization's real name (keeping " - Staff" / " - Deps").
export function generateMultiOrgTemplateExcel() {
  const wb = XLSX.utils.book_new();

  const instructions = [
    ['ACTIVA HealthPass — Multi-Organization Import Template (Staff / Deps)'],
    [''],
    ['1. One organization = a PAIR of sheets named EXACTLY:'],
    ['   "<Organization Name> - Staff"  and  "<Organization Name> - Deps"'],
    ['   (keep the spaces around the dash, as in the 2 example sheets provided)'],
    [''],
    ['2. Sheet "... - Staff" (1 row = 1 PRINCIPAL insured member):'],
    ['   - Card No.: principal\'s card number (required, unique)'],
    ['   - Primary Insured Name: principal\'s full name (required)'],
    ['   - Date of Birth: principal\'s date of birth (DD/MM/YYYY or YYYY-MM-DD)'],
    ['   - Contact: phone number (optional)'],
    ['   - Spouse Name / Spouse Date of Birth: spouse (optional)'],
    ['   - Child 1 Name / Child 1 Date of Birth, Child 2 Name / Child 2 Date of Birth, ... :'],
    ['     one child per column pair. Add as many "Child N" pairs as needed.'],
    ['   - Organization (optional): informational only — the organization is always taken'],
    ['     from the sheet name, not from this column.'],
    ['   - Biometrics (optional): "Yes" if the PRINCIPAL\'s fingerprints have already been'],
    ['     captured.'],
    [''],
    ['3. Sheet "... - Deps" (1 row = 1 dependent, spouse OR child) — gives each'],
    ['   dependent their OWN card number, used to identify/reimburse them:'],
    ['   - Card No.: card number OWNED by the dependent (required, unique)'],
    ['   - Relationship: "Spouse" for the spouse, or "Child 1" / "Child 2" / ... — the number'],
    ['     must EXACTLY match the "Child N Name" column on the Staff sheet'],
    ['   - Date of Birth: dependent\'s date of birth'],
    ['   - Primary Insured: PRINCIPAL\'s name (not the dependent\'s)'],
    ['   - Primary Card No.: PRINCIPAL\'s card number (links back to the Staff sheet)'],
    ['   - Organization: organization name (identical to the sheet name)'],
    ['   - Biometrics: "Yes" if biometric fingerprints have already been captured'],
    [''],
    ['4. If an organization\'s "... - Deps" sheet is empty or missing, spouses/children'],
    ['   will still be imported from the "Staff" sheet, but WITHOUT their own card number'],
    ['   (to be completed later from the Insured Members screen).'],
    [''],
    ['5. Re-importing this file after editing it updates existing records (matched by'],
    ['   card number) instead of duplicating them. Only MISSING information is filled in:'],
    ['   a field already set on an existing record (name, date of birth, phone,'],
    ['   organization...) is never overwritten by the import — edit it directly from the'],
    ['   Insured Members screen instead. Dependents are merged the same way: a dependent'],
    ['   already on file is enriched (missing card number/date of birth filled in) rather'],
    ['   than replaced, and a dependent added manually in the app that this file doesn\'t'],
    ['   mention is kept, never removed by the import.'],
  ];
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
  wsInstructions['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'INSTRUCTIONS');

  // === AMÉLIORATION AJOUTÉE : colonnes "Organization" et "Biometrics" ajoutées à la feuille
  // Staff pour correspondre exactement au modèle réel utilisé par le client (ex.
  // "Samaritain Purse - Staff"), qui les inclut. "Organization" reste purement informative
  // ici (l'organisation est toujours déterminée par le nom de la feuille) ; "Biometrics"
  // ("Yes"/vide) est désormais bien lue par le parseur pour le statut du PRINCIPAL — voir
  // staffBiometricsHeader dans parseActivaMultiOrgExcel.
  const staffData = [
    ['Card No.', 'Primary Insured Name', 'Date of Birth', 'Contact', 'Spouse Name', 'Spouse Date of Birth', 'Child 1 Name', 'Child 1 Date of Birth', 'Child 2 Name', 'Child 2 Date of Birth', 'Organization', 'Biometrics'],
    ['EXG-00001-0001', 'Samuel DOE', '1985-05-14', '+231 88 000 1122', 'Mary DOE', '1987-02-20', 'James DOE', '2015-08-31', 'Linda DOE', '2018-12-11', 'Example Org', 'Yes'],
    ['EXG-00002-0002', 'Grace KOLLIE', '1990-11-20', '+231 77 000 3344', '', '', 'Peter KOLLIE', '2020-04-04', '', '', 'Example Org', ''],
  ];
  const wsStaff = XLSX.utils.aoa_to_sheet(staffData);
  XLSX.utils.book_append_sheet(wb, wsStaff, 'Example Org - Staff');

  const depsData = [
    ['Card No.', 'Relationship', 'Date of Birth', 'Primary Insured', 'Primary Card No.', 'Organization', 'Biometrics'],
    ['EXG-00001-0002', 'Spouse', '1987-02-20', 'Samuel DOE', 'EXG-00001-0001', 'Example Org', ''],
    ['EXG-00001-0003', 'Child 1', '2015-08-31', 'Samuel DOE', 'EXG-00001-0001', 'Example Org', ''],
    ['EXG-00001-0004', 'Child 2', '2018-12-11', 'Samuel DOE', 'EXG-00001-0001', 'Example Org', ''],
    ['EXG-00002-0005', 'Child 1', '2020-04-04', 'Grace KOLLIE', 'EXG-00002-0002', 'Example Org', ''],
  ];
  const wsDeps = XLSX.utils.aoa_to_sheet(depsData);
  XLSX.utils.book_append_sheet(wb, wsDeps, 'Example Org - Deps');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([wbout], { type: 'application/octet-stream' }), 'ACTIVA_MultiOrg_Import_Template.xlsx');
}

export function exportMembersToExcel(members: Member[], lang?: any) {
  // Sheet 1: Principal Insured only
  const principalsData = members.map((m) => {
    const totalDeps = (m.dependents?.length || 0) + (m.children?.length || 0) + (m.spouseName ? 1 : 0);
    return {
      'Card Number': m.cardNo,
      'Principal Insured Name': m.principalName,
      'Date of Birth': m.birthDate || '—',
      'Gender': m.gender || '—',
      'Organization / Policyholder': m.organization,
      'Policy Status': m.status,
      'Dependents Count': totalDeps,
      'Outpatient Balance (USD)': m.outpatientBalanceUSD ?? 1000,
      'Outpatient Ceiling (USD)': m.outpatientCeilingUSD ?? 1000,
      'Inpatient Balance (USD)': m.inpatientBalanceUSD ?? 10000,
      'Inpatient Ceiling (USD)': m.inpatientCeilingUSD ?? 10000,
      'Biometrics Captured': m.hasBiometrics ? 'Yes' : 'No',
      'Photo Available': m.hasPhoto ? 'Yes' : 'No',
      'Contact Phone': m.phone || '—',
      'Enrollment Date': m.createdAt ? m.createdAt.split('T')[0] : '—',
    };
  });

  // Sheet 2: Dependents / Ayants Droit
  const dependentsData: any[] = [];
  members.forEach((m) => {
    // 1. Structured dependents
    if (m.dependents && m.dependents.length > 0) {
      m.dependents.forEach((dep) => {
        const depStatus = m.status === 'Suspended' || m.status === 'Suspendu' ? 'Suspended (Policy Block)' : 'Active';
        dependentsData.push({
          'Dependent Card Number': dep.cardNo || `${m.cardNo}-D`,
          'Dependent Full Name': dep.fullName,
          'Relationship': dep.relationship ? dep.relationship.toUpperCase() : 'DEPENDENT',
          'Date of Birth': dep.birthDate || '—',
          'Gender': dep.gender || '—',
          'Principal Insured Name': m.principalName,
          'Principal Card Number': m.cardNo,
          'Organization': m.organization,
          'Dependent Status': depStatus,
          'Biometrics Registered': dep.hasBiometrics ? 'Yes' : 'No',
        });
      });
    } else {
      // 2. Legacy spouse and children fallback
      if (m.spouseName) {
        const depStatus = m.status === 'Suspended' || m.status === 'Suspendu' ? 'Suspended (Policy Block)' : 'Active';
        dependentsData.push({
          'Dependent Card Number': `${m.cardNo}-SP`,
          'Dependent Full Name': m.spouseName,
          'Relationship': 'SPOUSE',
          'Date of Birth': '—',
          'Gender': '—',
          'Principal Insured Name': m.principalName,
          'Principal Card Number': m.cardNo,
          'Organization': m.organization,
          'Dependent Status': depStatus,
          'Biometrics Registered': 'No',
        });
      }
      if (m.children && m.children.length > 0) {
        m.children.forEach((childName, idx) => {
          const depStatus = m.status === 'Suspended' || m.status === 'Suspendu' ? 'Suspended (Policy Block)' : 'Active';
          dependentsData.push({
            'Dependent Card Number': `${m.cardNo}-C${idx + 1}`,
            'Dependent Full Name': childName,
            'Relationship': 'CHILD',
            'Date of Birth': '—',
            'Gender': '—',
            'Principal Insured Name': m.principalName,
            'Principal Card Number': m.cardNo,
            'Organization': m.organization,
            'Dependent Status': depStatus,
            'Biometrics Registered': 'No',
          });
        });
      }
    }
  });

  const wb = XLSX.utils.book_new();

  // Add Sheet 1: Principal Insured
  const wsPrincipals = XLSX.utils.json_to_sheet(sanitizeRowsForExcel(principalsData));
  XLSX.utils.book_append_sheet(wb, wsPrincipals, 'Principal Insured');

  // Add Sheet 2: Dependents
  const wsDependents = XLSX.utils.json_to_sheet(
    sanitizeRowsForExcel(
    dependentsData.length > 0
      ? dependentsData
      : [
          {
            'Dependent Card Number': '—',
            'Dependent Full Name': 'No dependents registered',
            'Relationship': '—',
            'Date of Birth': '—',
            'Gender': '—',
            'Principal Insured Name': '—',
            'Principal Card Number': '—',
            'Organization': '—',
            'Dependent Status': '—',
            'Biometrics Registered': '—',
          },
        ]
    )
  );
  XLSX.utils.book_append_sheet(wb, wsDependents, 'Dependents');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(
    new Blob([wbout], { type: 'application/octet-stream' }),
    `ACTIVA_Insured_Directory_${new Date().toISOString().split('T')[0]}.xlsx`
  );
}

export function exportMembersToCSV(members: Member[], lang?: any) {
  const headers = ['Card Number', 'Primary Insured', 'Spouse', 'Children', 'Organization', 'Relationship', 'Status', 'Date of Birth', 'Outpatient Balance (USD)', 'Outpatient Ceiling (USD)', 'Inpatient Balance (USD)', 'Inpatient Ceiling (USD)', 'Biometrics', 'Registration Date'];
  const rows = members.map(m => [
    `"${m.cardNo}"`,
    `"${m.principalName}"`,
    `"${m.spouseName || ''}"`,
    `"${(m.children || []).join('; ')}"`,
    `"${m.organization}"`,
    `"${m.relationship}"`,
    `"${m.status}"`,
    `"${m.birthDate || ''}"`,
    m.outpatientBalanceUSD ?? 1000,
    m.outpatientCeilingUSD ?? 1000,
    m.inpatientBalanceUSD ?? 10000,
    m.inpatientCeilingUSD ?? 10000,
    m.hasBiometrics ? 'Yes' : 'No',
    `"${m.createdAt || ''}"`,
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadBlob(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }), `ACTIVA_Insured_Members_${new Date().toISOString().split('T')[0]}.csv`);
}

// ================= ORGANIZATIONS IMPORT & EXPORT =================
const ORG_COLUMN_MAPPINGS = {
  name: ['company name', 'organization name', 'organization', 'name', 'nom organisation', 'nom entreprise', 'raison sociale', 'nom'],
  policyNumber: ['policy number', 'policy no', 'police', 'numero police', 'n police', 'contract no'],
  effectiveDate: ['effective date', 'start date', 'date debut', 'date d effet', 'date effet'],
  expirationDate: ['expiration date', 'expiry date', 'end date', 'date echeance', 'date fin'],
  declaredMembers: ['declared members', 'enrolled members', 'effectif', 'nb membres', 'membres declares', 'nombre assures'],
  coverageRate: ['coverage rate', 'coverage rate %', 'taux couverture', 'taux prise en charge', 'taux %', 'rate'],
  status: ['status', 'statut', 'etat'],
  email: ['email', 'contact email', 'courriel', 'email contact'],
  phone: ['phone', 'contact phone', 'telephone', 'tel contact'],
  globalCeiling: ['global ceiling', 'annual ceiling', 'plafond global', 'plafond annuel', 'plafond'],
};

export async function parseOrganizationExcel(
  file: File,
  existingOrgs: Organization[]
): Promise<ImportResult<Organization>> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];

        const rawJson: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          resolve({
            success: false,
            created: 0,
            updated: 0,
            ignored: 0,
            missingHeaders: [],
            errors: ['The selected file is empty or unreadable.'],
            parsedItems: [],
          });
          return;
        }

        const headers = Object.keys(rawJson[0]);
        const headerMap: { [key in keyof typeof ORG_COLUMN_MAPPINGS]?: string } = {};

        for (const [field, aliases] of Object.entries(ORG_COLUMN_MAPPINGS)) {
          const matchedHeader = headers.find(h => matchHeaderAlias(h, aliases));
          if (matchedHeader) {
            headerMap[field as keyof typeof ORG_COLUMN_MAPPINGS] = matchedHeader;
          }
        }

        const missingHeaders: string[] = [];
        if (!headerMap.name) missingHeaders.push('Organization Name');
        if (!headerMap.policyNumber) missingHeaders.push('Policy Number');

        if (missingHeaders.length > 0) {
          resolve({
            success: false,
            created: 0,
            updated: 0,
            ignored: 0,
            missingHeaders,
            errors: [`Missing required columns: ${missingHeaders.join(', ')}`],
            parsedItems: [],
          });
          return;
        }

        let created = 0;
        let updated = 0;
        let ignored = 0;
        const updatedList: Organization[] = [...existingOrgs];

        rawJson.forEach((row) => {
          const nameVal = String(row[headerMap.name!] || '').trim();
          const policyVal = String(row[headerMap.policyNumber!] || '').trim();

          if (!nameVal || !policyVal) {
            ignored++;
            return;
          }

          const effectiveDate = headerMap.effectiveDate ? String(row[headerMap.effectiveDate] || '2026-01-01').trim() : '2026-01-01';
          const expirationDate = headerMap.expirationDate ? String(row[headerMap.expirationDate] || '2026-12-31').trim() : '2026-12-31';
          const declaredMembers = headerMap.declaredMembers ? Number(row[headerMap.declaredMembers]) || 10 : 10;
          const coverageRate = headerMap.coverageRate ? Number(row[headerMap.coverageRate]) || 80 : 80;
          const statusRaw = headerMap.status ? String(row[headerMap.status] || 'Active').trim().toLowerCase() : 'active';
          const status = (statusRaw.includes('inact') || statusRaw.includes('suspend') || statusRaw.includes('expir')) ? (statusRaw.includes('expir') ? 'Expired' : 'Suspended') : 'Active';
          const email = headerMap.email ? String(row[headerMap.email] || '').trim() : '';
          const phone = headerMap.phone ? String(row[headerMap.phone] || '').trim() : '';
          const globalCeiling = headerMap.globalCeiling ? Number(row[headerMap.globalCeiling]) || 100000 : 100000;

          const existingIndex = updatedList.findIndex(o => o.policyNumber.toLowerCase() === policyVal.toLowerCase());

          const orgObj: Organization = {
            id: existingIndex >= 0 ? updatedList[existingIndex].id : `org-imp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: nameVal,
            policyNumber: policyVal,
            effectiveDate,
            expirationDate,
            declaredMembers,
            coverageRate,
            status: status as any,
            email: email || undefined,
            phone: phone || undefined,
            globalCeiling,
          };

          if (existingIndex >= 0) {
            updatedList[existingIndex] = orgObj;
            updated++;
          } else {
            updatedList.unshift(orgObj);
            created++;
          }
        });

        resolve({
          success: true,
          created,
          updated,
          ignored,
          missingHeaders: [],
          errors: [],
          parsedItems: updatedList,
        });
      } catch (err: any) {
        resolve({
          success: false,
          created: 0,
          updated: 0,
          ignored: 0,
          missingHeaders: [],
          errors: [`Excel parsing error: ${err.message || 'Corrupted file'}`],
          parsedItems: [],
        });
      }
    };

    reader.onerror = () => {
      resolve({
        success: false,
        created: 0,
        updated: 0,
        ignored: 0,
        missingHeaders: [],
        errors: ['Unable to read the uploaded file.'],
        parsedItems: [],
      });
    };

    reader.readAsArrayBuffer(file);
  });
}

export function generateOrganizationTemplateExcel() {
  const wsData = [
    ['Organization Name', 'Policy Number', 'Effective Date (YYYY-MM-DD)', 'Expiration Date (YYYY-MM-DD)', 'Declared Members', 'Coverage Rate (%)', 'Status', 'Contact Email', 'Contact Phone', 'Global Ceiling ($)'],
    ['Lonestar Cell MTN', 'POL-2026-MTN', '2026-01-01', '2026-12-31', 350, 85, 'Active', 'hr@lonestarcell.com', '+231 88 000 9988', 300000],
    ['United Bank for Africa (UBA)', 'POL-2026-UBA', '2026-01-01', '2026-12-31', 220, 90, 'Active', 'benefits@ubagroup.com', '+231 77 123 4567', 250000],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Organizations Template');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([wbout], { type: 'application/octet-stream' }), 'ACTIVA_Organizations_Import_Template.xlsx');
}

export function exportOrganizationsToExcel(orgs: Organization[], lang?: any) {
  const data = orgs.map(o => ({
    'Organization Name': o.name,
    'Policy Number': o.policyNumber,
    'Effective Date': o.effectiveDate,
    'Expiration Date': o.expirationDate,
    'Declared Members': o.declaredMembers,
    'Coverage Rate (%)': `${o.coverageRate}%`,
    'Status': o.status,
    'Contact Email': o.email || o.contactEmail || 'N/A',
    'Contact Phone': o.phone || o.contactPhone || 'N/A',
    'Global Ceiling ($)': o.globalCeiling ? `$${o.globalCeiling.toLocaleString('en-US')}` : 'N/A',
  }));

  const ws = XLSX.utils.json_to_sheet(sanitizeRowsForExcel(data));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Organizations');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([wbout], { type: 'application/octet-stream' }), `ACTIVA_Organizations_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function exportOrganizationsToCSV(orgs: Organization[], lang?: any) {
  const headers = ['Organization Name', 'Policy Number', 'Effective Date', 'Expiration Date', 'Declared Members', 'Coverage Rate (%)', 'Status', 'Contact Email', 'Contact Phone', 'Global Ceiling ($)'];
  const rows = orgs.map(o => [
    `"${o.name}"`,
    `"${o.policyNumber}"`,
    `"${o.effectiveDate}"`,
    `"${o.expirationDate}"`,
    o.declaredMembers,
    o.coverageRate,
    `"${o.status}"`,
    `"${o.email || o.contactEmail || ''}"`,
    `"${o.phone || o.contactPhone || ''}"`,
    o.globalCeiling || 0,
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadBlob(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }), `ACTIVA_Organizations_${new Date().toISOString().split('T')[0]}.csv`);
}

// ================= PROVIDERS IMPORT & EXPORT =================
const PROVIDER_COLUMN_MAPPINGS = {
  name: ['facility name', 'provider name', 'name', 'nom etablissement', 'nom prestataire', 'nom structure', 'nom'],
  type: ['facility type', 'provider type', 'type', 'type etablissement', 'nature'],
  location: ['city', 'location', 'address', 'ville', 'adresse', 'localisation'],
  conventionNumber: ['convention number', 'convention no', 'agreement no', 'numero convention', 'n convention', 'convention'],
  kypStatus: ['kyp status', 'compliance status', 'statut kyp', 'statut conformite', 'kyp'],
  contactPhone: ['phone', 'contact phone', 'telephone', 'tel contact'],
  tier: ['accreditation tier', 'tier', 'level', 'categorie', 'niveau', 'classement'],
  status: ['status', 'statut', 'etat'],
};

export async function parseProviderExcel(
  file: File,
  existingProviders: Provider[]
): Promise<ImportResult<Provider>> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];

        const rawJson: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          resolve({
            success: false,
            created: 0,
            updated: 0,
            ignored: 0,
            missingHeaders: [],
            errors: ['The selected file is empty or unreadable.'],
            parsedItems: [],
          });
          return;
        }

        const headers = Object.keys(rawJson[0]);
        const headerMap: { [key in keyof typeof PROVIDER_COLUMN_MAPPINGS]?: string } = {};

        for (const [field, aliases] of Object.entries(PROVIDER_COLUMN_MAPPINGS)) {
          const matchedHeader = headers.find(h => matchHeaderAlias(h, aliases));
          if (matchedHeader) {
            headerMap[field as keyof typeof PROVIDER_COLUMN_MAPPINGS] = matchedHeader;
          }
        }

        const missingHeaders: string[] = [];
        if (!headerMap.name) missingHeaders.push('Healthcare Facility Name');
        if (!headerMap.conventionNumber) missingHeaders.push('Convention / Agreement Number');

        if (missingHeaders.length > 0) {
          resolve({
            success: false,
            created: 0,
            updated: 0,
            ignored: 0,
            missingHeaders,
            errors: [`Missing required columns: ${missingHeaders.join(', ')}`],
            parsedItems: [],
          });
          return;
        }

        let created = 0;
        let updated = 0;
        let ignored = 0;
        const updatedList: Provider[] = [...existingProviders];

        rawJson.forEach((row) => {
          const nameVal = String(row[headerMap.name!] || '').trim();
          const convVal = String(row[headerMap.conventionNumber!] || '').trim();

          if (!nameVal || !convVal) {
            ignored++;
            return;
          }

          const typeRaw = headerMap.type ? String(row[headerMap.type] || 'Hospital').trim() : 'Hospital';
          const location = headerMap.location ? String(row[headerMap.location] || 'Monrovia').trim() : 'Monrovia';
          const phone = headerMap.contactPhone ? String(row[headerMap.contactPhone] || '').trim() : '';
          const tier = headerMap.tier ? String(row[headerMap.tier] || 'Tier 1 Accredited Partner').trim() : 'Tier 1 Accredited Partner';
          const kypRaw = headerMap.kypStatus ? String(row[headerMap.kypStatus] || 'validated').trim().toLowerCase() : 'validated';
          const kypStatus = kypRaw.includes('rej') ? 'rejected' : kypRaw.includes('pend') || kypRaw.includes('att') ? 'pending' : 'validated';
          const statusRaw = headerMap.status ? String(row[headerMap.status] || 'Contracted').trim().toLowerCase() : 'contracted';
          const status = (statusRaw.includes('non') || statusRaw.includes('suspend')) ? (statusRaw.includes('suspend') ? 'Suspended' : 'Non-contracted') : 'Contracted';

          const existingIndex = updatedList.findIndex(p => p.conventionNumber.toLowerCase() === convVal.toLowerCase());

          const provObj: Provider = {
            id: existingIndex >= 0 ? updatedList[existingIndex].id : `prv-imp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: nameVal,
            type: (typeRaw.includes('Pharm') ? 'Pharmacy' : typeRaw.includes('Clin') ? 'Clinic' : typeRaw.includes('Diag') ? 'Diagnostic Center' : typeRaw.includes('Dent') ? 'Dental Clinic' : typeRaw.includes('Opt') ? 'Optical Center' : 'Hospital') as any,
            location,
            conventionNumber: convVal,
            kypStatus,
            contactPhone: phone || '+231 77 000 0000',
            tier,
            status: status as any,
          };

          if (existingIndex >= 0) {
            updatedList[existingIndex] = provObj;
            updated++;
          } else {
            updatedList.unshift(provObj);
            created++;
          }
        });

        resolve({
          success: true,
          created,
          updated,
          ignored,
          missingHeaders: [],
          errors: [],
          parsedItems: updatedList,
        });
      } catch (err: any) {
        resolve({
          success: false,
          created: 0,
          updated: 0,
          ignored: 0,
          missingHeaders: [],
          errors: [`Excel parsing error: ${err.message || 'Corrupted file'}`],
          parsedItems: [],
        });
      }
    };

    reader.onerror = () => {
      resolve({
        success: false,
        created: 0,
        updated: 0,
        ignored: 0,
        missingHeaders: [],
        errors: ['Unable to read the uploaded file.'],
        parsedItems: [],
      });
    };

    reader.readAsArrayBuffer(file);
  });
}

export function generateProviderTemplateExcel() {
  const wsData = [
    ['Healthcare Facility Name', 'Facility Type', 'City / Location', 'Convention Number', 'KYP Status', 'Contact Phone', 'Accreditation Tier', 'Contract Status'],
    ['Fidelity Healthcare Clinic', 'Clinic', 'Monrovia, Sinkor 15th St', 'CONV-2026-FID-06', 'validated', '+231 77 888 1122', 'Tier 1 Medical Center', 'Contracted'],
    ['St. Luke Specialist Hospital', 'Hospital', 'Monrovia, Paynesville', 'CONV-2026-LUK-07', 'validated', '+231 88 555 3344', 'Tier 1 Referral Hospital', 'Contracted'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Providers Template');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([wbout], { type: 'application/octet-stream' }), 'ACTIVA_Healthcare_Providers_Template.xlsx');
}

export function exportProvidersToExcel(providers: Provider[], lang?: any) {
  const data = providers.map(p => ({
    'Healthcare Facility Name': p.name,
    'Facility Type': p.type,
    'City / Location': p.location,
    'Convention Number': p.conventionNumber,
    'KYP Status': p.kypStatus.toUpperCase(),
    'Contact Phone': p.contactPhone,
    'Accreditation Tier': p.tier || 'Tier 1',
    'Contract Status': p.status || 'Contracted',
  }));

  const ws = XLSX.utils.json_to_sheet(sanitizeRowsForExcel(data));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Healthcare Providers');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([wbout], { type: 'application/octet-stream' }), `ACTIVA_Healthcare_Providers_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function exportProvidersToCSV(providers: Provider[], lang?: any) {
  const headers = ['Facility Name', 'Type', 'Location', 'Convention Number', 'KYP Status', 'Phone', 'Tier', 'Status'];
  const rows = providers.map(p => [
    `"${p.name}"`,
    `"${p.type}"`,
    `"${p.location}"`,
    `"${p.conventionNumber}"`,
    `"${p.kypStatus.toUpperCase()}"`,
    `"${p.contactPhone}"`,
    `"${p.tier || 'Tier 1'}"`,
    `"${p.status || 'Contracted'}"`,
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadBlob(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }), `ACTIVA_Healthcare_Providers_${new Date().toISOString().split('T')[0]}.csv`);
}

// ================= CLAIMS & INVOICES EXPORTS =================
export function exportClaimsToExcel(claims: Claim[], lang?: any) {
  const data = claims.map(c => ({
    'Claim Reference': c.reference,
    'Card Number': c.memberCardNo,
    'Insured Member Name': c.memberName,
    'Organization / Employer': c.organization,
    'Healthcare Provider': c.provider,
    'Amount': c.amount,
    'Currency': c.currency || 'USD',
    'Care Category': c.careType,
    'Service Date': c.serviceDate,
    'Submission Date': c.submissionDate,
    'Status': c.status.toUpperCase(),
    'Attending Physician': c.doctorName || 'N/A',
    'Rejection / Return Reason': c.rejectionReason || c.returnReason || '',
    'Comments': c.comments || '',
  }));

  const ws = XLSX.utils.json_to_sheet(sanitizeRowsForExcel(data));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Benefit Claims');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([wbout], { type: 'application/octet-stream' }), `ACTIVA_Benefit_Claims_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function exportClaimsToCSV(claims: Claim[], lang?: any) {
  const headers = ['Claim Reference', 'Card Number', 'Insured Name', 'Organization', 'Healthcare Facility', 'Amount', 'Care Type', 'Service Date', 'Status', 'Reason'];
  const rows = claims.map(c => [
    `"${c.reference}"`,
    `"${c.memberCardNo}"`,
    `"${c.memberName}"`,
    `"${c.organization}"`,
    `"${c.provider}"`,
    c.amount,
    `"${c.careType}"`,
    `"${c.serviceDate}"`,
    `"${c.status.toUpperCase()}"`,
    `"${c.rejectionReason || c.returnReason || ''}"`,
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadBlob(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }), `ACTIVA_Benefit_Claims_${new Date().toISOString().split('T')[0]}.csv`);
}

export function exportInvoicesToExcel(invoices: InvoiceItem[], lang?: any) {
  const data = invoices.map(i => ({
    'Invoice Reference': i.reference,
    'Patient Name': i.patientName,
    'Head of Family': i.familyHead,
    'Card Number': i.cardNo,
    'Healthcare Provider': i.provider,
    'Organization / Employer': i.organization,
    'Amount ($)': i.amount,
    'Status': i.status.toUpperCase(),
    'Service Date': i.serviceDate,
    'Care Category': i.careType,
    'Coverage Rate (%)': `${i.coveragePercentage}%`,
  }));

  const ws = XLSX.utils.json_to_sheet(sanitizeRowsForExcel(data));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Invoices & Settlements');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([wbout], { type: 'application/octet-stream' }), `ACTIVA_Invoices_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ================= STATISTICAL REPORT EXPORTS =================
export function exportReportsToExcel(providerDistribution: any[], orgDistribution: any[], lang?: any) {
  const wb = XLSX.utils.book_new();

  const provData = providerDistribution.map(p => ({
    'Provider / Healthcare Facility': p.name,
    'Total Claims Count': p.count,
    'Total Amount ($ USD)': p.amount,
    'Percentage Share (%)': `${p.percentage}%`,
  }));
  const wsProv = XLSX.utils.json_to_sheet(sanitizeRowsForExcel(provData));
  XLSX.utils.book_append_sheet(wb, wsProv, 'By Provider');

  const orgData = orgDistribution.map(o => ({
    'Organization / Client Policy': o.name,
    'Total Claims Count': o.count,
    'Total Amount ($ USD)': o.amount,
    'Percentage Share (%)': `${o.percentage}%`,
  }));
  const wsOrg = XLSX.utils.json_to_sheet(sanitizeRowsForExcel(orgData));
  XLSX.utils.book_append_sheet(wb, wsOrg, 'By Organization');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([wbout], { type: 'application/octet-stream' }), `ACTIVA_Statistical_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function exportReportsToPDF(
  kpis: { totalBilled: number; totalReimbursed: number; avgTime: string; rejectionRate: number | string },
  providerDistribution: any[],
  orgDistribution: any[],
  lang?: any
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Banner
  doc.setFillColor(10, 46, 107);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFillColor(0, 168, 89);
  doc.rect(0, 28, pageWidth, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  drawRefinedHeaderTitle(doc, 'ACTIVA HEALTHCARE ASSURANCE', 15, 12, { charSpace: 0.2 });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  drawRefinedHeaderTitle(doc, 'ANALYTICAL OPERATIONS & PERFORMANCE REPORT', 15, 19);
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 15, 24);

  // === AMÉLIORATION AJOUTÉE : bandeau logos ACTIVA + Globus sous le bandeau de couleur
  // existant (voir pdfBranding.ts). Le document utilise déjà un curseur "currentY" cumulatif
  // pour tout ce qui suit, donc décaler son point de départ suffit à propager le changement
  // sans toucher au reste de la mise en page (autoTable gère lui-même la pagination).
  drawPdfLogoStrip(doc, pageWidth, 31);

  let currentY = 40 + PDF_LOGO_STRIP_HEIGHT;

  // KPI Summary
  doc.setTextColor(10, 46, 107);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  drawRefinedHeaderTitle(doc, '1. CONSOLIDATED KEY METRICS', 15, currentY, { charSpace: 0.15 });
  currentY += 8;

  const cardW = (pageWidth - 30 - 15) / 4;
  const cardH = 20;
  const kpiItems = [
    { label: 'Total Billed', val: `$${kpis.totalBilled.toLocaleString('en-US')}` },
    { label: 'Total Reimbursed', val: `$${kpis.totalReimbursed.toLocaleString('en-US')}` },
    { label: 'Avg Processing', val: kpis.avgTime },
    { label: 'Rejection Rate', val: `${kpis.rejectionRate}%` },
  ];

  kpiItems.forEach((k, idx) => {
    const x = 15 + idx * (cardW + 5);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, currentY, cardW, cardH, 2, 2, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, currentY, cardW, cardH, 2, 2, 'S');

    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(k.label, x + 4, currentY + 6);

    doc.setTextColor(10, 46, 107);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(k.val, x + 4, currentY + 14);
  });

  currentY += cardH + 12;

  // Table Top Providers
  doc.setTextColor(10, 46, 107);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  drawRefinedHeaderTitle(doc, '2. EXPENDITURE BREAKDOWN BY HEALTHCARE FACILITY', 15, currentY, { charSpace: 0.15 });
  currentY += 4;

  const provRows = providerDistribution.slice(0, 8).map(p => [
    p.name,
    p.count.toString(),
    `$${p.amount.toLocaleString('en-US')}`,
    `${p.percentage}%`,
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Healthcare Provider', 'Claims Count', 'Total Amount ($ USD)', 'Share (%)']],
    body: provRows,
    headStyles: {
      fillColor: [13, 63, 143],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8 },
  });

  const nextY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 12 : currentY + 60;

  // Table Top Orgs
  doc.setTextColor(10, 46, 107);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  drawRefinedHeaderTitle(doc, '3. CLAIMS CONSUMPTION BY POLICY / ORGANIZATION', 15, nextY, { charSpace: 0.15 });

  const orgRows = orgDistribution.slice(0, 8).map(o => [
    o.name,
    o.count.toString(),
    `$${o.amount.toLocaleString('en-US')}`,
    `${o.percentage}%`,
  ]);

  autoTable(doc, {
    startY: nextY + 4,
    head: [['Organization Name', 'Claims Count', 'Total Amount ($ USD)', 'Share (%)']],
    body: orgRows,
    headStyles: {
      fillColor: [0, 168, 89],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8 },
  });

  doc.save(`ACTIVA_Analytical_Report_${new Date().toISOString().split('T')[0]}.pdf`);
}

// ================= ANALYTICAL PDF REPORT GENERATOR =================
export function generateExecutiveReportPDF(metrics: {
  totalClaims: number;
  approvedClaims: number;
  pendingClaims: number;
  rejectedClaims: number;
  totalAmountUSD: number;
  activeMembers: number;
  activeOrgs: number;
  activeProviders: number;
  claimsList: Claim[];
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Banner
  doc.setFillColor(10, 46, 107); // ACTIVA Blue
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFillColor(0, 168, 89); // ACTIVA Green
  doc.rect(0, 28, pageWidth, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  drawRefinedHeaderTitle(doc, 'ACTIVA HEALTHCARE ASSURANCE', 15, 12, { charSpace: 0.2 });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  drawRefinedHeaderTitle(doc, 'EXECUTIVE OPERATIONS & HEALTH CLAIMS REPORT', 15, 19);
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 15, 24);

  doc.setFontSize(7.5);
  doc.text('CONFIDENTIAL & AUDIT READY', pageWidth - 14, 12, { align: 'right' });
  doc.text('ACTIVA HealthPass Portal', pageWidth - 14, 18, { align: 'right' });

  // === AMÉLIORATION AJOUTÉE : bandeau logos ACTIVA + Globus (voir pdfBranding.ts) ; comme
  // pour exportReportsToPDF ci-dessus, décaler le point de départ du curseur "currentY"
  // suffit à propager le changement sur tout le reste du document.
  drawPdfLogoStrip(doc, pageWidth, 31);

  let currentY = 40 + PDF_LOGO_STRIP_HEIGHT;

  // KPI Highlights Grid
  doc.setTextColor(10, 46, 107);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  drawRefinedHeaderTitle(doc, '1. KEY EXECUTIVE PERFORMANCE INDICATORS', 15, currentY, { charSpace: 0.15 });
  currentY += 6;

  const cardW = (pageWidth - 30 - 15) / 4;
  const cardH = 22;

  const kpis = [
    { label: 'Total Volume', value: `$${metrics.totalAmountUSD.toLocaleString('en-US')}`, sub: 'Claims & Direct Vouchers' },
    { label: 'Total Claims', value: metrics.totalClaims.toString(), sub: `${metrics.approvedClaims} Approved (${Math.round((metrics.approvedClaims / (metrics.totalClaims || 1)) * 100)}%)` },
    { label: 'Enrolled Members', value: metrics.activeMembers.toString(), sub: 'Biometrically Active' },
    { label: 'Partner Providers', value: metrics.activeProviders.toString(), sub: 'Contracted Facilities' },
  ];

  kpis.forEach((kpi, idx) => {
    const x = 15 + idx * (cardW + 5);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, currentY, cardW, cardH, 2, 2, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, currentY, cardW, cardH, 2, 2, 'S');

    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(kpi.label, x + 4, currentY + 6);

    doc.setTextColor(10, 46, 107);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(kpi.value, x + 4, currentY + 13);

    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(kpi.sub, x + 4, currentY + 18);
  });

  currentY += cardH + 12;

  // Table of recent claims
  doc.setTextColor(10, 46, 107);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  drawRefinedHeaderTitle(doc, '2. RECENT CLAIMS & SETTLEMENTS BREAKDOWN', 15, currentY, { charSpace: 0.15 });
  currentY += 4;

  const tableRows = metrics.claimsList.slice(0, 15).map(c => [
    c.reference,
    c.memberName,
    c.organization,
    c.provider,
    `$${c.amount} USD`,
    c.serviceDate,
    c.status.toUpperCase(),
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Reference', 'Insured Name', 'Organization', 'Healthcare Facility', 'Amount', 'Date', 'Status']],
    body: tableRows,
    headStyles: {
      fillColor: [13, 63, 143],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      4: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'center', fontStyle: 'bold' },
    },
  });

  const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY : 200;

  doc.setTextColor(148, 163, 184);
  doc.setFontSize(8);
  doc.text('ACTIVA Insurance — Official Management & Compliance Audit Trail', pageWidth / 2, finalY + 15, { align: 'center' });

  doc.save(`ACTIVA_Executive_Report_${new Date().toISOString().split('T')[0]}.pdf`);
}

// ================= HEALTH POLICY & PREMIUM MONITORING EXPORTS =================
// === AMÉLIORATION AJOUTÉE : Health Insurance Policy Management & Premium Monitoring ===
export function exportPoliciesToExcel(policies: (HealthPolicy & { organizationName?: string })[], lang?: any) {
  const data = policies.map((p) => ({
    'Organization': p.organizationId,
    'Policy Number': p.policyNumber,
    'Policy Type': p.policyType || '',
    'Effective Date': p.effectiveDate,
    'Expiration Date': p.expirationDate,
    'Policy Status': p.status,
    'Annual Premium': p.annualPremium,
    'Currency': p.currency,
    'Payment Frequency': p.paymentFrequency,
    'Next Payment Due': p.nextPaymentDueDate || '',
    'Outstanding Amount': p.outstandingAmount ?? 0,
    'Coverage Blocked': p.coverageBlocked ? 'YES' : 'NO',
  }));

  const ws = XLSX.utils.json_to_sheet(sanitizeRowsForExcel(data));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Policies & Premiums');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([wbout], { type: 'application/octet-stream' }), `ACTIVA_Policies_Premiums_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function exportPolicyDetailToPDF(
  policy: HealthPolicy,
  payments: PolicyPayment[],
  coveredPrincipals: number,
  coveredDependents: number
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(10, 46, 107);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFillColor(0, 168, 89);
  doc.rect(0, 28, pageWidth, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('ACTIVA HEALTHCARE ASSURANCE', 15, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('HEALTH INSURANCE POLICY DETAIL', 15, 19);
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 15, 24);

  let y = 40;
  doc.setTextColor(10, 46, 107);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('POLICY DETAILS', 15, y);
  y += 7;

  autoTable(doc, {
    startY: y,
    body: [
      ['Organization', policy.organizationId],
      ['Policy Number', policy.policyNumber],
      ['Policy Status', policy.status],
      ['Coverage Period', `${policy.effectiveDate} → ${policy.expirationDate}`],
      ['Annual Premium', `${policy.currency} ${policy.annualPremium.toLocaleString()}`],
      ['Payment Frequency', policy.paymentFrequency],
      ['Installment Amount', `${policy.currency} ${policy.installmentAmount.toLocaleString()}`],
      ['Outstanding Amount', `${policy.currency} ${(policy.outstandingAmount ?? 0).toLocaleString()}`],
    ],
    theme: 'plain',
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', textColor: [100, 116, 139] } },
  });

  let nextY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : y + 60;

  doc.setTextColor(10, 46, 107);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PAYMENT HISTORY', 15, nextY);

  const paymentRows = payments.map((p) => [
    p.quarter ? `Q${p.quarter}` : p.paymentDate,
    p.paymentDate,
    p.dueDate,
    `${p.currency} ${p.amountPaid.toLocaleString()}`,
    p.status,
  ]);

  autoTable(doc, {
    startY: nextY + 4,
    head: [['Period', 'Payment Date', 'Due Date', 'Amount Paid', 'Status']],
    body: paymentRows.length > 0 ? paymentRows : [['—', '—', '—', '—', 'No payments recorded']],
    headStyles: { fillColor: [13, 63, 143], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8 },
  });

  nextY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 12 : nextY + 60;

  doc.setTextColor(10, 46, 107);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('COVERED POPULATION', 15, nextY);

  autoTable(doc, {
    startY: nextY + 4,
    body: [
      ['Principal Insured', String(coveredPrincipals)],
      ['Dependents', String(coveredDependents)],
      ['Total Covered', String(coveredPrincipals + coveredDependents)],
    ],
    theme: 'plain',
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', textColor: [100, 116, 139] } },
  });

  doc.save(`ACTIVA_Policy_${policy.policyNumber}_${new Date().toISOString().split('T')[0]}.pdf`);
}
