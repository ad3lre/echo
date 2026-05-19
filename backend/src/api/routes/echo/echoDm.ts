import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { requireAuth } from '../../../auth/middleware';
import { sendError } from '../../errors';
import {
  acceptEchoDmMessageRequest,
  addEchoGroupDmMembers,
  createEchoGroupDmThread,
  ECHO_DM_REALM_SERVER_ID,
  getOrCreateEchoDmThread,
  ignoreEchoDmMessageRequest,
  listEchoDmActiveVoiceParticipantUserIdsByChannelId,
  listEchoDmMessageRequestsForUser,
  listEchoDmThreadsForUser,
  searchEchoMessagesInChannels,
  updateEchoGroupDm,
  leaveEchoGroupDm,
  removeEchoGroupDmMember,
  userMayJoinDmLiveKitRoom,
  echoDmVoiceE2eeRequired,
  getActiveVoiceE2eeEpoch,
} from '../../../domain/echoStore';
import { config } from '../../../config';
import { getEchoEntitlements } from '../../../domain/echoPlanEntitlements';
import {
  liveKitRoomName,
  mintJoinToken,
  pfpForLiveKitParticipantMetadata,
} from '../../../services/livekit/livekitAdapter';
import { vcTrace } from '../../../observability/voiceTraceLog';
import { redactAnonymousPollsInEchoMessageRows } from '../../../domain/echoMessagePollRedaction';
import {
  echoDmOpenTotal,
  echoMessageSearchDurationSeconds,
  echoMessageSearchResultCount,
} from '../../../observability/echoMetrics';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

function peerUserIdLogPrefix(peerUserId: string): string {
  const t = peerUserId.trim();
  if (t.length <= 8) return t;
  return `${t.slice(0, 8)}…`;
}

