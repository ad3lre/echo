/**
 * Discord CDN / media-proxy helpers for imported payloads (API uses snake_case;
 * discord.js models use camelCase for the same fields).
 */

const URL_KEYS_DEFAULT = ['url', 'proxy_url', 'proxyURL'] as const;

/**
 * Prefer the canonical CDN `url`, then Discord's `proxy_url` / `proxyURL` so imports
 * still work when only the media proxy is present.
 */
export function pickDiscordUrlOrProxy(
  o: Record<string, unknown>,
  keys: readonly string[] = URL_KEYS_DEFAULT,
): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** Embed footer / author icons: `icon_url` or `proxy_icon_url`. */
export function pickDiscordIconUrl(o: Record<string, unknown>): string {
  return pickDiscordUrlOrProxy(o, ['icon_url', 'proxy_icon_url']);
}

/**
 * True when `url` is a Discord attachment/media host we may fetch during import mirroring.
 * Only HTTP(S) and known Discord CDN hosts (not arbitrary links in embed `url`).
 */
export function isDiscordHostedImportMediaUrl(raw: string): boolean {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return false;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'cdn.discordapp.com' || h === 'media.discordapp.net';
  } catch {
    return false;
  }
}

/**
 * Path-only key for matching the same Discord asset across URL signature rotations
 * (`ex` / `is` / `hm` query params). Host is ignored so `cdn.discordapp.com` and
 * `media.discordapp.net` proxy URLs for one attachment still match.
 */
/** SSRF-safe fetch entry for Discord CDN import mirroring (host allowlist only). */
export async function fetchDiscordHostedImportMedia(
  raw: string,
  init: RequestInit & { maxBytes?: number } = {},
): Promise<Response | null> {
  if (!isDiscordHostedImportMediaUrl(raw)) return null;
  const url = raw.trim();
  return fetch(url, {
    ...init,
    redirect: 'error',
  });
}

export function discordCdnUrlStableKey(raw: string): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || !isDiscordHostedImportMediaUrl(s)) return null;
  try {
    const u = new URL(s);
    return u.pathname;
  } catch {
    return null;
  }
}
