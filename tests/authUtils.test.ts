// === AMÉLIORATION AJOUTÉE : tests unitaires (Revue complète 2026-09-06, finding D1) pour
// normalizeRole() — logique de sécurité explicite (aucun repli implicite vers un rôle), jusqu'ici
// non testée malgré son rôle central dans la résolution du RBAC.
import { describe, expect, it } from 'vitest';
import { normalizeRole, isSectionAllowedForRole, getDefaultSectionForRole } from '../src/utils/authUtils';

describe('normalizeRole — variantes reconnues', () => {
  it('reconnaît les variantes de "Admin"', () => {
    expect(normalizeRole('admin')).toBe('Admin');
    expect(normalizeRole('Admin')).toBe('Admin');
    expect(normalizeRole('ADMINISTRATOR')).toBe('Admin');
    expect(normalizeRole('administrateur')).toBe('Admin');
    expect(normalizeRole('  admin  ')).toBe('Admin');
  });

  it('reconnaît les variantes de "Supervisor" (y compris la graphie française)', () => {
    expect(normalizeRole('supervisor')).toBe('Supervisor');
    expect(normalizeRole('Superviseur')).toBe('Supervisor');
    expect(normalizeRole('medical_supervisor')).toBe('Supervisor');
  });

  it('reconnaît les variantes de "Agent"', () => {
    expect(normalizeRole('agent')).toBe('Agent');
    expect(normalizeRole('frontdesk')).toBe('Agent');
    expect(normalizeRole('intake_agent')).toBe('Agent');
  });
});

describe('normalizeRole — aucun repli implicite (garde de sécurité)', () => {
  it('retourne null pour une valeur inconnue, sans jamais retomber sur un rôle par défaut', () => {
    expect(normalizeRole('superadmin')).toBeNull();
    expect(normalizeRole('root')).toBeNull();
    expect(normalizeRole('')).toBeNull();
    expect(normalizeRole('   ')).toBeNull();
  });

  it('retourne null pour des types non-string (jamais une exception, jamais un rôle par défaut)', () => {
    expect(normalizeRole(null)).toBeNull();
    expect(normalizeRole(undefined)).toBeNull();
    expect(normalizeRole(123)).toBeNull();
    expect(normalizeRole({ role: 'Admin' })).toBeNull();
    expect(normalizeRole(['Admin'])).toBeNull();
  });
});

describe('isSectionAllowedForRole / getDefaultSectionForRole — cohérence de la matrice de rôles', () => {
  it('un rôle null n\'a accès à aucune section', () => {
    expect(isSectionAllowedForRole(null, 'dashboard')).toBe(false);
  });

  it('un Agent n\'a pas accès aux sections réservées (accounts, ceilings)', () => {
    expect(isSectionAllowedForRole('Agent', 'accounts')).toBe(false);
    expect(isSectionAllowedForRole('Agent', 'ceilings')).toBe(false);
    expect(isSectionAllowedForRole('Agent', 'identification')).toBe(true);
  });

  it('un Admin a accès à toutes les sections de sa propre liste, y compris "accounts"', () => {
    expect(isSectionAllowedForRole('Admin', 'accounts')).toBe(true);
  });

  it('la section par défaut de chaque rôle fait bien partie de sa propre liste de sections autorisées', () => {
    (['Admin', 'Supervisor', 'Agent'] as const).forEach((role) => {
      const defaultSection = getDefaultSectionForRole(role);
      expect(isSectionAllowedForRole(role, defaultSection)).toBe(true);
    });
  });
});
