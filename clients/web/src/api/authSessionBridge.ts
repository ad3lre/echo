/**
 * Decouples `authClient` from `@/features/auth/authSession` to avoid a circular module graph.
 * Registered once from `main.ts` after Pinia is installed (before any auth HTTP).
 */
type AuthSessionApiBridge = {
  invalidateSessionForReauth: (message: string) => void;
  clearLocalTokens: () => void;
  /** Rotation counter from the auth store (see client auth invariants doc). */
  getAuthStateGeneration?: () => number;
  /** Suppress 401 teardown briefly after login while cookies settle. */
  shouldDeferSession401Invalidate?: () => boolean;
};

let bridge: AuthSessionApiBridge | null = null;

export function registerAuthSessionApiBridge(next: AuthSessionApiBridge): void {
  bridge = next;
}

export function notifyInvalidateSessionForReauth(message: string): void {
  bridge?.invalidateSessionForReauth(message);
}

/** Probe-only `/auth/me` 401 path: clear client tokens without full session teardown. */
export function notifyAuthClearLocalTokensProbe(): void {
  bridge?.clearLocalTokens();
}

/** Capture before issuing a request whose final 401 may invalidate the session. */
export function captureAuthStateGeneration(): number {
  return bridge?.getAuthStateGeneration?.() ?? 0;
}

/**
 * Shared final-401 handler (post refresh-retry): invalidate the session only
 * when the auth generation has not rotated since the request started. A
 * changed generation means the 401 belongs to a previous session (register /
 * login / guest upgrade landed mid-flight) and must not tear down the new one.
 *
 * Returns true when the session was invalidated, false when the 401 was stale.
 */
export function finalizeAuthSession401(opts: {
  authGenAtStart: number;
  message: string;
}): boolean {
  if (captureAuthStateGeneration() !== opts.authGenAtStart) return false;
  if (bridge?.shouldDeferSession401Invalidate?.()) return false;
  bridge?.invalidateSessionForReauth(opts.message);
  return true;
}
