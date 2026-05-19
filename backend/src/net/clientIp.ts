import type { FastifyRequest } from 'fastify';
import { isIPv4, isIPv6 } from 'node:net';

export function clientIpFromFastifyRequest(req: FastifyRequest): string {
  return typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : 'unknown';
}

function firstForwardedForIp(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | null {
  const xf = headers?.['x-forwarded-for'];
  const xfStr = Array.isArray(xf) ? xf[0] : xf;
  if (typeof xfStr !== 'string' || xfStr.length === 0) return null;
  const first = xfStr.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

export function clientIpFromSocketHandshake(
  headers: Record<string, string | string[] | undefined> | undefined,
  fallbackAddress: string | undefined,
  trustProxy = false,
): string {
  if (trustProxy) {
    const forwarded = firstForwardedForIp(headers);
    if (forwarded) return forwarded;
  }
  return typeof fallbackAddress === 'string' && fallbackAddress.length > 0
    ? fallbackAddress
    : 'unknown';
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