export default async function echoDmRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{ Querystring: { q?: string; limit?: string; before?: string } }>(
    '/dm/messages/search',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const userId = req.authUser!.id;
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (!q)
        return sendError(reply, 400, 'SEARCH_QUERY_REQUIRED', 'Provide q');

      const limit = Math.min(
        50,
        Math.max(1, parseInt(req.query.limit ?? '24', 10) || 24),
      );
      const before =
        typeof req.query.before === 'string'
          ? req.query.before.trim()
          : undefined;

      const threads = await listEchoDmThreadsForUser(pool, userId);
      const channelIds = threads.map((t) => t.channelId);
      if (channelIds.length === 0)
        return reply.code(200).send({ messages: [] });

      const t0 = process.hrtime.bigint();
      try {
        const rows = await searchEchoMessagesInChannels(pool, {
          channelIds,
          q,
          limit,
          before,
        });
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        echoMessageSearchDurationSeconds.labels('dm').observe(ms / 1000);
        echoMessageSearchResultCount.labels('dm').observe(rows.length);
        req.log.info({
          msg: 'echo.rest.dm_messages_search',
          userId,
          durationMs: Math.round(ms),
          resultCount: rows.length,
        });
        return reply.code(200).send({
          messages: redactAnonymousPollsInEchoMessageRows(rows, userId),
        });
      } catch (err) {
        req.log.error({ err }, 'echo.rest.dm_messages_search_failed');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Search failed');
      }
    },
  );

  fastify.post<{ Body: { peerUserId?: string } }>(
    '/dm/open',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const peer =
        typeof req.body?.peerUserId === 'string'
          ? req.body.peerUserId.trim()
          : '';
      if (!peer)
        return sendError(reply, 400, 'INVALID_BODY', 'peerUserId required');
      const r = await getOrCreateEchoDmThread(pool, req.authUser!.id, peer);
      if (!r.ok) {
        if (r.reason === 'self') {
          echoDmOpenTotal.inc({ outcome: 'self' });
          req.log.info({
            msg: 'echo.dm.open',
            outcome: 'self',
            peerUserIdPrefix: peerUserIdLogPrefix(peer),
          });
          return sendError(reply, 400, 'INVALID_BODY', 'Cannot DM yourself');
        }
        if (r.reason === 'unknown_peer') {
          echoDmOpenTotal.inc({ outcome: 'unknown_peer' });
          req.log.info({
            msg: 'echo.dm.open',
            outcome: 'unknown_peer',
            peerUserIdPrefix: peerUserIdLogPrefix(peer),
          });
          return sendError(reply, 404, 'NOT_FOUND', 'User not found');
        }
        if (r.reason === 'blocked') {
          echoDmOpenTotal.inc({ outcome: 'blocked' });
          req.log.info({
            msg: 'echo.dm.open',
            outcome: 'blocked',
            peerUserIdPrefix: peerUserIdLogPrefix(peer),
          });
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'You cannot message this user',
          );
        }
        echoDmOpenTotal.inc({ outcome: 'not_friend' });
        req.log.info({
          msg: 'echo.dm.open',
          outcome: 'not_friend',
          peerUserIdPrefix: peerUserIdLogPrefix(peer),
        });
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You can only message accepted friends or users you share a server with',
        );
      }
      echoDmOpenTotal.inc({ outcome: 'ok' });
      req.log.info({
        msg: 'echo.dm.open',
        outcome: 'ok',
        peerUserIdPrefix: peerUserIdLogPrefix(peer),
        channelId: r.channelId,
      });
      return reply.code(200).send({ channelId: r.channelId, peerUserId: peer });
    },
  );

  fastify.post<{ Body: { memberUserIds?: string[]; name?: string } }>(
    '/dm/group/open',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const raw = req.body?.memberUserIds;
      if (!Array.isArray(raw) || raw.length === 0) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'memberUserIds array required',
        );
      }
      const name = typeof req.body?.name === 'string' ? req.body.name : '';
      const r = await createEchoGroupDmThread(
        pool,
        req.authUser!.id,
        raw.map((x) => String(x)),
        name,
      );
      if (!r.ok) {
        const outcome = r.reason;
        req.log.info({
          msg: 'echo.dm.group_open',
          outcome,
          memberCount: raw.length,
        });
        if (r.reason === 'bad_members')
          return sendError(reply, 400, 'INVALID_BODY', 'Invalid member list');
        if (r.reason === 'too_few')
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Group DM requires at least 3 members',
          );
        if (r.reason === 'too_many') {
          const ent = await getEchoEntitlements(pool, req.authUser!.id);
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            `Group DM allows at most ${ent.groupDmMaxMembers} members for your plan`,
          );
        }
        if (r.reason === 'unknown_peer')
          return sendError(reply, 404, 'NOT_FOUND', 'User not found');
        if (r.reason === 'blocked')
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'You cannot message this group',
          );
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Members must be eligible to DM each other',
        );
      }
      req.log.info({
        msg: 'echo.dm.group_open',
        outcome: 'ok',
        channelId: r.channelId,
      });
      return reply.code(200).send({ channelId: r.channelId });
    },
  );

  fastify.get(
    '/dm/threads',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const threads = await listEchoDmThreadsForUser(pool, req.authUser!.id);
      const activeVoiceParticipantUserIdsByChannelId =
        await listEchoDmActiveVoiceParticipantUserIdsByChannelId(
          pool,
          threads.map((t) => t.channelId),
        );
      return reply.code(200).send({
        threads: threads.map((t) =>
          t.kind === 'group'
            ? {
                channelId: t.channelId,
                kind: 'group' as const,
                name: t.name ?? 'Group',
                memberUserIds: t.memberUserIds ?? [],
                lastActivityId: t.lastActivityId,
                activeCallParticipantUserIds:
                  activeVoiceParticipantUserIdsByChannelId[t.channelId] ?? [],
                ...(t.groupPfp ? { pfp: t.groupPfp } : {}),
              }
            : {
                channelId: t.channelId,
                kind: 'direct' as const,
                peerUserId: t.peerId ?? '',
                lastActivityId: t.lastActivityId,
                activeCallParticipantUserIds:
                  activeVoiceParticipantUserIdsByChannelId[t.channelId] ?? [],
              },
        ),
      });
    },
  );

  /** Dedicated message requests (friend requests are separate social state). */
  fastify.get(
    '/dm/message-requests',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      if (req.authUser?.isGuest) {
        return sendError(
          reply,
          403,
          'UPGRADE_REQUIRED',
          'Add an email and password to use Friends and social features.',
        );
      }
      const pool = echoPool(req);
      const requests = await listEchoDmMessageRequestsForUser(
        pool,
        req.authUser!.id,
      );
      return reply.code(200).send({
        requests,
      });
    },
  );

  fastify.post<{ Params: { requestId: string } }>(
    '/dm/message-requests/:requestId/accept',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      if (req.authUser?.isGuest) {
        return sendError(
          reply,
          403,
          'UPGRADE_REQUIRED',
          'Add an email and password to use Friends and social features.',
        );
      }
      const pool = echoPool(req);
      const requestId = trimEchoPathParam(req.params.requestId);
      if (!requestId) {
        return sendError(reply, 400, 'INVALID_BODY', 'requestId required');
      }
      const out = await acceptEchoDmMessageRequest(
        pool,
        requestId,
        req.authUser!.id,
      );
      if (!out.ok) {
        if (out.reason === 'forbidden') {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'You cannot accept this message request.',
          );
        }
        return sendError(reply, 404, 'NOT_FOUND', 'Message request not found.');
      }
      return reply.code(200).send({
        channelId: out.channelId,
        peerUserId: out.peerUserId,
      });
    },
  );

  fastify.post<{ Params: { requestId: string } }>(
    '/dm/message-requests/:requestId/ignore',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      if (req.authUser?.isGuest) {
        return sendError(
          reply,
          403,
          'UPGRADE_REQUIRED',
          'Add an email and password to use Friends and social features.',
        );
      }
      const pool = echoPool(req);
      const requestId = trimEchoPathParam(req.params.requestId);
      if (!requestId) {
        return sendError(reply, 400, 'INVALID_BODY', 'requestId required');
      }
      const out = await ignoreEchoDmMessageRequest(
        pool,
        requestId,
        req.authUser!.id,
      );
      if (out === 'forbidden') {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot ignore this message request.',
        );
      }
      if (out === 'not_found') {
        return sendError(reply, 404, 'NOT_FOUND', 'Message request not found.');
      }
      return reply.code(204).send();
    },
  );

  fastify.delete<{ Params: { channelId: string; userId: string } }>(
    '/dm/group/:channelId/members/:userId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const targetUserId = trimEchoPathParam(req.params.userId);
      if (!channelId || !targetUserId) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'channelId and userId required',
        );
      }
      const r = await removeEchoGroupDmMember(
        pool,
        req.authUser!.id,
        channelId,
        targetUserId,
      );
      if (r === 'bad_target') {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Cannot remove yourself from the group this way',
        );
      }
      if (r === 'forbidden') {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You are not a member of this group',
        );
      }
      if (r === 'not_found') {
        return sendError(reply, 404, 'NOT_FOUND', 'Member or group not found');
      }
      return reply.code(204).send();
    },
  );

  fastify.post<{ Params: { channelId: string } }>(
    '/dm/group/:channelId/leave',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      if (!channelId) {
        return sendError(reply, 400, 'INVALID_BODY', 'channelId required');
      }
      const r = await leaveEchoGroupDm(pool, req.authUser!.id, channelId);
      if (r === 'forbidden') {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You are not a member of this group',
        );
      }
      if (r === 'not_found') {
        return sendError(reply, 404, 'NOT_FOUND', 'Group not found');
      }
      return reply.code(204).send();
    },
  );

  fastify.post<{
    Params: { channelId: string };
    Body: { memberUserIds?: string[] };
  }>(
    '/dm/group/:channelId/members',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const raw = req.body?.memberUserIds;
      if (!channelId || !Array.isArray(raw) || raw.length === 0) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'channelId and memberUserIds[] required',
        );
      }
      const r = await addEchoGroupDmMembers(
        pool,
        req.authUser!.id,
        channelId,
        raw.map((x) => String(x)),
      );
      if (!r.ok) {
        if (r.reason === 'forbidden') {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'You are not a member of this group',
          );
        }
        if (r.reason === 'not_found') {
          return sendError(reply, 404, 'NOT_FOUND', 'Group not found');
        }
        if (r.reason === 'too_many') {
          const ent = await getEchoEntitlements(pool, req.authUser!.id);
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            `Group DM allows at most ${ent.groupDmMaxMembers} members for your plan`,
          );
        }
        if (r.reason === 'blocked') {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'You cannot add one or more users to this group',
          );
        }
        if (r.reason === 'not_eligible') {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Added users must be eligible to DM existing group members',
          );
        }
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid member list');
      }
      return reply.code(200).send({ addedMemberUserIds: r.addedMemberUserIds });
    },
  );

  fastify.patch<{
    Params: { channelId: string };
    Body: { name?: string; pfp?: string };
  }>(
    '/dm/group/:channelId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const name =
        typeof req.body?.name === 'string' ? req.body.name : undefined;
      const pfp = typeof req.body?.pfp === 'string' ? req.body.pfp : undefined;
      if (name === undefined && pfp === undefined) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'At least one of name or pfp is required',
        );
      }

      const r = await updateEchoGroupDm(pool, req.authUser!.id, channelId, {
        ...(name !== undefined ? { name } : {}),
        ...(pfp !== undefined ? { pfp } : {}),
      });
      if (r === 'forbidden')
        return sendError(reply, 403, 'FORBIDDEN', 'Not a member of this group');
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Group not found');
      if (r === 'invalid_name')
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid group name');
      if (r === 'invalid_pfp') {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'pfp must be a data URL (when uploads are not configured) or an https URL from the configured object store',
        );
      }

      return reply.code(204).send();
    },
  );

  /**
   * Same LiveKit stack as guild voice: room name `echo_dm_realm:<channelId>` (see `liveKitRoomName`).
   * Webhooks update `echo_voice_participants` with server_id = echo_dm_realm.
   */
  fastify.post<{ Params: { channelId: string } }>(
    '/dm/channels/:channelId/voice/livekit-session',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      if (req.authUser?.isGuest) {
        return sendError(
          reply,
          403,
          'UPGRADE_REQUIRED',
          'Add an email and password to use voice calls.',
        );
      }
      if (!config.liveKitEnabled) {
        return sendError(
          reply,
          503,
          'NOT_CONFIGURED',
          'Voice infrastructure is not configured',
        );
      }
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const uid = req.authUser!.id;
      vcTrace(req.log, 'voice.dm_livekit_session:request', {
        channelId,
        userId: uid,
      });
      const ok = await userMayJoinDmLiveKitRoom(pool, channelId, uid);
      if (!ok) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot join a call in this conversation.',
        );
      }
      const voiceE2eeRequired = await echoDmVoiceE2eeRequired(pool, channelId);
      const activeEpoch = await getActiveVoiceE2eeEpoch(
        pool,
        ECHO_DM_REALM_SERVER_ID,
        channelId,
      );
      if (voiceE2eeRequired) {
        if (!activeEpoch) {
          return sendError(
            reply,
            409,
            'VOICE_E2EE_EPOCH_REQUIRED',
            'End-to-end encrypted voice requires a call key. Create an epoch before connecting.',
          );
        }
        const isCreator = activeEpoch.createdByUserId === uid;
        if (!isCreator) {
          const mine = await pool.query(
            `SELECT 1 FROM echo_voice_e2ee_envelopes WHERE epoch_id = $1 AND recipient_user_id = $2 LIMIT 1`,
            [activeEpoch.id, uid],
          );
          if (mine.rows.length === 0) {
            return sendError(
              reply,
              409,
              'VOICE_E2EE_ENVELOPE_MISSING',
              'No encrypted key material for your account. Wait for the call creator or refresh.',
            );
          }
        }
      }
      const roomName = liveKitRoomName(ECHO_DM_REALM_SERVER_ID, channelId);
      const pfpMeta = pfpForLiveKitParticipantMetadata(req.authUser!.pfp ?? '');
      const token = await mintJoinToken({
        identity: uid,
        name: req.authUser!.username ?? uid,
        roomName,
        canPublishMicrophone: true,
        ...(pfpMeta ? { metadata: JSON.stringify({ pfp: pfpMeta }) } : {}),
      });
      vcTrace(req.log, 'voice.dm_livekit_session:ok', { roomName });
      return reply.code(200).send({
        url: config.liveKitPublicUrl,
        token,
        roomName,
        voiceE2ee: {
          required: voiceE2eeRequired,
          epochId: voiceE2eeRequired ? (activeEpoch?.id ?? null) : null,
        },
      });
    },
  );
}
