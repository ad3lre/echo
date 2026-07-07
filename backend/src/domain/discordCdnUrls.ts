/**
 * Discord CDN / media-proxy helpers for imported payloads (API uses snake_case;
 * discord.js models use camelCase for the same fields).
 */

import { ssrfSafeFetch } from '../services/linkUnfurl/linkUnfurlFetch';

const URL_KEYS_DEFAULT = ['url', 'proxy_url', 'proxyURL'] as const;

/** Discord-controlled CDN zones (incl. `images-ext-*.discordapp.net` embed proxies). */
export function isDiscordImportMediaHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h) return false;
  return h.endsWith('.discordapp.com') || h.endsWith('.discordapp.net');
}

function normalizeDiscordCdnSearch(search: string): string {
  if (!search || search === '?') return '';
  let normalized = search;
  while (normalized.endsWith('&')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Prefer the canonical CDN `url`, then Discord's `proxy_url` / `proxyURL` so imports
 * still work when only the media proxy is present. When `url` is a third-party link,
 * prefer Discord's proxied CDN URL so mirroring and refresh stay on Discord hosts.
 */
export function pickDiscordUrlOrProxy(
  o: Record<string, unknown>,
  keys: readonly string[] = URL_KEYS_DEFAULT,
): string {
  let fallback = '';
  for (const k of keys) {
    const v = o[k];
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (!t) continue;
    if (isDiscordHostedImportMediaUrl(t)) return t;
    if (!fallback) fallback = t;
  }
  return fallback;
}

/** Embed footer / author icons: `icon_url` or `proxy_icon_url`. */
export function pickDiscordIconUrl(o: Record<string, unknown>): string {
  return pickDiscordUrlOrProxy(o, ['icon_url', 'proxy_icon_url']);
}

/**
 * Canonical HTTPS URL rebuilt from allowlisted Discord CDN hosts + path.
 * Returns null for non-HTTP(S), credentialed, or unknown hosts (never pass raw input to fetch).
 */
export function canonicalDiscordHostedImportMediaUrl(
  raw: string,
): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (!isDiscordImportMediaHostname(h)) return null;
  const search = normalizeDiscordCdnSearch(u.search);
  return new URL(`${u.pathname}${search}`, `https://${h}`).href;
}

/** True when `url` is a Discord attachment/media host we may fetch during import mirroring. */
export function isDiscordHostedImportMediaUrl(raw: string): boolean {
  return canonicalDiscordHostedImportMediaUrl(raw) !== null;
}

/** SSRF-safe fetch for Discord CDN import mirroring (host allowlist + DNS pinning). */
export async function fetchDiscordHostedImportMedia(
  raw: string,
  init: RequestInit & { maxBytes?: number } = {},
): Promise<Response | null> {
  const url = canonicalDiscordHostedImportMediaUrl(raw);
  if (!url) return null;
  try {
    // Host allowlist + DNS validation via ssrfSafeFetch; plain fetch (no pinned TLS agent)
    // because Discord's CDN edge often hangs on the pinned agent path.
    return await ssrfSafeFetch(url, {
      redirect: 'follow',
      ...init,
    });
  } catch {
    return null;
  }
}

/**
 * Path-only key for matching the same Discord asset across URL signature rotations
 * (`ex` / `is` / `hm` query params). Host is ignored so `cdn.discordapp.com` and
 * `media.discordapp.net` proxy URLs for one attachment still match.
 */
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
