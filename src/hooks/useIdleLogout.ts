// === AMÉLIORATION AJOUTÉE : déconnexion automatique après inactivité ============
// Avant ce hook, une session authentifiée restait ouverte indéfiniment tant que
// l'onglet du navigateur restait ouvert (Firebase Auth conserve la session locale sans
// limite de durée) — un risque de sécurité réel pour une application de santé/assurance
// consultée sur des postes partagés (agence, guichet). Ce hook surveille l'activité de
// l'utilisateur (souris, clavier, tactile, défilement) et déclenche automatiquement la
// déconnexion après une période d'inactivité configurable, avec un avertissement affiché
// un peu avant l'échéance pour laisser le temps de reprendre la main.
import { useEffect, useRef } from 'react';

/** Inactivity delay before automatic logout (15 minutes). */
export const IDLE_LOGOUT_TIMEOUT_MS = 15 * 60 * 1000;
/** How long before the timeout the warning toast is shown (60 seconds). */
export const IDLE_LOGOUT_WARNING_MS = 60 * 1000;
/** How often the idle timer is checked. */
const CHECK_INTERVAL_MS = 5 * 1000;

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
];

/**
 * Automatically signs the user out after `timeoutMs` of no mouse/keyboard/touch
 * activity. Only active while `enabled` is true (i.e. the user is actually
 * authenticated) — disabled on the login screen, where there is nothing to protect.
 *
 * `onWarning` (optional) fires once, `warningMs` before the timeout, so the caller can
 * show a "you're about to be logged out" notice; `onTimeout` fires once when the idle
 * threshold is reached and should perform the actual logout.
 */
export function useIdleLogout(options: {
  enabled: boolean;
  timeoutMs?: number;
  warningMs?: number;
  onTimeout: () => void;
  onWarning?: () => void;
}): void {
  const { enabled, onTimeout, onWarning } = options;
  const timeoutMs = options.timeoutMs ?? IDLE_LOGOUT_TIMEOUT_MS;
  const warningMs = options.warningMs ?? IDLE_LOGOUT_WARNING_MS;

  const lastActivityRef = useRef<number>(Date.now());
  const warnedRef = useRef<boolean>(false);
  // Keep the latest callbacks in refs so the effect below doesn't need to re-subscribe
  // every time a parent re-render creates new function identities.
  const onTimeoutRef = useRef(onTimeout);
  const onWarningRef = useRef(onWarning);
  onTimeoutRef.current = onTimeout;
  onWarningRef.current = onWarning;

  useEffect(() => {
    if (!enabled) return;

    lastActivityRef.current = Date.now();
    warnedRef.current = false;

    const markActive = () => {
      lastActivityRef.current = Date.now();
      warnedRef.current = false;
    };

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, markActive, { passive: true }));

    const intervalId = window.setInterval(() => {
      const idleFor = Date.now() - lastActivityRef.current;
      if (idleFor >= timeoutMs) {
        onTimeoutRef.current();
      } else if (!warnedRef.current && idleFor >= timeoutMs - warningMs) {
        warnedRef.current = true;
        onWarningRef.current?.();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActive));
      window.clearInterval(intervalId);
    };
  }, [enabled, timeoutMs, warningMs]);
}
