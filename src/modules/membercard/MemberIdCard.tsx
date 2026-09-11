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
// vraiment que la carte s'affiche comme une carte") — proportions fixes proches d'une carte
// bancaire/ID réelle (ratio ≈ 1.586, comme ISO/IEC 7810 ID-1).
//
// === AMÉLIORATION AJOUTÉE : refonte visuelle "carte physique réelle" (2026-09-10, sur demande
// explicite de l'utilisateur, à partir d'une photo de la carte "CARTE SANTE ACTIVA" imprimée
// réellement en production) — remplace le fond dégradé bleu par le visuel exact de la carte
// papier : bandeau bleu incurvé "CARTE SANTE ACTIVA" en haut, encadré photo à gauche, bloc
// "Bénéficiaire" (Matricule / Nom / Prénoms / Date de naissance), rôle en gros caractères
// ("Assuré.e" pour l'assuré principal, "Ayant droit" pour un dépendant), QR code et logo Activa
// en bas. Disponible en français ET en anglais (prop `lang`, repli sur 'en' si non fournie).
import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Language } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { ACTIVA_LOGO_BASE64 } from '../../assets/logos';

interface MemberIdCardProps {
  fullName: string;
  organization: string;
  cardNo: string;
  status: string;
  relationship?: string;
  birthDate?: string;
  photoUrl?: string;
  lang?: Language;
}

// === AMÉLIORATION AJOUTÉE : sépare "Nom" (nom de famille) et "Prénoms" à partir du nom complet
// unique disponible dans les données (InsuredBeneficiary.fullName) — la convention de saisie
// déjà utilisée ailleurs dans l'app (voir placeholder "e.g. LAST NAME First name" dans le
// formulaire Nouvelle adhésion) place le nom de famille en MAJUSCULES en premier. Repli sûr :
// si aucun mot en majuscules n'est détecté en tête, le nom complet est simplement affiché tel
// quel dans "Nom" et "Prénoms" reste vide — jamais de donnée inventée.
function splitFullName(fullName: string): { surname: string; given: string } {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < words.length && /[A-ZÀ-Ý]/.test(words[i]) && words[i] === words[i].toUpperCase()) {
    i++;
  }
  if (i === 0 || i === words.length) {
    return { surname: fullName, given: '' };
  }
  return { surname: words.slice(0, i).join(' '), given: words.slice(i).join(' ') };
}

function formatBirthDate(birthDate?: string): string {
  if (!birthDate) return '—';
  const match = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return birthDate;
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
}

