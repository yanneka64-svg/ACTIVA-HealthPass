// === AMÉLIORATION AJOUTÉE : Phase 3 du plan de durcissement — react-hook-form + zod
// (2026-09-18) === Deux formulaires distincts d'AgentMedicalFormView.tsx.
//
// "Generate Medical Form" : contrairement aux domaines précédents, aucune donnée externe
// (membres/organisations/plafonds) n'intervient dans la validation — le seul gate est "un
// bénéficiaire ET un prestataire ont été sélectionnés via la recherche intelligente" (comportement
// impératif d'origine : `if (!selectedMember || !selectedProvider) { setFormError(...); return; }`).
// Un schéma statique suffit donc ici, sans factory. Le message d'erreur exact reste construit
// dans le composant (onInvalid), comme pour les domaines précédents.
//
// "Clear All History" : phrase de confirmation exacte (insensible à la casse) + motif
// obligatoire. La phrase de confirmation reste définie dans le composant (CLEAR_ALL_CONFIRM_PHRASE,
// affichée à l'écran) — la factory la reçoit en paramètre pour rester l'unique source de vérité,
// plutôt que de la dupliquer ici.
import { z } from 'zod';
import { Member, Provider } from '../../types';

export const generateMedicalFormSchema = z
  .object({
    selectedMember: z.custom<Member | null>().nullable(),
    selectedProvider: z.custom<Provider | null>().nullable(),
    practitionerType: z.enum(['Generalist', 'Specialist']),
    doctorSpecialty: z.string(),
    customSpecialty: z.string(),
    coverageType: z.enum(['Outpatient', 'Inpatient']),
    doctorName: z.string(),
    presumedDiagnosis: z.string(),
    requestedExams: z.string(),
    treatmentOrder: z.string(),
  })
  .refine((data) => !!data.selectedMember && !!data.selectedProvider);
export type GenerateMedicalFormValues = z.infer<typeof generateMedicalFormSchema>;

export const createClearAllHistoryFormSchema = (confirmPhrase: string) =>
  z
    .object({
      reason: z.string(),
      confirmText: z.string(),
    })
    .refine((data) => data.confirmText.trim().toUpperCase() === confirmPhrase && !!data.reason.trim());
export type ClearAllHistoryFormValues = z.infer<ReturnType<typeof createClearAllHistoryFormSchema>>;
