// === AMÉLIORATION AJOUTÉE : tests unitaires (Revue complète 2026-09-06, finding D1) pour
// parseCardNumber()/formatCardNumber() — validation du format de numéro de carte, jusqu'ici non
// testée malgré son rôle direct dans l'unicité des identifiants d'assurés (section 12/13 des
// commentaires de cardNumberService.ts). Fonctions pures, aucune dépendance à l'émulateur.
import { describe, expect, it } from 'vitest';
import { formatCardNumber, parseCardNumber, toIssueDateSegment } from './cardService';

describe('formatCardNumber / toIssueDateSegment', () => {
  it('construit le format officiel AMID-YYMMDD-NNNNN à partir d\'une Date', () => {
    expect(formatCardNumber(new Date(2026, 0, 15), 42)).toBe('AMID-260115-00042');
  });

  it('construit le format officiel à partir d\'une chaîne "YYYY-MM-DD"', () => {
    expect(formatCardNumber('2026-01-15', 42)).toBe('AMID-260115-00042');
  });

  it('retombe sur la date du jour si aucune date d\'émission n\'est fournie (jamais une exception)', () => {
    const result = formatCardNumber(undefined, 1);
    expect(result).toMatch(/^AMID-\d{6}-00001$/);
  });

  it('retombe sur la date du jour si la date fournie est invalide (jamais une exception)', () => {
    const result = toIssueDateSegment('not-a-date');
    expect(result).toMatch(/^\d{6}$/);
  });

  it('complète le numéro d\'assuré sur 5 chiffres avec des zéros', () => {
    expect(formatCardNumber('2026-01-01', 7)).toBe('AMID-260101-00007');
  });
});

describe('parseCardNumber — format valide', () => {
  it('reconnaît un numéro de carte bien formé et en extrait les composants', () => {
    const parsed = parseCardNumber('AMID-260115-00042');
    expect(parsed).toEqual({ issueDate: '260115', assuredNumber: 42 });
  });

  it('accepte un numéro avec espaces superflus (trim)', () => {
    expect(parseCardNumber('  AMID-260115-00042  ')).not.toBeNull();
  });

  it('round-trip : formatCardNumber puis parseCardNumber redonne le même numéro d\'assuré', () => {
    const formatted = formatCardNumber('2026-06-30', 12345);
    const parsed = parseCardNumber(formatted);
    expect(parsed?.assuredNumber).toBe(12345);
    expect(parsed?.issueDate).toBe('260630');
  });
});

describe('parseCardNumber — rejette les formats invalides (jamais une exception)', () => {
  it('retourne null pour une valeur vide, nulle ou indéfinie', () => {
    expect(parseCardNumber('')).toBeNull();
    expect(parseCardNumber(null)).toBeNull();
    expect(parseCardNumber(undefined)).toBeNull();
  });

  it('retourne null pour un préfixe incorrect ou un format structurellement invalide', () => {
    expect(parseCardNumber('XXXX-260115-00042')).toBeNull();
    expect(parseCardNumber('AMID-26011-00042')).toBeNull();
    expect(parseCardNumber('AMID260115-00042')).toBeNull();
    expect(parseCardNumber('AMID-260115-0042')).toBeNull();
  });

  it('retourne null pour un mois calendaire impossible (13)', () => {
    expect(parseCardNumber('AMID-261399-00001')).toBeNull();
  });

  it('retourne null pour un jour calendaire impossible (0 ou 32+)', () => {
    expect(parseCardNumber('AMID-260100-00001')).toBeNull();
    expect(parseCardNumber('AMID-260132-00001')).toBeNull();
  });
});
