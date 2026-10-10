import { isAllowedJumpUrl } from './echoMessageJumpOrigin';
/** In-app message jump URLs; API authorization resolves ambiguous channel routes. */

export function parseEchoMessageJumpPath(
  urlString: string,
  origins?: readonly string[],
): { channelId: string; messageId: string } | null {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return null;
  }
  if (!isAllowedJumpUrl(u, origins)) return null;
  if (!isEchoMessageJumpPathname(u.pathname)) return null;
  const m = u.pathname.match(/^\/channels\/([^/]+)\/([^/?#]+)\/?$/);
  if (!m) return null;
  const [, channelId, messageId] = m;
  if (!channelId?.trim() || !messageId?.trim()) return null;
  return { channelId, messageId };
}

/** DM home / friends / thread routes are not message jumps. */
export function isEchoMessageJumpPathname(pathname: string): boolean {
  const m = pathname.match(/^\/channels\/([^/]+)\/([^/?#]+)\/?$/);
  if (!m) return false;
  const first = m[1]!.toLowerCase();
  if (first === '@me') return false;
  const second = m[2]!.toLowerCase();
  if (
    second === 'friends' ||
    second === 'notifications' ||
    second === 'requests'
  ) {
    return false;
  }
  return true;
}
