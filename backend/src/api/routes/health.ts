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

function requireMetricsScrapeAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const token = config.echoMetricsScrapeToken?.trim();
  if (!token) return;
  const h = request.headers.authorization;
  if (h !== `Bearer ${token}`) {
    sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
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

  fastify.get(
    '/metrics',
    { preHandler: [requireMetricsScrapeAuth] },
    async (_req, reply) => {
      const body = await getEchoMetricsRegistry().metrics();
      return reply.type('text/plain; version=0.0.4').send(body);
    },
  );
}
