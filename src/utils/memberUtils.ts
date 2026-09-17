import { Member } from '../types';

// === AMÉLIORATION AJOUTÉE : déplacé depuis src/views/settings/MembersView.tsx (auto-revue,
// 2026-09-12) — ces fonctions n'ont aucune dépendance à la vue Membres elle-même (aucun JSX,
// aucun état React) mais étaient importées statiquement par des modules qui n'ont besoin QUE
// de ce calcul (Claim360Panel.tsx, AgentIdentificationView.tsx). Les importer depuis
// MembersView.tsx — un composant lourd qui embarque WebcamCaptureModal/BiometricFingerprintModal/
// ExcelImportModal/etc. — forçait ces modules à tirer (au chargement) le chunk Vite de tout
// l'écran Membres, même pour un utilisateur qui ne l'ouvre jamais. Comportement strictement
// identique : seul l'emplacement du code change, MembersView.tsx réexporte pour ne rien casser
// côté appelants existants.
export interface FormattedDependent {
  id: string;
  cardNo: string;
  fullName: string;
  birthDate: string;
  age?: number | string;
  relationship: string;
  gender?: 'M' | 'F';
  hasBiometrics?: boolean;
}

export function formatRelationship(rel: string): string {
  if (!rel) return 'Spouse';
  const lower = rel.toLowerCase().trim();
  if (lower === 'husband') return 'Husband';
  if (lower === 'wife') return 'Wife';
  if (lower === 'spouse') return 'Spouse';
  if (lower === 'child') return 'Child';
  if (lower === 'parent') return 'Parent';
  if (lower === 'other') return 'Other';
  return rel.charAt(0).toUpperCase() + rel.slice(1);
}

export function deriveDependentCardNo(primaryCardNo: string, offset: number): string {
  if (!primaryCardNo) return `ACT-DEP-${offset}`;
  const match = primaryCardNo.match(/^(.*?)-(\d+)$/);
  if (match) {
    const prefix = match[1];
    const num = parseInt(match[2], 10);
    return `${prefix}-${num + offset}`;
  }
  return `${primaryCardNo}-${offset}`;
}

export function calculateAge(birthDate: string): number | undefined {
  try {
    const b = new Date(birthDate);
    if (isNaN(b.getTime())) return undefined;
    const today = new Date(2026, 7, 31);
    let age = today.getFullYear() - b.getFullYear();
    const m = today.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < b.getDate())) {
      age--;
    }
    return age >= 0 ? age : undefined;
  } catch {
    return undefined;
  }
}

export const getMemberDependents = (m: Member): FormattedDependent[] => {
  if (!m) return [];

  if (m.dependents && m.dependents.length > 0) {
    return m.dependents.map((d, index) => {
      const cardSeq = d.cardNo || deriveDependentCardNo(m.cardNo, index + 1);
      const relFormatted = formatRelationship(d.relationship);
      return {
        id: d.id || `dep-${m.id}-${index}`,
        cardNo: cardSeq,
        fullName: d.fullName,
        birthDate: d.birthDate || '1995-01-01',
        age: d.age || (d.birthDate ? calculateAge(d.birthDate) : undefined),
        relationship: relFormatted,
        gender: d.gender,
        hasBiometrics: d.hasBiometrics ?? true,
      };
    });
  }

  const result: FormattedDependent[] = [];
  let seq = 1;

  if (m.spouseName && m.spouseName.trim()) {
    const rel = m.dependentRelationship ? formatRelationship(m.dependentRelationship) : 'Spouse';
    result.push({
      id: `dep-spouse-${m.id}`,
      cardNo: deriveDependentCardNo(m.cardNo, seq++),
      fullName: m.spouseName.trim(),
      birthDate: '1986-05-14',
      age: 39,
      relationship: rel,
      gender: rel.toLowerCase() === 'husband' ? 'M' : 'F',
      hasBiometrics: true,
    });
  }

  if (m.children && m.children.length > 0) {
    m.children.forEach((childStr, i) => {
      const match = childStr.match(/^(.*?)(?:\s*\((.*?)\))?$/);
      const name = match && match[1] ? match[1].trim() : childStr;
      const ageStr = match && match[2] ? match[2].trim() : undefined;
      const parsedAge = ageStr ? parseInt(ageStr, 10) : undefined;
      const birthYear = parsedAge ? 2026 - parsedAge : 2018 + i;
      const birthDate = `${birthYear}-08-15`;

      result.push({
        id: `dep-child-${m.id}-${i}`,
        cardNo: deriveDependentCardNo(m.cardNo, seq++),
        fullName: name,
        birthDate: birthDate,
        age: parsedAge || (2026 - birthYear),
        relationship: 'Child',
        gender: i % 2 === 0 ? 'M' : 'F',
        hasBiometrics: (parsedAge || 10) >= 6,
      });
    });
  }

  return result;
};

// === AMÉLIORATION AJOUTÉE : dédoublonnage à l'affichage des assurés principaux ===
// Constat : après plusieurs tentatives d'import (dont certaines interrompues avant les
// correctifs appliqués sur handleImportMembers/updateMember), la collection Firestore
// `members` peut contenir plusieurs documents portant le MÊME numéro de carte (le même
// assuré, dupliqué). Plutôt que de supprimer des données en base — une action destructive
// et irréversible sur la production — cette fonction ne fait que choisir, pour chaque
// numéro de carte, UN SEUL enregistrement représentatif à afficher (le plus complet, ou le
// plus récent en cas d'égalité). Les documents Firestore sous-jacents ne sont ni modifiés
// ni supprimés : seuls les compteurs et listes affichés à l'écran (Dashboard, Organizations,
// Members Directory) reflètent désormais le nombre réel d'assurés distincts.
export function dedupeMembersByCardNo(members: Member[]): Member[] {
  const byCardNo = new Map<string, Member>();
  let noCardCounter = 0;

  for (const m of members) {
    const key = (m.cardNo || '').trim().toLowerCase();

    // A member without a usable card number can't be matched against others — keep it as-is
    // under its own unique key rather than risk collapsing unrelated records together.
    if (!key) {
      byCardNo.set(`__no-card-${m.id || noCardCounter++}`, m);
      continue;
    }

    const existing = byCardNo.get(key);
    if (!existing) {
      byCardNo.set(key, m);
      continue;
    }

    const existingScore = memberCompletenessScore(existing);
    const currentScore = memberCompletenessScore(m);
    const currentIsBetter =
      currentScore > existingScore ||
      (currentScore === existingScore && (m.createdAt || '') > (existing.createdAt || ''));

    if (currentIsBetter) {
      byCardNo.set(key, m);
    }
  }

  return Array.from(byCardNo.values());
}

// Heuristic used to pick which of several duplicate records (same card number) is kept as
// the representative one: the one carrying the most useful data.
function memberCompletenessScore(m: Member): number {
  let score = 0;
  if (m.dependents && m.dependents.length > 0) score += 2;
  if (m.spouseName) score += 1;
  if (m.children && m.children.length > 0) score += 1;
  if (m.hasBiometrics) score += 1;
  if (m.hasPhoto) score += 1;
  if (typeof m.declaredDependentsCount === 'number') score += 1;
  return score;
}
