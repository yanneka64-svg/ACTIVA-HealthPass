// === AMÉLIORATION AJOUTÉE : Phase 3 du plan de durcissement — introduction de react-hook-form +
// zod (2026-09-18), limitée aux petits formulaires autonomes de ClaimsView.tsx (Rejet, Retour,
// Assignation, Nouveau Sinistre). Chaque schéma reproduit EXACTEMENT la règle de validation déjà
// en vigueur dans le code existant (même condition de blocage, même valeur transmise ensuite aux
// callbacks onReject/onReturn/onAssign/onCreateClaim) — aucune règle plus stricte n'est ajoutée.
// Le gros formulaire d'intake d'AgentClaimsView n'est pas concerné par cette étape.
import { z } from 'zod';

export const rejectClaimSchema = z.object({
  // Comportement inchangé : select natif obligatoire (`required`) + message d'erreur affiché
  // au-dessus du formulaire si aucun motif n'est sélectionné (voir l'ancien `rejectError`).
  reason: z.string().min(1, 'Please select a rejection reason.'),
  comments: z.string(),
});
export type RejectClaimFormValues = z.infer<typeof rejectClaimSchema>;

// `.refine` plutôt que `.trim()` (qui transformerait la valeur analysée) : la valeur BRUTE, non
// « trimmée », continue d'être transmise à onReturn — comme le faisait `returnReason` avant. Une
// saisie uniquement composée d'espaces reste bloquée silencieusement, sans message (comportement
// inchangé : l'ancien code faisait juste `if (!returnReason.trim()) return;`).
export const returnClaimSchema = z.object({
  reason: z.string().refine((v) => v.trim().length > 0),
});
export type ReturnClaimFormValues = z.infer<typeof returnClaimSchema>;

// Même logique que returnClaimSchema ci-dessus, appliquée à l'assignation.
export const assignClaimSchema = z.object({
  agentName: z.string().refine((v) => v.trim().length > 0),
});
export type AssignClaimFormValues = z.infer<typeof assignClaimSchema>;

// `memberName`/`organization`/`serviceDate` ne sont jamais saisis directement (ils sont dérivés
// de la sélection de `memberCardNo`, ou d'une valeur par défaut) : aucune contrainte de longueur
// minimale, exactement comme avant (ces champs n'étaient jamais validés). `amount` reste une
// chaîne (le `parseFloat(...) || 0` existant s'applique toujours à la soumission).
export const newClaimSchema = z.object({
  memberCardNo: z.string().min(1),
  memberName: z.string(),
  organization: z.string(),
  provider: z.string().min(1),
  amount: z.string().min(1),
  careType: z.string().min(1),
  serviceDate: z.string(),
});
export type NewClaimFormValues = z.infer<typeof newClaimSchema>;
