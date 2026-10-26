/**
 * Shared bounded fetch helpers for link unfurl / oEmbed (no business logic).
 */

import { lookup } from 'dns/promises';
import { isPrivateOrLocalIpLiteral } from './ipLiteralPolicy';
import { pinnedHttpFetch } from './pinnedHttpFetch';
import { readBoundedResponseBody } from './readBoundedResponseBody';

const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 4;

export { isPrivateOrLocalIpLiteral };

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

export type SsrfFetchOptions = {
  /** Test seam: DNS resolver. */
  resolve?: (
    hostname: string,
  ) => Promise<{ address: string; family?: number }[]>;
  /** Test seam: address policy (default: public addresses only). */
  isAddressAllowed?: (address: string) => boolean;
  /** Test seam: permit plain http. */
  allowHttp?: boolean;
};

/**
 * Validate each URL and pin the connection to a validated public IP;
 * callers handle redirects (never followed here).
 */
export async function ssrfSafeFetch(
  url: string,
  init: Omit<RequestInit, 'dispatcher'> & { dispatcher?: unknown },
  opts: SsrfFetchOptions = {},
): Promise<Response> {
  const fail = () => new Error('SSRF: URL failed safety validation');
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw fail();
  }
  if (opts.allowHttp && target.protocol === 'http:') {
    if (target.username || target.password) throw fail();
  } else if (!isUrlSafeForOutboundFetch(url)) {
    throw fail();
  }
  const allowed =
    opts.isAddressAllowed ?? ((a: string) => !isPrivateOrLocalIpLiteral(a));
  const resolve =
    opts.resolve ??
    ((host: string) => lookup(host, { all: true, verbatim: true }));
  let addresses: { address: string; family?: number }[];
  try {
    addresses = await resolve(target.hostname);
  } catch {
    throw fail();
  }
  if (!addresses.length || !addresses.every((a) => allowed(a.address))) {
    throw fail();
  }
  // Connect to the validated IP (Bun ignores the undici dispatcher option).
  const { dispatcher: _ignored, ...rest } = init;
  void _ignored;
  return pinnedHttpFetch(
    target,
    { ...rest, redirect: 'manual' },
    addresses[0]!,
  );
}

function buildJsonFetchInit(): RequestInit {
  return {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'EchoLinkEmbed/1.0 (+https://echo.local)',
    },
  };
}

export async function fetchJsonWithTimeout(
  url: string,
  ssrfOpts: SsrfFetchOptions = {},
): Promise<Record<string, unknown> | null> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await ssrfSafeFetch(current, buildJsonFetchInit(), ssrfOpts);
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel();
      const loc = res.headers.get('location');
      if (!loc) return null;
      try {
        current = new URL(loc, current).href;
      } catch {
        return null;
      }
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    try {
      const body = await readBoundedResponseBody(res, 512 * 1024);
      const data: unknown = JSON.parse(body.toString('utf8'));
      return data != null && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}
