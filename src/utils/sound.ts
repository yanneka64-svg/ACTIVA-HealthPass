// === AMÉLIORATION AJOUTÉE : sons de confirmation (opération validée) et de notification ===
// Générés via la Web Audio API (aucun fichier audio à charger/héberger), donc légers et
// fiables hors-ligne. Chaque appel échoue silencieusement si l'API n'est pas disponible
// (anciens navigateurs, contexte non autorisé avant interaction utilisateur, etc.) afin de
// ne jamais bloquer une action métier à cause du son.

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new Ctx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      // Best-effort resume; ignored if the browser still requires a user gesture.
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
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
