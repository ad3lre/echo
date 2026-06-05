/**
 * Discord CDN / media-proxy helpers for imported payloads (API uses snake_case;
 * discord.js models use camelCase for the same fields).
 */

import { ssrfSafeFetch } from '../services/linkUnfurl/linkUnfurlFetch';
import { safeFetchAgent } from '../services/linkUnfurl/safeFetchAgent';

const URL_KEYS_DEFAULT = ['url', 'proxy_url', 'proxyURL'] as const;

const DISCORD_IMPORT_MEDIA_HOSTS = new Set([
  'cdn.discordapp.com',
  'media.discordapp.net',
]);

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
  if (!DISCORD_IMPORT_MEDIA_HOSTS.has(h)) return null;
  return new URL(`${u.pathname}${u.search}`, `https://${h}`).href;
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
    return await ssrfSafeFetch(url, {
      ...init,
      redirect: 'error',
      // @ts-expect-error Node 18+ undici dispatcher
      dispatcher: safeFetchAgent,
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
