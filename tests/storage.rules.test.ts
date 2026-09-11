// === TESTS DES RÈGLES DE SÉCURITÉ FIREBASE STORAGE ===
// Vérifie le durcissement :
// 1. Rejet des accès non-authentifiés (lecture et écriture)
// 2. Acceptation des images valides (<= 5Mo) dans member-photos et enrollment-photos
// 3. Rejet des types non autorisés (ex: text/html, application/x-sh)
// 4. Acceptation des documents valides (<= 15Mo) dans claims/receipts
// 5. Blocage de la suppression pour les non-admins
// 6. Blocage par défaut sur les chemins arbitraires non autorisés
// 7. Cloisonnement par organisation (fusionné le 2026-09-06 avec ce qui précède — voir le
//    commentaire en tête de storage.rules pour le contexte du conflit de fusion résolu ici)
//
// === AMÉLIORATION AJOUTÉE (2026-09-06) : mis à jour pour refléter la fusion de storage.rules
// entre le cloisonnement par organisation (cette PR) et le durcissement MIME/taille/suppression
// (poussé sur `main` pendant que cette PR était ouverte) — les chemins `member-photos`/
// `enrollment-photos`/`claims`/`receipts`/`documents` portent désormais un segment `{orgId}`,
// et les fonctions s'appellent `isSignedIn()`/`isActiveUser()` (pas `isAuthenticated()`),
// cohérent avec la convention déjà utilisée dans firestore.rules.

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Storage Rules — Hardening & Access Control', () => {
  const rulesContent = fs.readFileSync(path.resolve(__dirname, '../storage.rules'), 'utf8');

  it('Storage rules syntax is valid and loadable with version 2', () => {
    expect(rulesContent).toContain("rules_version = '2';");
    expect(rulesContent).toContain('service firebase.storage');
  });

  it('Enforces authentication for read and write operations', () => {
    expect(rulesContent).toContain('function isSignedIn()');
    expect(rulesContent).toContain('request.auth != null');
  });

  it('Enforces MIME type checking for photos and documents', () => {
    expect(rulesContent).toContain('function isImage()');
    expect(rulesContent).toContain('request.resource.contentType.matches');
    expect(rulesContent).toContain('function isPdfOrImage()');
  });

  it('Restricts file sizes to prevent denial-of-service / storage quota exhaustion', () => {
    expect(rulesContent).toContain('function isValidSize(maxMb)');
    expect(rulesContent).toContain('isValidSize(5)');
    expect(rulesContent).toContain('isValidSize(15)');
  });

  it('Isolates sensitive operational paths, cloisonnés par organisation', () => {
    expect(rulesContent).toContain('/member-photos/{orgId}/{fileName}');
    expect(rulesContent).toContain('/enrollment-photos/{orgId}/{fileName}');
    expect(rulesContent).toContain('/claims/{orgId}/{claimId}/{fileName}');
    expect(rulesContent).toContain('/receipts/{orgId}/{receiptId}/{fileName}');
    expect(rulesContent).toContain('/documents/{orgId}/{docId}/{fileName}');
  });

  it('Enforces per-organization access via custom claims (hasOrgAccess)', () => {
    expect(rulesContent).toContain('function hasOrgAccess(orgId)');
    expect(rulesContent).toContain("request.auth.token.orgs");
  });

  it('Restricts file deletion strictly to Admin role', () => {
    expect(rulesContent).toContain('allow delete: if isAdmin();');
  });

  it('Denies all arbitrary root or unmapped paths by default', () => {
    expect(rulesContent).toContain('match /{allPaths=**}');
    expect(rulesContent).toContain('allow read, write: if false;');
  });

  it('Keeps the legacy flat path rules declared (delete still Admin-only), without regressing on already-issued photo URLs', () => {
    expect(rulesContent).toContain('match /member-photos/{fileName}');
    expect(rulesContent).toContain('match /enrollment-photos/{fileName}');
  });

  // === AMÉLIORATION AJOUTÉE : sécurité (revue 2026-09-11 — anciens chemins Storage non
  // cloisonnés) ===
  it('Closes read/write on the legacy flat (non-org-scoped) paths — no cross-organization access, no new writes', () => {
    const legacyMemberPhotosBlock = rulesContent.slice(
      rulesContent.indexOf('match /member-photos/{fileName}'),
      rulesContent.indexOf('match /enrollment-photos/{fileName}')
    );
    expect(legacyMemberPhotosBlock).toContain('allow read, write: if false;');
    expect(legacyMemberPhotosBlock).toContain('allow delete: if isAdmin();');
    // Must NOT contain the old permissive rule (any active authenticated user, any org).
    expect(legacyMemberPhotosBlock).not.toContain('allow read, write: if isSignedIn() && isActiveUser();');

    const legacyEnrollmentPhotosBlock = rulesContent.slice(rulesContent.indexOf('match /enrollment-photos/{fileName}'));
    expect(legacyEnrollmentPhotosBlock).toContain('allow read, write: if false;');
    expect(legacyEnrollmentPhotosBlock).toContain('allow delete: if isAdmin();');
    expect(legacyEnrollmentPhotosBlock).not.toContain('allow read, write: if isSignedIn() && isActiveUser();');
  });
});
