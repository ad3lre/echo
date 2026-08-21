import { onScopeDispose, watch, type ComputedRef } from 'vue';

/** No keyboard/pointer/scroll activity for this long → auto-set profile to `idle` (compact). */
export const ECHO_AFK_IDLE_AFTER_MS = 10 * 60 * 1000;

/**
 * Persists the user's explicitly chosen presence status across browser restarts.
 * Uses `localStorage` (not `sessionStorage`) so the choice survives a full
 * browser close—`sessionStorage` was cleared on close, causing idle/DnD
 * to auto-recover to online on the next visit.
 */
const USER_STATUS_CHOICE_KEY = 'echo_user_status_choice_v1';

type EchoProfilePresence = 'online' | 'idle' | 'do_not_disturb' | 'offline';

const STICKY_STATUSES = new Set<EchoProfilePresence>([
  'idle',
  'do_not_disturb',
]);

function readUserStatusChoice(): EchoProfilePresence | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_STATUS_CHOICE_KEY);
    if (raw && STICKY_STATUSES.has(raw as EchoProfilePresence)) {
      return raw as EchoProfilePresence;
    }
    return null;
  } catch {
    return null;
  }
}

function writeUserStatusChoice(status: EchoProfilePresence | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (status && STICKY_STATUSES.has(status)) {
      localStorage.setItem(USER_STATUS_CHOICE_KEY, status);
    } else {
      localStorage.removeItem(USER_STATUS_CHOICE_KEY);
    }
  } catch {
    /* ignore private mode / quota */
  }
}

/**
 * When the signed-in user stays on `online` without interaction, set them to `idle`.
 * Any interaction while `idle` from this detector returns them to `online`.
 * Manual `idle` / `do_not_disturb` / `offline` are not overridden on activity.
 */
export function useEchoAfkPresence(deps: {
  enabled: ComputedRef<boolean>;
  /** Effective profile status (should match self UI presence, e.g. {@link selectSelfPresence}). */
  getStatus: () => EchoProfilePresence | undefined;
  setStatus: (s: EchoProfilePresence) => void;
}): {
  /** Call when the user explicitly picks a presence status in profile UI. */
  noteUserPresenceChoice: (status: EchoProfilePresence) => void;
} {
  let lastInputAt = Date.now();
  /** True only when `idle` was applied by this composable (not manual status). */
  let idleFromAfkDetector = false;
  /** The user's explicit status choice from the profile UI (survives browser restart via localStorage). */
  let userStatusChoice: EchoProfilePresence | null = readUserStatusChoice();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let lastMoveHandledAt = 0;
  let lastScrollHandledAt = 0;

  const mouseMoveThrottleMs = 900;
  const scrollThrottleMs = 500;

  function noteUserPresenceChoice(status: EchoProfilePresence): void {
    if (STICKY_STATUSES.has(status)) {
      userStatusChoice = status;
      writeUserStatusChoice(status);
      idleFromAfkDetector = false;
      return;
    }
    if (status === 'online') {
      userStatusChoice = null;
      writeUserStatusChoice(null);
    }
  }

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function armIdleTimer() {
    clearIdleTimer();
    if (!deps.enabled.value) return;
    if (deps.getStatus() !== 'online') return;
    const elapsed = Date.now() - lastInputAt;
    const delay = Math.max(0, ECHO_AFK_IDLE_AFTER_MS - elapsed);
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (!deps.enabled.value) return;
      if (deps.getStatus() !== 'online') return;
      if (Date.now() - lastInputAt < ECHO_AFK_IDLE_AFTER_MS) {
        armIdleTimer();
        return;
      }
      idleFromAfkDetector = true;
      deps.setStatus('idle');
    }, delay);
  }

  function onExternalStatusChange() {
    const st = deps.getStatus();
    // Echo presence map can still read `online` until `/presence` + socket catch up after
    // auto-idle; do not drop AFK ownership on that transient mismatch.
    if (!idleFromAfkDetector || st === 'idle') {
      if (st !== 'idle') idleFromAfkDetector = false;
    }
    armIdleTimer();
  }

  function shouldRecoverAutoIdleToOnline(): boolean {
    if (idleFromAfkDetector) return true;
    const current = deps.getStatus();
    if (userStatusChoice && current === userStatusChoice) return false;
    return current === 'idle';
  }

  function markUserActivity() {
    lastInputAt = Date.now();
    if (shouldRecoverAutoIdleToOnline()) {
      idleFromAfkDetector = false;
      userStatusChoice = null;
      writeUserStatusChoice(null);
      deps.setStatus('online');
    }
    armIdleTimer();
  }

  function onPointerLike() {
    markUserActivity();
  }

  function onMouseMove() {
    const now = Date.now();
    if (now - lastMoveHandledAt < mouseMoveThrottleMs) return;
    lastMoveHandledAt = now;
    markUserActivity();
  }

  function onScrollOrWheel() {
    const now = Date.now();
    if (now - lastScrollHandledAt < scrollThrottleMs) return;
    lastScrollHandledAt = now;
    markUserActivity();
  }

  function onVisibility() {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible') markUserActivity();
  }

  const opts: AddEventListenerOptions = { capture: true, passive: true };

  function attachGlobalListeners() {
    if (typeof window === 'undefined' || typeof document === 'undefined')
      return;
    window.addEventListener('pointerdown', onPointerLike, opts);
    window.addEventListener('keydown', onPointerLike, opts);
    window.addEventListener('wheel', onScrollOrWheel, opts);
    window.addEventListener('touchstart', onPointerLike, opts);
    window.addEventListener('scroll', onScrollOrWheel, opts);
    window.addEventListener('mousemove', onMouseMove, opts);
    window.addEventListener('focus', onPointerLike, opts);
    document.addEventListener('visibilitychange', onVisibility);
  }

  function detachGlobalListeners() {
    if (typeof window === 'undefined' || typeof document === 'undefined')
      return;
    window.removeEventListener('pointerdown', onPointerLike, opts);
    window.removeEventListener('keydown', onPointerLike, opts);
    window.removeEventListener('wheel', onScrollOrWheel, opts);
    window.removeEventListener('touchstart', onPointerLike, opts);
    window.removeEventListener('scroll', onScrollOrWheel, opts);
    window.removeEventListener('mousemove', onMouseMove, opts);
    window.removeEventListener('focus', onPointerLike, opts);
    document.removeEventListener('visibilitychange', onVisibility);
  }

  watch(
    () => [deps.enabled.value, deps.getStatus()] as const,
    () => {
      onExternalStatusChange();
    },
    { flush: 'post' },
  );

  watch(
    () => deps.enabled.value,
    (on) => {
      if (on) {
        lastInputAt = Date.now();
        idleFromAfkDetector = false;
        userStatusChoice = readUserStatusChoice();
        attachGlobalListeners();
        armIdleTimer();
      } else {
        clearIdleTimer();
        idleFromAfkDetector = false;
        detachGlobalListeners();
      }
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    clearIdleTimer();
    detachGlobalListeners();
  });

  return { noteUserPresenceChoice };
}
