import type { FastifyRequest } from 'fastify';
import { isIPv4, isIPv6 } from 'node:net';
import { config } from '../config';

function headerOne(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | null {
  const raw = headers?.[name];
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** Returns true when the string looks like a usable IP for rate limits and audits. */
function isPlausibleIp(raw: string): boolean {
  const t = raw.trim();
  if (!t || t === 'unknown') return false;
  if (isIPv4(t)) return true;
  if (isIPv6(t)) return true;
  if (t.startsWith('[') && t.endsWith(']')) {
    return isIPv6(t.slice(1, -1));
  }
  return false;
}

/**
 * Cloudflare sets `CF-Connecting-IP` to the client address; it cannot be spoofed through
 * Cloudflare when the origin accepts traffic only from Cloudflare. Prefer this over
 * leftmost `X-Forwarded-For`, which attackers can prepend when proxy trust is misconfigured.
 */
function cloudflareConnectingIp(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | null {
  const raw = headerOne(headers, 'cf-connecting-ip');
  if (!raw || !isPlausibleIp(raw)) return null;
  return raw;
}

function rightmostForwardedForIp(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | null {
  const xf = headerOne(headers, 'x-forwarded-for');
  if (!xf) return null;
  const parts = xf
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const candidate = parts[parts.length - 1] ?? null;
  if (!candidate || !isPlausibleIp(candidate)) return null;
  return candidate;
}

/**
 * Resolve the trusted client IP from proxy headers and a socket / Fastify fallback.
 * When `trustProxy` is enabled, prefers `CF-Connecting-IP`, then the rightmost
 * `X-Forwarded-For` hop (the address appended by the nearest trusted proxy).
 */
export function resolveTrustedClientIp(
  headers: Record<string, string | string[] | undefined> | undefined,
  fallbackIp: string | null | undefined,
  trustProxy = config.trustProxy,
): string {
  if (trustProxy) {
    const cf = cloudflareConnectingIp(headers);
    if (cf) return cf;
    const forwarded = rightmostForwardedForIp(headers);
    if (forwarded) return forwarded;
  }
  if (
    typeof fallbackIp === 'string' &&
    fallbackIp.length > 0 &&
    isPlausibleIp(fallbackIp)
  ) {
    return fallbackIp;
  }
  return 'unknown';
}

export function clientIpFromFastifyRequest(req: FastifyRequest): string {
  return resolveTrustedClientIp(req.headers, req.ip, config.trustProxy);
}

export function clientIpFromSocketHandshake(
  headers: Record<string, string | string[] | undefined> | undefined,
  fallbackAddress: string | undefined,
  trustProxy = config.trustProxy,
): string {
  return resolveTrustedClientIp(headers, fallbackAddress, trustProxy);
}

/** Returns a normalized IP string safe for `::inet` inserts, or null when not suitable for bans. */
export function parseClientIpForBan(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t || t === 'unknown') return null;
  if (t.includes('%')) return null;
  if (isIPv4(t)) return t;
  if (isIPv6(t)) return t;
  if (t.startsWith('[') && t.endsWith(']')) {
    const inner = t.slice(1, -1);
    if (isIPv6(inner)) return inner;
  }
  return null;
}
