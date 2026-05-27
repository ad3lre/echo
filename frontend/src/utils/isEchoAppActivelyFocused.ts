/** True when Echo is the window the user is actively using (not another app / hidden tab). */
export function isEchoAppActivelyFocused(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.visibilityState !== 'visible') return false;
  if (typeof document.hasFocus === 'function' && !document.hasFocus())
    return false;
  return true;
}
