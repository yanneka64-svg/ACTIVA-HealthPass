// === AMÉLIORATION AJOUTÉE : Phase 3 du plan de durcissement — react-hook-form + zod
// (2026-09-18) === Domaine Ceilings : contrairement à claims/enrollments/providers/organizations,
// CeilingsView.tsx ne comporte AUCUN <form> HTML — c'est un wizard à 3 étapes piloté par des
// boutons et un état imbriqué (matrice de plafonds par prestation à clés dynamiques), qui ne se
// prête pas au pattern react-hook-form sans restructuration importante pour aucun gain de
// validation (voir arbitrage utilisateur du 2026-09-18). Seule la modale autonome "Age Limits
// Quick Editor" (organisation + 4 âges limites, un seul bouton de sauvegarde) est migrée ici :
// c'est le seul véritable formulaire indépendant de ce fichier.
//
// Aucun champ n'était validé par une règle de blocage en JS impératif : les 4 champs d'âge
// étaient déjà coercés en nombre entier à chaque frappe (`parseInt(e.target.value, 10) ||
// défaut`), ce qui garantit toujours une valeur numérique valide avant même la soumission —
// reproduit ici via des `setValue()` identiques dans la modale (voir CeilingsView.tsx). Le
// schéma zod ne fait donc que typer la forme finale, sans contrainte supplémentaire.
import { z } from 'zod';

export const ageLimitsFormSchema = z.object({
  organization: z.string(),
  principal: z.number(),
  spouse: z.number(),
  child: z.number(),
  student: z.number(),
});
export type AgeLimitsFormValues = z.infer<typeof ageLimitsFormSchema>;
