// === AMÉLIORATION AJOUTÉE : Phase 3 du plan de durcissement — react-hook-form + zod
// (2026-09-18) === Domaine "New Claim" d'AgentClaimsView.tsx (formulaire de saisie de
// réclamation par l'Agent) — le formulaire le plus à risque de tout le rollout Phase 3 : il
// gouverne la soumission réelle de réclamations d'assurance.
//
// Contrairement aux domaines précédents, l'essentiel de la "validation" de ce formulaire n'est
// pas une contrainte de champ (longueur, format...) mais une règle métier calculée à partir de
// données externes (membres/organisations/plafonds) : l'éligibilité du bénéficiaire
// (checkCareEligibility), l'obligation d'un prestataire sélectionné et d'un montant total > 0.
// Comme pour ApplyRefactionModal/RecordRecoveryModal, le schéma n'encode qu'un booléen de
// validité global (borne dynamique par instance, via une factory recevant members/organizations/
// ceilings) — les messages précis restent construits dans AgentClaimsView.tsx (callback
// onInvalid), en reproduisant EXACTEMENT l'ordre de priorité et le comportement du code impératif
// d'origine : (1) bénéficiaire inéligible -> message affiché, (2) prestataire manquant ou montant
// nul -> échec silencieux (aucun message), comportement déjà existant et préservé tel quel.
import { z } from 'zod';
import { Member, Organization, Ceiling } from '../../types';
import { checkCareEligibility } from '../../services/eligibilityService';

const medicalActSchema = z.object({
  id: z.string().optional(),
  category: z.string(),
  description: z.string(),
  amount: z.number(),
});

export const createAgentClaimsFormSchema = (
  members: Member[],
  organizations: Organization[],
  ceilings: Ceiling[]
) =>
  z
    .object({
      principalName: z.string(),
      memberCard: z.string(),
      organization: z.string(),
      patientName: z.string(),
      patientRelationship: z.string(),
      currency: z.enum(['USD', 'LRD']),
      selectedProviderName: z.string(),
      doctorName: z.string(),
      selectedMedicalFormId: z.string(),
      medicalActs: z.array(medicalActSchema),
    })
    .refine((data) => {
      const totalAmount = data.medicalActs.reduce((s, a) => s + (Number(a.amount) || 0), 0);
      if (!data.selectedProviderName || totalAmount <= 0) return false;

      const targetRef = data.memberCard || data.principalName;
      if (targetRef) {
        const eligibility = checkCareEligibility(
          targetRef,
          members,
          organizations,
          ceilings,
          data.patientName !== data.principalName ? data.patientName : undefined
        );
        if (eligibility && !eligibility.isEligible) return false;
      }
      return true;
    });

export type AgentClaimsFormValues = z.infer<ReturnType<typeof createAgentClaimsFormSchema>>;
