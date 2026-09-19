// === AMÉLIORATION AJOUTÉE : Phase 3 du plan de durcissement — react-hook-form + zod (2026-09-18)
// === Même approche déjà validée sur le module claims (voir
// src/features/claims/claimsFormSchemas.ts) : limitée aux 3 petits formulaires autonomes de
// EnrollmentsView.tsx (Rejet, Retour, Assignation). Le formulaire "Nouvel enrôlement"
// (newEnrForm) n'est PAS concerné — capture caméra/empreinte biométrique et réservation
// asynchrone/transactionnelle du numéro de carte (voir handleCreateSubmit), même profil de
// risque que le formulaire d'intake d'AgentClaimsView laissé de côté sur le module claims.
// Chaque schéma reproduit EXACTEMENT la règle de validation qui existait déjà en JS impératif.
import { z } from 'zod';

// Pas de message d'erreur affiché ici (contrairement au rejet de ClaimsView) : l'ancien code
// faisait juste `if (!rejectReason) return;`, sans état d'erreur — comportement inchangé.
export const rejectEnrollmentSchema = z.object({
  reason: z.string().min(1),
});
export type RejectEnrollmentFormValues = z.infer<typeof rejectEnrollmentSchema>;

// `.refine` plutôt que `.trim()` (qui transformerait la valeur analysée) : la valeur BRUTE, non
// « trimmée », continue d'être transmise à onReturn — comme le faisait `returnReason` avant.
export const returnEnrollmentSchema = z.object({
  reason: z.string().refine((v) => v.trim().length > 0),
});
export type ReturnEnrollmentFormValues = z.infer<typeof returnEnrollmentSchema>;

// Même logique que returnEnrollmentSchema ci-dessus, appliquée à l'assignation.
export const assignEnrollmentSchema = z.object({
  agentName: z.string().refine((v) => v.trim().length > 0),
});
export type AssignEnrollmentFormValues = z.infer<typeof assignEnrollmentSchema>;
