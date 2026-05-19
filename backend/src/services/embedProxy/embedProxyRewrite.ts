/**
 * HTML and CSS URL rewriting for the embed proxy (v1 — static text only).
 *
 * Rewrites absolute and protocol-relative URLs that belong to a catalog
 * target's origins into Echo proxy paths:
 *   https://cdn2.codenames.game/static/foo.js
 *   → /api/v1/embed/codenames/o/cdn2/static/foo.js
 *
 * Scope: static document text (href, src, url(), @import, …).
 * Limitation: URLs built in JavaScript at runtime are NOT rewritten —
 * document this clearly in deploy notes.
 */

import type { EmbedProxyTarget } from './embedProxyCatalog';

/** Rewrite all catalog-origin URLs in an HTML or CSS body string. */
export function rewriteTextBody(
  text: string,
  slug: string,
  target: EmbedProxyTarget,
): string {
  let result = text;

  for (const { alias, httpsOrigin } of target.origins) {
    const proxyBase = `/api/v1/embed/${slug}/o/${alias}`;
    const escapedOrigin = escapeRegex(httpsOrigin);

    // Absolute URLs: https://hostname.com/path?q=1#hash
    // Stop at characters that cannot appear unescaped inside attribute values
    // or CSS url() arguments.
    const absoluteRe = new RegExp(
      `${escapedOrigin}(/[^"'\\s<>\\\\]*)?`,
      'g',
    );
    result = result.replace(absoluteRe, (_, pathPart: string | undefined) => {
      return `${proxyBase}${pathPart ?? '/'}`;
    });

    // Protocol-relative URLs: //hostname.com/path
    const noScheme = httpsOrigin.slice('https:'.length); // "//hostname.com"
    const protoRelRe = new RegExp(
      `${escapeRegex(noScheme)}(/[^"'\\s<>\\\\]*)?`,
      'g',
    );
    result = result.replace(protoRelRe, (_, pathPart: string | undefined) => {
      return `${proxyBase}${pathPart ?? '/'}`;
    });
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Next.js and similar apps emit root-relative URLs (`/_next/...`, `/favicon.ico`).
 * In a path-based embed (`/api/v1/embed/.../o/main/...`), those would otherwise
 * resolve against the site origin and miss the proxy. Rewrite common attributes
 * so they stay under the embed path.
 *
 * Only safe for **HTML documents served from the primary app host** (`main`,
 * `www`). Do not apply to CDN (`cdn2`) responses — there `/foo` means the CDN root.
 */
export function rewriteRootRelativeAttrPathsForEmbed(
  html: string,
  slug: string,
  originAlias: string,
): string {
  const prefix = `/api/v1/embed/${slug}/o/${originAlias}`;
  return html.replace(
    /\b(href|src|action)\s*=\s*(["'])\/(?!api\/v1\/embed\/)/gi,
    (_m, attr: string, q: string) => `${attr}=${q}${prefix}/`,
  );
}
