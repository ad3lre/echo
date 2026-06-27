/**
 * Shared bounded fetch helpers for link unfurl / oEmbed (no business logic).
 */

import { lookup } from 'dns/promises';
import { safeFetchAgent } from './safeFetchAgent';

const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 4;

function parseIpv4Octets(ipv4: string): number[] | null {
  const parts = ipv4.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return NaN;
    return Number(part);
  });
  if (
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return null;
  }
  return octets;
}

function isPrivateOrLocalIpv4Octets(octets: number[]): boolean {
  const [a, b, c, d] = octets;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && b >= 18 && b <= 19) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 ||
    (a === 255 && b === 255 && c === 255 && d === 255)
  );
}

function parseIpv6Segments(raw: string): number[] | null {
  if (!raw) return [];
  const parts = raw.split(':');
  const out: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) return null;
    if (part.includes('.')) {
      if (i !== parts.length - 1) return null;
      const octets = parseIpv4Octets(part);
      if (!octets) return null;
      out.push((octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!);
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
    out.push(parseInt(part, 16));
  }
  return out;
}

function expandIpv6ToHextets(ipv6: string): number[] | null {
  const normalized = ipv6.split('%')[0]!.toLowerCase();
  if (!normalized) return null;
  const parts = normalized.split('::');
  if (parts.length > 2) return null;

  const left = parseIpv6Segments(parts[0] ?? '');
  const right = parseIpv6Segments(parts[1] ?? '');
  if (!left || !right) return null;

  if (parts.length === 1) {
    return left.length === 8 ? left : null;
  }

  const zerosNeeded = 8 - left.length - right.length;
  if (zerosNeeded < 1) return null;
  return [...left, ...new Array<number>(zerosNeeded).fill(0), ...right];
}

function ipv6HextetsAreZero(
  hextets: number[],
  from: number,
  to: number,
): boolean {
  for (let i = from; i < to; i++) {
    if (hextets[i] !== 0) return false;
  }
  return true;
}

function embeddedIpv4OctetsFromLowHextets(hextets: number[]): number[] {
  const hi = hextets[6]!;
  const lo = hextets[7]!;
  return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
}

/** IPv4-mapped, IPv4-compatible (::/96), and NAT64 (64:ff9b::/96) embedded forms. */
function embeddedIpv4OctetsFromIpv6(ipv6: string): number[] | null {
  const hextets = expandIpv6ToHextets(ipv6);
  if (!hextets) return null;
  if (
    ipv6HextetsAreZero(hextets, 0, 5) &&
    hextets[5] === 0xffff &&
    !ipv6HextetsAreZero(hextets, 6, 8)
  ) {
    return embeddedIpv4OctetsFromLowHextets(hextets);
  }
  if (
    hextets[0] === 0x64 &&
    hextets[1] === 0xff9b &&
    ipv6HextetsAreZero(hextets, 2, 6) &&
    !ipv6HextetsAreZero(hextets, 6, 8)
  ) {
    return embeddedIpv4OctetsFromLowHextets(hextets);
  }
  if (ipv6HextetsAreZero(hextets, 0, 6) && !ipv6HextetsAreZero(hextets, 6, 8)) {
    return embeddedIpv4OctetsFromLowHextets(hextets);
  }
  return null;
}

export function isPrivateOrLocalIpLiteral(hostnameOrIp: string): boolean {
  const h = hostnameOrIp.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) {
    return true;
  }
  const bracketedIpv6 =
    h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : null;
  const ipv6 = bracketedIpv6 ?? (h.includes(':') ? h : null);
  if (ipv6) {
    const normalized = ipv6.split('%')[0]!.toLowerCase();
    if (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('2001:db8') ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true;
    }
    const embeddedIpv4 = embeddedIpv4OctetsFromIpv6(normalized);
    if (embeddedIpv4) {
      return isPrivateOrLocalIpv4Octets(embeddedIpv4);
    }
  }
  const ipv4 = parseIpv4Octets(h);
  if (!ipv4) return false;
  return isPrivateOrLocalIpv4Octets(ipv4);
}

/** True for https public URLs suitable for outbound fetch (aligns with linkUnfurl SSRF checks). */
export function isUrlSafeForOutboundFetch(urlString: string): boolean {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (isPrivateOrLocalIpLiteral(u.hostname)) return false;
  if (u.username || u.password) return false;
  return true;
}

async function resolvesToOnlyPublicIps(hostname: string): Promise<boolean> {
  try {
    const results = await lookup(hostname, { all: true, verbatim: true });
    if (!results.length) return false;
    return results.every(
      (result) => !isPrivateOrLocalIpLiteral(result.address),
    );
  } catch {
    return false;
  }
}

export async function canSafelyResolveUrlForOutboundFetch(
  urlString: string,
): Promise<boolean> {
  if (!isUrlSafeForOutboundFetch(urlString)) return false;
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return false;
  }
  return resolvesToOnlyPublicIps(u.hostname);
}

/**
 * SSRF-safe fetch: single entry point for unfurl/oEmbed HTTP. Validates scheme,
 * hostname, and DNS (via `canSafelyResolveUrlForOutboundFetch`) before `fetch`.
 */
export async function ssrfSafeFetch(
  url: string,
  init: RequestInit & { dispatcher?: unknown },
): Promise<Response> {
  if (!(await canSafelyResolveUrlForOutboundFetch(url))) {
    throw new Error('SSRF: URL failed safety validation');
  }
  return fetch(url, init);
}

export async function fetchJsonWithTimeout(
  url: string,
): Promise<Record<string, unknown> | null> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await ssrfSafeFetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: ac.signal,
        dispatcher: safeFetchAgent,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'EchoLinkEmbed/1.0 (+https://echo.local)',
        },
      } as RequestInit & { dispatcher: typeof safeFetchAgent });
    } catch {
      clearTimeout(t);
      return null;
    } finally {
      clearTimeout(t);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return null;
      try {
        current = new URL(loc, current).href;
      } catch {
        return null;
      }
      continue;
    }
    if (!res.ok) return null;
    try {
      const data = (await res.json()) as unknown;
      return data != null && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}
