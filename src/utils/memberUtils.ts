import { Member } from '../types';

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
