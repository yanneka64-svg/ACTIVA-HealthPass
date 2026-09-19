// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { extractCardNumberFromQrText } from './qrCodeUtils';

describe('extractCardNumberFromQrText', () => {
  it('extrait le numéro de carte du format multi-lignes généré par MemberIdCard.tsx', () => {
    const qrText = [
      'ACTIVA HealthCare — Insured Member',
      'Name: Amina Diallo',
      'Card No: AMID-2026-0001',
      'Organization: TotalEnergies Liberia Ltd',
      'Status: Active',
    ].join('\n');

    expect(extractCardNumberFromQrText(qrText)).toBe('AMID-2026-0001');
  });

  it('accepte directement un numéro de carte ACTIVA au format historique à tiret (QR généré par un autre outil)', () => {
    expect(extractCardNumberFromQrText('AMID-2026-0002')).toBe('AMID-2026-0002');
  });

  // === AMÉLIORATION AJOUTÉE : revue automatisée (2026-09-18) — "Valid card qr codes are
  // rejected". L'ancien motif de repli exigeait un préfixe suivi d'un tiret (format historique)
  // et rejetait donc le format ACTUEL des numéros de carte (11 caractères alphanumériques sans
  // tiret, voir cardNumberService.ts) quand le QR ne contient pas de ligne "Card No:".
  it('accepte directement un numéro de carte au format actuel (11 caractères alphanumériques, sans tiret)', () => {
    expect(extractCardNumberFromQrText('ABC12345678')).toBe('ABC12345678');
  });

  it('accepte le format actuel indépendamment de la casse', () => {
    expect(extractCardNumberFromQrText('abc12345678')).toBe('abc12345678');
  });

  it('rejette une chaîne de 11 caractères qui ne suit ni le format actuel ni le format historique', () => {
    // 12 caractères — ni un numéro actuel valide (exactement 11), ni un format historique à
    // tiret.
    expect(extractCardNumberFromQrText('ABC123456789')).toBeNull();
  });

  it('ignore les espaces superflus autour du texte scanné', () => {
    expect(extractCardNumberFromQrText('  AMID-2026-0002  ')).toBe('AMID-2026-0002');
  });

  it("renvoie null pour un texte qui ne ressemble ni au format carte ni à un numéro ACTIVA", () => {
    expect(extractCardNumberFromQrText('https://example.com')).toBeNull();
    expect(extractCardNumberFromQrText('hello world')).toBeNull();
  });

  it('renvoie null pour un texte vide ou absent', () => {
    expect(extractCardNumberFromQrText('')).toBeNull();
    expect(extractCardNumberFromQrText('   ')).toBeNull();
  });

  // === AMÉLIORATION AJOUTÉE : revue CodeRabbit (2026-09-18) — "Validate the value captured
  // from Card No:". La valeur après "Card No:" n'était pas validée : un QR affichant
  // "Card No: invalid" était traité comme un candidat reconnu (fermant la modale de scan) au
  // lieu de déclencher le message "QR non reconnu" (qui garde la caméra active).
  it('renvoie null quand la valeur après "Card No:" ne correspond à aucun format de carte valide', () => {
    const qrText = ['Card No: invalid', 'Name: Test'].join('\n');
    expect(extractCardNumberFromQrText(qrText)).toBeNull();
  });
});
