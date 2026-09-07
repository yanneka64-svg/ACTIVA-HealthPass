// === AMÉLIORATION AJOUTÉE : tests unitaires (Revue complète 2026-09-06, finding D1) pour
// hashPassword()/verifyPassword() — hachage PBKDF2-HMAC-SHA256 avec sel, jusqu'ici non testé
// malgré son rôle central dans la sécurité des identifiants (voir migratePlaintextPasswords.ts).
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/utils/passwordUtils';

describe('hashPassword / verifyPassword', () => {
  it('un mot de passe correct est vérifié avec succès contre son propre hash', async () => {
    const { passwordHash, passwordSalt } = await hashPassword('Sup3rSecret!2026');
    await expect(verifyPassword('Sup3rSecret!2026', passwordHash, passwordSalt)).resolves.toBe(true);
  });

  it('un mot de passe incorrect est rejeté', async () => {
    const { passwordHash, passwordSalt } = await hashPassword('Sup3rSecret!2026');
    await expect(verifyPassword('WrongPassword!', passwordHash, passwordSalt)).resolves.toBe(false);
  });

  it('deux hachages du même mot de passe utilisent des sels différents (jamais le même hash deux fois)', async () => {
    const first = await hashPassword('SamePassword123');
    const second = await hashPassword('SamePassword123');

    expect(first.passwordSalt).not.toBe(second.passwordSalt);
    expect(first.passwordHash).not.toBe(second.passwordHash);

    // Mais chacun reste vérifiable contre son propre sel.
    await expect(verifyPassword('SamePassword123', first.passwordHash, first.passwordSalt)).resolves.toBe(true);
    await expect(verifyPassword('SamePassword123', second.passwordHash, second.passwordSalt)).resolves.toBe(true);
  });

  it('verifyPassword refuse (sans lever d\'exception) si le hash ou le sel est manquant', async () => {
    await expect(verifyPassword('anything', '', 'somesalt')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'somehash', '')).resolves.toBe(false);
    await expect(verifyPassword('anything', '', '')).resolves.toBe(false);
  });

  it('verifyPassword refuse sans lever d\'exception si le sel est mal formé (jamais un crash sur donnée corrompue)', async () => {
    await expect(verifyPassword('anything', 'somehash', 'not-a-valid-hex-salt!!')).resolves.toBe(false);
  });

  it('un mot de passe vide est haché et vérifié comme n\'importe quel autre (aucun cas spécial silencieux)', async () => {
    const { passwordHash, passwordSalt } = await hashPassword('');
    await expect(verifyPassword('', passwordHash, passwordSalt)).resolves.toBe(true);
    await expect(verifyPassword('not-empty', passwordHash, passwordSalt)).resolves.toBe(false);
  });
});
