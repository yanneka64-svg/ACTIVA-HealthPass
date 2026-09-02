import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, RefreshCw, Check, AlertCircle, FlipHorizontal, Image as ImageIcon, Upload } from 'lucide-react';
import { Language } from '../types';

interface BiometricCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoCaptured: (photoDataUrl: string) => void;
  lang?: Language;
  title?: string;
}

export const BiometricCameraModal: React.FC<BiometricCameraModalProps> = ({
  isOpen,
  onClose,
  onPhotoCaptured,
  lang = 'en',
  title = 'Live Facial Photo Capture',
}) => {
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Start Camera Stream
  const startCamera = async (mode: 'user' | 'environment') => {
    setIsLoading(true);
    setCameraError(null);
    stopCamera();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser environment. Please use file upload.');
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn('Camera access issue:', err);
      setCameraError(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Camera permission was denied. Please allow camera access in your browser or select an image file.'
          : 'Unable to connect to camera device. Please use the image upload option.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Stop Camera Stream
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null);
      startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const handleToggleFacingMode = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  const handleCaptureSnapshot = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // If front camera, flip horizontally for natural mirror effect
        if (facingMode === 'user') {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        setCapturedImage(dataUrl);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setCapturedImage(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    if (!stream) {
      startCamera(facingMode);
    }
  };

  const handleConfirmPhoto = () => {
    if (capturedImage) {
      onPhotoCaptured(capturedImage);
      stopCamera();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[94vh]">
        {/* Header — === AMÉLIORATION AJOUTÉE : fenêtre passée au blanc (auparavant fond
            bleu marine #0a2e6b), cohérent avec le reste des fenêtres de l'interface. */}
        <div className="px-5 py-4 bg-white border-b border-slate-200 text-slate-900 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <Camera className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base leading-tight text-slate-900">{title}</h3>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Align face inside the oval guide for ISO/ICAO medical ID standard
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport Area */}
        <div className="relative bg-slate-950 aspect-[4/3] flex items-center justify-center overflow-hidden flex-1 min-h-[260px]">
          {capturedImage ? (
            // Captured Snapshot Preview
            <div className="relative w-full h-full flex items-center justify-center bg-black">
              <img
                src={capturedImage}
                alt="Captured Snapshot"
                className="w-full h-full object-contain"
              />
              <div className="absolute top-3 left-3 bg-emerald-600/90 text-white px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-md">
                <Check className="w-3.5 h-3.5" />
                <span>Photo Acquired</span>
              </div>
            </div>
          ) : cameraError ? (
            // Error State with File Upload Fallback
            <div className="p-6 text-center text-white space-y-4 max-w-sm">
              <AlertCircle className="w-12 h-12 text-amber-400 mx-auto opacity-90" />
              <div>
                <p className="text-xs font-bold text-amber-200">{cameraError}</p>
                <p className="text-[11px] text-slate-300 mt-1">
                  You can upload a saved photo or take a photo using your device camera selector.
                </p>
              </div>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => startCamera(facingMode)}
                  className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Camera</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Image</span>
                </button>
              </div>
            </div>
          ) : (
            // Live Stream
            <div className="relative w-full h-full flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              />

              {/* Portrait Oval Alignment Guide */}
              <div className="absolute inset-4 sm:inset-6 border-2 border-dashed border-emerald-400/70 rounded-[48%] pointer-events-none flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-emerald-400/40" />
              </div>

              {/* Camera Switch button */}
              <button
                type="button"
                onClick={handleToggleFacingMode}
                className="absolute top-3 right-3 p-2.5 rounded-full bg-black/50 hover:bg-black/75 text-white border border-white/20 shadow-lg transition backdrop-blur-xs cursor-pointer"
                title="Switch Camera (Front / Back)"
              >
                <FlipHorizontal className="w-4 h-4" />
              </button>

              <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-xs text-white px-2.5 py-1 rounded-full text-[10px] font-mono border border-white/10">
                1280x720 • HD Feed
              </div>
            </div>
          )}

          {/* Hidden File Input for Image Selection */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            capture="user"
            className="hidden"
          />
        </div>

        {/* Footer Controls */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
          {capturedImage ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retake</span>
              </button>

              <button
                type="button"
                onClick={handleConfirmPhoto}
                className="px-6 py-2.5 rounded-xl bg-[#00A859] hover:bg-[#008f4c] text-white text-xs font-extrabold shadow-md shadow-emerald-600/20 transition flex items-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Use This Photo</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>Import File</span>
              </button>

              <button
                type="button"
                onClick={handleCaptureSnapshot}
                disabled={Boolean(cameraError) || isLoading}
                className={`px-6 py-3 rounded-full font-extrabold text-xs text-white shadow-lg transition flex items-center gap-2 cursor-pointer ${
                  cameraError || isLoading
                    ? 'bg-slate-400 opacity-50 cursor-not-allowed'
                    : 'bg-rose-600 hover:bg-rose-700 border-4 border-rose-200 active:scale-95'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Capture Snapshot</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  onClose();
                }}
                className="px-3.5 py-2.5 rounded-xl text-slate-500 hover:text-slate-800 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
