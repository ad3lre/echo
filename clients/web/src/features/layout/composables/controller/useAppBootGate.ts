import { onScopeDispose, ref, watch, type Ref } from 'vue';

/**
 * Boot gate for the first app paint.
 *
 * Returning users (hasSession): hold the gate until workspace `initialLoadSettled`
 * (or safety timeout). Fast-revealing the chrome at ~600ms before trees/messages
 * hydrate is what paints "No channels to show" / "No messages here yet" and the
 * orphan members search — Fluxer avoids that by keeping AppSkeleton until ready.
 *
 * No-session / login: still fast-reveal so the auth shell is not stuck behind
 * a long opaque gate.
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
  /** Fast reveal for auth / progressive shells without a session (ms). */
  fastRevealMs?: number;
}): { showBootGate: Ref<boolean> } {
  const {
    hasSession,
    warmPainted: _warmPainted,
    initialLoadSettled,
    timeoutMs,
    fastRevealMs = 800,
  } = deps;
  void _warmPainted;

  const showBootGate = ref(true);

  const reveal = () => {
    showBootGate.value = false;
  };

  // Authenticated boots wait for settle; only auth/login uses fast reveal.
  // warmPainted still waits for settle so empty-cache lies do not flash.
  const useFastReveal = !hasSession;
  const fastRevealTimer = useFastReveal
    ? setTimeout(reveal, fastRevealMs)
    : null;

  const safetyTimer = setTimeout(reveal, timeoutMs);

  const stop = watch(
    initialLoadSettled,
    (settled) => {
      if (settled) {
        reveal();
        if (fastRevealTimer) clearTimeout(fastRevealTimer);
        clearTimeout(safetyTimer);
      }
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    stop();
    if (fastRevealTimer) clearTimeout(fastRevealTimer);
    clearTimeout(safetyTimer);
  });

  return { showBootGate };
}
