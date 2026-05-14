import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config';
import { getAccessUserIdFromAuthHeader } from '../auth/token';
import { enforceApiCsrf } from '../auth/csrf';
import { isEchoApiReadRequest } from './echoReadRateLimitPaths';
import { registerEchoHttpObservability } from './echoHttpObservability';
import { recordNetworkDiagnostic } from '../observability/networkDiagnostics';

/** Browser preflight must allow every non-simple header Echo clients send (see `frontend/src/api/echo/transport.ts`). */
export const ECHO_CORS_ALLOWED_HEADERS: string[] = [
  'Content-Type',
  'Authorization',
  'X-Request-Id',
  'X-CSRF-Token',
  'X-Diag-Trace-Id',
  'X-Diag-Span-Id',
];

function requestOrigin(req: FastifyRequest): string | null {
  const raw = req.headers.origin;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function isAllowedCorsOrigin(origin: string): boolean {
  const configured = config.corsOrigin;
  if (configured === true) return true;
  if (typeof configured === 'string') return configured === origin;
  return configured.includes(origin);
}

function appendVaryValue(
  current: string | string[] | number | undefined,
  value: string,
): string {
  const parts = String(current ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const seen = new Set(parts.map((part) => part.toLowerCase()));
  if (!seen.has(value.toLowerCase())) parts.push(value);
  return parts.join(', ');
}

export async function registerHttpPlugins(
  fastify: FastifyInstance,
): Promise<void> {
  const edgeCspHsts = config.echoEdgeSecurityHeaders;
  await fastify.register(helmet, {
    // Keep security headers explicit so external scanners can verify them.
    contentSecurityPolicy: edgeCspHsts
      ? false
      : {
          directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
          },
        },
    frameguard: { action: 'deny' },
    strictTransportSecurity: edgeCspHsts
      ? false
      : {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },
    noSniff: true,
    /**
     * `same-origin` blocks credentialed cross-origin fetches from the Tauri WebView
     * (`https://tauri.localhost` → API) even when CORS allows the origin. Use
     * `cross-origin` so SPA + desktop shells can read JSON responses.
     */
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },
  });

  await registerEchoHttpObservability(fastify);

  /** Before rate-limit so OPTIONS preflight always gets CORS headers (limit errors otherwise omit them). */
  await fastify.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ECHO_CORS_ALLOWED_HEADERS,
  });

  /**
   * Credentialed `fetch` requires `Access-Control-Allow-Credentials: true` on the **OPTIONS**
   * preflight, not only on the actual request. Some edge stacks have been observed to forward
   * GET/POST CORS headers correctly while dropping this one on preflight — browsers then block
   * with `TypeError: Failed to fetch` and never send `POST /api/v1/echo/uploads/presign`.
   * Re-assert at `onSend` when `@fastify/cors` already chose an allowed origin.
   */
  fastify.addHook('onSend', async (req, reply, payload) => {
    const origin = requestOrigin(req);
    if (!origin || !isAllowedCorsOrigin(origin)) return payload;
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Access-Control-Allow-Credentials', 'true');
    reply.header('Vary', appendVaryValue(reply.getHeader('Vary'), 'Origin'));
    if (req.method === 'OPTIONS') {
      reply.header(
        'Vary',
        appendVaryValue(
          reply.getHeader('Vary'),
          'Access-Control-Request-Headers',
        ),
      );
    }
    return payload;
  });

  await fastify.register(rateLimit, {
    /** Mutations, auth, and non-Echo traffic; Echo GETs use the scoped bucket in registerRoutes. */
    max: 150,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      const userId = getAccessUserIdFromAuthHeader(req.headers.authorization);
      return userId ? `uid:${userId}` : `ip:${req.ip}`;
    },
    allowList: (req: FastifyRequest) =>
      isEchoApiReadRequest(req.method, req.url),
    addHeaders: { 'retry-after': true },
  });

  await fastify.register(cookie);

  fastify.addHook('preHandler', async (req, reply) => {
    const ok = await enforceApiCsrf(req, reply);
    if (!ok) {
      return;
    }
  });

  fastify.addHook('onResponse', async (req, reply) => {
    recordNetworkDiagnostic(req, reply);
  });
}

function isTrustedLoopbackRemote(addr: string | undefined): boolean {
  if (!addr) return false;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

export function registerHttpsEnforcementIfConfigured(
  fastify: FastifyInstance,
): void {
  if (!config.enforceHttps) return;

  fastify.addHook('onRequest', async (req, reply) => {
    const isHttps = req.protocol === 'https';
    if (!isHttps) {
      // Deploy scripts and local tooling probe loopback over plain HTTP; use the
      // TCP peer address (not Forwarded headers) so this cannot be spoofed remotely.
      const peer = req.socket.remoteAddress;
      if (isTrustedLoopbackRemote(peer)) return;
      return reply.code(426).send({
        code: 'HTTPS_REQUIRED',
        message: 'HTTPS is required in this environment',
      });
    }
  });
}
