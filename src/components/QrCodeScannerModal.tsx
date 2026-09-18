import React, { useEffect, useRef, useState } from 'react';
import { X, QrCode, AlertTriangle } from 'lucide-react';
import { Language } from '../types';
import { useTranslation } from '../i18n/translations';
import { extractCardNumberFromQrText } from '../utils/qrCodeUtils';

interface QrCodeScannerModalProps {
  isOpen: boolean;
  lang?: Language;
  onClose: () => void;
  onCardNumberScanned: (cardNumber: string) => void;
}

// === AMÉLIORATION AJOUTÉE : lecteur de QR code pour la recherche d'assuré (demande explicite,
// 2026-09-18) — "prévoir également un QR code pour capter les numéro de carte afin de faciliter
// la recherche au niveau de l'identification des assurés". Utilise l'API native du navigateur
// `BarcodeDetector` (disponible sur Chrome/WebView Android, la plateforme du terminal
// HFSecurity FP08 ciblé par cette app) plutôt qu'une nouvelle dépendance de décodage QR : un
// `npm install` est actuellement bloqué dans l'environnement de développement de ce projet (voir
// la dépendance `xlsx` de package.json, hébergée sur un CDN inaccessible), donc une librairie
// pure-JS (jsQR, zxing...) ne peut pas être ajoutée pour le moment. Repli honnête si l'API n'est
// pas disponible sur l'appareil/navigateur : message clair, jamais de capture simulée — même
// principe déjà appliqué au scan biométrique dans AgentIdentificationView.tsx.
export const QrCodeScannerModal: React.FC<QrCodeScannerModalProps> = ({
  isOpen,
  lang = 'en' as Language,
  onClose,
  onCardNumberScanned,
}) => {
  const t = useTranslation(lang);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // === AMÉLIORATION AJOUTÉE : distinct de `error` — un QR non reconnu (ex. code d'un autre
  // usage, mal cadré) n'est pas une panne caméra : le flux vidéo reste affiché et le scan
  // continue, seul un message d'aide transitoire s'affiche le temps que l'agent recadre.
  const [hint, setHint] = useState<string | null>(null);
  const isSupported =
    typeof window !== 'undefined' &&
    'BarcodeDetector' in window &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setHint(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isSupported) return;
    let cancelled = false;

    const stopStream = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const BarcodeDetectorCtor = (window as any).BarcodeDetector;
        const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const rawValue = codes?.[0]?.rawValue;
            if (rawValue) {
              const cardNumber = extractCardNumberFromQrText(rawValue);
              if (cardNumber) {
                onCardNumberScanned(cardNumber);
                return;
              }
              if (!cancelled) setHint(t.agentId.qrScannerUnrecognized);
            }
          } catch {
            // Erreur de détection au niveau d'une frame (ex. caméra en cours d'initialisation) —
            // transitoire, on continue la boucle plutôt que d'afficher une erreur bloquante.
          }
          if (!cancelled) rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setError(t.agentId.qrScannerCameraError);
      }
    };

    start();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isSupported]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95">
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-[var(--brand-900)]" />
              <h3 className="text-sm font-black text-slate-800">{t.agentId.qrScannerTitle}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
              aria-label={t.agentId.qrScannerCancel}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {!isSupported ? (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-amber-800 text-xs font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{t.agentId.qrScannerUnsupported}</span>
            </div>
          ) : error ? (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-amber-800 text-xs font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500">{t.agentId.qrScannerSubtitle}</p>
              <video
                ref={videoRef}
                muted
                playsInline
                className="w-full aspect-square bg-slate-900 rounded-xl object-cover"
              />
              {hint && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-amber-800 text-xs font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{hint}</span>
                </div>
              )}
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-xl font-bold text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
          >
            {t.agentId.qrScannerCancel}
          </button>
        </div>
      </div>
    </div>
  );
};
