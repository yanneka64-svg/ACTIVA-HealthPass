// === AMÉLIORATION AJOUTÉE : visuel de carte membre, écran Agent (Insured Identification) ===
// Sur demande explicite de l'utilisateur (2026-09-10), remplace la précédente "Digital Card"
// (signature serveur + QR vérifiable, HealthPass 2.0 Phase 3) qui nécessitait un déploiement
// Cloud Functions non disponible pour cette session — abandonnée. Ce composant est purement
// visuel : aucun appel réseau, aucune dépendance à une Cloud Function ou à une nouvelle
// collection Firestore, rien à déployer. Affiché automatiquement dès qu'un assuré est
// sélectionné (jamais derrière un bouton/une modale).
//
// === AMÉLIORATION AJOUTÉE : QR code (2026-09-10, sur demande explicite) — encode directement
// les informations générales déjà affichées sur la carte (nom, n° de carte, organisation,
// statut) sous forme de texte lisible, généré entièrement côté client avec la librairie
// `qrcode`. Volontairement SANS signature ni vérification serveur (contrairement à l'ancienne
// "Digital Card") : un lecteur de QR standard affiche directement ces informations, sans avoir
// besoin de l'application ni d'une Cloud Function.
//
// === AMÉLIORATION AJOUTÉE : format "vraie carte" (2026-09-10, retour utilisateur — "je veux
// vraiment que la carte s'affiche comme une carte") — remplace l'ancien bloc pleine largeur par
// des proportions fixes proches d'une carte bancaire/ID réelle (ratio ≈ 1.586, comme ISO/IEC
// 7810 ID-1), alignée à gauche plutôt qu'étirée sur toute la largeur de l'écran. Option "A"
// choisie explicitement parmi 3 propositions visuelles : QR discret dans le coin, numéro de
// carte en style embossé (monospace, espacé).
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

    QRCode.toDataURL(qrText, { margin: 1, width: 90 })
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
      className="rounded-2xl text-white relative overflow-hidden shadow-xl w-full max-w-[340px]"
      style={{ aspectRatio: '340 / 214', background: 'linear-gradient(135deg, #072659, #0A347B 55%, #0D2B63)' }}
    >
      <div className="p-4 flex flex-col h-full">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-extrabold uppercase tracking-wide opacity-85">Activa HealthPass</span>
          <div className="w-8 h-5.5 rounded-md shrink-0" style={{ background: 'linear-gradient(135deg,#e7c873,#c9a24a)' }} />
        </div>

        <div className="flex items-center gap-2.5 mt-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center text-base shrink-0">
            👤
          </div>
          <div className="min-w-0">
            <div className="font-extrabold text-sm truncate">{fullName}</div>
            <div className="text-[10.5px] text-white/70 truncate">
              {organization}{relationship ? ` · ${relationship}` : ''}
            </div>
          </div>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[8.5px] uppercase tracking-wide text-white/55 font-bold">Card No.</div>
            <div className="font-bold text-[13px] tracking-wider mt-0.5 truncate" style={{ fontFamily: 'monospace' }}>
              {cardNo}
            </div>
            <span className={`inline-flex items-center gap-1 mt-1.5 text-[9px] font-bold ${isActive ? 'text-emerald-300' : 'text-rose-300'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {isActive ? 'Active' : status}
            </span>
          </div>
          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt="QR code with insured member information"
              title="Scan to view this member's general information"
              className="rounded bg-white p-1 w-[46px] h-[46px] shrink-0"
            />
          )}
        </div>
      </div>
    </div>
  );
};
