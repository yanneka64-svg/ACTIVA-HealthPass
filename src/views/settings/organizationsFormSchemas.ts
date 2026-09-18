// === AMÉLIORATION AJOUTÉE : Phase 3 du plan de durcissement — react-hook-form + zod
// (2026-09-18) === Nouveau domaine, plus complexe que providers/claims/enrollments : le
// formulaire Créer/Modifier une organisation de OrganizationsView.tsx, qui combine les champs de
// l'organisation ET (section repliable optionnelle) ceux de sa police santé — 22 champs au
// total, mais un SEUL <form> HTML, sans logique asynchrone ni capture biométrique. Contrairement
// aux formulaires laissés de côté sur claims/enrollments (intake avec logique métier
// asynchrone/biométrique), celui-ci reste un formulaire contrôlé classique — converti dans son
// intégralité.
//
// Seul `name` était validé en JS impératif (`if (!formName.trim()) return;`, valeur BRUTE non
// trimmée transmise ensuite à onAddOrganization/onUpdateOrganization) : reproduit via `.refine()`
// plutôt que `.trim()`. Aucun autre champ n'était validé en JS (certains portent l'attribut HTML
// `required` — policyNumber notamment — conservé tel quel dans le JSX, comportement de blocage
// natif inchangé) : aucune contrainte supplémentaire ajoutée ici.
import { z } from 'zod';

export const organizationFormSchema = z.object({
  name: z.string().refine((v) => v.trim().length > 0),
  policyNumber: z.string(),
  effectiveDate: z.string(),
  expirationDate: z.string(),
  members: z.string(),
  rate: z.string(),
  status: z.string(),
  contactPhone: z.string(),
  contactEmail: z.string(),
  // Section "Health Insurance Policy Configuration" (repliable, optionnelle) — voir
  // OrganizationsView.tsx : `policySectionOpen`/`policyExistedBeforeEdit` (état séparé, non
  // géré ici) décident si ces valeurs sont effectivement enregistrées à la soumission.
  policyType: z.string(),
  annualPremium: z.string(),
  policyCurrency: z.string(),
  paymentFrequency: z.string(),
  installmentAmount: z.string(),
  nextPaymentDueDate: z.string(),
  lastPaymentDate: z.string(),
  lastPaymentAmount: z.string(),
  outstandingAmount: z.string(),
  gracePeriodDays: z.string(),
  expiringSoonWarningDays: z.string(),
  manuallySuspended: z.boolean(),
  suspensionReason: z.string(),
});
export type OrganizationFormValues = z.infer<typeof organizationFormSchema>;
