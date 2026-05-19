/**
 * Declarative registry of allowed same-origin embed proxy targets.
 *
 * Each entry maps a slug (used in the route path) to a set of HTTPS origins.
 * Origins are identified by an alias used in the URL: /api/v1/embed/:slug/o/:alias/...
 *
 * Only slugs registered here (and allowed by the runtime config gate) can be proxied.
 */

export interface EmbedProxyOrigin {
  /** Short alias used in proxy paths: o/main, o/cdn2, … */
  readonly alias: string;
  /** Full HTTPS origin (no trailing slash) e.g. "https://codenames.game". */
  readonly httpsOrigin: string;
}

export interface EmbedProxyTarget {
  readonly slug: string;
  /** Origins in resolution order: first entry is treated as the "primary" site origin. */
  readonly origins: readonly EmbedProxyOrigin[];
  /** Max bytes buffered when rewriting text/html or text/css responses. Default 4 MiB. */
  readonly maxRewriteBytes: number;
  /** Request headers to strip before forwarding to the upstream (lowercased). */
  readonly blockedUpstreamHeaders: readonly string[];
}

const EMBED_PROXY_CATALOG: readonly EmbedProxyTarget[] = [
  {
    slug: 'codenames',
    origins: [
      { alias: 'main', httpsOrigin: 'https://codenames.game' },
      { alias: 'www', httpsOrigin: 'https://www.codenames.game' },
      { alias: 'cdn2', httpsOrigin: 'https://cdn2.codenames.game' },
    ],
    maxRewriteBytes: 4 * 1024 * 1024,
    blockedUpstreamHeaders: ['cookie', 'authorization'],
  },
];

const catalogBySlug = new Map<string, EmbedProxyTarget>();
for (const entry of EMBED_PROXY_CATALOG) {
  catalogBySlug.set(entry.slug, entry);
}

export function getEmbedProxyTarget(slug: string): EmbedProxyTarget | null {
  return catalogBySlug.get(slug) ?? null;
}

export function getEmbedProxyOriginForAlias(
  target: EmbedProxyTarget,
  alias: string,
): EmbedProxyOrigin | null {
  return target.origins.find((o) => o.alias === alias) ?? null;
}

export function getEmbedProxyAliasForOrigin(
  target: EmbedProxyTarget,
  httpsOrigin: string,
): string | null {
  const entry = target.origins.find((o) => o.httpsOrigin === httpsOrigin);
  return entry?.alias ?? null;
}

export const EMBED_PROXY_ALL_SLUGS: readonly string[] = Object.freeze(
  EMBED_PROXY_CATALOG.map((t) => t.slug),
);
