import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  echoRestHttpRequestDurationSeconds,
  echoRestHttpRequestsTotal,
} from '../observability/echoMetrics';
import { appendBackendDiagnostic } from '../observability/sessionDiagnostics';

const METRICS_PATH = '/api/v1/metrics';

/**
 * Low-cardinality bucket for REST RED metrics (never use raw paths with ids).
 */
export function echoRestRouteGroup(urlPath: string): string {
  const u = urlPath.split('?')[0] ?? urlPath;
  if (u === '/api/v1/health' || u === METRICS_PATH) return 'health';
  if (u.includes('/hooks/livekit')) return 'hooks_livekit';
  if (u.startsWith('/api/v1/auth')) return 'auth';
  if (u.includes('/messages/search')) return 'echo_search';
  if (u.startsWith('/api/v1/echo/dm')) return 'echo_dm';
  if (u.includes('presign') || u.includes('/upload')) return 'echo_uploads';
  if (u.startsWith('/api/v1/echo')) return 'echo_workspace';
  if (u.startsWith('/api/v1')) return 'api_other';
  return 'other';
}

function httpMethodLabel(method: string): string {
  const m = method.toUpperCase();
  if (
    m === 'GET' ||
    m === 'POST' ||
    m === 'PUT' ||
    m === 'PATCH' ||
    m === 'DELETE'
  )
    return m;
  return 'OTHER';
}

function statusClass(code: number): string {
  if (code >= 500) return '5xx';
  if (code >= 400) return '4xx';
  if (code >= 300) return '3xx';
  return '2xx';
}

/**
 * Binds `correlationId` on the request logger (from Fastify `requestIdHeader` / `genReqId`)
 * and records REST RED metrics on response.
 */
export async function registerEchoHttpObservability(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.addHook('onRequest', async (req: FastifyRequest) => {
    const id =
      typeof req.id === 'string' && req.id.length > 0 ? req.id : undefined;
    if (id) {
      req.log = req.log.child({ correlationId: id });
    }
    await appendBackendDiagnostic({
      level: 'info',
      domain: 'api',
      event: 'http_request',
      stage: 'start',
      traceId: (req.headers['x-diag-trace-id'] as string | undefined) || id,
      spanId:
        (req.headers['x-diag-span-id'] as string | undefined) || undefined,
      parentSpanId:
        (req.headers['x-diag-parent-span-id'] as string | undefined) ||
        undefined,
      context: {
        method: req.method,
        path: req.url.split('?')[0] ?? '',
      },
    });
  });

  fastify.addHook(
    'onResponse',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const pathOnly = req.url.split('?')[0] ?? '';
      if (pathOnly === METRICS_PATH) return;

      const routeGroup = echoRestRouteGroup(pathOnly);
      const method = httpMethodLabel(req.method);
      const sc = statusClass(reply.statusCode);

      echoRestHttpRequestsTotal.inc({
        route_group: routeGroup,
        method,
        status_class: sc,
      });

      const ms = reply.elapsedTime;
      if (typeof ms === 'number' && Number.isFinite(ms) && ms >= 0) {
        echoRestHttpRequestDurationSeconds.observe(
          { route_group: routeGroup },
          ms / 1000,
        );
      }
      await appendBackendDiagnostic({
        level:
          reply.statusCode >= 500
            ? 'error'
            : reply.statusCode >= 400
              ? 'warn'
              : 'info',
        domain: 'api',
        event: 'http_response',
        stage: reply.statusCode >= 400 ? 'fail' : 'success',
        traceId:
          (req.headers['x-diag-trace-id'] as string | undefined) ||
          (typeof req.id === 'string' ? req.id : undefined),
        spanId:
          (req.headers['x-diag-span-id'] as string | undefined) || undefined,
        parentSpanId:
          (req.headers['x-diag-parent-span-id'] as string | undefined) ||
          undefined,
        status: String(reply.statusCode),
        durationMs: typeof ms === 'number' ? Math.round(ms) : undefined,
        context: {
          method: req.method,
          path: pathOnly,
          statusCode: reply.statusCode,
        },
      });
    },
  );
}
