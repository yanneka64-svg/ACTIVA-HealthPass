import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Member, Organization, Provider, Claim, InvoiceItem, DependentItem } from '../types';

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
  principalName: ['primary insured', 'principal name', 'member name', 'insured name', 'full name', 'name', 'assure principal', 'principal', 'nom principal', 'nom et prenom'],
  spouseName: ['spouse', 'spouse name', 'partner', 'conjoint', 'nom conjoint', 'epoux', 'epouse'],
  children: ['children', 'dependents', 'child', 'kids', 'enfants', 'enfant', 'ayants droit'],
  organization: ['organization', 'company', 'employer', 'policy holder', 'organisation', 'entreprise', 'societe', 'police'],
  relationship: ['relationship', 'family status', 'role', 'lien', 'lien de parente', 'statut familial', 'qualite'],
  status: ['status', 'active status', 'membership status', 'statut', 'etat'],
  birthDate: ['date of birth', 'birth date', 'dob', 'birthdate', 'date de naissance', 'naissance'],
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

        // Detect column mapping from the keys of the first row
        const headers = Object.keys(rawJson[0]);
        const headerMap: { [key in keyof typeof MEMBER_COLUMN_MAPPINGS]?: string } = {};

        for (const [field, aliases] of Object.entries(MEMBER_COLUMN_MAPPINGS)) {
          const matchedHeader = headers.find(h => matchHeaderAlias(h, aliases));
          if (matchedHeader) {
            headerMap[field as keyof typeof MEMBER_COLUMN_MAPPINGS] = matchedHeader;
          }
        }

        // Required headers validation: cardNo and principalName
        const missingHeaders: string[] = [];
        if (!headerMap.cardNo) missingHeaders.push('Card No. (Health Card ID)');
        if (!headerMap.principalName) missingHeaders.push('Primary Insured / Full Name');

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

          const orgVal = headerMap.organization ? String(row[headerMap.organization] || '').trim() : 'Standard';
          const spouseVal = headerMap.spouseName ? String(row[headerMap.spouseName] || '').trim() : '';
          const childrenRaw = headerMap.children ? String(row[headerMap.children] || '').trim() : '';
          const childrenList = childrenRaw ? childrenRaw.split(/[,;/]+/).map(s => s.trim()).filter(Boolean) : [];
          const statusRaw = headerMap.status ? String(row[headerMap.status] || '').trim().toLowerCase() : 'active';
          const status = (statusRaw.includes('inact') || statusRaw.includes('suspend')) ? (statusRaw.includes('suspend') ? 'Suspended' : 'Inactive') : 'Active';
          const birthDate = headerMap.birthDate ? String(row[headerMap.birthDate] || '1985-06-15') : '1985-06-15';
          const relationshipRaw = headerMap.relationship ? String(row[headerMap.relationship] || 'Primary').trim() : 'Primary';

          const existingIndex = updatedList.findIndex(m => m.cardNo.toLowerCase() === cardNoVal.toLowerCase());

          const memberObj: Member = {
            id: existingIndex >= 0 ? updatedList[existingIndex].id : `mem-imp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            cardNo: cardNoVal,
            principalName: principalVal,
            spouseName: spouseVal || undefined,
            children: childrenList,
            birthDate: birthDate,
            relationship: (relationshipRaw.toLowerCase().includes('conjoint') || relationshipRaw.toLowerCase().includes('spouse')) ? 'Spouse' : (relationshipRaw.toLowerCase().includes('child') || relationshipRaw.toLowerCase().includes('enfant')) ? 'Child' : 'Primary',
            organization: orgVal || 'Standard',
            status: status as any,
            hasPhoto: existingIndex >= 0 ? updatedList[existingIndex].hasPhoto : false,
            hasBiometrics: existingIndex >= 0 ? updatedList[existingIndex].hasBiometrics : false,
            photoUrl: existingIndex >= 0 ? updatedList[existingIndex].photoUrl : undefined,
            outpatientBalanceUSD: existingIndex >= 0 ? updatedList[existingIndex].outpatientBalanceUSD : 1000,
            outpatientCeilingUSD: existingIndex >= 0 ? updatedList[existingIndex].outpatientCeilingUSD : 1000,
            inpatientBalanceUSD: existingIndex >= 0 ? updatedList[existingIndex].inpatientBalanceUSD : 10000,
            inpatientCeilingUSD: existingIndex >= 0 ? updatedList[existingIndex].inpatientCeilingUSD : 10000,
            gender: 'M',
            createdAt: existingIndex >= 0 ? updatedList[existingIndex].createdAt : new Date().toISOString().split('T')[0],
          };

          if (existingIndex >= 0) {
            updatedList[existingIndex] = memberObj;
            updated++;
          } else {
            updatedList.unshift(memberObj);
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

export function generateMemberTemplateExcel() {
  const wsData = [
    ['Card No.', 'Primary Insured Name', 'Spouse Name', 'Children (comma-separated)', 'Organization / Employer', 'Relationship', 'Status', 'Date of Birth (YYYY-MM-DD)'],
    ['ACT-2026-99001', 'Samuel DOE', 'Mary DOE', 'James DOE (10 yrs), Linda DOE (6 yrs)', 'Orange Liberia Telecom', 'Primary', 'Active', '1985-05-14'],
    ['ACT-2026-99002', 'Grace KOLLIE', 'Joseph KOLLIE', 'Peter KOLLIE (4 yrs)', 'Ecobank Liberia Head Office', 'Primary', 'Active', '1990-11-20'],
    ['ACT-2026-99003', 'Alexander FREEMAN', '', '', 'TotalEnergies Liberia Ltd', 'Primary', 'Active', '1982-08-03'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Members Template');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([wbout], { type: 'application/octet-stream' }), 'ACTIVA_Members_Import_Template.xlsx');
}

// ================= AMÉLIORATION AJOUTÉE : IMPORT MULTI-ORGANISATIONS (classeur "Staff / Deps") =================
// Import dédié pour les classeurs RH historiques structurés comme le fichier client fourni :
// une paire de feuilles "<Organisation> - Staff" / "<Organisation> - Deps" PAR employeur, au lieu
// d'une seule feuille plate. Ce format est INCOMPATIBLE avec parseMemberExcel() ci-dessus
// (qui ne lit que la 1ère feuille et une seule organisation) : on ne modifie donc PAS
// parseMemberExcel / generateMemberTemplateExcel (toujours disponibles pour les imports simples,
// mono-feuille) — ce bloc ajoute un second chemin d'import, en plus.
//
// Règles de correspondance déduites du fichier réel fourni par le client :
// - Feuille "<Org> - Staff" : 'Card No.', 'Primary Insured Name', 'Date of Birth', puis
//   optionnellement 'Contact', 'Spouse Name' + 'Spouse Date of Birth', et des paires
//   'Child N Name' + 'Child N Date of Birth' (N = 1..9). C'est la SEULE source du nom des
//   ayants droit (le nom du conjoint/enfant n'apparaît nulle part dans la feuille "Deps").
// - Feuille "<Org> - Deps" (mêmes 7 colonnes partout) : 'Card No.' (carte PROPRE à l'ayant
//   droit), 'Relationship' ('Spouse' ou 'Child N' — le N correspond exactement à la colonne
//   'Child N Name' de la feuille Staff), 'Date of Birth', 'Primary Insured' (nom du PRINCIPAL,
//   pas de l'ayant droit), 'Primary Card No.', 'Organization', 'Biometrics'. C'est la SEULE
//   source du numéro de carte individuel de chaque ayant droit — indispensable à
//   l'identification / aux réclamations le concernant.
// - L'organisation est déduite du nom de feuille (tout ce qui précède " - Staff"/" - Deps").
//
// Le résultat alimente à la fois `dependents[]` (structuré, avec cardNo propre — utilisé par
// eligibilityService et la recherche Agent) ET les champs hérités `spouseName`/`children`
// (chaîne "Nom (âge yrs)", même convention que parseMemberExcel / generateMemberTemplateExcel,
// pour rester compatible avec l'affichage historique de AgentIdentificationView / MembersView).
// Fusion avec les assurés déjà en base par numéro de carte, comme parseMemberExcel : un
// réimport du même fichier met à jour au lieu de dupliquer.

const STAFF_SHEET_SUFFIX = /\s*-\s*staff\s*$/i;
const DEPS_SHEET_SUFFIX = /\s*-\s*deps\s*$/i;
const CHILD_NAME_HEADER = /^child\s*(\d+)\s*name$/i;
const CHILD_DOB_HEADER = /^child\s*(\d+)\s*(?:date of birth|dob|birth date)$/i;
const CHILD_RELATIONSHIP_NUMBER = /child\s*(\d+)/i;

// Convertit une valeur de cellule Excel (objet Date JS, numéro de série Excel, ou texte libre)
// en 'YYYY-MM-DD'. Renvoie '' si la valeur est vide/illisible, pour laisser l'appelant décider
// de la valeur par défaut (même logique que parseMemberExcel, qui utilise déjà des fallbacks).
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

// Normalisation cosmétique "TOUT MAJUSCULES" -> "Casse de titre" (ex: "ORANGE LIBERIA" ->
// "Orange Liberia"), appliquée UNIQUEMENT quand le nom de feuille est entièrement en
// majuscules. Les noms déjà en casse mixte (ex: "Samaritain Purse") ne sont pas modifiés.
// Purement cosmétique : les comparaisons d'organisation dans le reste de l'app sont déjà
// insensibles à la casse (.toLowerCase().trim()), donc cela n'affecte aucune logique métier.
function titleCaseIfAllCaps(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed || !/[A-Z]/.test(trimmed) || trimmed !== trimmed.toUpperCase()) return trimmed;
  return trimmed
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// Si une organisation du même nom (insensible à la casse) existe déjà dans `existingOrganizations`
// (ex: "Orange Liberia Telecom" créée depuis l'écran Organisations), on réutilise EXACTEMENT ce nom
// au lieu du nom déduit de la feuille, pour que ceilings/eligibilityService/OrganizationsView
// retrouvent bien l'organisation existante. Sinon on garde le nom déduit de la feuille.
function reconcileOrganizationName(sheetOrgName: string, existingOrganizations: Organization[]): string {
  const match = existingOrganizations.find(
    (o) => o.name.toLowerCase().trim() === sheetOrgName.toLowerCase().trim()
  );
  return match ? match.name : sheetOrgName;
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
        // cellDates: true => les colonnes "Date of Birth" arrivent en objets Date JS exploitables
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
              // Exclusion explicite de "Primary Card No." : sans elle, la détection par alias
              // (qui matche "card no" en sous-chaîne) pourrait s'y accrocher selon l'ordre des
              // colonnes du fichier au lieu de la véritable colonne "Card No." de l'ayant droit.
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

            const memberObj: Member = {
              id: existingMember ? existingMember.id : `mem-imp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              cardNo: cardNoVal,
              principalName: principalVal,
              spouseName: spouseNameVal || existingMember?.spouseName,
              children: childrenLegacy.length > 0 ? childrenLegacy : existingMember?.children || [],
              dependents: dependents.length > 0 ? dependents : existingMember?.dependents || [],
              birthDate: birthDate || existingMember?.birthDate || '1985-01-01',
              relationship: existingMember?.relationship || 'Primary',
              organization,
              status: existingMember?.status || 'Active',
              hasPhoto: existingMember?.hasPhoto || false,
              hasBiometrics: existingMember?.hasBiometrics || dependents.some((d) => d.hasBiometrics),
              phone: phone || existingMember?.phone,
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

// Modèle de classeur téléchargeable, reproduisant EXACTEMENT la structure attendue par
// parseActivaMultiOrgExcel() ci-dessus (une paire de feuilles "<Organisation> - Staff" /
// "<Organisation> - Deps"), avec une feuille d'instructions et un exemple concret. Pour
// ajouter une organisation, il suffit de dupliquer les 2 feuilles d'exemple et de renommer
// "Example Org" par le nom réel de l'organisation (en conservant " - Staff" / " - Deps").
export function generateMultiOrgTemplateExcel() {
  const wb = XLSX.utils.book_new();

  const instructions = [
    ['ACTIVA HealthPass — Modèle d\'import multi-organisations (Staff / Deps)'],
    [''],
    ['1. Une organisation = une PAIRE de feuilles nommées EXACTEMENT :'],
    ['   "<Nom Organisation> - Staff"  et  "<Nom Organisation> - Deps"'],
    ['   (respecter les espaces autour du tiret, comme dans les 2 feuilles d\'exemple ci-jointes)'],
    [''],
    ['2. Feuille "... - Staff" (1 ligne = 1 assuré PRINCIPAL) :'],
    ['   - Card No. : numéro de carte du principal (obligatoire, unique)'],
    ['   - Primary Insured Name : nom complet du principal (obligatoire)'],
    ['   - Date of Birth : date de naissance du principal (JJ/MM/AAAA ou AAAA-MM-JJ)'],
    ['   - Contact : téléphone (optionnel)'],
    ['   - Spouse Name / Spouse Date of Birth : conjoint (optionnel)'],
    ['   - Child 1 Name / Child 1 Date of Birth, Child 2 Name / Child 2 Date of Birth, ... :'],
    ['     un enfant par paire de colonnes. Ajoutez autant de paires "Child N" que nécessaire.'],
    [''],
    ['3. Feuille "... - Deps" (1 ligne = 1 ayant droit, conjoint OU enfant) — donne à chaque'],
    ['   ayant droit son PROPRE numéro de carte, utilisé pour l\'identifier/le rembourser :'],
    ['   - Card No. : numéro de carte PROPRE à l\'ayant droit (obligatoire, unique)'],
    ['   - Relationship : "Spouse" pour le conjoint, ou "Child 1" / "Child 2" / ... — le numéro'],
    ['     doit correspondre EXACTEMENT à la colonne "Child N Name" de la feuille Staff'],
    ['   - Date of Birth : date de naissance de l\'ayant droit'],
    ['   - Primary Insured : nom du PRINCIPAL (pas de l\'ayant droit)'],
    ['   - Primary Card No. : numéro de carte du PRINCIPAL (fait le lien avec la feuille Staff)'],
    ['   - Organization : nom de l\'organisation (identique au nom de feuille)'],
    ['   - Biometrics : "Yes" si les empreintes biométriques ont déjà été enregistrées'],
    [''],
    ['4. Si la feuille "... - Deps" d\'une organisation est vide ou absente, les conjoints/enfants'],
    ['   seront quand même importés depuis la feuille "Staff", mais SANS numéro de carte propre'],
    ['   (à compléter plus tard depuis l\'écran Assurés).'],
    [''],
    ['5. Réimporter ce fichier après modification met à jour les fiches existantes (par numéro de'],
    ['   carte) au lieu de les dupliquer — vous pouvez donc l\'utiliser aussi pour des mises à jour.'],
  ];
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
  wsInstructions['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'INSTRUCTIONS');

  const staffData = [
    ['Card No.', 'Primary Insured Name', 'Date of Birth', 'Contact', 'Spouse Name', 'Spouse Date of Birth', 'Child 1 Name', 'Child 1 Date of Birth', 'Child 2 Name', 'Child 2 Date of Birth'],
    ['EXG-00001-0001', 'Samuel DOE', '1985-05-14', '+231 88 000 1122', 'Mary DOE', '1987-02-20', 'James DOE', '2015-08-31', 'Linda DOE', '2018-12-11'],
    ['EXG-00002-0002', 'Grace KOLLIE', '1990-11-20', '+231 77 000 3344', '', '', 'Peter KOLLIE', '2020-04-04', '', ''],
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
