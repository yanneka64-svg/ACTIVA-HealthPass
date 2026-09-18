// === AMÉLIORATION AJOUTÉE : lecture de QR code pour la recherche d'assuré (demande explicite,
// 2026-09-18) — "prévoir également un QR code pour capter les numéro de carte afin de faciliter
// la recherche au niveau de l'identification des assurés". Le QR code scanné est celui déjà
// généré côté carte membre (voir src/features/membercard/MemberIdCard.tsx), un texte multi-lignes
// contenant une ligne "Card No: <numéro>". Cette fonction extrait ce numéro de carte à partir du
// texte décodé, sans jamais deviner une valeur qui n'a pas été réellement scannée : si le texte
// ne suit ni ce format ni celui d'un numéro de carte ACTIVA brut, elle renvoie `null`.
const CARD_NO_LINE_PATTERN = /Card No:\s*(\S+)/i;
const ACTIVA_CARD_NUMBER_PATTERN = /^[A-Z]{2,6}-[\w-]+$/i;

export function extractCardNumberFromQrText(rawText: string): string | null {
  if (!rawText) return null;
  const text = rawText.trim();
  if (!text) return null;

  const lineMatch = text.match(CARD_NO_LINE_PATTERN);
  if (lineMatch) return lineMatch[1];

  if (ACTIVA_CARD_NUMBER_PATTERN.test(text)) return text;

  return null;
}
