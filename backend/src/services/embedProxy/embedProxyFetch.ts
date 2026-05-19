/**
 * Upstream HTTP fetcher for the embed proxy.
 *
 * - Uses undici directly for manual redirect handling.
 * - All 3xx Location headers are validated against the target's catalog origins
 *   before following (SSRF prevention).
 * - Upstream response headers listed in STRIPPED_RESPONSE_HEADERS are removed
 *   before forwarding to the browser.
 * - Rewriteable content types (text/html, text/css) are fetched with
 *   Accept-Encoding: identity so we never regex over compressed bytes.
 */

import { request } from 'undici';
import type { EmbedProxyTarget } from './embedProxyCatalog';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 4;
/** Binary response body size cap: 50 MiB. */
const MAX_BINARY_BYTES = 50 * 1024 * 1024;

/**
 * Upstream request headers to never forward from the browser to the
 * third-party origin (security + privacy).
 */
const ALWAYS_BLOCKED_UPSTREAM_HEADERS: ReadonlySet<string> = new Set([
  'cookie',
  'authorization',
  'x-forwarded-for',
  'x-real-ip',
  'x-forwarded-host',
  'x-forwarded-proto',
  'host',
  'connection',
  'upgrade',
  'te',
  'trailer',
  'transfer-encoding',
  // Don't leak Echo origin info to upstream
  'origin',
  'referer',
]);

/**
 * Upstream response headers stripped before forwarding to the browser.
 * Prevents third-party content from setting credentials, imposing frame policy,
 * or pushing connectivity hints under Echo's origin.
 */
export const STRIPPED_RESPONSE_HEADERS: ReadonlySet<string> = new Set([
  'set-cookie',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'clear-site-data',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  'origin-agent-cluster',
  'report-to',
  'nel',
]);

export type EmbedFetchOk = {
  ok: true;
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  /** true when the content-type is NOT rewriteable (image, font, script, etc.) */
  isBinary: boolean;
  contentType: string;
};

export type EmbedFetchError = {
  ok: false;
  httpStatus: number;
  message: string;
};

export type EmbedFetchResult = EmbedFetchOk | EmbedFetchError;

export function isRewriteableContentType(ct: string): boolean {
  const lower = ct.toLowerCase();
  return (
    lower.startsWith('text/html') ||
    lower.startsWith('text/css') ||
    lower.startsWith('application/xhtml')
  );
}

/**
 * Fetch an upstream URL, following redirects only within the target's
 * catalog origins, buffering the full body, and stripping unsafe headers.
 */
export async function embedFetch(
  target: EmbedProxyTarget,
  upstreamUrl: string,
  /** Forwarded request headers (lowercased keys). */
  incomingHeaders: Record<string, string | string[] | undefined>,
  /** Hint: if true, the caller expects to rewrite the body. */
  expectRewrite: boolean,
  /** Upstream HTTP method (iframe uses GET; probes may use HEAD). */
  upstreamMethod: 'GET' | 'HEAD' = 'GET',
): Promise<EmbedFetchResult> {
  let currentUrl = upstreamUrl;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const reqHeaders = buildForwardedHeaders(
      incomingHeaders,
      target,
      expectRewrite,
    );

    let response: Awaited<ReturnType<typeof request>>;
    try {
      response = await request(currentUrl, {
        method: upstreamMethod,
        headers: reqHeaders,
        maxRedirections: 0,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        throwOnError: false,
      });
    } catch (err) {
      return {
        ok: false,
        httpStatus: 502,
        message: `Upstream connection failed: ${String(err)}`,
      };
    }

    const status = response.statusCode;

    if (status >= 301 && status <= 308) {
      // Drain body before following
      try {
        await response.body.dump();
      } catch {
        /* ignore drain errors */
      }

      const rawLocation = response.headers['location'];
      if (!rawLocation || typeof rawLocation !== 'string') {
        return { ok: false, httpStatus: 502, message: 'Redirect without Location' };
      }

      let resolved: string;
      try {
        resolved = new URL(rawLocation, currentUrl).toString();
      } catch {
        return { ok: false, httpStatus: 502, message: 'Invalid redirect Location' };
      }

      if (!resolved.startsWith('https://')) {
        return { ok: false, httpStatus: 502, message: 'Redirect to non-https disallowed' };
      }

      const allowed = target.origins.some(
        (o) => resolved.startsWith(`${o.httpsOrigin}/`) || resolved === o.httpsOrigin,
      );
      if (!allowed) {
        return { ok: false, httpStatus: 502, message: 'Redirect to disallowed origin' };
      }

      currentUrl = resolved;
      continue;
    }

    // Determine if content is rewriteable from response headers
    const rawContentType = (response.headers['content-type'] ?? '') as string;
    const isBinary = !isRewriteableContentType(rawContentType);
    const maxBytes = isBinary ? MAX_BINARY_BYTES : target.maxRewriteBytes;

    // Buffer body with size cap (HEAD typically has no body)
    let body: Buffer;
    try {
      if (upstreamMethod === 'HEAD') {
        try {
          await response.body.dump();
        } catch {
          /* ignore */
        }
        body = Buffer.alloc(0);
      } else {
        const chunks: Buffer[] = [];
        let total = 0;
        for await (const chunk of response.body) {
          total += chunk.length;
          if (total > maxBytes) {
            return { ok: false, httpStatus: 502, message: 'Upstream response too large' };
          }
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        body = Buffer.concat(chunks);
      }
    } catch {
      return { ok: false, httpStatus: 502, message: 'Error reading upstream body' };
    }

    // Build filtered response headers
    const outHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(response.headers)) {
      const lower = k.toLowerCase();
      if (STRIPPED_RESPONSE_HEADERS.has(lower)) continue;
      if (typeof v === 'string') {
        outHeaders[lower] = v;
      } else if (Array.isArray(v)) {
        outHeaders[lower] = v.join(', ');
      }
    }

    return {
      ok: true,
      status,
      headers: outHeaders,
      body,
      isBinary,
      contentType: rawContentType,
    };
  }

  return { ok: false, httpStatus: 502, message: 'Too many redirects' };
}

function buildForwardedHeaders(
  incoming: Record<string, string | string[] | undefined>,
  target: EmbedProxyTarget,
  expectRewrite: boolean,
): Record<string, string> {
  const blocked = new Set([
    ...ALWAYS_BLOCKED_UPSTREAM_HEADERS,
    ...target.blockedUpstreamHeaders.map((h) => h.toLowerCase()),
  ]);

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(incoming)) {
    const lower = k.toLowerCase();
    if (blocked.has(lower)) continue;
    if (typeof v === 'string') {
      out[lower] = v;
    } else if (Array.isArray(v) && v.length > 0) {
      out[lower] = v.join(', ');
    }
  }

  // For rewriteable content request uncompressed body so we can rewrite plaintext.
  if (expectRewrite) {
    out['accept-encoding'] = 'identity';
  }

  return out;
}
