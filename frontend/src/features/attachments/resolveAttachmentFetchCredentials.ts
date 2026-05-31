/**
 * Whether attachment bytes should be fetched with cookies (same-origin `/api/*` URLs).
 */
export function attachmentUrlNeedsCredentials(url: string): boolean {
  if (typeof window === 'undefined') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return false;
  }
  try {
    const resolved = new URL(trimmed, window.location.href);
    if (resolved.origin !== window.location.origin) return false;
    const p = resolved.pathname;
    return (
      p.startsWith('/api/') || p === '/socket.io' || p.startsWith('/socket.io/')
    );
  } catch {
    return false;
  }
}
