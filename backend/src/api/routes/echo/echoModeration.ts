import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { requireAuth } from '../../../auth/middleware';
import { ECHO_MSG_NOT_SERVER_MEMBER, sendError } from '../../errors';
import {
  getMergedRolePermissions,
  listEchoAuditLogForServer,
  listEchoModerationHistoryForServer,
  listEchoServerBans,
  isEchoServerOwner,
  type EchoPermission,
} from '../../../domain/echoStore';
import {
  canModerateServer,
  hasServerPermission,
} from '../../../domain/echoPolicy';
import { isMemberOfServer } from '../../../domain/echoPermissions';
import { config } from '../../../config';
import {
  parseDeleteRecentMessagesHours,
  runEchoModerationActionAndBroadcast,
} from '../../../services/echoModerationOps';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

const ECHO_MODERATION_ACTIONS = new Set([
  'ban',
  'kick',
  'timeout',
  'untimeout',
  'unban',
  'warn',
]);

function moderationReadRateLimitKey(req: FastifyRequest): string {
  return req.authUser?.id ? `uid:${req.authUser.id}` : `ip:${req.ip}`;
}

export default async function echoModerationRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.post<{
    Params: { serverId: string };
    Body: {
      action?: string;
      targetUserId?: string;
      meta?: Record<string, unknown>;
    };
  }>(
    '/servers/:serverId/moderation',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const action =
        typeof req.body?.action === 'string' ? req.body.action.trim() : '';
      const targetUserId =
        typeof req.body?.targetUserId === 'string'
          ? req.body.targetUserId.trim()
          : '';
      if (!action || !targetUserId) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'action and targetUserId required',
        );
      }
      if (!ECHO_MODERATION_ACTIONS.has(action)) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Unknown moderation action',
        );
      }
      const requiredPerm: EchoPermission =
        action === 'ban' || action === 'unban'
          ? 'BAN_MEMBERS'
          : action === 'kick'
            ? 'KICK_MEMBERS'
            : 'MODERATE_MEMBERS';

      const mayMod =
        (await isEchoServerOwner(pool, sid, req.authUser!.id)) ||
        (await hasServerPermission(pool, req.authUser!.id, sid, requiredPerm));

      if (!mayMod)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          `You require the ${requiredPerm} permission to perform this action`,
        );
      const meta: Record<string, unknown> =
        req.body?.meta &&
        typeof req.body.meta === 'object' &&
        !Array.isArray(req.body.meta)
          ? (req.body.meta as Record<string, unknown>)
          : {};
      if (action === 'unban') {
        const raw = meta.reason;
        const reasonStr = typeof raw === 'string' ? raw.trim() : '';
        if (!reasonStr) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Unban requires a non-empty reason (meta.reason)',
          );
        }
        meta.reason = reasonStr.slice(0, 500);
      }
      if (action === 'ban') {
        const purgeH = parseDeleteRecentMessagesHours(meta);
        if (purgeH > 0) {
          const canPurge =
            (await isEchoServerOwner(pool, sid, req.authUser!.id)) ||
            (await hasServerPermission(
              pool,
              req.authUser!.id,
              sid,
              'MANAGE_MESSAGES',
            ));
          if (!canPurge) {
            return sendError(
              reply,
              403,
              'FORBIDDEN',
              'MANAGE_MESSAGES permission required to delete message history when banning',
            );
          }
        }
      }
      const r = await runEchoModerationActionAndBroadcast(
        fastify,
        pool,
        sid,
        req.authUser!.id,
        action,
        targetUserId,
        meta,
      );
      if (!r.ok) {
        if (r.code === 'CANNOT_MODERATE_OWNER') {
          return sendError(
            reply,
            400,
            'INVALID_TARGET',
            'Cannot moderate the server owner',
          );
        }
        if (r.code === 'INVALID_TARGET') {
          return sendError(reply, 400, 'INVALID_TARGET', 'Invalid target');
        }
        if (r.code === 'CANNOT_MODERATE_PEER') {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'You cannot moderate this member',
          );
        }
        if (r.code === 'UNKNOWN_ACTION') {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Unknown moderation action',
          );
        }
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Moderation failed');
      }
      return reply.code(204).send();
    },
  );

  fastify.get<{
    Params: { serverId: string };
    Querystring: { limit?: string; actorId?: string };
  }>(
    '/servers/:serverId/audit',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 25,
          timeWindow: '1 minute',
          keyGenerator: moderationReadRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okAudit = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okAudit)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const perms = await getMergedRolePermissions(pool, sid, req.authUser!.id);
      const isOwner = await isEchoServerOwner(pool, sid, req.authUser!.id);
      const maySee =
        isOwner || perms.has('VIEW_AUDIT_LOG') || perms.has('MANAGE_GUILD');

      if (!maySee) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You require the VIEW_AUDIT_LOG permission to see the audit log',
        );
      }
      const limit = Math.min(
        200,
        Math.max(1, parseInt(req.query.limit ?? '50', 10) || 50),
      );
      const actorId =
        typeof req.query.actorId === 'string' ? req.query.actorId.trim() : '';
      const entries = await listEchoAuditLogForServer(
        pool,
        sid,
        limit,
        actorId ? { actorId } : undefined,
      );
      return reply.code(200).send({ entries });
    },
  );

  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/bans',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: moderationReadRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const perms = await getMergedRolePermissions(pool, sid, req.authUser!.id);
      const isOwner = await isEchoServerOwner(pool, sid, req.authUser!.id);
      const maySee =
        isOwner || perms.has('BAN_MEMBERS') || perms.has('MANAGE_GUILD');

      if (!maySee)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You require the BAN_MEMBERS permission to view bans in this server',
        );
      const bans = await listEchoServerBans(pool, sid);
      return reply.code(200).send({ bans });
    },
  );

  fastify.get<{
    Params: { serverId: string };
    Querystring: { limit?: string; targetUserId?: string };
  }>(
    '/servers/:serverId/moderation/history',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 25,
          timeWindow: '1 minute',
          keyGenerator: moderationReadRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const perms = await getMergedRolePermissions(pool, sid, req.authUser!.id);
      const isOwner = await isEchoServerOwner(pool, sid, req.authUser!.id);
      const mayView =
        isOwner ||
        perms.has('VIEW_AUDIT_LOG') ||
        perms.has('MODERATE_MEMBERS') ||
        perms.has('MANAGE_GUILD');

      if (!mayView)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You require MODERATE_MEMBERS or VIEW_AUDIT_LOG to view moderation history',
        );
      const limit = Math.min(
        200,
        Math.max(1, parseInt(req.query.limit ?? '50', 10) || 50),
      );
      const target =
        typeof req.query.targetUserId === 'string'
          ? req.query.targetUserId.trim()
          : '';
      const entries = await listEchoModerationHistoryForServer(
        pool,
        sid,
        limit,
        target || undefined,
      );
      return reply.code(200).send({ entries });
    },
  );
}
