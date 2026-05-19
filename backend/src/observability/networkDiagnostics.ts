import type { FastifyRequest, FastifyReply } from 'fastify';

const MAX_NETWORK_DIAGNOSTICS = 400;

export type NetworkDiagnosticEntry = {
  ts: string;
  traceId: string | null;
  method: string;
  path: string;
  statusCode: number;
  route: string | null;
  kind: 'auth' | 'echo_uploads';
  ip: string;
  host: string | null;
  origin: string | null;
  referer: string | null;
  userAgent: string | null;
  contentType: string | null;
  hasCookieHeader: boolean;
  accessControlRequestMethod: string | null;
  accessControlRequestHeaders: string | null;
  forwardedHost: string | null;
  forwardedProto: string | null;
  forwardedFor: string | null;
  responseAllowOrigin: string | null;
  responseAllowCredentials: string | null;
  responseContentType: string | null;
  responseVary: string | null;
};

const recentNetworkDiagnostics: NetworkDiagnosticEntry[] = [];

function trimToNull(input: unknown, max = 512): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!value) return null;
  return value.slice(0, max);
}

function pathOnly(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

function routeKind(path: string): NetworkDiagnosticEntry['kind'] | null {
  if (path.startsWith('/api/v1/auth/')) return 'auth';
  if (path.startsWith('/api/v1/echo/uploads/')) return 'echo_uploads';
  return null;
}

function firstHeader(
  raw: string | string[] | undefined,
  max = 512,
): string | null {
  if (Array.isArray(raw)) return trimToNull(raw[0], max);
  return trimToNull(raw, max);
}

function bodyTraceId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as Record<string, unknown>).diagTraceId;
  return trimToNull(raw, 128);
}

function queryTraceId(query: unknown): string | null {
  if (!query || typeof query !== 'object') return null;
  const raw = (query as Record<string, unknown>).diagTraceId;
  if (Array.isArray(raw)) return trimToNull(raw[0], 128);
  return trimToNull(raw, 128);
}

export function extractRequestTraceId(req: FastifyRequest): string | null {
  return (
    firstHeader(req.headers['x-diag-trace-id'], 128) ??
    queryTraceId(req.query) ??
    bodyTraceId(req.body)
  );
}

export function recordNetworkDiagnostic(
  req: FastifyRequest,
  reply: FastifyReply,
): void {
  const path = pathOnly(req.url);
  const kind = routeKind(path);
  if (!kind) return;

  recentNetworkDiagnostics.push({
    ts: new Date().toISOString(),
    traceId: extractRequestTraceId(req),
    method: req.method.toUpperCase(),
    path,
    statusCode: reply.statusCode,
    route: trimToNull(req.routeOptions?.url, 256),
    kind,
    ip: trimToNull(req.ip, 128) ?? 'unknown',
    host: firstHeader(req.headers.host, 256),
    origin: firstHeader(req.headers.origin, 256),
    referer: firstHeader(req.headers.referer, 512),
    userAgent: firstHeader(req.headers['user-agent'], 512),
    contentType: firstHeader(req.headers['content-type'], 128),
    hasCookieHeader: Boolean(firstHeader(req.headers.cookie, 16_384)),
    accessControlRequestMethod: firstHeader(
      req.headers['access-control-request-method'],
      32,
    ),
    accessControlRequestHeaders: firstHeader(
      req.headers['access-control-request-headers'],
      512,
    ),
    forwardedHost: firstHeader(req.headers['x-forwarded-host'], 256),
    forwardedProto: firstHeader(req.headers['x-forwarded-proto'], 64),
    forwardedFor: firstHeader(req.headers['x-forwarded-for'], 512),
    responseAllowOrigin: trimToNull(
      reply.getHeader('access-control-allow-origin'),
      256,
    ),
    responseAllowCredentials: trimToNull(
      reply.getHeader('access-control-allow-credentials'),
      32,
    ),
    responseContentType: trimToNull(reply.getHeader('content-type'), 128),
    responseVary: trimToNull(reply.getHeader('vary'), 512),
  });

  const overflow = recentNetworkDiagnostics.length - MAX_NETWORK_DIAGNOSTICS;
  if (overflow > 0) recentNetworkDiagnostics.splice(0, overflow);
}

export function getRecentNetworkDiagnostics(options?: {
  traceId?: string | null;
  limit?: number;
}): NetworkDiagnosticEntry[] {
  const traceId = options?.traceId?.trim() || null;
  const limit = Math.max(
    1,
    Math.min(options?.limit ?? 80, MAX_NETWORK_DIAGNOSTICS),
  );
  const filtered = traceId
    ? recentNetworkDiagnostics.filter((entry) => entry.traceId === traceId)
    : recentNetworkDiagnostics;
  return filtered.slice(-limit).reverse();
}
