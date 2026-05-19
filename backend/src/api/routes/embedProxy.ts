/**
 * Same-origin embed proxy routes.
 *
 * GET/HEAD /api/v1/embed/:slug/o/:originAlias/*
 *   Fetches the upstream resource, rewrites HTML/CSS body URLs to Echo-proxy
 *   paths, strips dangerous upstream headers, and returns the result.
 *
 * POST /api/v1/embed/token
 *   Mints a short-lived signed embed token for the SPA to attach to the
 *   initial iframe src URL.
 *
 * GET /api/v1/embed/meta
 *   Returns which slugs are enabled so the SPA can decide whether to use
 *   the proxy or fall back to a direct iframe.
 *
 * Auth model:
 *   - The token endpoint requires a full authenticated session (requireAuth).
 *   - Proxy requests accept EITHER a valid embed token in `?_eproxy_t=...`
 *     OR a valid echo_sid session cookie. The embed token covers the initial
 *     document load (no cookie on first navigation); the cookie covers all
 *     subsequent same-origin subresource/navigation requests from the iframe.
 *
 * Helmet override:
 *   An onSend hook (after Helmet) removes X-Frame-Options and the
 *   frameAncestors CSP directive from proxy responses so the iframe can
 *   load the document.
 *
 * SECURITY WARNING:
 *   Proxied content runs as Echo's origin. Only catalog targets that have
 *   been explicitly reviewed are reachable here. See embedProxyCatalog.ts.
 */

import type { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { requireAuth } from '../../auth/middleware';
import { config } from '../../config';
import { sendError } from '../errors';
import { getEmbedProxyTarget, EMBED_PROXY_ALL_SLUGS } from '../../services/embedProxy/embedProxyCatalog';
import { mintEmbedToken, verifyEmbedToken } from '../../services/embedProxy/embedProxyToken';
import { buildUpstreamUrl, sanitizeProxyPath } from '../../services/embedProxy/embedProxyUpstream';
import { embedFetch, isRewriteableContentType } from '../../services/embedProxy/embedProxyFetch';
import { rewriteTextBody, rewriteRootRelativeAttrPathsForEmbed } from '../../services/embedProxy/embedProxyRewrite';
import {
  getServerSession,
  SESSION_COOKIE,
  LEGACY_SESSION_COOKIE,
} from '../../auth/serverSession';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Enabled slugs: catalog ∩ runtime allowlist. */
function allowedSlugs(): string[] {
  const configured = config.echoEmbedProxySlugs;
  if (configured === null) return [...EMBED_PROXY_ALL_SLUGS];
  return configured.filter((s) => EMBED_PROXY_ALL_SLUGS.includes(s));
}

function isSlugAllowed(slug: string): boolean {
  return allowedSlugs().includes(slug);
}

/**
 * Validates proxy request auth:
 *   1. Embed token in `?_eproxy_t=...` for the initial document request.
 *   2. Session cookie (echo_sid) for subsequent same-origin requests.
 *
 * Returns the authenticated userId, or null if unauthenticated.
 */
async function resolveProxyAuth(
  req: FastifyRequest,
  slug: string,
): Promise<{ userId: string } | null> {
  // 1. Embed token (query param)
  const tokenParam = (req.query as Record<string, string | undefined>)['_eproxy_t'];
  if (tokenParam) {
    const result = verifyEmbedToken(tokenParam, slug, config.echoEmbedProxySecret);
    if (result.ok) return { userId: result.userId };
    // Fall through to cookie check; don't reject on bad token if cookie is valid
  }

  // 2. Session cookie
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const sid = (
    cookies?.[SESSION_COOKIE] ?? cookies?.[LEGACY_SESSION_COOKIE]
  )?.trim();
  if (sid) {
    const sess = await getServerSession(sid);
    if (sess) return { userId: sess.userId };
  }

  return null;
}

/** Strip Helmet's per-response security headers that break proxied documents in iframes. */
function stripEmbedConflictingHeaders(reply: {
  removeHeader: (name: string) => void;
  getHeader: (name: string) => unknown;
  header: (name: string, value: string) => void;
}): void {
  // Helmet frameguard sets X-Frame-Options: DENY
  reply.removeHeader('X-Frame-Options');

  // Helmet CSP with frameAncestors: none also blocks iframing
  // We remove it entirely; proxied HTML may have no CSP or its own stripped CSP.
  reply.removeHeader('Content-Security-Policy');
  reply.removeHeader('Content-Security-Policy-Report-Only');
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export default async function embedProxyRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  // Meta endpoint: always available (tells SPA whether proxy is on)
  fastify.get('/embed/meta', async (_req, reply) => {
    return reply.send({
      enabled: config.echoEmbedProxyEnabled,
      slugs: config.echoEmbedProxyEnabled ? allowedSlugs() : [],
    });
  });

  if (!config.echoEmbedProxyEnabled) return;

  // Token mint endpoint (requires full auth)
  fastify.post<{ Body: { slug?: string } }>(
    '/embed/token',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const slug = req.body?.slug?.trim();
      if (!slug) {
        return sendError(reply, 400, 'INVALID_BODY', 'slug is required');
      }
      if (!isSlugAllowed(slug) || !getEmbedProxyTarget(slug)) {
        return sendError(reply, 404, 'NOT_FOUND', 'Unknown or disabled embed slug');
      }
      const userId = req.authUser!.id;
      const token = mintEmbedToken(slug, userId, config.echoEmbedProxySecret);
      return reply.send({ token });
    },
  );

  // Proxy routes — scoped for independent rate limit + helmet override
  await fastify.register(async (scope) => {
    // Rate limit: 300 req/min per identity (generous for page loads + assets)
    await scope.register(rateLimit, {
      max: 300,
      timeWindow: '1 minute',
      keyGenerator: (req) => {
        const userId = (req as FastifyRequest & { authUser?: { id: string } })
          .authUser?.id;
        return userId ? `embed:uid:${userId}` : `embed:ip:${req.ip}`;
      },
      addHeaders: { 'retry-after': true },
    });

    // After Helmet's onSend, remove headers that would block the iframe
    scope.addHook('onSend', async (_req, reply, payload) => {
      stripEmbedConflictingHeaders(reply);
      return payload;
    });

    // Fastify registers HEAD for GET automatically; do not add a separate `.head()` route
    // or startup fails with FST_ERR_DUPLICATED_ROUTE.
    scope.get<{
      Params: { slug: string; originAlias: string; '*': string };
    }>(
      '/embed/:slug/o/:originAlias/*',
      async (req, reply) => {
        return handleProxyRequest(req, reply, scope);
      },
    );
  });
}

