import { readonly, ref, watch, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useEchoSessionStore } from '@/stores/echoSession';

/**
 * App-wide singleton mapping `liveSyncConnected` → a single status pill.
 *
 * - `reconnecting` only after {@link REALTIME_BANNER_RECONNECTING_DELAY_MS} down.
 * - `connected` (green) only if the user saw `reconnecting`, then auto-hides.
 * - Initial boot connect stays silent.
 * - Duplicate connect events during recovery are ignored.
 */

export type RealtimeConnectionBannerState =
  | 'hidden'
  | 'reconnecting'
  | 'connected';

export const REALTIME_BANNER_RECONNECTING_DELAY_MS = 1500;
export const REALTIME_BANNER_CONNECTED_HOLD_MS = 800;
export const REALTIME_BANNER_CONNECTED_FADE_MS = 1000;

type TimerId = ReturnType<typeof setTimeout>;

type RealtimeConnectionBannerOptions = {
  reconnectingDelayMs?: number;
  connectedHoldMs?: number;
  setTimeoutFn?: (fn: () => void, ms: number) => TimerId;
  clearTimeoutFn?: (id: TimerId) => void;
  /** Test hook: observe a specific connected ref instead of the session store. */
  connected?: Ref<boolean>;
};

const state = ref<RealtimeConnectionBannerState>('hidden');
let hasConnectedOnce = false;
let showTimer: TimerId | null = null;
let hideTimer: TimerId | null = null;
let watchInstalled = false;

let reconnectingDelayMs = REALTIME_BANNER_RECONNECTING_DELAY_MS;
let connectedHoldMs = REALTIME_BANNER_CONNECTED_HOLD_MS;
let setTimeoutFn: (fn: () => void, ms: number) => TimerId = (fn, ms) =>
  setTimeout(fn, ms) as TimerId;
let clearTimeoutFn: (id: TimerId) => void = (id) => clearTimeout(id);

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
  if (state.value === 'connected') {
    hasConnectedOnce = true;
    return;
  }
  if (state.value === 'reconnecting') {
    state.value = 'connected';
    clearHideTimer();
    hideTimer = setTimeoutFn(() => {
      state.value = 'hidden';
      hideTimer = null;
    }, connectedHoldMs);
  } else {
    state.value = 'hidden';
  }
  hasConnectedOnce = true;
}

function onDisconnected() {
  clearHideTimer();
  if (!hasConnectedOnce) return;
  if (state.value === 'reconnecting' || showTimer !== null) return;
  showTimer = setTimeoutFn(() => {
    state.value = 'reconnecting';
    showTimer = null;
  }, reconnectingDelayMs);
}

function installConnectedWatch(connected: Ref<boolean>) {
  if (watchInstalled) return;
  watchInstalled = true;
  hasConnectedOnce = connected.value;
  watch(
    connected,
    (isConnected) => {
      if (isConnected) onConnected();
      else onDisconnected();
    },
    { immediate: true },
  );
}

/** @internal Reset singleton between unit tests. */
export function resetRealtimeConnectionBannerForTests() {
  clearShowTimer();
  clearHideTimer();
  state.value = 'hidden';
  hasConnectedOnce = false;
  watchInstalled = false;
  reconnectingDelayMs = REALTIME_BANNER_RECONNECTING_DELAY_MS;
  connectedHoldMs = REALTIME_BANNER_CONNECTED_HOLD_MS;
  setTimeoutFn = (fn, ms) => setTimeout(fn, ms) as TimerId;
  clearTimeoutFn = (id) => clearTimeout(id);
}

export function useRealtimeConnectionBanner(
  opts: RealtimeConnectionBannerOptions = {},
): { state: Readonly<Ref<RealtimeConnectionBannerState>> } {
  reconnectingDelayMs =
    opts.reconnectingDelayMs ?? REALTIME_BANNER_RECONNECTING_DELAY_MS;
  connectedHoldMs = opts.connectedHoldMs ?? REALTIME_BANNER_CONNECTED_HOLD_MS;
  if (opts.setTimeoutFn) setTimeoutFn = opts.setTimeoutFn;
  if (opts.clearTimeoutFn) clearTimeoutFn = opts.clearTimeoutFn;

  const connected =
    opts.connected ?? storeToRefs(useEchoSessionStore()).liveSyncConnected;
  installConnectedWatch(connected);

  return { state: readonly(state) };
}
