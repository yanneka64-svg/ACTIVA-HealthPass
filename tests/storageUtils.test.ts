// === AMÉLIORATION AJOUTÉE : tests unitaires (Revue complète 2026-09-06, finding #7 — HIGH) pour
// uploadPhotoOrFallback() — preuve reproductible du comportement fail-closed : un échec d'upload
// Firebase Storage ne doit plus, par défaut, dégrader silencieusement vers un stockage base64
// dans Firestore. `firebase/storage` et `src/lib/firebase` sont mockés pour ne dépendre d'aucun
// projet Firebase réel ni réseau.
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';

vi.mock('../src/lib/firebase', () => ({ storage: {} }));

const uploadStringMock = vi.fn();
const getDownloadURLMock = vi.fn();
vi.mock('firebase/storage', () => ({
  ref: vi.fn(() => ({})),
  uploadString: (...args: unknown[]) => uploadStringMock(...args),
  getDownloadURL: (...args: unknown[]) => getDownloadURLMock(...args),
}));

import { uploadPhotoOrFallback } from '../src/utils/storageUtils';

const SAMPLE_DATA_URL = 'data:image/jpeg;base64,AAAA';

describe('uploadPhotoOrFallback', () => {
  beforeEach(() => {
    uploadStringMock.mockReset();
    getDownloadURLMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('retourne l\'URL de téléchargement quand l\'upload Storage réussit (chemin nominal)', async () => {
    uploadStringMock.mockResolvedValue(undefined);
    getDownloadURLMock.mockResolvedValue('https://storage.example.com/member-photos/OrgA/card1-123.jpg');

    const result = await uploadPhotoOrFallback(SAMPLE_DATA_URL, 'member-photos', 'card1', 'OrgA');

    expect(result).toBe('https://storage.example.com/member-photos/OrgA/card1-123.jpg');
  });

  it('FAIL-CLOSED par défaut : relance une erreur claire si l\'upload échoue (pas de repli base64)', async () => {
    vi.stubEnv('VITE_ALLOW_STORAGE_BASE64_FALLBACK', undefined as unknown as string);
    uploadStringMock.mockRejectedValue(new Error('storage/unauthorized'));

    await expect(uploadPhotoOrFallback(SAMPLE_DATA_URL, 'member-photos', 'card1', 'OrgA')).rejects.toThrow(
      /could not be saved securely/i
    );
  });

  it('interrupteur de secours : si VITE_ALLOW_STORAGE_BASE64_FALLBACK="true", restaure l\'ancien comportement (repli base64)', async () => {
    vi.stubEnv('VITE_ALLOW_STORAGE_BASE64_FALLBACK', 'true');
    uploadStringMock.mockRejectedValue(new Error('storage/unauthorized'));

    const result = await uploadPhotoOrFallback(SAMPLE_DATA_URL, 'member-photos', 'card1', 'OrgA');

    expect(result).toBe(SAMPLE_DATA_URL);
  });

  it('ne tente aucun upload si la valeur n\'est pas une data URL (URL déjà résolue)', async () => {
    const existingUrl = 'https://storage.example.com/already-uploaded.jpg';
    const result = await uploadPhotoOrFallback(existingUrl, 'member-photos', 'card1', 'OrgA');
    expect(result).toBe(existingUrl);
    expect(uploadStringMock).not.toHaveBeenCalled();
  });
});
