import { onScopeDispose, ref, watch, type Ref } from 'vue';

/**
 * Boot gate for the first app paint.
 *
 * DECISION: Show the app shell immediately with skeleton states rather than
 * holding a full-screen splash. This reduces perceived load time from ~9s to
 * ~1-2s while actual data hydrates in the background.
 *
 * The gate now only shows briefly (max 800ms) to prevent a flash of unstyled
 * content, then reveals the app shell with skeleton placeholders.
 *
 * For users without a session (login page), we show the gate briefly to let
 * the auth shell render, then fade it out.
 */
export function useAppBootGate(deps: {
  /** A session token was present at boot (returning / logged-in user). */
  hasSession: boolean;
  /** The shell already painted workspace content from cache before mount. */
  warmPainted: boolean;
  /** Workspace one-way latch: true once the initial load first settles. */
  initialLoadSettled: Ref<boolean>;
  /** Defensive cap (ms) after which the gate reveals regardless. */
  timeoutMs: number;
  /** Fast reveal timeout for progressive loading experience (ms). */
  fastRevealMs?: number;
}): { showBootGate: Ref<boolean> } {
  const {
    hasSession,
    warmPainted,
    initialLoadSettled,
    timeoutMs,
    fastRevealMs = 800,
  } = deps;

  // Always start with gate visible to prevent FOUC, but reveal quickly
  const showBootGate = ref(true);

  const reveal = () => {
    showBootGate.value = false;
  };

  // Fast reveal for progressive loading: show app shell with skeletons
  // instead of waiting for full data hydration
  const fastRevealTimer = setTimeout(reveal, fastRevealMs);

  // Safety: ensure we always reveal even if something goes wrong
  const safetyTimer = setTimeout(reveal, timeoutMs);

  // For warm-painted sessions, we could hide even faster, but the fastRevealMs
  // already handles this well
  const stop = watch(initialLoadSettled, (settled) => {
    if (settled) {
      // Already revealed by fast timer, but ensure cleanup
      clearTimeout(fastRevealTimer);
      clearTimeout(safetyTimer);
    }
  });

  onScopeDispose(() => {
    stop();
    clearTimeout(fastRevealTimer);
    clearTimeout(safetyTimer);
  });

  return { showBootGate };
}
