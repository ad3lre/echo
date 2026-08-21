/** Set when the user has completed full registration or login (not guest-only). */
export const PRIOR_REGISTERED_KEY = 'echo_prior_registered_v1';

export function markPriorRegistered(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PRIOR_REGISTERED_KEY, '1');
  } catch {
    /* quota / private mode */
  }
}

export function hasPriorRegistration(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(PRIOR_REGISTERED_KEY) === '1';
  } catch {
    return false;
  }
}
