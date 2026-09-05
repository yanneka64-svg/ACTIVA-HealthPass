// === AMÉLIORATION AJOUTÉE : sons Web Audio API (succès, notification, connexion, erreur, déconnexion) ===
// Générés via la Web Audio API (aucun fichier audio à charger/héberger), donc légers et
// fiables hors-ligne. Chaque appel échoue silencieusement si l'API n'est pas disponible
// (anciens navigateurs, contexte non autorisé avant interaction utilisateur, etc.) afin de
// ne jamais bloquer une action métier à cause du son.

const SOUND_ENABLED_KEY = 'activa_sound_enabled';

/**
 * Checks whether audio feedback is enabled in user settings.
 * Defaults to true if not set.
 */
export function isSoundEnabled(): boolean {
  try {
    const val = localStorage.getItem(SOUND_ENABLED_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

/**
 * Persists user sound preference and notifies active listeners.
 */
export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_ENABLED_KEY, enabled ? 'true' : 'false');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('activa_sound_toggle', { detail: { enabled } }));
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Toggles the sound preference between enabled and muted.
 */
export function toggleSound(): boolean {
  const next = !isSoundEnabled();
  setSoundEnabled(next);
  if (next) {
    unlockAudioContext();
  }
  return next;
}

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new Ctx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      // Best-effort resume;
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Explicitly unlocks and resumes the AudioContext upon a direct user interaction gesture.
 */
export function unlockAudioContext(): void {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch {
    // Ignore
  }
}

// Automatic one-time gesture unlock for browsers with strict auto-play policies
if (typeof window !== 'undefined') {
  const unlockOnFirstGesture = () => {
    unlockAudioContext();
    window.removeEventListener('click', unlockOnFirstGesture);
    window.removeEventListener('keydown', unlockOnFirstGesture);
  };
  window.addEventListener('click', unlockOnFirstGesture, { once: true, passive: true });
  window.addEventListener('keydown', unlockOnFirstGesture, { once: true, passive: true });
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  peakGain = 0.18
) {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(peakGain, startTime + 0.015);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

/**
 * Short, pleasant ascending two-tone chime played when a user operation is
 * successfully validated (approve, save, submit, create, etc.).
 */
export function playSuccessSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    playTone(ctx, 740, now, 0.14);
    playTone(ctx, 988, now + 0.09, 0.18);
  } catch {
    // Never let a sound failure interrupt the actual operation.
  }
}

/**
 * Short, distinct double-ping played when a new notification is received.
 */
export function playNotificationSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    playTone(ctx, 880, now, 0.11, 0.14);
    playTone(ctx, 1174, now + 0.13, 0.14, 0.14);
  } catch {
    // Never let a sound failure interrupt the app.
  }
}

/**
 * Warm 3-note ascending welcome chime played once upon successful user login.
 * Distinct from playSuccessSound (3 notes instead of 2).
 */
export function playLoginSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    playTone(ctx, 523.25, now, 0.12, 0.15);       // C5
    playTone(ctx, 659.25, now + 0.08, 0.14, 0.16); // E5
    playTone(ctx, 783.99, now + 0.16, 0.22, 0.18); // G5
  } catch {
    // Never let a sound failure interrupt the app.
  }
}

/**
 * Short, neutral descending tone played when an operation results in an error.
 */
export function playErrorSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    playTone(ctx, 392, now, 0.13, 0.15);        // G4
    playTone(ctx, 293.66, now + 0.10, 0.18, 0.13); // D4
  } catch {
    // Never let a sound failure interrupt the app.
  }
}

/**
 * Brief, neutral tone played upon automatic session expiration / timeout.
 * Different from validation and error sounds.
 */
export function playLogoutSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    playTone(ctx, 520, now, 0.12, 0.14);
    playTone(ctx, 390, now + 0.10, 0.16, 0.12);
  } catch {
    // Never let a sound failure interrupt the app.
  }
}
