import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getAuthUser } from '../../../auth/middleware';
import {
  buildEchoChannelWebhookExecuteUrl,
  createEchoChannelWebhook,
  deleteEchoChannelWebhook,
  listEchoChannelWebhooks,
  regenerateEchoChannelWebhookToken,
} from '../../../domain/echoChannelWebhooksRepo';
import { assertUserCanManageEchoChannelWebhooks } from '../../../services/channelWebhooks/echoChannelWebhooksPolicy';
import { ECHO_MSG_NOT_SERVER_MEMBER, sendError } from '../../errors';
import { echoPool, requireEchoStore, trimEchoPathParam } from './routeUtils';

async function requireWebhookManage(
  reply: import('fastify').FastifyReply,
  pool: import('pg').Pool,
  serverId: string,
  channelId: string,
  userId: string,
): Promise<boolean> {
  const g = await assertUserCanManageEchoChannelWebhooks(
    pool,
    serverId,
    channelId,
    userId,
  );
  if (g.ok) return true;
  if (g.status === 403 && g.message === 'NOT_SERVER_MEMBER') {
    sendError(
      reply,
      403,
      'FORBIDDEN',
      ECHO_MSG_NOT_SERVER_MEMBER,
      'NOT_SERVER_MEMBER',
    );
    return false;
  }
  if (g.status === 404) {
    sendError(reply, 404, 'NOT_FOUND', g.message);
    return false;
  }
  if (g.status === 400) {
    sendError(reply, 400, 'INVALID_BODY', g.message);
    return false;
  }
  sendError(reply, 403, 'FORBIDDEN', g.message);
  return false;
}

export default async function echoChannelWebhooksRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{
    Params: { serverId: string; channelId: string };
  }>(
    '/servers/:serverId/channels/:channelId/webhooks',
    { preHandler: [requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const userId = getAuthUser(req).id;
      if (
        !(await requireWebhookManage(reply, pool, serverId, channelId, userId))
      )
        return;
      const list = await listEchoChannelWebhooks(pool, channelId);
      return reply.code(200).send({ webhooks: list });
    },
  );

  fastify.post<{
    Params: { serverId: string; channelId: string };
    Body: { name?: string; avatarUrl?: string | null };
  }>(
    '/servers/:serverId/channels/:channelId/webhooks',
    { preHandler: [requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const userId = getAuthUser(req).id;
      if (
        !(await requireWebhookManage(reply, pool, serverId, channelId, userId))
      )
        return;
      const name =
        typeof req.body?.name === 'string' && req.body.name.trim()
          ? req.body.name.trim()
          : 'Webhook';
      const avatarUrl =
        typeof req.body?.avatarUrl === 'string' && req.body.avatarUrl.trim()
          ? req.body.avatarUrl.trim()
          : req.body?.avatarUrl === null
            ? null
            : undefined;
      const { row, plaintextToken } = await createEchoChannelWebhook(pool, {
        serverId,
        channelId,
        name,
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        createdByUserId: userId,
      });
      const url = buildEchoChannelWebhookExecuteUrl(row.id, plaintextToken);
      return reply.code(201).send({
        id: row.id,
        name: row.name,
        avatarUrl: row.avatarUrl,
        channelId: row.channelId,
        serverId: row.serverId,
        createdAt: row.createdAt,
        token: plaintextToken,
        url,
      });
    },
  );

  fastify.delete<{
    Params: { serverId: string; channelId: string; webhookId: string };
  }>(
    '/servers/:serverId/channels/:channelId/webhooks/:webhookId',
    { preHandler: [requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const webhookId = trimEchoPathParam(req.params.webhookId);
      const userId = getAuthUser(req).id;
      if (
        !(await requireWebhookManage(reply, pool, serverId, channelId, userId))
      )
        return;
      const ok = await deleteEchoChannelWebhook(
        pool,
        serverId,
        channelId,
        webhookId,
      );
      if (!ok) {
        return sendError(reply, 404, 'NOT_FOUND', 'Webhook not found.');
      }
      return reply.code(204).send();
    },
  );

  fastify.post<{
    Params: { serverId: string; channelId: string; webhookId: string };
  }>(
    '/servers/:serverId/channels/:channelId/webhooks/:webhookId/regenerate-token',
    { preHandler: [requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const webhookId = trimEchoPathParam(req.params.webhookId);
      const userId = getAuthUser(req).id;
      if (
        !(await requireWebhookManage(reply, pool, serverId, channelId, userId))
      )
        return;
      const out = await regenerateEchoChannelWebhookToken(
        pool,
        serverId,
        channelId,
        webhookId,
      );
      if (!out) {
        return sendError(reply, 404, 'NOT_FOUND', 'Webhook not found.');
      }
      const url = buildEchoChannelWebhookExecuteUrl(
        webhookId,
        out.plaintextToken,
      );
      return reply.code(200).send({
        token: out.plaintextToken,
        url,
      });
    },
  );
}
