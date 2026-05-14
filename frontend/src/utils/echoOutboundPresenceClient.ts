/**
 * What to report to the server for `active_client` on this device.
 * Coarse pointer + no hover ≈ phone / tablet in most browsers (matches “on your phone” UX).
 */
export function echoOutboundPresenceActiveClient(): 'web' | 'mobile' {
  if (typeof window === 'undefined') return 'web';
  try {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const noHover = window.matchMedia('(hover: none)').matches;
    return coarse && noHover ? 'mobile' : 'web';
  } catch {
    return 'web';
  }
}
