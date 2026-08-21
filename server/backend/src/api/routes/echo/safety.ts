import rateLimit from '@fastify/rate-limit';
import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
} from 'fastify';
import { requireAuth, getAuthUser } from '../../../auth/middleware';
import { getAccessUserIdFromAuthHeader } from '../../../auth/token';
import {
  blockEchoUser,
  canUserAccessChannel,
  getEchoChannelServerId,
  insertEchoMessageReport,
  insertEchoUserReport,
  listEchoBlockedUserIds,
  unblockEchoUser,
} from '../../../domain/echoStore';
import { selectEchoMessageAuthorDeleted } from '../../../domain/echoMessagesDal';
import { sendSafetyReportSupportEmail } from '../../../services/email/echoSafetyReportEmail';
import { normalizeEchoReportCategory } from '../../../../../../contracts/safetyReports';
import { sendError } from '../../errors';
import { echoPool, requireEchoStore, trimEchoPathParam } from './routeUtils';

function safetyReportReporter(req: FastifyRequest): {
  id: string;
  username: string;
  displayName: string;
  email?: string;
} {
  const user = getAuthUser(req);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    ...(typeof user.email === 'string' && user.email.trim()
      ? { email: user.email.trim() }
      : {}),
  };
}

export default async function echoSafetyRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get(
    '/blocks',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const blockedUserIds = await listEchoBlockedUserIds(
        pool,
        getAuthUser(req).id,
      );
      return reply.code(200).send({ blockedUserIds });
    },
  );

  fastify.post<{ Body: { targetUserId?: string } }>(
    '/blocks',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const target =
        typeof req.body?.targetUserId === 'string'
          ? req.body.targetUserId.trim()
          : '';
      if (!target)
        return sendError(reply, 400, 'INVALID_BODY', 'targetUserId required');
      if (target === getAuthUser(req).id)
        return sendError(reply, 400, 'INVALID_BODY', 'Cannot block yourself');
      const br = await blockEchoUser(pool, getAuthUser(req).id, target);
      if (br === 'user_not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'User not found');
      if (br === 'already_blocked')
        return reply.code(200).send({ alreadyBlocked: true });
      return reply.code(204).send();
    },
  );

  fastify.delete<{ Params: { targetUserId: string } }>(
    '/blocks/:targetUserId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const target = trimEchoPathParam(req.params.targetUserId);
      if (!target)
        return sendError(reply, 400, 'INVALID_BODY', 'targetUserId required');
      if (target === getAuthUser(req).id)
        return sendError(reply, 400, 'INVALID_BODY', 'Cannot unblock yourself');
      const ub = await unblockEchoUser(pool, getAuthUser(req).id, target);
      if (ub === 'target_not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'User not found');
      if (ub === 'not_blocked')
        return sendError(
          reply,
          404,
          'NOT_BLOCKED',
          'You are not blocking that user',
        );
      return reply.code(204).send();
    },
  );

  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 10,
      timeWindow: '1 hour',
      keyGenerator: (req: FastifyRequest) => {
        const uid = getAccessUserIdFromAuthHeader(req.headers.authorization);
        return uid
          ? `echo_safety_report:${uid}`
          : `echo_safety_report:ip:${req.ip}`;
      },
      addHeaders: { 'retry-after': true },
    });

    scope.post<{
      Body: {
        targetUserId?: string;
        reason?: string;
        category?: string;
        messageId?: string;
        channelId?: string;
      };
    }>(
      '/reports/user',
      {
        preHandler: [requireAuth, requireEchoStore],
        config: {
          rateLimit: {
            max: 10,
            timeWindow: '1 hour',
          },
        },
      },
      async (req, reply) => {
        const pool = echoPool(req);
        const target =
          typeof req.body?.targetUserId === 'string'
            ? req.body.targetUserId.trim()
            : '';
        if (!target)
          return sendError(reply, 400, 'INVALID_BODY', 'targetUserId required');
        if (target === getAuthUser(req).id)
          return sendError(reply, 400, 'INVALID_BODY', 'Invalid target');
        const reason =
          typeof req.body?.reason === 'string' ? req.body.reason : '';
        const category = normalizeEchoReportCategory(req.body?.category);
        const messageId =
          typeof req.body?.messageId === 'string'
            ? req.body.messageId.trim()
            : '';
        const channelId =
          typeof req.body?.channelId === 'string'
            ? req.body.channelId.trim()
            : '';

        const peer = await pool.query(
          `SELECT 1 FROM auth_users WHERE id = $1`,
          [target],
        );
        if (peer.rows.length === 0)
          return sendError(reply, 404, 'NOT_FOUND', 'User not found');

        if (messageId) {
          if (!channelId) {
            return sendError(
              reply,
              400,
              'INVALID_BODY',
              'channelId required when messageId is set',
            );
          }
          if (
            !(await canUserAccessChannel(pool, getAuthUser(req).id, channelId))
          ) {
            return sendError(reply, 403, 'FORBIDDEN', 'Cannot access channel');
          }
          const meta = await selectEchoMessageAuthorDeleted(
            pool,
            channelId,
            messageId,
          );
          if (!meta)
            return sendError(reply, 404, 'NOT_FOUND', 'Message not found');
          if (meta.authorId !== target) {
            return sendError(
              reply,
              400,
              'INVALID_BODY',
              'Message author does not match target user',
            );
          }
        }

        const serverId = channelId
          ? await getEchoChannelServerId(pool, channelId)
          : null;

        const result = await insertEchoUserReport(pool, getAuthUser(req).id, {
          targetId: target,
          reason,
          category,
          ...(messageId ? { messageId } : {}),
          ...(channelId ? { channelId } : {}),
          serverId,
        });

        if (result.inserted) {
          req.log.info(
            {
              echoUserReportId: result.id,
              reporterId: getAuthUser(req).id,
              targetUserId: target,
            },
            'echo_user_report_submitted',
          );
          void sendSafetyReportSupportEmail(req.log, {
            kind: 'user',
            id: result.id,
            category,
            reason: reason.trim() || '(no details)',
            targetUserId: target,
            ...(messageId ? { messageId } : {}),
            ...(channelId ? { channelId } : {}),
            serverId,
            reporter: safetyReportReporter(req),
          });
        }

        return reply.code(204).send();
      },
    );

    scope.post<{
      Body: {
        messageId?: string;
        channelId?: string;
        reason?: string;
        category?: string;
      };
    }>(
      '/reports/message',
      {
        preHandler: [requireAuth, requireEchoStore],
        config: {
          rateLimit: {
            max: 10,
            timeWindow: '1 hour',
          },
        },
      },
      async (req, reply) => {
        const pool = echoPool(req);
        const messageId =
          typeof req.body?.messageId === 'string'
            ? req.body.messageId.trim()
            : '';
        const channelId =
          typeof req.body?.channelId === 'string'
            ? req.body.channelId.trim()
            : '';
        if (!messageId || !channelId) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'messageId and channelId required',
          );
        }
        const reason =
          typeof req.body?.reason === 'string' ? req.body.reason : '';
        const category = normalizeEchoReportCategory(req.body?.category);

        const result = await insertEchoMessageReport(
          pool,
          getAuthUser(req).id,
          {
            messageId,
            channelId,
            reason,
            category,
          },
        );

        if ('error' in result) {
          if (result.error === 'not_found')
            return sendError(reply, 404, 'NOT_FOUND', 'Message not found');
          if (result.error === 'forbidden')
            return sendError(reply, 403, 'FORBIDDEN', 'Cannot access channel');
          if (result.error === 'self_report')
            return sendError(
              reply,
              400,
              'INVALID_BODY',
              'Cannot report your own message',
            );
        }

        if (result.inserted) {
          const row = await pool.query(
            `
            SELECT author_id, content_snapshot, server_id
            FROM echo_message_reports
            WHERE id = $1
            `,
            [result.id],
          );
          const authorId = String(row.rows[0]?.author_id ?? '');
          const contentSnapshot = String(row.rows[0]?.content_snapshot ?? '');
          const serverId =
            row.rows[0]?.server_id != null
              ? String(row.rows[0].server_id)
              : null;

          req.log.info(
            {
              echoMessageReportId: result.id,
              reporterId: getAuthUser(req).id,
              messageId,
              channelId,
            },
            'echo_message_report_submitted',
          );
          void sendSafetyReportSupportEmail(req.log, {
            kind: 'message',
            id: result.id,
            category,
            reason: reason.trim() || '(no details)',
            messageId,
            channelId,
            serverId,
            authorId,
            contentSnapshot,
            reporter: safetyReportReporter(req),
          });
        }

        return reply.code(204).send();
      },
    );
  });
}
