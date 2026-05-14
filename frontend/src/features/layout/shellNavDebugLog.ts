/**
 * Shell navigation trace hook (DM → #general, etc.).
 * Previously logged to console when enabled; kept as no-ops for stable call sites.
 */
const LS_KEY = 'echo_shell_nav_debug';

export function shellNavDebugEnabled(): boolean {
  try {
    return (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(LS_KEY) === '1'
    );
  } catch {
    return false;
  }
}

export function logShellNav(
  source: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!shellNavDebugEnabled()) return;
  try {
    // eslint-disable-next-line no-console
    console.log('[echo][shellnav]', { source, message, data });
  } catch {
    // ignore
  }
}

/** First few stack frames (caller), not the Error message. */
export function logShellNavWithStack(
  source: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!shellNavDebugEnabled()) return;
  try {
    const raw = new Error().stack ?? '';
    const lines = raw
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    // eslint-disable-next-line no-console
    console.log('[echo][shellnav]', {
      source,
      message,
      data,
      stack: lines.slice(1, 6),
    });
  } catch {
    // ignore
  }
}
