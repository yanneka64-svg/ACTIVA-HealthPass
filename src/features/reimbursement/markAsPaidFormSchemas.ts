// === AMÉLIORATION AJOUTÉE : Phase 3 du plan de durcissement — react-hook-form + zod
// (2026-09-18) === Domaine "Mark as Paid" (MarkAsPaidModal.tsx) : formulaire simple et
// autonome, sans logique de transaction Firestore ni d'authentification — un seul appel
// `FirestoreService.updateInvoice`. Converti dans son intégralité.
//
// Seul `paymentReference` était validé en JS impératif (`if (!paymentReference.trim())`,
// valeur BRUTE non trimmée transmise ensuite) — reproduit via `.refine()` plutôt que `.trim()`.
// `payee` a toujours une valeur par défaut valide (bouton présélectionné) et `paidAt` porte
// l'attribut HTML `required` mais n'était jamais validé en JS : aucune contrainte
// supplémentaire ajoutée pour ces deux champs.
import { z } from 'zod';

export const markAsPaidFormSchema = z.object({
  payee: z.enum(['provider', 'member']),
  paymentReference: z.string().refine((v) => v.trim().length > 0),
  paidAt: z.string(),
});
export type MarkAsPaidFormValues = z.infer<typeof markAsPaidFormSchema>;
