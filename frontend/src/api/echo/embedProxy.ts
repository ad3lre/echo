/**
 * Embed proxy API: token mint and meta discovery.
 */

import { API_BASE } from '@/config';
import { echoCsrfJsonHeaders } from '@/utils/echoCsrf';

const EMBED_BASE = `${API_BASE.replace(/\/$/, '')}/api/v1/embed`;

export type EmbedProxyMeta = {
  enabled: boolean;
  slugs: string[];
};

export type EmbedProxyTokenResponse = {
  token: string;
};

/** Returns proxy feature availability without requiring authentication. */
export async function fetchEmbedProxyMeta(): Promise<EmbedProxyMeta> {
  const res = await fetch(`${EMBED_BASE}/meta`, { credentials: 'include' });
  if (!res.ok) return { enabled: false, slugs: [] };
  return res.json() as Promise<EmbedProxyMeta>;
}

/**
 * Mints a short-lived embed access token for the given slug.
 * The SPA must be authenticated; the token is appended to the iframe src URL
 * as `?_eproxy_t=<token>`.
 *
 * Returns null when the proxy is disabled or the request fails.
 */
export async function mintEmbedProxyToken(
  slug: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${EMBED_BASE}/token`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...echoCsrfJsonHeaders(),
      },
      body: JSON.stringify({ slug }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as EmbedProxyTokenResponse;
    return data.token ?? null;
  } catch {
    return null;
  }
}

/**
 * Builds a proxy entry URL for the given slug, origin alias, path, and token.
 *   /api/v1/embed/:slug/o/:alias:path?_eproxy_t=:token
 */
export function buildEmbedProxyUrl(
  slug: string,
  originAlias: string,
  path: string,
  token: string,
): string {
  const base = `${API_BASE.replace(/\/$/, '')}/api/v1/embed`;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}/${slug}/o/${originAlias}${normalizedPath}?_eproxy_t=${encodeURIComponent(token)}`;
}
