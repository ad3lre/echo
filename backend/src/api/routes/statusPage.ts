import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { config } from '../../config';
import { getPgPool } from '../../db/pg';
import { buildPublicStatusPayload } from '../../services/statusPage/publicStatus';

/**
 * Public fleet status (Discord-style). No auth; safe for marketing site + caches.
 */
export default async function statusPageRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get('/status', async (_req, reply) => {
    const pool = getPgPool();
    const payload = await buildPublicStatusPayload(pool);
    const maxAge = Math.max(
      15,
      Math.floor(config.echoStatusProbeIntervalMs / 1000 / 2),
    );
    return reply
      .header('Cache-Control', `public, max-age=${maxAge}`)
      .code(200)
      .send(payload);
  });
}
