import type { FastifyRequest } from 'fastify';
import { clipUserAgent } from './clipUserAgent';
import { clientIpFromFastifyRequest } from '../net/clientIp';

export type RefreshTokenClientContext = {
  userAgent: string | null;
  /** Human-readable approximate location when edge headers are present. */
  location: string | null;
};

function headerOne(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string {
  const raw = headers?.[name];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' ? v.trim() : '';
}

function clipLocation(raw: string, maxLen = 120): string | null {
  const t = raw.trim();
  if (!t) return null;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

/**
 * Best-effort location label from common reverse-proxy / CDN headers (no GeoIP DB).
 */
export function sessionLocationFromRequest(req: FastifyRequest): string | null {
  const h = req.headers;
  const city =
    headerOne(h, 'cf-ipcity') ||
    headerOne(h, 'x-vercel-ip-city') ||
    headerOne(h, 'x-appengine-city');
  const region =
    headerOne(h, 'cf-region') ||
    headerOne(h, 'cf-region-code') ||
    headerOne(h, 'x-vercel-ip-country-region');
  const country =
    headerOne(h, 'cf-ipcountry') ||
    headerOne(h, 'x-vercel-ip-country') ||
    headerOne(h, 'x-appengine-country');

  const parts: string[] = [];
  if (city) parts.push(city);
  if (region && region.toLowerCase() !== city.toLowerCase()) parts.push(region);
  if (country) {
    const c = country.length === 2 ? country.toUpperCase() : country;
    if (!parts.some((p) => p.toUpperCase() === c)) parts.push(c);
  }
  if (parts.length > 0) return clipLocation(parts.join(', '));

  const ip = clientIpFromFastifyRequest(req);
  if (
    ip &&
    ip !== 'unknown' &&
    !ip.startsWith('127.') &&
    !ip.startsWith('::1') &&
    ip !== '::ffff:127.0.0.1'
  ) {
    return null;
  }
  return null;
}

export function sessionClientContextFromRequest(
  req: FastifyRequest | undefined,
): RefreshTokenClientContext {
  if (!req) {
    return { userAgent: null, location: null };
  }
  return {
    userAgent: clipUserAgent(req.headers['user-agent']),
    location: sessionLocationFromRequest(req),
  };
}
