/**
 * Decouples `authClient` from `@/stores/authSession` to avoid a circular module graph.
 * Registered once from `main.ts` after Pinia is installed (before any auth HTTP).
 */
type AuthSessionApiBridge = {
  invalidateSessionForReauth: (message: string) => void;
  clearLocalTokens: () => void;
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
