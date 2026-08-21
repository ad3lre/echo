/** Persisted when a guest completes or skips the welcome layout modal (per browser). */
export const ECHO_GUEST_WELCOME_LAYOUT_STORAGE_KEY =
  'echo_guest_welcome_layout_v1';

export function isGuestWelcomeLayoutDismissedForUser(userId: string): boolean {
  const id = userId.trim();
  if (!id || typeof window === 'undefined') return true;
  try {
    return (
      window.localStorage.getItem(ECHO_GUEST_WELCOME_LAYOUT_STORAGE_KEY) === id
    );
  } catch {
    return false;
  }
}
