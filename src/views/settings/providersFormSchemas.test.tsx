// === AMÉLIORATION AJOUTÉE : Phase 3 — react-hook-form + zod (2026-09-18) === Verrouille le
// comportement du schéma AVANT tout changement futur : cette règle reproduit la vérification
// impérative qui existait déjà dans ProvidersView.tsx (voir providersFormSchemas.ts), et une
// régression ici romprait silencieusement le blocage de soumission du formulaire Créer/Modifier
// un prestataire.
import { describe, it, expect } from 'vitest';
import { providerFormSchema } from './providersFormSchemas';

describe('providerFormSchema', () => {
  const valid = {
    name: 'City Clinic',
    type: 'Clinique',
    location: 'Monrovia — Sinkor',
    conventionNumber: 'CONV-2026-1234',
    kypStatus: 'validated',
    phone: '+231 770 00 00 00',
  };

  it('accepte un formulaire complet', () => {
    expect(providerFormSchema.safeParse(valid).success).toBe(true);
  });

  it('rejette un nom vide ou uniquement composé d\'espaces (comme l\'ancien `.trim()`)', () => {
    expect(providerFormSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
    expect(providerFormSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
  });

  it('accepte un nom valide sans le transformer (valeur brute conservée pour onAddProvider/onUpdateProvider)', () => {
    const result = providerFormSchema.safeParse({ ...valid, name: '  City Clinic  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('  City Clinic  ');
    }
  });

  it('n\'impose aucune contrainte sur type/location/conventionNumber/kypStatus/phone (jamais validés en JS auparavant)', () => {
    const result = providerFormSchema.safeParse({ ...valid, location: '', conventionNumber: '', phone: '' });
    expect(result.success).toBe(true);
  });
});
