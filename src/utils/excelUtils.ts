import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Member, Organization, Provider, Claim, InvoiceItem, DependentItem, DependentRelationship } from '../types';

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

    reader.onload = (e) => {
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

        rawJson.forEach((row) => {
          const cardNoVal = String(row[headerMap.cardNo!] || '').trim();
          const principalVal = String(row[headerMap.principalName!] || '').trim();

          if (!cardNoVal || !principalVal) {
            ignored++;
            return;
          }

          const orgVal = headerMap.organization ? String(row[headerMap.organization] || '').trim() : 'Orange Liberia Telecom';
          const dobVal = headerMap.birthDate ? formatExcelDate(row[headerMap.birthDate]) : '1985-06-15';
          const statusRaw = headerMap.status ? String(row[headerMap.status] || '').trim().toLowerCase() : 'active';
          const status = (statusRaw.includes('inact') || statusRaw.includes('suspend')) ? (statusRaw.includes('suspend') ? 'Suspendu' : 'Inactif') : 'Actif';
          
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
              organization: orgVal || 'Orange Liberia Telecom',
              status: status as any,
              hasPhoto: false,
              hasBiometrics: hasBiometrics,
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
        organization: orgVal || 'Orange Liberia Telecom',
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
export function generateMemberTemplateExcel() {
  const wsData = [
    [
      'Card No.',
      'Primary Insured Name',
      'Date of Birth',
      'Spouse Name',
      'Spouse Date of Birth',
      'Child 1 Name',
      'Child 1 Date of Birth',
      'Child 2 Name',
      'Child 2 Date of Birth',
      'Child 3 Name',
      'Child 3 Date of Birth',
      'Child 4 Name',
      'Child 4 Date of Birth',
      'Organization',
      'Biometrics',
    ],
    [
      'ACT-2026-10350',
      'Samuel DOE',
      '1985-05-14',
      'Mary DOE',
      '1988-09-22',
      'Lucas DOE',
      '2014-03-10',
      'Emma DOE',
      '2017-08-19',
      'Noah DOE',
      '2021-01-05',
      '',
      '',
      'Orange Liberia Telecom',
      'Yes',
    ],
    [
      'ACT-2026-10351',
      'Grace KOLLIE',
      '1992-11-20',
      'Joseph KOLLIE',
      '1990-04-15',
      'Nathan KOLLIE',
      '2019-06-12',
      'Chloe KOLLIE',
      '2022-10-30',
      '',
      '',
      '',
      '',
      'Ecobank Liberia Head Office',
      'Yes',
    ],
    [
      'ACT-2026-10352',
      'Alexander FREEMAN',
      '1980-07-03',
      'Beatrice FREEMAN',
      '1983-12-08',
      'David FREEMAN',
      '2012-11-25',
      '',
      '',
      '',
      '',
      '',
      '',
      'TotalEnergies Liberia Ltd',
      'Yes',
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
      'Orange Liberia Telecom',
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
      'Orange Liberia Telecom',
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
      'Orange Liberia Telecom',
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
      'Ecobank Liberia Head Office',
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
      'Ecobank Liberia Head Office',
      'Yes',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dependents');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([wbout], { type: 'application/octet-stream' }), 'ACTIVA_Template_Dependants.xlsx');
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
  const wsPrincipals = XLSX.utils.json_to_sheet(principalsData);
  XLSX.utils.book_append_sheet(wb, wsPrincipals, 'Principal Insured');

  // Add Sheet 2: Dependents
  const wsDependents = XLSX.utils.json_to_sheet(
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

  const ws = XLSX.utils.json_to_sheet(data);
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

  const ws = XLSX.utils.json_to_sheet(data);
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

  const ws = XLSX.utils.json_to_sheet(data);
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

  const ws = XLSX.utils.json_to_sheet(data);
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
  const wsProv = XLSX.utils.json_to_sheet(provData);
  XLSX.utils.book_append_sheet(wb, wsProv, 'By Provider');

  const orgData = orgDistribution.map(o => ({
    'Organization / Client Policy': o.name,
    'Total Claims Count': o.count,
    'Total Amount ($ USD)': o.amount,
    'Percentage Share (%)': `${o.percentage}%`,
  }));
  const wsOrg = XLSX.utils.json_to_sheet(orgData);
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
  doc.text('ACTIVA HEALTHCARE ASSURANCE', 15, 12);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('ANALYTICAL OPERATIONS & PERFORMANCE REPORT', 15, 19);
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 15, 24);

  let currentY = 40;

  // KPI Summary
  doc.setTextColor(10, 46, 107);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('1. CONSOLIDATED KEY METRICS', 15, currentY);
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
  doc.text('2. EXPENDITURE BREAKDOWN BY HEALTHCARE FACILITY', 15, currentY);
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
  doc.text('3. CLAIMS CONSUMPTION BY POLICY / ORGANIZATION', 15, nextY);

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
  doc.text('ACTIVA HEALTHCARE ASSURANCE', 15, 12);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('EXECUTIVE OPERATIONS & HEALTH CLAIMS REPORT', 15, 19);
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 15, 24);

  doc.setFontSize(7.5);
  doc.text('CONFIDENTIAL & AUDIT READY', pageWidth - 14, 12, { align: 'right' });
  doc.text('ACTIVA HealthPass Portal', pageWidth - 14, 18, { align: 'right' });

  let currentY = 40;

  // KPI Highlights Grid
  doc.setTextColor(10, 46, 107);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('1. KEY EXECUTIVE PERFORMANCE INDICATORS', 15, currentY);
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
  doc.text('2. RECENT CLAIMS & SETTLEMENTS BREAKDOWN', 15, currentY);
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
