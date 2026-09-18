// === AMÉLIORATION AJOUTÉE : Phase 3 du plan de durcissement — react-hook-form + zod
// (2026-09-18) === Domaine "Change Password" (ChangePasswordModal.tsx). Contrairement aux
// domaines précédents, les règles de mot de passe ne servent pas qu'à bloquer la soumission :
// elles pilotent aussi une checklist affichée EN DIRECT à chaque frappe (coche verte par règle).
// Les prédicats individuels sont donc exportés ici comme fonctions pures, réutilisées à la fois
// par le schéma zod (règle globale de soumission) et par ChangePasswordModal.tsx (checklist en
// direct, dérivée des valeurs surveillées via `watch()`) — une seule source de vérité pour les
// règles, sans dupliquer les expressions régulières entre les deux.
//
// Aucun changement de règle : mêmes 5 critères + correspondance des mots de passe qu'avant
// (`hasMinLength`/`hasUpper`/`hasLower`/`hasNumber`/`hasSpecial`/`isMatching`), même message
// d'erreur générique en cas d'échec. `currentPassword` n'était (et n'est toujours) jamais
// validé en JS — seul l'attribut HTML `required` s'applique quand le champ est affiché
// (masqué lors d'une première connexion forcée).
import { z } from 'zod';

export const hasMinLength = (password: string): boolean => password.length >= 8;
export const hasUpper = (password: string): boolean => /[A-Z]/.test(password);
export const hasLower = (password: string): boolean => /[a-z]/.test(password);
export const hasNumber = (password: string): boolean => /\d/.test(password);
export const hasSpecial = (password: string): boolean =>
  /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
export const isMatchingPassword = (newPassword: string, confirmPassword: string): boolean =>
  newPassword.length > 0 && newPassword === confirmPassword;

export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string(),
    newPassword: z.string(),
    confirmPassword: z.string(),
  })
  .refine(
    (data) =>
      hasMinLength(data.newPassword) &&
      hasUpper(data.newPassword) &&
      hasLower(data.newPassword) &&
      hasNumber(data.newPassword) &&
      hasSpecial(data.newPassword) &&
      isMatchingPassword(data.newPassword, data.confirmPassword)
  );
export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;
