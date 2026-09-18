// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Verrouille le
// comportement du schéma AVANT tout changement futur : la modale "Age Limits Quick Editor" de
// CeilingsView.tsx n'imposait aucune contrainte de blocage en JS impératif (coercion en nombre
// entier via `parseInt(...) || défaut` à chaque frappe, jamais de rejet de soumission) — ce
// schéma ne fait donc que typer la forme finale des valeurs.
import { describe, it, expect } from 'vitest';
import { ageLimitsFormSchema } from './ceilingsFormSchemas';

describe('ageLimitsFormSchema', () => {
  const valid = {
    organization: 'TotalEnergies Liberia Ltd',
    principal: 65,
    spouse: 65,
    child: 21,
    student: 25,
  };

  it('accepte un formulaire complet', () => {
    expect(ageLimitsFormSchema.safeParse(valid).success).toBe(true);
  });

  it("n'impose aucune contrainte numérique supplémentaire (jamais validée en JS auparavant)", () => {
    expect(ageLimitsFormSchema.safeParse({ ...valid, principal: 0, spouse: 999, child: -5 }).success).toBe(
      true
    );
  });

  it('rejette une valeur non numérique pour un champ d\'âge (garantie de typage)', () => {
    expect(
      ageLimitsFormSchema.safeParse({ ...valid, principal: 'soixante-cinq' as unknown as number })
        .success
    ).toBe(false);
  });
});
