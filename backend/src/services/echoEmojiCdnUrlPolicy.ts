import { ECHO_PUBLIC_EMOJI_CDN_PATH_PREFIX } from '../../../shared/echoEmojiCdn';
import { ECHO_PUBLIC_EMOJI_OBJECT_KEY_PREFIX } from '../../../shared/echoEmojiCdn';
import { config } from '../config';

function collectAllowedHosts(): string[] {
  const out: string[] = [];
  for (const raw of [
    config.echoEmojiPublicBaseUrl,
    config.echoApiPublicUrl,
    config.echoEmojiCdnBaseUrl,
    config.s3UploadPublicBaseUrl,
    ...config.echoMediaUrlAllowedHosts,
  ]) {
    const t = raw?.trim();
    if (!t) continue;
    try {
      const host = new URL(
        t.startsWith('http') ? t : `https://${t.replace(/^\/+/, '')}`,
      ).hostname;
      if (host) out.push(host.toLowerCase());
    } catch {
      /* ignore malformed env */
    }
  }
  return out;
}

function hostMatchesAllowlist(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h) return false;
  for (const allowed of collectAllowedHosts()) {
    if (h === allowed || h.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

function pathnameIsPublicEmojiAsset(pathname: string): boolean {
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (p.startsWith(ECHO_PUBLIC_EMOJI_CDN_PATH_PREFIX)) return true;
  const bare = p.replace(/^\/+/, '');
  return bare.startsWith(ECHO_PUBLIC_EMOJI_OBJECT_KEY_PREFIX);
}

/**
 * Whether a resolved or stored `public_cdn_url` may be returned to clients or used for redirects.
 */
export function isAllowedPublicEmojiCdnUrl(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  if (t.startsWith(ECHO_PUBLIC_EMOJI_CDN_PATH_PREFIX)) return true;

  let parsed: URL;
  try {
    parsed = new URL(t);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (!hostMatchesAllowlist(parsed.hostname)) return false;
  return pathnameIsPublicEmojiAsset(parsed.pathname);
}

export function sanitizePublicCdnUrlForClient(
  url: string | null | undefined,
): string | null {
  const t = url?.trim();
  if (!t || !isAllowedPublicEmojiCdnUrl(t)) return null;
  return t;
}