async function handleProxyRequest(
  req: FastifyRequest<{ Params: { slug: string; originAlias: string; '*': string } }>,
  reply: import('fastify').FastifyReply,
  fastify: FastifyInstance,
): Promise<import('fastify').FastifyReply> {
  const { slug, originAlias } = req.params;
  const remainder = req.params['*'] ?? '';
  const rawPath = remainder.startsWith('/') ? remainder : `/${remainder}`;

  // Config gate
  if (!config.echoEmbedProxyEnabled) {
    return sendError(reply, 503, 'SERVICE_UNAVAILABLE', 'Embed proxy is not enabled');
  }
  if (!isSlugAllowed(slug)) {
    return sendError(reply, 404, 'NOT_FOUND', 'Unknown or disabled embed slug');
  }

  // Auth: embed token OR session cookie
  const auth = await resolveProxyAuth(req, slug);
  if (!auth) {
    return sendError(reply, 401, 'UNAUTHORIZED', 'Missing or invalid embed token or session');
  }

  // Lookup catalog entry
  const target = getEmbedProxyTarget(slug);
  if (!target) {
    return sendError(reply, 404, 'NOT_FOUND', 'Embed target not found');
  }

  // Reconstruct path + query
  const rawUrl = req.url; // /api/v1/embed/:slug/o/:alias/<rest>?<query>
  const qMark = rawUrl.indexOf('?');
  const queryString = qMark >= 0 ? rawUrl.slice(qMark) : '';
  // Strip _eproxy_t from query before forwarding
  const forwardedQuery = stripEproxyTokenFromQuery(queryString);
  const pathAndQuery = `${rawPath}${forwardedQuery}`;

  // Sanitize + build upstream URL
  const safePath = sanitizeProxyPath(pathAndQuery);
  if (!safePath) {
    return sendError(reply, 400, 'BAD_REQUEST', 'Invalid path');
  }
  const upstreamUrl = buildUpstreamUrl(target, originAlias, safePath);
  if (!upstreamUrl) {
    return sendError(reply, 404, 'NOT_FOUND', 'Unknown origin alias');
  }

  // Determine if the content is expected to be rewriteable (HTML/CSS)
  // from request Accept header as a hint; actual decision from response Content-Type
  const acceptHint = (req.headers['accept'] ?? '').toLowerCase();
  const expectRewrite =
    acceptHint.includes('text/html') ||
    acceptHint.includes('application/xhtml') ||
    acceptHint === '' ||
    rawPath.endsWith('.html') ||
    rawPath.endsWith('.css');

  // Fetch upstream
  const forwardHeaders: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    forwardHeaders[k.toLowerCase()] = v as string | string[] | undefined;
  }

  fastify.log.debug(
    { slug, originAlias, path: rawPath, upstreamUrl },
    'embed-proxy: upstream request',
  );

  const result = await embedFetch(
    target,
    upstreamUrl,
    forwardHeaders,
    expectRewrite,
    req.method === 'HEAD' ? 'HEAD' : 'GET',
  );

  if (!result.ok) {
    fastify.log.warn(
      { slug, originAlias, upstreamUrl, error: result.message },
      'embed-proxy: upstream error',
    );
    return sendError(reply, result.httpStatus, 'UPSTREAM_ERROR', result.message);
  }

  // Set response headers from upstream (already stripped of dangerous ones)
  for (const [k, v] of Object.entries(result.headers)) {
    if (k === 'content-length') continue; // Will be recalculated after rewrite
    reply.header(k, v);
  }

  // Set Vary so CDNs don't cache one user's proxy session for another
  reply.header('Vary', 'Cookie, Authorization');
  // Prevent this response from being stored in the browser cache by default
  if (!result.headers['cache-control']) {
    reply.header('Cache-Control', 'no-store');
  }

  if (req.method === 'HEAD') {
    return reply.code(result.status).send();
  }

  // Rewrite HTML/CSS, pass binary through
  let responseBody: Buffer | string;
  if (!result.isBinary && isRewriteableContentType(result.contentType)) {
    let text = rewriteTextBody(result.body.toString('utf-8'), slug, target);
    if (
      slug === 'codenames' &&
      (originAlias === 'main' || originAlias === 'www')
    ) {
      text = rewriteRootRelativeAttrPathsForEmbed(text, slug, originAlias);
    }
    responseBody = text;
    // Update content-length after rewrite
    reply.header('content-length', Buffer.byteLength(text, 'utf-8').toString());
  } else {
    responseBody = result.body;
  }

  return reply.code(result.status).send(responseBody);
}

function stripEproxyTokenFromQuery(queryString: string): string {
  if (!queryString || queryString === '?') return '';
  const params = new URLSearchParams(queryString.slice(1));
  params.delete('_eproxy_t');
  const rebuilt = params.toString();
  return rebuilt ? `?${rebuilt}` : '';
}
