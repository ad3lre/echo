import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getAuthUser, requireAuth } from '../../../auth/middleware';
import { sendError } from '../../errors';
import { nextEchoSnowflakeId } from '../../../domain/echoSnowflake';
import {
  applyPresenceSignal,
  buildPresenceClientMap,
  buildPresenceMap,
} from '../../../domain/echoPresenceAuthority';
import {
  ECHO_PRESENCE_BATCH_MAX_USER_IDS,
  canViewEchoPeerSocialGraph,
  echoPeerProfileVisibleToViewer,
  filterVisibleEchoUserIds,
  getEchoPresenceRows,
  getEchoPresenceWithLastOnline,
  getEchoUserPublicProfileRow,
  listEchoFriends,
  listEchoMutualFriendPeerIds,
  listEchoPendingFriendRequestsIncoming,
  listEchoPendingFriendRequestsOutgoing,
} from '../../../domain/echoStore';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';
import {
  publishFriendRequestsChanged,
  updateEchoPresenceAndBroadcast,
  addEchoFriendRequestAndBroadcast,
  acceptEchoFriendshipAndBroadcast,
  declineEchoFriendRequestAndBroadcast,
  cancelEchoFriendRequestAndBroadcast,
  removeEchoFriendshipAndBroadcast,
} from '../../../services/echoSocialOps';

function guestFriendsForbidden(reply: Parameters<typeof sendError>[0]) {
  return sendError(
    reply,
    403,
    'UPGRADE_REQUIRED',
    'Add an email and password to use Friends and social features.',
  );
}

