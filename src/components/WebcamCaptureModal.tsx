import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, X, Check, AlertCircle, SwitchCamera, Sparkles, Image as ImageIcon } from 'lucide-react';

interface WebcamCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoCaptured: (photoDataUrl: string) => void;
  title?: string;
}

export const WebcamCaptureModal: React.FC<WebcamCaptureModalProps> = ({
  isOpen,
  onClose,
  onPhotoCaptured,
  title = 'Live Webcam / Camera Capture',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputFallbackRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoadingCamera, setIsLoadingCamera] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(false);

  // Stop camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  // Start camera stream
  const startCamera = useCallback(async (mode: 'user' | 'environment' = facingMode) => {
    setIsLoadingCamera(true);
    setCameraError(null);
    setCapturedImage(null);

    // Clean up existing stream
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam / Camera API is not supported on this browser.');
      }

      // Check available video devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      setHasMultipleCameras(videoDevices.length > 1);

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: mode,
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.play().catch((e) => {
          console.warn('Video playback error:', e);
        });
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      let message = 'Unable to access camera. Please check permissions or use device camera upload.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        message = 'Camera access was denied by browser settings. Please allow camera permissions.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        message = 'No physical webcam or camera device detected on this system.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        message = 'Camera is already in use by another application or tab.';
      }
      setCameraError(message);
    } finally {
      setIsLoadingCamera(false);
    }
  }, [facingMode, stream]);

  // Handle open / close lifecycle
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

  // Switch between front and back camera
  const toggleCameraFacing = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Capture snapshot from video stream
  const captureSnapshot = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 640;

    // Make square crop for ID portrait
    const minDim = Math.min(width, height);
    const startX = (width - minDim) / 2;
    const startY = (height - minDim) / 2;

    canvas.width = minDim;
    canvas.height = minDim;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flip horizontally if front camera for natural mirror effect
    if (facingMode === 'user') {
      ctx.translate(minDim, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, startX, startY, minDim, minDim, 0, 0, minDim, minDim);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    setCapturedImage(dataUrl);
    stopCamera();
  };

  // Confirm captured photo
  const handleConfirm = () => {
    if (capturedImage) {
      onPhotoCaptured(capturedImage);
      onClose();
    }
  };

  // Retake photo
  const handleRetake = () => {
    setCapturedImage(null);
    startCamera(facingMode);
  };

  // Direct device camera / file fallback
  const handleFallbackFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const result = uploadEvent.target?.result as string;
        setCapturedImage(result);
        setCameraError(null);
        stopCamera();
      };
      reader.readAsDataURL(file);
    }
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
              <Camera className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base leading-tight text-slate-900">{title}</h3>
              <p className="text-[11px] text-slate-500">Live facial photo capture for insured identification</p>
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

        {/* Camera Viewport / Review Area */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 flex flex-col items-center">
          <div className="relative w-full max-w-[340px] aspect-square rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-700 shadow-inner flex items-center justify-center group">
            {/* Live Video Stream */}
            {!capturedImage && !cameraError && (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                />

                {/* Facial alignment oval guide overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-60 rounded-[50%] border-2 border-dashed border-emerald-400/70 shadow-[0_0_15px_rgba(16,185,129,0.3)] flex flex-col items-center justify-start pt-4">
                    <span className="text-[10px] font-bold text-emerald-300 bg-slate-900/80 px-2 py-0.5 rounded-full backdrop-blur-xs">
                      Align Face in Frame
                    </span>
                  </div>
                </div>

                {/* Live Indicator */}
                <div className="absolute top-3 left-3 bg-rose-600/90 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-sm animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                  <span>LIVE CAMERA</span>
                </div>

                {/* Camera switch toggle if device has multiple cameras */}
                {hasMultipleCameras && (
                  <button
                    type="button"
                    onClick={toggleCameraFacing}
                    className="absolute top-3 right-3 p-2 rounded-xl bg-slate-900/80 hover:bg-slate-900 text-white border border-slate-700 backdrop-blur-sm transition cursor-pointer"
                    title="Switch Camera"
                  >
                    <SwitchCamera className="w-4 h-4" />
                  </button>
                )}
              </>
            )}

            {/* Captured Snapshot Preview */}
            {capturedImage && (
              <div className="relative w-full h-full">
                <img
                  src={capturedImage}
                  alt="Captured Snapshot"
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-3 left-3 bg-emerald-600 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                  <Check className="w-3 h-3" />
                  <span>PHOTO CAPTURED</span>
                </div>
              </div>
            )}

            {/* Error or No Camera Fallback */}
            {cameraError && !capturedImage && (
              <div className="p-6 text-center text-slate-300 space-y-3">
                <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
                <p className="text-xs font-semibold text-slate-200">{cameraError}</p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => fileInputFallbackRef.current?.click()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 mx-auto cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Open Device Camera / Photo</span>
                  </button>
                </div>
              </div>
            )}

            {/* Loading Spinner */}
            {isLoadingCamera && (
              <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center text-white gap-2">
                <RefreshCw className="w-7 h-7 text-emerald-400 animate-spin" />
                <span className="text-xs font-bold">Activating webcam device...</span>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />
          <input
            type="file"
            ref={fileInputFallbackRef}
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={handleFallbackFileSelect}
          />

          {/* Guidelines */}
          <div className="w-full text-center text-slate-500 text-xs">
            {!capturedImage ? (
              <p>Keep your head centered, look directly into the camera lens, and ensure good lighting.</p>
            ) : (
              <p className="text-emerald-700 font-bold">Photo verified. Click "Use This Photo" to confirm enrollment.</p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {!capturedImage ? (
              <>
                <button
                  type="button"
                  onClick={() => fileInputFallbackRef.current?.click()}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  title="Upload from device file or native camera"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                  <span>Device Upload</span>
                </button>
                <button
                  type="button"
                  onClick={captureSnapshot}
                  disabled={isLoadingCamera || !!cameraError}
                  className="px-5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-extrabold transition flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                >
                  <Camera className="w-4 h-4 text-emerald-300" />
                  <span>Capture Photo</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleRetake}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retake</span>
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition flex items-center gap-2 shadow-md shadow-emerald-700/20 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Use This Photo</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
