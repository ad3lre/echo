import { onScopeDispose, ref, watch, type Ref } from 'vue';

/**
 * Boot gate for the first app paint.
 *
 * Decides whether `App.vue` holds a full-screen splash over the shell while the
 * workspace performs its initial hydrate. Only a no-session cold start is gated:
 * a returning user with a session (or already warm-painted content from cache)
 * renders the shell immediately — empty surfaces show live skeletons via the
 * workspace `loading` flags rather than a blank splash.
 *
 * The gate clears the first time the workspace load settles
 * ({@link WorkspaceStateApi.initialLoadSettled}); `timeoutMs` is a defensive
 * force-reveal in case that latch never flips.
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
}): { showBootGate: Ref<boolean> } {
  const { hasSession, warmPainted, initialLoadSettled, timeoutMs } = deps;

  const showBootGate = ref(
    !hasSession && !warmPainted && !initialLoadSettled.value,
  );

  // Only a gated cold start needs to watch for readiness / arm the timeout; for
  // session, warm-paint, or already-settled boots there is nothing to wait on.
  if (showBootGate.value) {
    const reveal = () => {
      showBootGate.value = false;
    };

    const stop = watch(initialLoadSettled, (settled) => {
      if (settled) reveal();
    });
    const timer = setTimeout(reveal, timeoutMs);

    onScopeDispose(() => {
      stop();
      clearTimeout(timer);
    });
  }

  return { showBootGate };
}
