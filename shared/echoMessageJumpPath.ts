/**
 * In-app message jump URLs: `{origin}/channels/:channelId/:messageId`.
 * Path shape matches guild channel URLs; callers must validate via API when ambiguous.
 */

export function parseEchoMessageJumpPath(
  urlString: string,
): { channelId: string; messageId: string } | null {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!isEchoMessageJumpPathname(u.pathname)) return null;
  const m = u.pathname.match(/^\/channels\/([^/]+)\/([^/?#]+)\/?$/);
  if (!m) return null;
  const channelId = m[1];
  const messageId = m[2];
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
