import React, { useState } from 'react';

interface PhotoThumbnailProps {
  src?: string;
  alt: string;
  className?: string;
  fallback: React.ReactNode;
}

// === AMÉLIORATION AJOUTÉE : robustesse d'affichage des photos (retour utilisateur explicite —
// "les images ont du mal à charger" à la connexion / en changeant de page) — les <img
// src={photoUrl}> pointant vers Firebase Storage n'avaient jusqu'ici aucun filet de sécurité :
// une photo lente ou en échec de chargement (réseau, URL expirée) restait vide ou affichait
// l'icône "image cassée" du navigateur, sans jamais revenir à l'avatar de repli déjà utilisé
// quand `photoUrl` est absent. Ce composant centralise ce filet : bascule automatiquement sur
// `fallback` dès que le chargement échoue (`onError`), et charge les photos hors-écran en
// différé (`loading="lazy"`) pour ne pas ralentir l'affichage initial des listes qui en
// comportent beaucoup. `referrerPolicy="no-referrer"` déjà utilisé ponctuellement ailleurs dans
// le code, généralisé ici, évite un blocage de certaines URLs Firebase Storage par un en-tête
// Referer inattendu.
export const PhotoThumbnail: React.FC<PhotoThumbnailProps> = ({ src, alt, className, fallback }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
};
