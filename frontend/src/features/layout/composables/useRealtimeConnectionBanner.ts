import { ref, watch, onScopeDispose, type Ref } from 'vue';

/**
 * Maps the raw realtime connection flag into a debounced banner state for the chat surface.
 *
 * - `reconnecting` is only shown after the socket has been down for {@link reconnectingDelayMs},
 *   so quick blips (and the Manager's own fast auto-reconnect) never flash a banner.
 * - `reconnected` is shown briefly after recovery — but only if a `reconnecting` banner was
 *   actually visible, so the initial boot connect stays silent.
 * - Nothing is shown until the socket has connected at least once (initial load is silent).
 */

export type RealtimeConnectionBannerState =
  | 'hidden'
  | 'reconnecting'
  | 'reconnected';

export const REALTIME_BANNER_RECONNECTING_DELAY_MS = 1500;
export const REALTIME_BANNER_RECONNECTED_HOLD_MS = 2500;

type TimerId = ReturnType<typeof setTimeout>;

export function useRealtimeConnectionBanner(deps: {
  connected: Ref<boolean>;
  reconnectingDelayMs?: number;
  reconnectedHoldMs?: number;
  setTimeoutFn?: (fn: () => void, ms: number) => TimerId;
  clearTimeoutFn?: (id: TimerId) => void;
}): { state: Ref<RealtimeConnectionBannerState> } {
  const reconnectingDelayMs =
    deps.reconnectingDelayMs ?? REALTIME_BANNER_RECONNECTING_DELAY_MS;
  const reconnectedHoldMs =
    deps.reconnectedHoldMs ?? REALTIME_BANNER_RECONNECTED_HOLD_MS;
  const setTimeoutFn: (fn: () => void, ms: number) => TimerId =
    deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms) as TimerId);
  const clearTimeoutFn: (id: TimerId) => void =
    deps.clearTimeoutFn ?? ((id) => clearTimeout(id));

  const state = ref<RealtimeConnectionBannerState>('hidden');
  let hasConnected = deps.connected.value;
  let showTimer: TimerId | null = null;
  let hideTimer: TimerId | null = null;

  function clearShowTimer() {
    if (showTimer !== null) {
      clearTimeoutFn(showTimer);
      showTimer = null;
    }
  }
  function clearHideTimer() {
    if (hideTimer !== null) {
      clearTimeoutFn(hideTimer);
      hideTimer = null;
    }
  }

  function onConnected() {
    clearShowTimer();
    // Only celebrate a recovery the user actually saw fail.
    if (state.value === 'reconnecting') {
      state.value = 'reconnected';
      clearHideTimer();
      hideTimer = setTimeoutFn(() => {
        state.value = 'hidden';
        hideTimer = null;
      }, reconnectedHoldMs);
    } else {
      state.value = 'hidden';
    }
    hasConnected = true;
  }

  function onDisconnected() {
    clearHideTimer();
    // Stay silent until the very first successful connect (initial boot).
    if (!hasConnected) return;
    if (state.value === 'reconnecting' || showTimer !== null) return;
    showTimer = setTimeoutFn(() => {
      state.value = 'reconnecting';
      showTimer = null;
    }, reconnectingDelayMs);
  }

  watch(
    () => deps.connected.value,
    (connected) => {
      if (connected) onConnected();
      else onDisconnected();
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    clearShowTimer();
    clearHideTimer();
  });

  return { state };
}
