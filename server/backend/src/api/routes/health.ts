import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { config } from '../../config';
import { getPgPool } from '../../db/pg';
import { getNatsConnection } from '../../db/nats';
import { sendError } from '../errors';
import { getEchoMetricsRegistry } from '../../observability/echoMetrics';

/** Bound scrape so a stuck prom-client collector cannot pin the request forever. */
const METRICS_SCRAPE_TIMEOUT_MS = 5_000;

function metricsAuthDenied(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const token = config.echoMetricsScrapeToken?.trim();
  const requireAuth =
    config.isProduction ||
    (config.backendStorageMode === 'postgres' &&
      config.echoRequireMetricsScrapeTokenInProduction);
  if (!token) {
    if (!requireAuth) return false;
    sendError(
      reply,
      503,
      'NOT_CONFIGURED',
      'Metrics scrape token not configured',
    );
    return true;
  }
  // A configured token is always enforced (never silently open in dev/memory mode).
  const h = request.headers.authorization;
  if (h !== `Bearer ${token}`) {
    sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
    return true;
  }
  return false;
}

async function collectMetricsExposition(): Promise<string> {
  const registry = getEchoMetricsRegistry();
  return await Promise.race([
    registry.metrics(),
    new Promise<string>((_, reject) => {
      setTimeout(() => {
        reject(new Error('metrics_scrape_timeout'));
      }, METRICS_SCRAPE_TIMEOUT_MS);
    }),
  ]);
}

/**
 * Health check routes. Used for liveness/readiness probes.
 */
export default async function healthRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get('/health', async (_request, reply) => {
    try {
      let db: string =
        config.backendStorageMode === 'memory' ? 'memory' : 'disconnected';
      if (config.backendStorageMode === 'postgres') {
        const pool = getPgPool();
        if (!pool) {
          db = 'disconnected';
        } else {
          try {
            await pool.query('SELECT 1');
            db = 'connected';
          } catch {
            db = 'disconnected';
          }
        }
      }

      let nats: string = 'none';
      if (config.natsUrl) {
        const nc = getNatsConnection();
        if (nc && !nc.isClosed()) {
          nats = 'connected';
        } else {
          nats = 'disconnected';
        }
      }

      if (config.echoHealthRedact) {
        return reply.code(200).send({
          status: 'ok' as const,
          timestamp: new Date().toISOString(),
        });
      }

      reply.code(200).send({
        status: 'ok' as const,
        timestamp: new Date().toISOString(),
        db,
        nats,
        backendStorageMode: config.backendStorageMode,
        useMockDb: config.useMockDb,
      });
    } catch (error) {
      fastify.log.error(error, 'Health check failed');
      return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
    }
  });

  /**
   * Auth + collect + send in a single handler (no separate preHandler).
   * Under Bun, a successful metrics preHandler followed by a route handler has
   * been observed to never flush the response; doing the work inline avoids that.
   */
  fastify.get('/metrics', async (request, reply) => {
    if (metricsAuthDenied(request, reply)) return;
    try {
      const body = await collectMetricsExposition();
      if (reply.sent) return;
      return reply.type('text/plain; version=0.0.4').send(body);
    } catch (error) {
      if (reply.sent) return;
      const timedOut =
        error instanceof Error && error.message === 'metrics_scrape_timeout';
      if (timedOut) {
        fastify.log.error(
          { timeoutMs: METRICS_SCRAPE_TIMEOUT_MS },
          'Prometheus metrics scrape timed out',
        );
        return sendError(
          reply,
          503,
          'METRICS_TIMEOUT',
          'Metrics scrape timed out',
        );
      }
      fastify.log.error(error, 'Prometheus metrics scrape failed');
      return sendError(
        reply,
        500,
        'INTERNAL_ERROR',
        'Failed to collect metrics',
      );
    }
  });
}
