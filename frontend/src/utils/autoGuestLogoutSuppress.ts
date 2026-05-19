/**
 * After explicit sign-out, we must not auto-mint a guest on the next page load — that looks like
 * "still logged in". Pure guests never get `echo_prior_registered_v1`, so `startInitialLoad` would
 * otherwise always call `authContinueAsGuest()` again.
 */
const KEY = 'echo_suppress_auto_guest_after_logout_v1';

export function setSkipAutoGuestAfterLogout(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* quota / private mode */
  }
}

export function clearSkipAutoGuestAfterLogout(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* */
  }
}

export function shouldSkipAutoGuestAfterLogout(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
