import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { parseClientEnvironmentSnapshot } from '../../../../shared/clientEnvironment';
import { getPgPool } from '../../db/pg';
import { recordClientEnvironmentReport } from '../../services/clientEnvironmentAggregation';

const CLIENT_ENV_BODY_SCHEMA = {
  type: 'object',
  required: ['snapshot'],
  properties: {
    snapshot: { type: 'object', additionalProperties: true },
  },
} as const;

/**
 * Anonymous client environment ingest for aggregate product analytics.
 * POST /api/v1/analytics/client-environment
 */
export default async function clientEnvironmentAnalyticsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 12,
      timeWindow: '1 hour',
      keyGenerator: (req) => `client-env:ip:${req.ip}`,
      addHeaders: { 'retry-after': true },
    });

    scope.post<{ Body: { snapshot?: unknown } }>(
      '/analytics/client-environment',
      {
        schema: { body: CLIENT_ENV_BODY_SCHEMA },
      },
      async (req, reply) => {
        const snapshot = parseClientEnvironmentSnapshot(req.body?.snapshot);
        if (!snapshot) {
          return reply.code(400).send({ ok: false, error: 'INVALID_SNAPSHOT' });
        }

        scope.log.info({
          msg: 'echo_client_environment',
          shell: snapshot.shell,
          osFamily: snapshot.osFamily,
          deviceForm: snapshot.deviceForm,
          browserFamily: snapshot.browserFamily,
          displayMode: snapshot.displayMode,
          gpuTier: snapshot.gpuTier,
          viewportBucket: snapshot.viewportBucket,
          locale: snapshot.locale,
          touch: snapshot.touch,
          colorScheme: snapshot.colorScheme,
          connectionType: snapshot.connectionType,
        });

        try {
          await recordClientEnvironmentReport(getPgPool(), snapshot);
        } catch (error) {
          req.log.warn(
            { err: error, msg: 'echo_client_environment_aggregate_failed' },
            'Client environment aggregate write failed',
          );
        }

        return reply.code(204).send();
      },
    );
  });
}
