// === AMÉLIORATION AJOUTÉE : HealthPass 2.0, Phase 3 — Digital Card & Server-Verifiable QR ===
// Modale ouverte depuis un bouton dédié sur la fiche assuré (AgentIdentificationView.tsx), même
// convention que CardNumberManagementModal.tsx / ProviderTariffsModal.tsx : jamais une colonne
// ajoutée à un tableau existant. Combine dans une seule modale la carte numérique de l'assuré
// courant (générée + son QR affiché) ET un outil de vérification pouvant contrôler N'IMPORTE
// QUELLE carte (celle affichée, ou un code collé/scanné d'un autre assuré) — évite de dupliquer
// l'écran de vérification séparément dans Admin pour ce premier incrément.
import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, IdCard, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { ADMIN_THEME } from '../../theme/roleTheme';
import {
  DigitalCardSignature,
  DigitalCardVerification,
  generateDigitalCardSignature,
  verifyDigitalCardSignature,
  encodeCardQrPayload,
  decodeCardQrPayload,
} from './digitalCardService';

interface DigitalCardModalProps {
  cardNo: string;
  memberName: string;
  organization: string;
  onClose: () => void;
}

export const DigitalCardModal: React.FC<DigitalCardModalProps> = ({ cardNo, memberName, organization, onClose }) => {
  const [signature, setSignature] = useState<DigitalCardSignature | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [verifyResult, setVerifyResult] = useState<DigitalCardVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [pastedCode, setPastedCode] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const sig = await generateDigitalCardSignature(cardNo);
        if (cancelled) return;
        setSignature(sig);
        const dataUrl = await QRCode.toDataURL(encodeCardQrPayload(sig), { margin: 1, width: 180 });
        if (cancelled) return;
        setQrDataUrl(dataUrl);
      } catch (err: any) {
        if (!cancelled) {
          setLoadError(
            err?.message?.includes('CARD_SIGNING_KEY') || err?.code === 'functions/internal' || err?.code === 'functions/not-found'
              ? 'Digital card signing is not yet deployed on this server (CARD_SIGNING_KEY secret / Cloud Functions).'
              : 'Could not generate the digital card. Please try again.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardNo]);

  const handleVerifyThisCard = async () => {
    if (!signature) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result = await verifyDigitalCardSignature(signature);
      setVerifyResult(result);
    } catch {
      setVerifyResult({ valid: false });
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyPasted = async () => {
    setPasteError(null);
    setVerifyResult(null);
    const decoded = decodeCardQrPayload(pastedCode);
    if (!decoded) {
      setPasteError('Could not read this code — expected the exact text encoded on a HealthPass digital card.');
      return;
    }
    setVerifying(true);
    try {
      const result = await verifyDigitalCardSignature(decoded);
      setVerifyResult(result);
    } catch {
      setVerifyResult({ valid: false });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-white border-b border-slate-200 px-6 py-4.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-[#0A347B]">
              <IdCard className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight text-slate-900">Digital HealthPass Card</h3>
              <p className="text-xs text-slate-500 mt-0.5">{memberName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {loading && (
            <div className="p-8 flex flex-col items-center gap-2 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <p className="text-xs font-semibold">Generating signed card…</p>
            </div>
          )}

          {loadError && (
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
              {loadError}
            </div>
          )}

          {!loading && signature && (
            <div
              className="rounded-2xl p-5 text-white relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #072659, #0A347B 55%, #0D2B63)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wide opacity-85">Activa HealthPass</span>
                <div className="w-8 h-5.5 rounded-md" style={{ background: 'linear-gradient(135deg,#e7c873,#c9a24a)' }} />
              </div>
              <div className="flex items-center gap-3 mt-3.5">
                <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center text-lg shrink-0">
                  👤
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-sm truncate">{memberName}</div>
                  <div className="text-[11px] text-white/70 truncate">{organization}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3.5 text-[11px]">
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-white/55 font-bold">Card No.</div>
                  <div className="font-bold mt-0.5">{signature.cardNo}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-white/55 font-bold">Valid Through</div>
                  <div className="font-bold mt-0.5">{signature.validThrough}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-4">
                {qrDataUrl && <img src={qrDataUrl} alt="Card verification QR code" className="rounded-lg bg-white p-1 w-[64px] h-[64px]" />}
                <p className="text-[10px] text-white/75 leading-relaxed">
                  Signed, server-verifiable — encodes the card number and expiry plus a signature
                  checked against the server on scan.
                </p>
              </div>
            </div>
          )}

          {!loading && signature && (
            <button
              type="button"
              onClick={handleVerifyThisCard}
              disabled={verifying}
              className="w-full px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#00A859] border border-emerald-200 text-xs font-bold transition cursor-pointer disabled:opacity-60"
            >
              {verifying ? 'Verifying…' : 'Verify This Card'}
            </button>
          )}

          <div className="pt-1 border-t border-slate-100">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2 mt-3">Verify Another Card</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={pastedCode}
                onChange={(e) => setPastedCode(e.target.value)}
                placeholder="Paste a scanned card's code"
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800"
              />
              <button
                type="button"
                onClick={handleVerifyPasted}
                disabled={verifying || !pastedCode.trim()}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${ADMIN_THEME.palette.primaryColor} text-white disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Verify
              </button>
            </div>
            {pasteError && <p className="text-[11px] text-rose-600 font-semibold mt-1.5">{pasteError}</p>}
          </div>

          {verifyResult && (
            <div className={`rounded-xl p-4 border ${verifyResult.valid ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
              <div className={`flex items-center gap-1.5 text-xs font-extrabold ${verifyResult.valid ? 'text-emerald-800' : 'text-rose-700'}`}>
                {verifyResult.valid ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                <span>
                  {verifyResult.valid
                    ? verifyResult.expired
                      ? 'Signature valid — but this card has expired'
                      : 'Signature valid'
                    : 'Invalid signature — this card was not issued by ACTIVA or was altered'}
                </span>
              </div>
              {verifyResult.valid && verifyResult.member && (
                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-slate-500">Insured</span><span className="font-bold text-slate-800">{verifyResult.member.name}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Organization</span><span className="font-bold text-slate-800">{verifyResult.member.organization}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Current status</span><span className="font-bold text-slate-800">{verifyResult.member.status}</span></div>
                </div>
              )}
              {verifyResult.valid && !verifyResult.member && (
                <p className="text-[11px] text-slate-500 mt-1.5">Signature is genuine, but no matching insured record was found.</p>
              )}
            </div>
          )}
        </div>

        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className={`px-5 py-2 rounded-xl ${ADMIN_THEME.palette.primaryColor} text-white text-xs font-semibold shadow-xs transition cursor-pointer`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