export const MemberIdCard: React.FC<MemberIdCardProps> = ({
  fullName,
  organization,
  cardNo,
  status,
  relationship,
  birthDate,
  photoUrl,
  lang = 'en' as Language,
}) => {
  const t = useTranslation(lang);
  const isActive = status === 'Active' || status === 'Actif';
  const { surname, given } = splitFullName(fullName);
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

    QRCode.toDataURL(qrText, { margin: 0, width: 120 })
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

  const roleLabel = relationship ? t.memberCard.dependentRoleLabel : t.memberCard.insuredRoleLabel;

  return (
    <div
      // === AMÉLIORATION AJOUTÉE : largeur FLUIDE alignée sur le conteneur parent (retour
      // utilisateur, 2026-09-10 — "la taille de la carte (sur la largeur) doit être alignée
      // avec la bannière en dessous") — remplace la précédente taille FIXE en pixels
      // (300×189), qui laissait un écart visible avec le panneau "ICAO Biometrics Compliant"
      // affiché juste en dessous (celui-ci occupant toute la largeur de la colonne, ex. 320px).
      // La carte occupe maintenant `w-full` (jusqu'à 340px max, proche d'une vraie carte
      // ID-1) et conserve son ratio via `aspect-ratio`. Pour éviter de réintroduire le bug de
      // débordement précédent (des tailles internes fixes en px ne rétrécissant pas avec un
      // conteneur plus étroit que prévu), ce conteneur devient une "container query" CSS
      // (`containerType: 'inline-size'`) et toutes les tailles internes sensibles (polices,
      // encadré photo, QR, logo) sont exprimées en unités `cqw` (% de la largeur RÉELLE de la
      // carte elle-même) au lieu de px fixes — elles remontent/descendent proportionnellement
      // avec la carte, quelle que soit la largeur réelle du conteneur parent.
      className="w-full max-w-[340px] aspect-[340/214] rounded-2xl bg-white flex flex-col overflow-hidden shadow-xl border border-slate-200"
      style={{ containerType: 'inline-size' }}
    >
      {/* Bandeau bleu incurvé — forme "ruban" fidèle à la carte physique réelle. Le texte est
          calé en haut (pt-1.5), une zone TOUJOURS pleinement bleue quelle que soit la position
          horizontale (seul le BAS de la forme est incurvé) — évite tout chevauchement blanc sur
          blanc avec le creux de la courbe au centre. */}
      <div className="relative shrink-0 flex items-start justify-center pt-1.5" style={{ height: '27%' }}>
        <svg
          viewBox="0 0 340 58"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full block"
        >
          <path d="M0,0 H340 V44 Q170,26 0,44 Z" fill="#1657b0" />
        </svg>
        <span className="relative text-white font-extrabold tracking-wide text-[4cqw]">
          {t.memberCard.cardTitle}
        </span>
      </div>

      {/* Corps de la carte */}
      <div className="flex-1 min-h-0 px-3 pt-1.5 pb-1.5 flex flex-col justify-between">
        {/* === AMÉLIORATION AJOUTÉE : "Insured"/"Assuré.e" resserré juste après la Date de
            naissance (retour utilisateur explicite, 2026-09-11) — Beneficiary et Rôle sont
            désormais regroupés dans un même bloc (au lieu d'être espacés par le
            `justify-between` du conteneur), qui ne s'applique plus qu'entre ce groupe et le
            pied de carte. === */}
        <div>
          {/* Photo + bloc Bénéficiaire */}
          <div className="flex items-start gap-2.5">
            <div className="w-[16.67cqw] h-[18.67cqw] shrink-0 rounded-md border border-slate-300 bg-slate-100 overflow-hidden flex items-center justify-center">
              {photoUrl ? (
                <img src={photoUrl} alt={t.memberCard.photoAlt} className="w-full h-full object-cover" />
              ) : (
                <svg viewBox="0 0 50 56" className="w-full h-full">
                  <rect width="50" height="56" fill="#eef1f5" />
                  <circle cx="25" cy="21" r="10" fill="#c3cbd6" />
                  <path d="M7,54 C7,40 14,34 25,34 C36,34 43,40 43,54 Z" fill="#c3cbd6" />
                </svg>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-[3.83cqw] font-extrabold text-[#1657b0] leading-tight">
                {t.memberCard.beneficiaryLabel}
              </div>
              <div className="mt-0.5 text-[2.67cqw] text-slate-800 leading-[1.3]">
                <div className="whitespace-nowrap overflow-hidden text-ellipsis">
                  <span className="font-semibold text-slate-500">{t.memberCard.matriculeLabel} : </span>
                  <span className="font-bold" style={{ fontFamily: 'monospace' }}>{cardNo}</span>
                </div>
                {/* === AMÉLIORATION AJOUTÉE : puce à droite des lignes Nom/Prénoms (retour
                    utilisateur explicite, 2026-09-11) — repère visuel discret, même style de
                    point que celui déjà utilisé pour le statut plus bas sur la carte.
                    === AMÉLIORATION AJOUTÉE : débordement corrigé (retour utilisateur explicite
                    — "ne doit pas déborder le cadre dédié à la photo") — `min-w-0` ajouté sur le
                    span tronqué : dans une ligne flex, un enfant garde par défaut sa largeur de
                    contenu minimale et refuse de rétrécir, ce qui empêchait `text-ellipsis` de
                    s'appliquer pour un nom long et le laissait déborder du cadre de la carte. === */}
                <div className="flex items-center justify-between gap-1">
                  <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                    <span className="font-semibold text-slate-500">{t.memberCard.surnameLabel} : </span>
                    <span className="font-bold uppercase">{surname}</span>
                  </span>
                  <span className="w-1 h-1 rounded-full bg-[#1657b0] shrink-0" />
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                    <span className="font-semibold text-slate-500">{t.memberCard.givenNamesLabel} : </span>
                    <span className="font-bold">{given || '—'}</span>
                  </span>
                  <span className="w-1 h-1 rounded-full bg-[#1657b0] shrink-0" />
                </div>
                <div className="whitespace-nowrap overflow-hidden text-ellipsis">
                  <span className="font-semibold text-slate-500">{t.memberCard.dobLabel} : </span>
                  <span className="font-bold">{formatBirthDate(birthDate)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Rôle (Assuré.e / Ayant droit) — juste après la Date de naissance */}
          <div className="leading-tight mt-1">
            <div className="text-[4.67cqw] font-extrabold text-[#1657b0]">{roleLabel}</div>
            {relationship && (
              <div className="text-[2.5cqw] text-slate-500 font-semibold truncate">{relationship} · {organization}</div>
            )}
          </div>
        </div>

        {/* Pied de carte : QR, statut, logo.
            === AMÉLIORATION AJOUTÉE : "Full Name" (signature) et le nom affiché à côté du QR
            retirés (retour utilisateur explicite, 2026-09-11) — seuls le QR code, le statut et
            le logo restent en pied de carte.
            === AMÉLIORATION AJOUTÉE : statut aligné sur la même ligne que le QR code (retour
            utilisateur explicite) — `items-end` remplacé par `items-center` (le statut suivait
            auparavant le bas du QR au lieu d'être centré à côté de lui). Le texte affiché reste
            entièrement dynamique : "Active"/"Actif" si `isActive`, sinon la valeur réelle de
            `status` (ex. "Suspended"/"Suspendu") telle que transmise par l'écran appelant à
            partir des données réelles de l'assuré — jamais figé en dur. === */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="QR code"
                title="Scan to view this member's general information"
                className="w-[10cqw] h-[10cqw] shrink-0"
              />
            )}
            <span className={`inline-flex items-center gap-1 text-[2.17cqw] font-bold ${isActive ? 'text-emerald-600' : 'text-rose-600'}`}>
              <span className="w-1 h-1 rounded-full bg-current" />
              {isActive ? 'Active' : status}
            </span>
          </div>

          <img src={ACTIVA_LOGO_BASE64} alt="Activa" className="h-[7.33cqw] w-auto object-contain shrink-0" />
        </div>
      </div>
    </div>
  );
};
