// === AMÉLIORATION AJOUTÉE : Phase 3 du plan de durcissement — react-hook-form + zod
// (2026-09-18) === Domaine Members : contrairement à Ceilings, MembersView.tsx a un vrai
// <form onSubmit={...}> (modale Créer/Modifier un assuré, "Insured Biometric Enrollment") —
// converti dans son intégralité pour les champs textuels/select. La capture photo/empreinte
// (photoData/biometricData/formHasPhoto/formHasBiometrics) et les champs conjoint/enfants
// hérités (formSpouseName/formDependentRelationship/formChildren, jamais affichés dans ce
// formulaire) restent en état séparé (useState), comme sur les domaines précédents — ce ne
// sont pas des champs de saisie <input>/<select> à valider.
//
// Seuls `principalName` et `organization` étaient validés en JS impératif (un message combiné
// unique : "Please fill in all mandatory fields (Name and Organization)."), valeur BRUTE non
// trimmée transmise ensuite — reproduit via `.refine()` plutôt que `.trim()`. Le format du
// numéro de carte (`isValidCardNumberFormat`, 11 caractères alphanumériques) et sa réservation
// transactionnelle Firestore restent dans le gestionnaire de soumission (uniquement à la
// création, jamais en modification où le champ est désactivé) plutôt que dans le schéma : ce
// n'est pas une règle statique applicable à tout moment (elle dépend de editingMember), voir
// MembersView.tsx. Aucun autre champ (birthDate, gender, relationship, status,
// mainInsuredName/mainInsuredCardNo — jamais utilisés dans la soumission, voir
// MembersView.tsx —, phone, email) n'était validé en JS auparavant.
import { z } from 'zod';

export const memberFormSchema = z.object({
  cardNo: z.string(),
  principalName: z.string().refine((v) => v.trim().length > 0),
  birthDate: z.string(),
  gender: z.string(),
  organization: z.string().refine((v) => v.trim().length > 0),
  relationship: z.string(),
  status: z.string(),
  mainInsuredName: z.string(),
  mainInsuredCardNo: z.string(),
  phone: z.string(),
  email: z.string(),
});
export type MemberFormValues = z.infer<typeof memberFormSchema>;
