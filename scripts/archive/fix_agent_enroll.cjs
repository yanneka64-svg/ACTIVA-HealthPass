const fs = require('fs');

const code = `import React, { useState, useRef } from 'react';
import { Camera, Fingerprint, UserCheck, CheckCircle2, Upload, AlertTriangle, X } from 'lucide-react';
import { Enrollment, Organization, RelationshipType } from '../../types';

interface AgentEnrollmentsViewProps {
  organizations: Organization[];
  onCreateEnrollment: (enr: Partial<Enrollment>) => void;
}

export const AgentEnrollmentsView: React.FC<AgentEnrollmentsViewProps> = ({ organizations, onCreateEnrollment }) => {
  const [form, setForm] = useState({
    fullName: '',
    cardNo: '',
    birthDate: '',
    organization: '',
    relationship: 'Principal' as RelationshipType,
    mainInsuredName: '',
    mainInsuredCardNo: '',
  });

  const [hasPhoto, setHasPhoto] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [photoData, setPhotoData] = useState<string | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setShowCamera(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (e) {
      console.error(e);
      alert("Impossible d'accéder à la caméra. Vérifiez les permissions.");
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        setPhotoData(canvas.toDataURL('image/jpeg'));
        setHasPhoto(true);
      }
      stopCamera();
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setShowCamera(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPhoto || !hasBiometrics) return;

    onCreateEnrollment({
      fullName: form.fullName,
      birthDate: form.birthDate,
      organizationName: form.organization,
      relationship: form.relationship,
      status: 'pending'
    });

    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setForm({ fullName: '', cardNo: '', birthDate: '', organization: '', relationship: 'Principal', mainInsuredName: '', mainInsuredCardNo: '' });
      setHasPhoto(false);
      setHasBiometrics(false);
      setPhotoData(null);
    }, 3000);
  };

  const handleFingerprint = () => {
    setIsCapturing(true);
    // Simulate fingerprint scanning matching database
    setTimeout(() => {
      setIsCapturing(false);
      setHasBiometrics(true);
      // Simulate fetching matching user data
      if (!form.fullName) {
         setForm(f => ({ ...f, fullName: 'Assuré Reconnu', birthDate: '1985-06-15', organization: organizations[0]?.name || '' }));
      }
    }, 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-8 py-6 bg-[#0d3f8f] text-white flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Enrôlement Biométrique</h2>
            <p className="text-sm text-blue-100 mt-1">Capture des données pour la création de la carte santé</p>
          </div>
          <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
            <UserCheck className="w-6 h-6 text-white" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {submitted && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <p className="font-bold text-sm">Dossier d'enrôlement soumis avec succès pour validation.</p>
            </div>
          )}

          {/* Informations personnelles */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">Informations de l'assuré</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nom Complet</label>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(e) => setForm({...form, fullName: e.target.value})}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#0d3f8f]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Date de Naissance</label>
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setForm({...form, birthDate: e.target.value})}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#0d3f8f]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Organisation</label>
                <select
                  value={form.organization}
                  onChange={(e) => setForm({...form, organization: e.target.value})}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#0d3f8f]"
                  required
                >
                  <option value="">Sélectionner...</option>
                  {organizations.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Lien de parenté</label>
                <select
                  value={form.relationship}
                  onChange={(e) => setForm({...form, relationship: e.target.value as RelationshipType})}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#0d3f8f]"
                >
                  <option value="Principal">Principal</option>
                  <option value="Conjoint">Conjoint</option>
                  <option value="Enfant">Enfant</option>
                  <option value="Ascendant">Ascendant</option>
                </select>
              </div>
              
              {form.relationship !== 'Principal' && (
                <>
                  <div className="md:col-span-1">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nom de l'Assuré Principal <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      value={form.mainInsuredName}
                      onChange={(e) => setForm({...form, mainInsuredName: e.target.value})}
                      className="w-full px-3.5 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#0d3f8f]"
                      required
                      placeholder="Ex: Jean Dupont"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-xs font-bold text-slate-700 mb-1">N° Carte Assuré Principal <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      value={form.mainInsuredCardNo}
                      onChange={(e) => setForm({...form, mainInsuredCardNo: e.target.value})}
                      className="w-full px-3.5 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#0d3f8f]"
                      required
                      placeholder="Ex: ACT-2023-XXXX"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Biometrics */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">Acquisition Biométrique</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Photo */}
              <div className={\`p-6 rounded-2xl border-2 border-dashed flex flex-col items-center text-center transition \${hasPhoto ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}\`}>
                <div className={\`w-16 h-16 rounded-full flex items-center justify-center mb-4 overflow-hidden \${hasPhoto ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-[#0d3f8f]'}\`}>
                  {hasPhoto && photoData ? (
                    <img src={photoData} alt="Captured" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-8 h-8" />
                  )}
                </div>
                <h4 className="font-bold text-sm text-slate-800 mb-1">Photo d'identité</h4>
                <p className="text-xs text-slate-500 mb-4">Capture faciale claire requise</p>
                <button
                  type="button"
                  onClick={startCamera}
                  className={\`px-4 py-2 rounded-xl text-xs font-bold transition \${
                    'bg-[#0d3f8f] hover:bg-[#0b357a] text-white shadow-xs'
                  }\`}
                >
                  {hasPhoto ? 'Reprendre la photo' : 'Capturer la photo'}
                </button>
              </div>

              {/* Empreinte */}
              <div className={\`p-6 rounded-2xl border-2 border-dashed flex flex-col items-center text-center transition \${hasBiometrics ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}\`}>
                <div className={\`w-16 h-16 rounded-full flex items-center justify-center mb-4 \${hasBiometrics ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}\`}>
                  {hasBiometrics ? <CheckCircle2 className="w-8 h-8" /> : <Fingerprint className="w-8 h-8" />}
                </div>
                <h4 className="font-bold text-sm text-slate-800 mb-1">Empreinte Digitale</h4>
                <p className="text-xs text-slate-500 mb-4">Placer le doigt sur le capteur externe</p>
                <button
                  type="button"
                  onClick={handleFingerprint}
                  disabled={isCapturing || hasBiometrics}
                  className={\`px-4 py-2 rounded-xl text-xs font-bold transition \${
                    hasBiometrics ? 'bg-emerald-200 text-emerald-800 cursor-not-allowed' :
                    isCapturing ? 'bg-slate-200 text-slate-500 cursor-wait' :
                    'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                  }\`}
                >
                  {hasBiometrics ? 'Acquise' : isCapturing ? 'Recherche correspondances...' : 'Scanner le capteur biometrique'}
                </button>
              </div>
            </div>
            
            {(!hasPhoto || !hasBiometrics) && (
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-600 mt-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Les deux éléments biométriques sont obligatoires. La photo et l'empreinte seront stockées.</span>
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={!hasPhoto || !hasBiometrics || submitted}
              className={\`px-8 py-3 rounded-xl text-sm font-bold shadow-md transition flex items-center gap-2 \${
                (!hasPhoto || !hasBiometrics || submitted)
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-[#00A859] hover:bg-[#008f4c] text-white'
              }\`}
            >
              <Upload className="w-5 h-5" />
              <span>Soumettre l'enrôlement</span>
            </button>
          </div>
        </form>
      </div>

      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm">
          <div className="bg-white rounded-3xl overflow-hidden w-full max-w-md shadow-2xl">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Prendre une photo</h3>
              <button onClick={stopCamera} className="p-2 text-slate-400 hover:bg-slate-200 rounded-full transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative bg-black aspect-square flex items-center justify-center">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            </div>
            <div className="p-6 bg-slate-50 flex justify-center">
              <button
                onClick={capturePhoto}
                className="w-16 h-16 rounded-full bg-rose-500 hover:bg-rose-600 border-4 border-rose-200 shadow-lg flex items-center justify-center transition-transform active:scale-95"
              >
                <Camera className="w-6 h-6 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
`;

fs.writeFileSync('src/views/agent/AgentEnrollmentsView.tsx', code);
