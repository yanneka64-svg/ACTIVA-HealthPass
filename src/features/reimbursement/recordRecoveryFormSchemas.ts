// === AMÉLIORATION AJOUTÉE : Phase 3 du plan de durcissement — react-hook-form + zod
// (2026-09-18) === Domaine "Record Recovery" (RecordRecoveryModal.tsx) : formulaire simple et
// autonome, sans transaction Firestore ni authentification — un seul appel
// `FirestoreService.updateInvoice`. Converti dans son intégralité.
//
// Seul `amount` était validé en JS impératif (`if (amount <= 0 || amount > pending) return;`).
// Cette borne n'est PAS une constante : elle dépend du montant refacté restant à récupérer sur
// LA facture ouverte dans la modale (`pending`, calculé dans RecordRecoveryModal.tsx à partir de
// `invoice.refactionTotalUSD`/`invoice.recoveredTotalUSD`) — donc pas une règle statique
// exprimable une fois pour toutes dans un schéma exporté. D'où cette fabrique
// `createRecordRecoveryFormSchema(pending)`, appelée à chaque rendu de la modale avec la borne
// courante, plutôt qu'un schéma unique au niveau du module. Le message d'erreur (qui formate
// `pending` en devise via `useCurrency()`) reste construit côté composant, pas ici — ce fichier
// ne fait que valider, jamais l'affichage.
// `reference`/`notes` n'étaient jamais validés en JS (juste `.trim() || undefined` au moment de
// la sauvegarde, inchangé, voir RecordRecoveryModal.tsx) et `recordedAt` porte l'attribut HTML
// `required` mais n'était jamais validé en JS : aucune contrainte supplémentaire ajoutée pour
// ces trois champs.
import { z } from 'zod';

export const createRecordRecoveryFormSchema = (pending: number) =>
  z.object({
    amount: z.number().refine((val) => val > 0 && val <= pending),
    reference: z.string(),
    notes: z.string(),
    recordedAt: z.string(),
  });
export type RecordRecoveryFormValues = z.infer<ReturnType<typeof createRecordRecoveryFormSchema>>;
