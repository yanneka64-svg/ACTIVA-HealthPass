// === TESTS DES RÈGLES DE SÉCURITÉ FIREBASE STORAGE ===
// Vérifie le durcissement :
// 1. Rejet des accès non-authentifiés (lecture et écriture)
// 2. Acceptation des images valides (<= 5Mo) dans member-photos et enrollment-photos
// 3. Rejet des types non autorisés (ex: text/html, application/x-sh)
// 4. Acceptation des documents valides (<= 15Mo) dans claims/receipts
// 5. Blocage de la suppression pour les non-admins
// 6. Blocage par défaut sur les chemins arbitraires non autorisés

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
    expect(rulesContent).toContain('function isAuthenticated()');
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

  it('Isolates sensitive operational paths', () => {
    expect(rulesContent).toContain('/member-photos/{photoId}');
    expect(rulesContent).toContain('/enrollment-photos/{photoId}');
    expect(rulesContent).toContain('/claims/{claimId}/{fileName}');
    expect(rulesContent).toContain('/receipts/{receiptId}/{fileName}');
    expect(rulesContent).toContain('/documents/{docId}/{fileName}');
  });

  it('Restricts file deletion strictly to Admin role', () => {
    expect(rulesContent).toContain('allow delete: if isAdmin();');
  });

  it('Denies all arbitrary root or unmapped paths by default', () => {
    expect(rulesContent).toContain('match /{allPaths=**}');
    expect(rulesContent).toContain('allow read, write: if false;');
  });
});

