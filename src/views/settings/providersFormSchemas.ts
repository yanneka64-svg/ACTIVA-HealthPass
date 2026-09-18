// === AMÉLIORATION AJOUTÉE : Phase 3 du plan de durcissement — react-hook-form + zod
// (2026-09-18) === Nouveau domaine (providers), même approche déjà validée sur claims et
// enrollments : un formulaire simple et autonome (Créer/Modifier un prestataire dans
// ProvidersView.tsx), sans logique asynchrone ni capture biométrique — contrairement aux
// formulaires d'intake laissés de côté sur claims/enrollments, celui-ci ne présente donc aucun
// profil de risque particulier et est converti dans son intégralité (un seul formulaire, pas
// plusieurs modales indépendantes).
//
// Seul `name` était validé en JS impératif (`if (!formName.trim()) return;`, valeur BRUTE non
// trimmée transmise ensuite à onAddProvider/onUpdateProvider) : reproduit ici via `.refine()`
// plutôt que `.trim()` pour ne pas transformer la valeur. `type`/`location`/`conventionNumber`/
// `kypStatus`/`phone` n'étaient jamais validés en JS (seuls `location`/`conventionNumber`
// portent l'attribut HTML `required`, conservé tel quel dans le JSX — comportement de blocage
// natif du navigateur inchangé, comme avant) : aucune contrainte supplémentaire ajoutée ici pour
// ces champs.
import { z } from 'zod';

export const providerFormSchema = z.object({
  name: z.string().refine((v) => v.trim().length > 0),
  type: z.string(),
  location: z.string(),
  conventionNumber: z.string(),
  kypStatus: z.string(),
  phone: z.string(),
});
export type ProviderFormValues = z.infer<typeof providerFormSchema>;
