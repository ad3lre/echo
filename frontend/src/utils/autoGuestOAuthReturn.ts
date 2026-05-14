/**
 * One-shot guard: after OAuth redirect (`?discord_login=1` / `?google_login=1`), if session
 * cookies fail to apply before the first `/auth/me`, `startInitialLoad` would otherwise
 * auto-mint a guest — hiding the failed login. We skip auto-guest for that load when
 * `main.ts` sets this flag before awaiting `restoreSessionFromApi()`.
 */
const KEY = 'echo_skip_auto_guest_oauth_return_v1';

export function setSkipAutoGuestOnce(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    /* */
  }
}

export function clearSkipAutoGuestOnce(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* */
  }
}

/** @returns true once, then clears the flag (call from `startInitialLoad` only). */
export function consumeSkipAutoGuestOnce(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    if (sessionStorage.getItem(KEY) !== '1') return false;
    sessionStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
