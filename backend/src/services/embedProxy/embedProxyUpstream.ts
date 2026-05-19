/**
 * SSRF-safe URL construction and proxy-path mapping for the embed proxy.
 *
 * Upstream URLs are only built from allowlisted catalog origins;
 * directory traversal and non-HTTPS are rejected.
 */

import type { EmbedProxyTarget } from './embedProxyCatalog';
import { getEmbedProxyOriginForAlias } from './embedProxyCatalog';

/**
 * Builds the upstream URL from a catalog entry + origin alias + path remainder.
 * Returns null if the alias is unknown or the path is unsafe.
 */
export function buildUpstreamUrl(
  target: EmbedProxyTarget,
  originAlias: string,
  /** Path + optional query string from the proxy request (must start with /). */
  pathAndQuery: string,
): string | null {
  const origin = getEmbedProxyOriginForAlias(target, originAlias);
  if (!origin) return null;

  const safePath = sanitizeProxyPath(pathAndQuery);
  if (safePath === null) return null;

  return `${origin.httpsOrigin}${safePath}`;
}

/**
 * Rejects traversal sequences and ensures path starts with /.
 * Returns null if the path is considered unsafe.
 */
export function sanitizeProxyPath(raw: string): string | null {
  if (!raw || !raw.startsWith('/')) return null;

  // Decode once to catch double-encoded traversals (%2F, %2e%2e, etc.)
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  if (decoded.includes('..') || decoded.includes('\0')) return null;

  return raw; // Return original (percent-encoded) form for upstream
}

/**
 * Given a full upstream absolute URL, return the Echo proxy path for it
 * (e.g. /api/v1/embed/codenames/o/cdn2/path?q=1), or null if the URL
 * does not belong to any of this target's catalog origins.
 */
export function upstreamUrlToProxyPath(
  slug: string,
  target: EmbedProxyTarget,
  upstreamUrl: string,
): string | null {
  for (const origin of target.origins) {
    if (upstreamUrl.startsWith(`${origin.httpsOrigin}/`)) {
      const remainder = upstreamUrl.slice(origin.httpsOrigin.length);
      return `/api/v1/embed/${slug}/o/${origin.alias}${remainder}`;
    }
    // Exact match (no trailing slash — i.e. request to origin root)
    if (upstreamUrl === origin.httpsOrigin) {
      return `/api/v1/embed/${slug}/o/${origin.alias}/`;
    }
  }
  return null;
}
