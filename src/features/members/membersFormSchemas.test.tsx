// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Verrouille le
// comportement du schéma AVANT tout changement futur : cette règle reproduit la vérification
// impérative combinée qui existait déjà dans MembersView.tsx (voir membersFormSchemas.ts), et
// une régression ici romprait silencieusement le blocage de soumission du formulaire Créer/
// Modifier un assuré.
import { describe, it, expect } from 'vitest';
import { memberFormSchema } from './membersFormSchemas';

describe('memberFormSchema', () => {
  const valid = {
    cardNo: 'A1B2C3D4E5F',
    principalName: 'John Doe',
    birthDate: '1990-01-01',
    gender: 'M',
    organization: 'TotalEnergies Liberia Ltd',
    relationship: 'Principal',
    status: 'Actif',
    mainInsuredName: '',
    mainInsuredCardNo: '',
    phone: '+231 77 123 4567',
    email: 'john.doe@example.com',
  };

  it('accepte un formulaire complet', () => {
    expect(memberFormSchema.safeParse(valid).success).toBe(true);
  });

  it('rejette un nom principal vide ou uniquement composé d\'espaces (comme l\'ancien check combiné)', () => {
    expect(memberFormSchema.safeParse({ ...valid, principalName: '' }).success).toBe(false);
    expect(memberFormSchema.safeParse({ ...valid, principalName: '   ' }).success).toBe(false);
  });

  it('rejette une organisation vide ou uniquement composée d\'espaces (comme l\'ancien check combiné)', () => {
    expect(memberFormSchema.safeParse({ ...valid, organization: '' }).success).toBe(false);
    expect(memberFormSchema.safeParse({ ...valid, organization: '   ' }).success).toBe(false);
  });

  it('accepte un nom principal valide sans le transformer (valeur brute conservée pour onAddMember/onUpdateMember)', () => {
    const result = memberFormSchema.safeParse({ ...valid, principalName: '  John Doe  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.principalName).toBe('  John Doe  ');
    }
  });

  it("n'impose aucune contrainte sur cardNo/birthDate/gender/relationship/status/mainInsured*/phone/email (jamais validés en JS auparavant, ou jamais utilisés à la soumission)", () => {
    const result = memberFormSchema.safeParse({
      ...valid,
      cardNo: '',
      birthDate: '',
      phone: '',
      email: '',
      mainInsuredName: '',
      mainInsuredCardNo: '',
    });
    expect(result.success).toBe(true);
  });
});
