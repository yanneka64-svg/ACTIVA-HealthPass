// @vitest-environment jsdom
// === AMÉLIORATION AJOUTÉE : premier test de composant sur du code EXISTANT (pas seulement le
// nouveau code de cette session) — voir FRONTEND_CRITICAL_ANALYSIS.md §8. `PhotoThumbnail` a
// été créé plus tôt dans cette session précisément pour corriger un bug utilisateur ("les
// images ont du mal à charger") ; ce test verrouille ce comportement (bascule vers `fallback`
// à la fois quand `src` est absent ET quand le chargement échoue) pour qu'une régression future
// soit détectée automatiquement plutôt que redécouverte manuellement.
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PhotoThumbnail } from './PhotoThumbnail';

describe('PhotoThumbnail', () => {
  it('renders the fallback when no src is provided', () => {
    render(<PhotoThumbnail alt="Member photo" fallback={<div data-testid="fallback">No photo</div>} />);

    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the image when a src is provided', () => {
    render(
      <PhotoThumbnail
        src="https://storage.example.com/photo.jpg"
        alt="Member photo"
        fallback={<div data-testid="fallback">No photo</div>}
      />
    );

    const img = screen.getByRole('img', { name: 'Member photo' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://storage.example.com/photo.jpg');
    expect(screen.queryByTestId('fallback')).not.toBeInTheDocument();
  });

  it('switches to the fallback once the image fails to load', () => {
    render(
      <PhotoThumbnail
        src="https://storage.example.com/broken.jpg"
        alt="Member photo"
        fallback={<div data-testid="fallback">No photo</div>}
      />
    );

    const img = screen.getByRole('img', { name: 'Member photo' });
    fireEvent.error(img);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
  });
});
