import React, { useState, useEffect, useRef } from 'react';
import { Fingerprint, CheckCircle2, AlertCircle, X, RefreshCw, Cpu, Check, Radio, ShieldCheck, Zap } from 'lucide-react';
import { Language } from '../types';
import {
  HF_SECURITY_DEVICE_INFO,
  isHFSecurityBridgeAvailable,
  captureViaHFSecurityBridge,
  CaptureHandle,
} from '../services/hfSecurityBridge';

interface BiometricFingerprintModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFingerprintCaptured: (fingerprintData: { score: number; template: string; finger: string }) => void;
  lang?: Language;
  title?: string;
  subtitle?: string;
  autoStart?: boolean;
}

// === AMÉLIORATION AJOUTÉE : intégration du capteur physique HFSecurity FP08 (demande
// explicite, 2026-09-18) — voir src/services/hfSecurityBridge.ts pour le contrat du pont natif
// et le contexte complet (le FP08 est un terminal Android autonome, pas un lecteur USB : il n'y
// a pas d'API web standard pour le piloter directement depuis un navigateur). Tant qu'aucun pont
// natif n'est détecté (cas de tout navigateur classique aujourd'hui), la capture simulée
// d'origine reste utilisée à l'identique — aucun changement de comportement dans ce cas.
export const BiometricFingerprintModal: React.FC<BiometricFingerprintModalProps> = ({
  isOpen,
  onClose,
  onFingerprintCaptured,
  lang = 'en',
  title = `${HF_SECURITY_DEVICE_INFO.brand} ${HF_SECURITY_DEVICE_INFO.model} — Fingerprint Capture`,
  subtitle = `${HF_SECURITY_DEVICE_INFO.deviceType} · S/N ${HF_SECURITY_DEVICE_INFO.serialNumber}`,
  autoStart = true,
}) => {
  // === AMÉLIORATION AJOUTÉE : demande explicite (2026-09-18) — "la prise d'empreinte se fait
  // uniquement sur le pouce" : plus de sélecteur de doigt (Right/Left Index, Right/Left Thumb),
  // capture systématiquement sur le pouce droit — déjà la convention implicite ailleurs dans
  // l'app (voir le libellé "Right Thumb" codé en dur dans MembersView.tsx pour les biométries
  // existantes). `targetFinger` remplace l'ancien état `selectedFinger` (n'a plus besoin d'être
  // mutable, il n'y a plus qu'une seule valeur possible).
  const targetFinger = 'right_thumb' as const;
  const [sensorStatus, setSensorStatus] = useState<'idle' | 'ready' | 'capturing' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [qualityScore, setQualityScore] = useState<number>(0);
  const [minutiaeCount, setMinutiaeCount] = useState<number>(0);
  const [capturedTemplate, setCapturedTemplate] = useState<string | null>(null);
  // === AMÉLIORATION AJOUTÉE : revue automatisée (2026-09-18) — verrouille le doigt demandé au
  // moment du déclenchement plutôt que de relire `selectedFinger` (mutable) à la confirmation :
  // le sélecteur restait actif pendant la capture, donc le changer en cours de route pouvait
  // faire correspondre le gabarit d'un doigt au libellé d'un autre.
  const [capturedFinger, setCapturedFinger] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  // true si le pont natif HFSecurity (coquille Android) est détecté — false dans tout
  // navigateur classique aujourd'hui, en attendant que cette coquille existe.
  const [hardwareDetected, setHardwareDetected] = useState<boolean>(false);
  // Capture native active (le cas échéant) — annulée à la fermeture/au démontage ou avant une
  // nouvelle capture, pour qu'une réponse tardive de la coquille native n'écrase jamais un état
  // plus récent (revue automatisée, 2026-09-18).
  const activeCaptureRef = useRef<CaptureHandle | null>(null);
  // Minuteur de démarrage automatique — annulé si l'agent déclenche une capture manuelle avant
  // son expiration, pour ne jamais lancer deux captures concurrentes (revue automatisée,
  // 2026-09-18 — "One tap can start two sensor scans").
  const autoStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startCaptureProcess = () => {
    if (sensorStatus === 'capturing') return;
    if (autoStartTimeoutRef.current) {
      clearTimeout(autoStartTimeoutRef.current);
      autoStartTimeoutRef.current = null;
    }

    const requestedFinger = targetFinger;

    setSensorStatus('capturing');
    setProgress(10);
    setQualityScore(0);
    setMinutiaeCount(0);
    setCapturedTemplate(null);
    setCapturedFinger(null);
    setCaptureError(null);

    if (isHFSecurityBridgeAvailable()) {
      const handle = captureViaHFSecurityBridge(requestedFinger);
      activeCaptureRef.current = handle;
      handle.promise
        .then((result) => {
          if (activeCaptureRef.current !== handle) return; // capture annulée/remplacée entre-temps
          activeCaptureRef.current = null;
          setProgress(100);
          setQualityScore(result.score);
          setCapturedTemplate(result.template);
          setCapturedFinger(requestedFinger);
          setSensorStatus('success');
        })
        .catch((err: Error) => {
          if (activeCaptureRef.current !== handle) return;
          activeCaptureRef.current = null;
          setCaptureError(err.message);
          setSensorStatus('error');
        });
      return;
    }

    // Capture simulée (comportement d'origine, inchangé) — utilisée tant qu'aucun capteur
    // physique HFSecurity n'est détecté.
    let curr = 10;
    const interval = setInterval(() => {
      curr += 22;
      if (curr >= 100) {
        clearInterval(interval);
        setProgress(100);
        const finalScore = Math.floor(93 + Math.random() * 6); // 93% to 98%
        const finalMinutiae = Math.floor(52 + Math.random() * 16);
        setQualityScore(finalScore);
        setMinutiaeCount(finalMinutiae);
        setCapturedFinger(requestedFinger);
        setSensorStatus('success');
      } else {
        setProgress(curr);
      }
    }, 280);
  };

  useEffect(() => {
    if (isOpen) {
      setHardwareDetected(isHFSecurityBridgeAvailable());
      setSensorStatus('ready');
      setProgress(0);
      setQualityScore(0);
      setMinutiaeCount(0);
      setCapturedTemplate(null);
      setCapturedFinger(null);
      setCaptureError(null);

      if (autoStart) {
        autoStartTimeoutRef.current = setTimeout(() => {
          autoStartTimeoutRef.current = null;
          startCaptureProcess();
        }, 500);
        return () => {
          if (autoStartTimeoutRef.current) {
            clearTimeout(autoStartTimeoutRef.current);
            autoStartTimeoutRef.current = null;
          }
        };
      }
    } else {
      setSensorStatus('idle');
      activeCaptureRef.current?.cancel();
      activeCaptureRef.current = null;
    }
  }, [isOpen, autoStart]);

  // Filet de sécurité au démontage réel du composant (indépendant de `isOpen`, par exemple si
  // le parent cesse de le rendre sans passer par isOpen=false).
  useEffect(() => {
    return () => {
      if (autoStartTimeoutRef.current) clearTimeout(autoStartTimeoutRef.current);
      activeCaptureRef.current?.cancel();
    };
  }, []);

  const handleStartCapture = () => {
    startCaptureProcess();
  };

  const handleConfirm = () => {
    onFingerprintCaptured({
      score: qualityScore || 96,
      template: capturedTemplate ?? `ANSI_378_${targetFinger.toUpperCase()}_${Date.now()}`,
      finger: capturedFinger ?? targetFinger,
    });
    onClose();
  };

  const handleReset = () => {
    setSensorStatus('ready');
    setProgress(0);
    setQualityScore(0);
    setMinutiaeCount(0);
    setCapturedTemplate(null);
    setCapturedFinger(null);
    setCaptureError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[95vh]">
        {/* Header — === AMÉLIORATION AJOUTÉE : fenêtre passée au blanc (auparavant fond
            bleu marine #0a2e6b), cohérent avec le reste des fenêtres de l'interface. */}
        <div className="px-5 py-4 bg-white border-b border-slate-200 text-slate-900 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <Fingerprint className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base leading-tight text-slate-900">{title}</h3>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                {subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Target Finger — === AMÉLIORATION AJOUTÉE : demande explicite (2026-09-18) —
              capture désormais toujours sur le pouce droit, plus de sélecteur (voir
              `targetFinger` plus haut). Simple rappel informatif, non interactif. */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-xs font-bold text-slate-700">Target Finger</span>
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-700 text-white">
              Right Thumb
            </span>
          </div>

          {/* Scanner Visualizer Area */}
          <div className="relative rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-slate-800 p-6 flex flex-col items-center justify-center min-h-[220px] text-center overflow-hidden">
            {/* Animated Laser line when capturing */}
            {sensorStatus === 'capturing' && (
              <div
                className="absolute inset-x-0 h-1 bg-emerald-400 shadow-[0_0_20px_#10b981] transition-all duration-300"
                style={{ top: `${progress}%` }}
              />
            )}

            {/* Glowing biometric prism */}
            <div
              className={`w-28 h-28 rounded-2xl flex items-center justify-center border-2 transition duration-300 relative ${
                sensorStatus === 'success'
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.35)]'
                  : sensorStatus === 'error'
                  ? 'border-red-500 bg-red-500/10 text-red-400'
                  : sensorStatus === 'capturing'
                  ? 'border-emerald-400 bg-emerald-500/10 text-emerald-300 animate-pulse'
                  : 'border-slate-700 bg-slate-800/60 text-slate-400'
              }`}
            >
              <Fingerprint className="w-16 h-16" />
              {sensorStatus === 'success' && (
                <div className="absolute bottom-1 right-1 bg-emerald-500 text-white rounded-full p-1 shadow-sm animate-in zoom-in-75">
                  <Check className="w-3.5 h-3.5" />
                </div>
              )}
            </div>

            {/* Live Status indicator */}
            <div className="mt-4">
              {sensorStatus === 'ready' && (
                <p className="text-xs font-semibold text-slate-300 flex items-center justify-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {hardwareDetected
                      ? `${HF_SECURITY_DEVICE_INFO.brand} ${HF_SECURITY_DEVICE_INFO.model} ready. Place finger on the sensor.`
                      : 'Scanner ready. Place finger firmly on the optical prism.'}
                  </span>
                </p>
              )}
              {sensorStatus === 'capturing' && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-emerald-300 flex items-center justify-center gap-1.5 animate-pulse">
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Capturing ridges & calculating minutiae ({progress}%)...</span>
                  </p>
                  <div className="w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden mx-auto">
                    <div
                      className="h-full bg-emerald-400 transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
              {sensorStatus === 'success' && (
                <div className="space-y-1 animate-in zoom-in-95">
                  <p className="text-xs font-bold text-emerald-400 flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>NFIQ 2.0 Quality Score: {qualityScore}% (ISO Compliant)</span>
                  </p>
                  {/* === AMÉLIORATION AJOUTÉE : le nombre de minuties n'est affiché que pour la
                      capture simulée — le pont HFSecurity réel ne fournit pas cette donnée
                      (voir FingerprintCaptureResult dans hfSecurityBridge.ts), inventer un
                      chiffre ici induirait en erreur sur un capteur physique. */}
                  <p className="text-[11px] text-slate-400 font-mono">
                    {hardwareDetected
                      ? `${HF_SECURITY_DEVICE_INFO.brand} ${HF_SECURITY_DEVICE_INFO.model} template captured`
                      : `${minutiaeCount} minutiae points extracted • ANSI/NIST ISO CC template generated`}
                  </p>
                </div>
              )}
              {sensorStatus === 'error' && (
                <div className="space-y-1 animate-in zoom-in-95">
                  <p className="text-xs font-bold text-red-400 flex items-center justify-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span>Capture failed</span>
                  </p>
                  <p className="text-[11px] text-slate-400">{captureError}</p>
                </div>
              )}
            </div>
          </div>

          {/* Device Telemetry info — === AMÉLIORATION AJOUTÉE : références du capteur physique
              HFSecurity FP08 (demande explicite) à la place de l'ancien "FAP-20 / USB OTG"
              fictif, avec un état honnête (pont détecté vs capture simulée). */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">Hardware Interface:</span>
              <span
                className={`font-mono font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
                  hardwareDetected
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : 'text-amber-700 bg-amber-50 border-amber-200'
                }`}
              >
                <ShieldCheck className="w-3 h-3" />
                <span>
                  {HF_SECURITY_DEVICE_INFO.brand} {HF_SECURITY_DEVICE_INFO.model}
                  {hardwareDetected ? ' — Connected' : ' — Simulated'}
                </span>
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              S/N {HF_SECURITY_DEVICE_INFO.serialNumber} · {HF_SECURITY_DEVICE_INFO.sensor} · {HF_SECURITY_DEVICE_INFO.standards} · {HF_SECURITY_DEVICE_INFO.resolutionDpi} DPI
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {sensorStatus === 'success' ? (
              <>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Rescan</span>
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirm Biometrics</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleStartCapture}
                disabled={sensorStatus === 'capturing'}
                className="px-5 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-extrabold transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Fingerprint className="w-4 h-4 text-emerald-300" />
                <span>{sensorStatus === 'capturing' ? 'Acquiring...' : 'Trigger Sensor'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
