/**
 * Extract invite token from pasted text: full URL (including `/api/v1/echo/invites/…/share`),
 * `/invite/CODE` path, or raw vanity / hex code.
 */
function decodeInvitePathSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function extractInviteTokenFromUserInput(input: string): string {
  const t = input.trim();
  if (!t) return '';
  try {
    if (/^https?:\/\//i.test(t)) {
      const u = new URL(t);
      const share = u.pathname.match(
        /^\/api\/v1\/echo\/invites\/([^/]+)\/share\/?$/i,
      );
      if (share?.[1]) return decodeInvitePathSegment(share[1]);
      const parts = u.pathname.split('/').filter(Boolean);
      const invIdx = parts.indexOf('invite');
      if (invIdx >= 0 && parts[invIdx + 1]) {
        return decodeInvitePathSegment(parts[invIdx + 1]!);
      }
      return decodeInvitePathSegment(parts[parts.length - 1] ?? '');
    }
  } catch {
    /* not a URL */
  }
  return t.replace(/^\/+/, '');
}

/** Parse `voice=<channelId>` from invite share URLs or SPA paths. */
export function extractVoiceChannelIdFromInviteUserInput(
  input: string,
): string | null {
  const t = input.trim();
  if (!t) return null;
  try {
    if (/^https?:\/\//i.test(t)) {
      const u = new URL(t);
      const v = u.searchParams.get('voice')?.trim();
      return v || null;
    }
  } catch {
    /* not a URL */
  }
  try {
    const q = t.includes('?') ? t.slice(t.indexOf('?')) : '';
    if (!q) return null;
    const v = new URLSearchParams(q.replace(/^\?/, '')).get('voice')?.trim();
    return v || null;
  } catch {
    return null;
  }
}
