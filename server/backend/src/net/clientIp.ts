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

function forwardedForClientIp(
  headers: Record<string, string | string[] | undefined> | undefined,
  trustedProxyHops: number,
): string | null {
  const xf = headerOne(headers, 'x-forwarded-for');
  if (!xf) return null;
  const parts = xf
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const candidate = parts[Math.max(0, parts.length - trustedProxyHops)] ?? null;
  if (!candidate || !isPlausibleIp(candidate)) return null;
  return candidate;
}

/**
 * Resolve the trusted client IP from proxy headers and a socket / Fastify fallback.
 * Socket callers lack Fastify's parsed `req.ip`, so apply the configured proxy
 * hop count to X-Forwarded-For. Provider-specific headers are never trusted here.
 */
export function resolveTrustedClientIp(
  headers: Record<string, string | string[] | undefined> | undefined,
  fallbackIp: string | null | undefined,
  trustProxy = config.trustProxy,
  trustedProxyHops = config.trustProxyHops,
): string {
  if (trustProxy) {
    const forwarded = forwardedForClientIp(headers, trustedProxyHops);
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
  return isPlausibleIp(req.ip) ? req.ip : 'unknown';
}

export function clientIpFromSocketHandshake(
  headers: Record<string, string | string[] | undefined> | undefined,
  fallbackAddress: string | undefined,
  trustProxy = config.trustProxy,
  trustedProxyHops = config.trustProxyHops,
): string {
  return resolveTrustedClientIp(
    headers,
    fallbackAddress,
    trustProxy,
    trustedProxyHops,
  );
}

export function clientIpFromSocket(socket: {
  handshake: { headers: unknown; address: string | undefined };
}): string {
  return clientIpFromSocketHandshake(
    socket.handshake.headers as Record<string, string | string[] | undefined>,
    socket.handshake.address,
    config.trustProxy,
  );
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
