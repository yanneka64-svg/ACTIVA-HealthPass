// === AMÉLIORATION AJOUTÉE : Phase 3 du plan de durcissement — react-hook-form + zod
// (2026-09-18) === Domaine "Mark as Paid" (MarkAsPaidModal.tsx) : formulaire simple et
// autonome, sans logique de transaction Firestore ni d'authentification — un seul appel
// `FirestoreService.updateInvoice`. Converti dans son intégralité.
//
// Seul `paymentReference` était validé en JS impératif (`if (!paymentReference.trim())`) —
// reproduit ici via `.refine()` plutôt que `.trim()` pour que le schéma ne transforme jamais la
// valeur qu'il valide (comme sur les autres domaines migrés). Le `.trim()` réel avant écriture
// Firestore reste appliqué séparément par MarkAsPaidModal.tsx (`values.paymentReference.trim()`)
// juste avant `FirestoreService.updateInvoice`, exactement comme le faisait déjà l'ancien code
// impératif (`paymentReference: paymentReference.trim()`) — comportement de persistance
// inchangé, seule la validation est désormais déléguée à zod.
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
