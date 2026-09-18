// === AMÉLIORATION AJOUTÉE : Phase 3 du plan de durcissement — react-hook-form + zod
// (2026-09-18) === Domaine "Apply Réfaction" (ApplyRefactionModal.tsx). Contrairement aux
// domaines précédents à un seul montant, ce formulaire porte sur un tableau dynamique de lignes
// (actes médicaux) avec une validation croisée : la somme des montants originaux des lignes doit
// rester égale au montant original de la facture (borne dynamique, d'où la factory), et un motif
// devient obligatoire dès qu'une ligne est réduite (retenu < original) ; au moins une ligne doit
// être réduite pour qu'une réfaction ait un sens.
//
// Comme pour RecordRecoveryModal, le schéma n'encode qu'un booléen de validité global — les
// messages d'erreur précis (avec montants formatés via useCurrency, ou nommant la ligne en
// cause) restent construits dans ApplyRefactionModal.tsx (callback onInvalid), en reproduisant
// exactement l'ordre de priorité des vérifications déjà présent dans le code impératif d'origine :
// (1) somme des lignes ≠ montant original de la facture, (2) motif manquant pour la première
// ligne réduite rencontrée, (3) aucune ligne réduite du tout. Aucune règle métier n'a changé.
import { z } from 'zod';

const actLineSchema = z.object({
  name: z.string(),
  amount: z.number(),
  category: z.string().optional(),
  retained: z.number(),
  reason: z.string(),
});

export const createApplyRefactionFormSchema = (invoiceAmount: number) =>
  z.object({ acts: z.array(actLineSchema) }).refine((data) => {
    const totalOriginal = data.acts.reduce((s, a) => s + a.amount, 0);
    if (Math.abs(totalOriginal - invoiceAmount) > 0.01) return false;

    let anyRejected = false;
    for (const a of data.acts) {
      const rejected = Math.max(0, a.amount - a.retained);
      if (rejected > 0) {
        anyRejected = true;
        if (!a.reason.trim()) return false;
      }
    }
    return anyRejected;
  });

export type ApplyRefactionFormValues = z.infer<ReturnType<typeof createApplyRefactionFormSchema>>;
