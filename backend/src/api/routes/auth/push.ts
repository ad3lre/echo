import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { requireAuth, getAuthUser } from '../../../auth/middleware';
import { getAuthStore } from '../../../auth/store';
import { getPgPool } from '../../../db/pg';
import { sendError } from '../../errors';
import {
  deleteIosDeviceToken,
  upsertIosDeviceToken,
} from '../../../domain/iosDeviceTokenRepo';
import { config } from '../../../config';

type RegisterBody = {
  deviceToken?: string;
  bundleId?: string;
  environment?: string;
};

export default async function pushRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  fastify.post<{ Body?: RegisterBody }>(
    '/push/register',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const { mode } = await getAuthStore();
      if (mode !== 'postgres') {
        return sendError(
          reply,
          503,
          'NOT_AVAILABLE',
          'Push registration requires a database.',
        );
      }

      const deviceToken =
        typeof req.body?.deviceToken === 'string'
          ? req.body.deviceToken.trim().toLowerCase()
          : '';
      if (!deviceToken) {
        return sendError(reply, 400, 'BAD_REQUEST', 'deviceToken is required.');
      }

      const bundleId =
        typeof req.body?.bundleId === 'string' && req.body.bundleId.trim()
          ? req.body.bundleId.trim()
          : config.apnsBundleId;
      const envRaw =
        typeof req.body?.environment === 'string'
          ? req.body.environment.trim().toLowerCase()
          : config.apnsEnvironment === 'production'
            ? 'production'
            : 'development';
      const environment =
        envRaw === 'production' ? 'production' : 'development';

      const pool = getPgPool();
      if (!pool) {
        return sendError(
          reply,
          503,
          'NOT_AVAILABLE',
          'Push registration requires a database.',
        );
      }
      const result = await upsertIosDeviceToken(pool, {
        userId: getAuthUser(req).id,
        deviceToken,
        bundleId,
        environment,
        userAgent:
          typeof req.headers['user-agent'] === 'string'
            ? req.headers['user-agent']
            : '',
      });
      if (result === 'invalid') {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Invalid APNs device token.',
        );
      }
      return reply.code(204).send();
    },
  );

  fastify.post<{ Body?: { deviceToken?: string } }>(
    '/push/unregister',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const { mode } = await getAuthStore();
      if (mode !== 'postgres') {
        return reply.code(204).send();
      }
      const deviceToken =
        typeof req.body?.deviceToken === 'string'
          ? req.body.deviceToken.trim()
          : '';
      const pool = getPgPool();
      if (deviceToken && pool) {
        await deleteIosDeviceToken(pool, deviceToken, getAuthUser(req).id);
      }
      return reply.code(204).send();
    },
  );
}
