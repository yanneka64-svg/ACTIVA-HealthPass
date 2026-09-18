// === AMÉLIORATION AJOUTÉE : lecture de QR code pour la recherche d'assuré (demande explicite,
// 2026-09-18) — "prévoir également un QR code pour capter les numéro de carte afin de faciliter
// la recherche au niveau de l'identification des assurés". Le QR code scanné est celui déjà
// généré côté carte membre (voir src/features/membercard/MemberIdCard.tsx), un texte multi-lignes
// contenant une ligne "Card No: <numéro>". Cette fonction extrait ce numéro de carte à partir du
// texte décodé, sans jamais deviner une valeur qui n'a pas été réellement scannée : si le texte
// ne suit ni ce format ni celui d'un numéro de carte ACTIVA (actuel ou historique), elle renvoie
// `null`. La validation qu'un numéro extrait correspond réellement à un assuré enregistré est
// faite par l'appelant (correspondance EXACTE, voir handleQrCodeScanned dans
// AgentIdentificationView.tsx) — cette fonction ne fait qu'identifier un candidat plausible.
//
// === CORRECTIF (revue automatisée, 2026-09-18) : le repli pour un QR contenant directement le
// numéro de carte (sans ligne "Card No:") exigeait un préfixe suivi d'un tiret (ex.
// "AMID-2026-0001"), l'ancien format. Depuis la migration vers un format libre de 11 caractères
// alphanumériques sans tiret (voir cardNumberService.ts, format actuel des nouvelles cartes), un
// QR contenant un numéro valide au nouveau format était rejeté à tort. On accepte désormais les
// deux formats — le nouveau (validé via le même validateur que le reste de l'app) et l'ancien
// format à tiret, toujours porté par des cartes déjà imprimées avant la migration.
import { isValidCardNumberFormat } from '../services/cardNumberService';

const CARD_NO_LINE_PATTERN = /Card No:\s*(\S+)/i;
const LEGACY_HYPHENATED_CARD_PATTERN = /^[A-Z]{2,6}-[\w-]+$/i;

// === CORRECTIF (revue CodeRabbit, 2026-09-18) : la ligne "Card No: <valeur>" était renvoyée
// telle quelle, sans validation — un QR affichant "Card No: invalid" était donc traité comme un
// candidat "reconnu", fermant la modale de scan pour afficher ensuite "carte introuvable" sur
// l'écran principal, au lieu du message "QR non reconnu" (qui garde la caméra active pour un
// nouvel essai immédiat). La valeur capturée après "Card No:" (ou le texte brut à défaut) est
// désormais validée avec les mêmes règles que la saisie directe.
export function extractCardNumberFromQrText(rawText: string): string | null {
  if (!rawText) return null;
  const text = rawText.trim();
  if (!text) return null;

  const lineMatch = text.match(CARD_NO_LINE_PATTERN);
  const candidate = lineMatch?.[1] ?? text;

  if (isValidCardNumberFormat(candidate) || LEGACY_HYPHENATED_CARD_PATTERN.test(candidate)) {
    return candidate;
  }

  return null;
}
