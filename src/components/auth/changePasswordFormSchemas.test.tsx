// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Verrouille le
// comportement des prédicats et du schéma AVANT tout changement futur : ces règles reproduisent
// exactement les vérifications impératives qui existaient déjà dans ChangePasswordModal.tsx
// (voir changePasswordFormSchemas.ts), et une régression ici romprait silencieusement soit la
// checklist affichée en direct, soit le blocage de soumission.
import { describe, it, expect } from 'vitest';
import {
  changePasswordFormSchema,
  hasLower,
  hasMinLength,
  hasNumber,
  hasSpecial,
  hasUpper,
  isMatchingPassword,
} from './changePasswordFormSchemas';

describe('prédicats individuels de mot de passe', () => {
  it('hasMinLength exige au moins 8 caractères', () => {
    expect(hasMinLength('Abc123!')).toBe(false);
    expect(hasMinLength('Abc123!!')).toBe(true);
  });

  it('hasUpper/hasLower/hasNumber/hasSpecial détectent chaque catégorie', () => {
    expect(hasUpper('abc')).toBe(false);
    expect(hasUpper('Abc')).toBe(true);
    expect(hasLower('ABC')).toBe(false);
    expect(hasLower('ABc')).toBe(true);
    expect(hasNumber('abc')).toBe(false);
    expect(hasNumber('abc1')).toBe(true);
    expect(hasSpecial('abc1')).toBe(false);
    expect(hasSpecial('abc1!')).toBe(true);
  });

  it("isMatchingPassword exige un nouveau mot de passe non vide et identique à la confirmation", () => {
    expect(isMatchingPassword('', '')).toBe(false);
    expect(isMatchingPassword('Abc123!!', 'Abc123!')).toBe(false);
    expect(isMatchingPassword('Abc123!!', 'Abc123!!')).toBe(true);
  });
});

describe('changePasswordFormSchema', () => {
  const valid = {
    currentPassword: 'OldPass1!',
    newPassword: 'NewPass1!',
    confirmPassword: 'NewPass1!',
  };

  it('accepte un mot de passe respectant les 5 règles et une confirmation identique', () => {
    expect(changePasswordFormSchema.safeParse(valid).success).toBe(true);
  });

  it('rejette un mot de passe trop court, sans majuscule, minuscule, chiffre ou caractère spécial', () => {
    expect(changePasswordFormSchema.safeParse({ ...valid, newPassword: 'short1!', confirmPassword: 'short1!' }).success).toBe(false);
    expect(changePasswordFormSchema.safeParse({ ...valid, newPassword: 'nouppercase1!', confirmPassword: 'nouppercase1!' }).success).toBe(false);
    expect(changePasswordFormSchema.safeParse({ ...valid, newPassword: 'NOLOWERCASE1!', confirmPassword: 'NOLOWERCASE1!' }).success).toBe(false);
    expect(changePasswordFormSchema.safeParse({ ...valid, newPassword: 'NoNumberHere!', confirmPassword: 'NoNumberHere!' }).success).toBe(false);
    expect(changePasswordFormSchema.safeParse({ ...valid, newPassword: 'NoSpecial123', confirmPassword: 'NoSpecial123' }).success).toBe(false);
  });

  it('rejette une confirmation différente du nouveau mot de passe', () => {
    expect(changePasswordFormSchema.safeParse({ ...valid, confirmPassword: 'Different1!' }).success).toBe(false);
  });

  it("n'impose aucune contrainte sur currentPassword (jamais validé en JS auparavant)", () => {
    expect(changePasswordFormSchema.safeParse({ ...valid, currentPassword: '' }).success).toBe(true);
  });
});
