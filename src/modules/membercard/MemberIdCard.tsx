// === AMÉLIORATION AJOUTÉE : visuel de carte membre, écran Agent (Insured Identification) ===
// Sur demande explicite de l'utilisateur (2026-09-10), remplace la précédente "Digital Card"
// (signature serveur + QR vérifiable, HealthPass 2.0 Phase 3) qui nécessitait un déploiement
// Cloud Functions non disponible pour cette session — abandonnée. Ce composant est purement
// visuel : aucun appel réseau, aucune dépendance à une Cloud Function ou à une nouvelle
// collection Firestore, rien à déployer. Affiché automatiquement dès qu'un assuré est
// sélectionné (jamais derrière un bouton/une modale), avec les mêmes données déjà présentes sur
// la fiche assuré juste au-dessus — reprend l'habillage visuel "carte d'assurance" (dégradé bleu
// marine, puce, avatar) qui avait été validé visuellement dans l'aperçu HealthPass 2.0.
//
// === AMÉLIORATION AJOUTÉE : QR code (2026-09-10, sur demande explicite) — encode directement
// les informations générales déjà affichées sur la carte (nom, n° de carte, organisation,
// statut) sous forme de texte lisible, généré entièrement côté client avec la librairie
// `qrcode`. Volontairement SANS signature ni vérification serveur (contrairement à l'ancienne
// "Digital Card") : un lecteur de QR standard affiche directement ces informations, sans avoir
// besoin de l'application ni d'une Cloud Function.
import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface MemberIdCardProps {
  fullName: string;
  organization: string;
  cardNo: string;
  status: string;
  relationship?: string;
}

export const MemberIdCard: React.FC<MemberIdCardProps> = ({ fullName, organization, cardNo, status, relationship }) => {
  const isActive = status === 'Active' || status === 'Actif';
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const qrText = [
      'ACTIVA HealthPass — Insured Member',
      `Name: ${fullName}`,
      `Card No: ${cardNo}`,
      `Organization: ${organization}`,
      `Status: ${isActive ? 'Active' : status}`,
    ].join('\n');

    QRCode.toDataURL(qrText, { margin: 1, width: 120 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [fullName, cardNo, organization, status, isActive]);

  return (
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
          <div className="font-extrabold text-sm truncate">{fullName}</div>
          <div className="text-[11px] text-white/70 truncate">
            {organization}{relationship ? ` · ${relationship}` : ''}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3.5 text-[11px]">
        <div>
          <div className="text-[9px] uppercase tracking-wide text-white/55 font-bold">Card No.</div>
          <div className="font-bold mt-0.5">{cardNo}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wide text-white/55 font-bold">Status</div>
          <div className={`font-bold mt-0.5 ${isActive ? 'text-emerald-300' : 'text-rose-300'}`}>{isActive ? 'Active' : status}</div>
        </div>
      </div>
      {qrDataUrl && (
        <div className="flex items-center gap-3 mt-4">
          <img src={qrDataUrl} alt="QR code with insured member information" className="rounded-lg bg-white p-1 w-[64px] h-[64px]" />
          <p className="text-[10px] text-white/75 leading-relaxed">
            Scan to view this member's general information (name, card number, organization, status).
          </p>
        </div>
      )}
    </div>
  );
};
