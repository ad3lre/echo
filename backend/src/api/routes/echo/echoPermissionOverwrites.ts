import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { getAuthUser, requireAuth } from '../../../auth/middleware';
import { ECHO_MSG_NOT_SERVER_MEMBER, sendError } from '../../errors';
import {
  getEchoChannelServerId,
  getMergedRolePermissions,
  insertEchoAudit,
  listEchoChannelPermissionOverwrites,
  replaceEchoChannelPermissionOverwrites,
} from '../../../domain/echoStore';
import { evaluatePermissionSet } from '../../../domain/echoPermissionEvaluate';
import { composePermissionExplanation } from '../../../domain/permissionExplanation';
import { isMemberOfServer } from '../../../domain/echoPermissions';
import { publishEchoWorkspaceEvent } from '../../../platform/echoPlatformEvents';
import { evictAllUsersFromEchoChannelRealtimeScope } from '../../../platform/echoRealtimeMembership';
import { ECHO_ADMIN_MUTATION_RATE_LIMIT } from './echoMutationRateLimits';
import {
  echoPool,
  parsePermissionOverwriteRowsBody,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

export default async function echoPermissionOverwritesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  function permissionExplainRateLimitKey(req: FastifyRequest): string {
    return req.authUser?.id ? `uid:${req.authUser.id}` : `ip:${req.ip}`;
  }

  fastify.get<{ Params: { channelId: string } }>(
    '/channels/:channelId/permission-overwrites',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const sid = await getEchoChannelServerId(pool, channelId);
      if (!sid) return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');
      const okMem = await isMemberOfServer(pool, sid, getAuthUser(req).id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const gate = await getMergedRolePermissions(
        pool,
        sid,
        getAuthUser(req).id,
      );
      if (!gate.has('MANAGE_ROLES') && !gate.has('MANAGE_GUILD')) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot view channel permission overwrites',
        );
      }
      const rows = await listEchoChannelPermissionOverwrites(
        pool,
        sid,
        channelId,
      );
      return reply.code(200).send({ rows });
    },
  );

  fastify.put<{ Params: { channelId: string }; Body: { rows?: unknown } }>(
    '/channels/:channelId/permission-overwrites',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: { rateLimit: ECHO_ADMIN_MUTATION_RATE_LIMIT },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const sid = await getEchoChannelServerId(pool, channelId);
      if (!sid) return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');
      const okMem = await isMemberOfServer(pool, sid, getAuthUser(req).id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const parsed = parsePermissionOverwriteRowsBody(req.body?.rows);
      if (parsed === undefined)
        return sendError(reply, 400, 'INVALID_BODY', 'rows must be an array');
      let r: Awaited<ReturnType<typeof replaceEchoChannelPermissionOverwrites>>;
      try {
        r = await replaceEchoChannelPermissionOverwrites(
          pool,
          sid,
          getAuthUser(req).id,
          channelId,
          parsed,
        );
      } catch {
        return sendError(
          reply,
          500,
          'SERVER_ERROR',
          'Failed to save permission overwrites',
        );
      }
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot edit channel permissions',
        );
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');
      if (r === 'invalid_body')
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid overwrites');
      evictAllUsersFromEchoChannelRealtimeScope(fastify, channelId);
      const auditId = await insertEchoAudit(
        pool,
        sid,
        getAuthUser(req).id,
        'channel.permission_overwrites',
        'channel',
        channelId,
        {
          rowCount: parsed.length,
        },
      );
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'permission_invalidated', version: auditId, serverId: sid },
        { serverId: sid },
      );
      return reply.code(204).send();
    },
  );

  fastify.get<{
    Params: { serverId: string };
    Querystring: {
      channelId?: string;
      traceMode?: string;
      targetUserId?: string;
    };
  }>(
    '/servers/:serverId/permission-explain',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
          keyGenerator: permissionExplainRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, getAuthUser(req).id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const gate = await getMergedRolePermissions(
        pool,
        sid,
        getAuthUser(req).id,
      );
      if (!gate.has('MANAGE_ROLES') && !gate.has('MANAGE_GUILD')) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not allowed to inspect permission explanations',
        );
      }
      const channelIdRaw = req.query.channelId;
      const channelId =
        typeof channelIdRaw === 'string' && channelIdRaw.trim()
          ? channelIdRaw.trim()
          : undefined;
      const traceMode = req.query.traceMode === 'full' ? 'full' : 'compressed';
      const targetUserRaw = req.query.targetUserId;
      const targetUserId =
        typeof targetUserRaw === 'string' && targetUserRaw.trim()
          ? targetUserRaw.trim()
          : getAuthUser(req).id;
      const { effective, ownerBypass, traces } = await evaluatePermissionSet(
        pool,
        sid,
        targetUserId,
        channelId,
        {
          traceMode,
        },
      );
      const explanation = composePermissionExplanation(traces);
      return reply.code(200).send({
        effective: [...effective].sort(),
        ownerBypass,
        explanation,
        traces,
      });
    },
  );
}