export default async function echoSocialRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{ Params: { userId: string } }>(
    '/users/:userId/profile',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const target = trimEchoPathParam(req.params.userId);
      if (!target) {
        return sendError(reply, 400, 'INVALID_BODY', 'userId required');
      }
      const viewerId = getAuthUser(req).id;
      const allowed = await echoPeerProfileVisibleToViewer(
        pool,
        viewerId,
        target,
      );
      if (!allowed) {
        return sendError(reply, 404, 'NOT_FOUND', 'User not found');
      }
      const profile = await getEchoUserPublicProfileRow(pool, target);
      if (!profile) {
        return sendError(reply, 404, 'NOT_FOUND', 'User not found');
      }
      return reply.code(200).send(profile);
    },
  );

  fastify.get(
    '/friends',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      if (req.authUser?.isGuest) return guestFriendsForbidden(reply);
      const pool = echoPool(req);
      const friends = await listEchoFriends(pool, getAuthUser(req).id);
      return reply.code(200).send({ friends });
    },
  );

  fastify.post<{ Body: { peerId?: string } }>(
    '/friends/request',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      if (req.authUser?.isGuest) return guestFriendsForbidden(reply);
      const pool = echoPool(req);
      const peerId =
        typeof req.body?.peerId === 'string' ? req.body.peerId.trim() : '';
      if (!peerId)
        return sendError(reply, 400, 'INVALID_BODY', 'peerId required');
      if (peerId === getAuthUser(req).id)
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Cannot send a friend request to yourself',
        );
      const peerRow = await pool.query<{ is_guest: boolean }>(
        `SELECT COALESCE(is_guest, false) AS is_guest FROM auth_users WHERE id = $1 LIMIT 1`,
        [peerId],
      );
      if (peerRow.rows.length === 0) {
        return sendError(reply, 404, 'NOT_FOUND', 'User not found');
      }
      if (peerRow.rows[0]!.is_guest) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Guest accounts cannot be added as friends.',
        );
      }
      const fr = await addEchoFriendRequestAndBroadcast(
        fastify,
        pool,
        getAuthUser(req).id,
        peerId,
      );
      if (fr === 'blocked')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot send a friend request to this user.',
        );
      if (fr === 'already_related')
        return sendError(
          reply,
          409,
          'CONFLICT',
          'Already friends or an outstanding friend request exists.',
        );
      return reply.code(204).send();
    },
  );

  fastify.post<{ Body: { peerId?: string } }>(
    '/friends/accept',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      if (req.authUser?.isGuest) return guestFriendsForbidden(reply);
      const pool = echoPool(req);
      const peerId =
        typeof req.body?.peerId === 'string' ? req.body.peerId.trim() : '';
      if (!peerId)
        return sendError(reply, 400, 'INVALID_BODY', 'peerId required');
      const ok = await acceptEchoFriendshipAndBroadcast(
        fastify,
        pool,
        getAuthUser(req).id,
        peerId,
      );
      if (!ok)
        return sendError(
          reply,
          404,
          'NOT_FOUND',
          'No pending friend request from that user',
        );
      return reply.code(204).send();
    },
  );

  fastify.get(
    '/friends/requests',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      if (req.authUser?.isGuest) return guestFriendsForbidden(reply);
      const pool = echoPool(req);
      const uid = getAuthUser(req).id;
      const [incoming, outgoing] = await Promise.all([
        listEchoPendingFriendRequestsIncoming(pool, uid),
        listEchoPendingFriendRequestsOutgoing(pool, uid),
      ]);
      return reply.code(200).send({
        incoming: incoming.map((r) => ({ id: r.id, fromUserId: r.fromUserId })),
        outgoing: outgoing.map((r) => ({ id: r.id, toUserId: r.toUserId })),
      });
    },
  );

  fastify.post<{ Body: { peerId?: string } }>(
    '/friends/decline',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      if (req.authUser?.isGuest) return guestFriendsForbidden(reply);
      const pool = echoPool(req);
      const peerId =
        typeof req.body?.peerId === 'string' ? req.body.peerId.trim() : '';
      if (!peerId)
        return sendError(reply, 400, 'INVALID_BODY', 'peerId required');
      const ok = await declineEchoFriendRequestAndBroadcast(
        fastify,
        pool,
        getAuthUser(req).id,
        peerId,
      );
      if (!ok)
        return sendError(
          reply,
          404,
          'NOT_FOUND',
          'No pending request from that user',
        );
      return reply.code(204).send();
    },
  );

  fastify.post<{ Body: { peerId?: string } }>(
    '/friends/cancel',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      if (req.authUser?.isGuest) return guestFriendsForbidden(reply);
      const pool = echoPool(req);
      const peerId =
        typeof req.body?.peerId === 'string' ? req.body.peerId.trim() : '';
      if (!peerId)
        return sendError(reply, 400, 'INVALID_BODY', 'peerId required');
      const ok = await cancelEchoFriendRequestAndBroadcast(
        fastify,
        pool,
        getAuthUser(req).id,
        peerId,
      );
      if (!ok)
        return sendError(
          reply,
          404,
          'NOT_FOUND',
          'No pending outgoing request to that user',
        );
      return reply.code(204).send();
    },
  );

  fastify.post<{ Body: { peerId?: string } }>(
    '/friends/remove',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      if (req.authUser?.isGuest) return guestFriendsForbidden(reply);
      const pool = echoPool(req);
      const peerId =
        typeof req.body?.peerId === 'string' ? req.body.peerId.trim() : '';
      if (!peerId)
        return sendError(reply, 400, 'INVALID_BODY', 'peerId required');
      if (peerId === getAuthUser(req).id)
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Cannot remove friendship with yourself',
        );
      const ok = await removeEchoFriendshipAndBroadcast(
        fastify,
        pool,
        getAuthUser(req).id,
        peerId,
      );
      if (!ok)
        return sendError(
          reply,
          404,
          'NOT_FOUND',
          'No accepted friendship with that user',
        );
      return reply.code(204).send();
    },
  );

  fastify.get<{ Querystring: { peerId?: string } }>(
    '/friends/mutual',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      if (req.authUser?.isGuest) return guestFriendsForbidden(reply);
      const pool = echoPool(req);
      const peerId =
        typeof req.query.peerId === 'string' ? req.query.peerId.trim() : '';
      if (!peerId)
        return sendError(reply, 400, 'INVALID_QUERY', 'peerId required');
      if (peerId === getAuthUser(req).id)
        return reply.code(200).send({ userIds: [] as string[] });
      const canView = await canViewEchoPeerSocialGraph(
        pool,
        getAuthUser(req).id,
        peerId,
      );
      if (!canView) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You can only inspect mutual friends for yourself, accepted friends, or users who share a server with you',
        );
      }
      const userIds = await listEchoMutualFriendPeerIds(
        pool,
        getAuthUser(req).id,
        peerId,
      );
      return reply.code(200).send({ userIds });
    },
  );

  fastify.post<{ Body: { status?: string; client?: string } }>(
    '/presence',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const next = applyPresenceSignal(undefined, {
        source: 'http',
        status: req.body?.status,
        occurredAtMs: Date.now(),
      });
      if (!next)
        return sendError(reply, 400, 'INVALID_STATUS', 'Invalid status');
      const activeClient = req.body?.client === 'mobile' ? 'mobile' : 'web';
      await updateEchoPresenceAndBroadcast(
        fastify,
        pool,
        getAuthUser(req).id,
        next.status,
        activeClient,
      );
      return reply.code(204).send();
    },
  );

  fastify.get<{ Querystring: { ids?: string } }>(
    '/presence',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const raw = req.query.ids ?? '';
      const userIds = [
        ...new Set(
          raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ];
      if (userIds.length > ECHO_PRESENCE_BATCH_MAX_USER_IDS) {
        return sendError(
          reply,
          400,
          'INVALID_QUERY',
          `At most ${ECHO_PRESENCE_BATCH_MAX_USER_IDS} user ids per request`,
        );
      }
      const visibleUserIds = await filterVisibleEchoUserIds(
        pool,
        getAuthUser(req).id,
        userIds,
      );
      const rows = await getEchoPresenceWithLastOnline(pool, visibleUserIds);
      const authorityRows = rows.map((r) => ({
        userId: r.userId,
        status: r.status,
        activeClient: r.activeClient,
      }));
      const map = buildPresenceMap(authorityRows, visibleUserIds);
      const presenceClient = buildPresenceClientMap(
        authorityRows,
        visibleUserIds,
      );
      // Build lastOnlineAt map only for users who have enabled showing it
      const lastOnlineAt: Record<string, string> = {};
      for (const row of rows) {
        if (row.lastOnlineAt) {
          lastOnlineAt[row.userId] = row.lastOnlineAt;
        }
      }
      const payload: {
        presence: typeof map;
        presenceClient?: Record<string, 'mobile'>;
        lastOnlineAt?: Record<string, string>;
      } = { presence: map };
      if (Object.keys(presenceClient).length > 0) {
        payload.presenceClient = presenceClient;
      }
      if (Object.keys(lastOnlineAt).length > 0) {
        payload.lastOnlineAt = lastOnlineAt;
      }
      return reply.code(200).send(payload);
    },
  );
}
