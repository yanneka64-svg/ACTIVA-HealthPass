// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { extractCardNumberFromQrText } from './qrCodeUtils';

describe('extractCardNumberFromQrText', () => {
  it('extrait le numéro de carte du format multi-lignes généré par MemberIdCard.tsx', () => {
    const qrText = [
      'ACTIVA HealthPass — Insured Member',
      'Name: Amina Diallo',
      'Card No: AMID-2026-0001',
      'Organization: TotalEnergies Liberia Ltd',
      'Status: Active',
    ].join('\n');

    expect(extractCardNumberFromQrText(qrText)).toBe('AMID-2026-0001');
  });

  it('accepte directement un numéro de carte ACTIVA brut (QR généré par un autre outil)', () => {
    expect(extractCardNumberFromQrText('AMID-2026-0002')).toBe('AMID-2026-0002');
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
});
