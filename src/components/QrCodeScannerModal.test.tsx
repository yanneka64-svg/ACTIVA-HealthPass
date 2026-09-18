// @vitest-environment jsdom
// === AMÉLIORATION AJOUTÉE : lecteur de QR code pour la recherche d'assuré (demande explicite,
// 2026-09-18) — voir QrCodeScannerModal.tsx. Ces tests verrouillent : (1) le repli honnête quand
// l'API BarcodeDetector n'est pas disponible (aucune capture simulée), (2) l'accès caméra et
// l'extraction du numéro de carte à la détection, (3) l'erreur fatale si la caméra est
// inaccessible, (4) le message d'aide non bloquant (le flux vidéo reste affiché, contrairement à
// une panne caméra) quand le QR scanné n'est pas reconnu comme une carte ACTIVA.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QrCodeScannerModal } from './QrCodeScannerModal';

function fakeStream(): MediaStream {
  return { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
}

function stubGetUserMedia(impl: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(impl) },
  });
}

// === AMÉLIORATION AJOUTÉE : `BarcodeDetector` doit être instanciable via `new` (voir
// QrCodeScannerModal.tsx) — une fonction fléchée passée à `vi.fn().mockImplementation()` ne peut
// pas servir de constructeur (`new` sur une arrow function échoue toujours en JS), d'où l'usage
// d'une function expression classique ici.
function stubBarcodeDetector(detectedCodes: Array<{ rawValue: string }>) {
  (window as any).BarcodeDetector = vi.fn().mockImplementation(function () {
    return { detect: vi.fn().mockResolvedValue(detectedCodes) };
  });
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined as any);
});

afterEach(() => {
  cleanup();
  delete (window as any).BarcodeDetector;
  delete (navigator as any).mediaDevices;
  vi.restoreAllMocks();
});

describe('QrCodeScannerModal', () => {
  it('ne rend rien quand isOpen est false', () => {
    render(
      <QrCodeScannerModal isOpen={false} lang="en" onClose={() => {}} onCardNumberScanned={() => {}} />
    );
    expect(screen.queryByText('Scan Insured Card QR Code')).not.toBeInTheDocument();
  });

  it("affiche un message clair quand l'API BarcodeDetector n'est pas disponible (pas de capture simulée)", () => {
    render(
      <QrCodeScannerModal isOpen lang="en" onClose={() => {}} onCardNumberScanned={() => {}} />
    );
    expect(
      screen.getByText(/QR code scanning is not supported on this device or browser/)
    ).toBeInTheDocument();
  });

  it('le bouton Cancel appelle onClose', () => {
    const onClose = vi.fn();
    render(<QrCodeScannerModal isOpen lang="en" onClose={onClose} onCardNumberScanned={() => {}} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('extrait le numéro de carte détecté par la caméra et appelle onCardNumberScanned', async () => {
    stubBarcodeDetector([{ rawValue: 'Card No: AMID-2026-0001' }]);
    stubGetUserMedia(async () => fakeStream());
    const onCardNumberScanned = vi.fn();

    render(
      <QrCodeScannerModal
        isOpen
        lang="en"
        onClose={() => {}}
        onCardNumberScanned={onCardNumberScanned}
      />
    );

    await waitFor(() => expect(onCardNumberScanned).toHaveBeenCalledWith('AMID-2026-0001'));
  });

  it("affiche une erreur fatale si la caméra n'est pas accessible", async () => {
    stubBarcodeDetector([]);
    stubGetUserMedia(async () => {
      throw new Error('Permission denied');
    });

    render(
      <QrCodeScannerModal isOpen lang="en" onClose={() => {}} onCardNumberScanned={() => {}} />
    );

    await waitFor(() =>
      expect(screen.getByText(/Unable to access the camera/)).toBeInTheDocument()
    );
  });

  it('affiche un message non bloquant (le flux vidéo reste visible) quand le QR scanné n\'est pas reconnu', async () => {
    stubBarcodeDetector([{ rawValue: 'https://example.com' }]);
    stubGetUserMedia(async () => fakeStream());
    const onCardNumberScanned = vi.fn();

    const { container } = render(
      <QrCodeScannerModal
        isOpen
        lang="en"
        onClose={() => {}}
        onCardNumberScanned={onCardNumberScanned}
      />
    );

    await waitFor(() =>
      expect(screen.getByText(/was not recognized as an ACTIVA insured card/)).toBeInTheDocument()
    );
    expect(onCardNumberScanned).not.toHaveBeenCalled();
    expect(container.querySelector('video')).toBeInTheDocument();
  });
});
