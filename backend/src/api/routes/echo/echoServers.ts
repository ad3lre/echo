import {
  FastifyInstance,
  FastifyPluginOptions,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import { sendError } from '../../errors';
import { getAuthUser, requireAuth } from '../../../auth/middleware';
import {
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
} from '../../../auth/serverSession';
import { assertEchoUserHasServerMembershipSlot } from '../../../domain/echoPlanEntitlements';
import {
  createEchoServer,
  insertEchoAudit,
  joinEchoServerFromDirectory,
  listEchoServersForUser,
  listEchoWorkspaceForUser,
  removeEchoServerMember,
  shouldBlockEchoJoinForPendingApplication,
  type EchoWorkspaceMemberDetail,
} from '../../../domain/echoStore';
import { publishEchoWorkspaceEvent } from '../../../platform/echoPlatformEvents';
import { evictUserFromEchoServerRealtimeScopes } from '../../../platform/echoRealtimeMembership';
import { config } from '../../../config';
import {
  liveKitRoomName,
  removeLiveKitParticipant,
} from '../../../services/livekit/livekitAdapter';
import { validateEchoStoredBrandingUrl } from '../../../services/storedMediaUrl';
import { authUserOrIpRateLimitKey } from '../../rateLimitKeys';
import { ensureOfficialEchoServerMembership } from '../../../services/auth/officialEchoServerOnSignup';
import {
  isUserAlreadyInOfficialEchoServer,
  markOfficialEchoServerMembershipChecked,
  shouldSkipOfficialEchoServerMembershipBackfill,
} from '../../../services/auth/officialEchoServerMembershipCache';
import { resolveOfficialEchoServerId } from '../../../domain/echoStore';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';
import { clientIpFromFastifyRequest } from '../../../net/clientIp';

function guestServerExploreForbidden(reply: Parameters<typeof sendError>[0]) {
  return sendError(
    reply,
    403,
    'UPGRADE_REQUIRED',
    'Create an account with email to create servers or join more from Explore.',
  );
}

function parseWorkspaceMemberDetailQuery(
  query: Record<string, unknown> | undefined,
): EchoWorkspaceMemberDetail {
  const raw = query?.memberDetail;
  if (typeof raw === 'string' && raw.trim().toLowerCase() === 'roster') {
    return 'roster';
  }
  return 'full';
}

function workspaceReadRateLimitKey(req: FastifyRequest): string {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const sid = String(
    cookies?.[SESSION_COOKIE] ?? cookies?.[LEGACY_SESSION_COOKIE] ?? '',
  ).trim();
  if (sid) return `sid:${sid}`;
  if (req.authUser?.id) return `uid:${req.authUser.id}`;
  return `ip:${req.ip}`;
}

export default async function echoServersRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get(
    '/servers',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const servers = await listEchoServersForUser(pool, getAuthUser(req).id);
      return reply.code(200).send({ servers });
    },
  );

  /** Bootstrap: joined servers + full category/channel trees in minimal DB round trips. */
  fastify.get<{ Querystring: { memberDetail?: string } }>(
    '/workspace',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          // This endpoint is heavy (workspace bootstrap); keep a tighter budget.
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: workspaceReadRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const userId = getAuthUser(req).id;
      try {
        const officialId = await resolveOfficialEchoServerId(pool);
        if (officialId) {
          if (shouldSkipOfficialEchoServerMembershipBackfill(userId)) {
            /* cached */
          } else if (
            await isUserAlreadyInOfficialEchoServer(pool, userId, officialId)
          ) {
            markOfficialEchoServerMembershipChecked(userId);
          } else {
            await ensureOfficialEchoServerMembership(pool, userId);
          }
        }
      } catch (err) {
        req.log.warn(
          { err, userId },
          'official_echo_server_workspace_backfill_failed',
        );
      }
      const memberDetail = parseWorkspaceMemberDetailQuery(req.query);
      const {
        servers,
        categoriesByServer,
        membersByServer,
        workspaceVersion,
        upcomingEventsByServerId,
        myEventRsvps,
      } = await listEchoWorkspaceForUser(pool, userId, { memberDetail });
      return reply.code(200).send({
        servers,
        categoriesByServer,
        membersByServer,
        workspaceVersion,
        upcomingEventsByServerId,
        myEventRsvps,
      });
    },
  );

  fastify.post<{ Body: { name?: string; iconUrl?: string } }>(
    '/servers',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 8,
          timeWindow: '1 hour',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const name =
        typeof req.body?.name === 'string' ? req.body.name : 'New Server';
      const rawIcon =
        typeof req.body?.iconUrl === 'string' ? req.body.iconUrl.trim() : '';
      let iconUrl = '';
      if (rawIcon) {
        const v = validateEchoStoredBrandingUrl(rawIcon);
        if (!v.ok) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'iconUrl must be empty, a data URL (when uploads are not configured), or an https URL from the configured object store',
          );
        }
        iconUrl = v.value;
      }
      const slot = await assertEchoUserHasServerMembershipSlot(
        pool,
        getAuthUser(req).id,
      );
      if (!slot.ok) {
        return sendError(
          reply,
          403,
          'PLAN_SERVER_LIMIT',
          `You can join at most ${slot.max} servers on Echo (free). Leave a server or upgrade to Echo+ to add more.`,
          `current=${slot.current}`,
        );
      }
      const { serverId, defaultChannelId } = await createEchoServer(
        pool,
        getAuthUser(req).id,
        name,
        iconUrl,
      );
      const auditId = await insertEchoAudit(
        pool,
        serverId,
        getAuthUser(req).id,
        'server.create',
        'server',
        serverId,
        {},
      );
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'workspace_invalidated',
          version: auditId,
          serverId,
          userId: getAuthUser(req).id,
        },
        { serverId, userId: getAuthUser(req).id },
      );
      return reply.code(201).send({ serverId, defaultChannelId });
    },
  );

  /** Join via Explore directory (server must be `listed_in_directory`). */
  const postJoinFromExploreDirectory = async (
    req: FastifyRequest<{ Params: { serverId: string } }>,
    reply: FastifyReply,
  ) => {
    const pool = echoPool(req);
    const sid = trimEchoPathParam(req.params.serverId);
    const block = await shouldBlockEchoJoinForPendingApplication(
      pool,
      sid,
      getAuthUser(req).id,
      false,
    );
    if (block) {
      return reply.code(409).send({
        code: 'APPLICATION_REQUIRED',
        message:
          'This server requires an application before you can join. Complete the form to join the waitlist.',
        detail: 'APPLICATION_REQUIRED',
        serverId: sid,
        source: 'directory' as const,
      });
    }
    const r = await joinEchoServerFromDirectory(
      pool,
      sid,
      getAuthUser(req).id,
      clientIpFromFastifyRequest(req),
      {
        isGuest: Boolean(req.authUser?.isGuest),
        io: fastify.io,
        log: req.log,
      },
    );
    if (!r.ok) {
      if (r.reason === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Server not found');
      if (r.reason === 'guest_join_forbidden') {
        return guestServerExploreForbidden(reply);
      }
      if (r.reason === 'email_verification_required') {
        return sendError(
          reply,
          403,
          'EMAIL_VERIFICATION_REQUIRED',
          'Verify your email before joining this server.',
        );
      }
      if (r.reason === 'not_listed') {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'This server is not joinable from Explore',
        );
      }
      if (r.reason === 'server_limit') {
        return sendError(
          reply,
          403,
          'PLAN_SERVER_LIMIT',
          'You have reached the maximum number of servers for your plan. Leave a server or upgrade to Echo+.',
        );
      }
      if (r.reason === 'raid_protection') {
        return sendError(
          reply,
          429,
          'RAID_PROTECTION_ACTIVE',
          'This server is temporarily protected from burst joins. Please try again shortly.',
        );
      }
      if (r.reason === 'banned') {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You are banned from this server',
          'BANNED_FROM_SERVER',
        );
      }
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'You are banned from this server',
      );
    }
    if (!r.alreadyMember && r.joinAuditId) {
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'membership_changed',
          version: r.joinAuditId,
          serverId: sid,
          userId: getAuthUser(req).id,
        },
        { serverId: sid, userId: getAuthUser(req).id },
      );
    }
    return reply
      .code(200)
      .send({ serverId: r.serverId, alreadyMember: r.alreadyMember });
  };

  fastify.post<{ Params: { serverId: string } }>(
    '/servers/:serverId/join-directory',
    { preHandler: [requireAuth, requireEchoStore] },
    postJoinFromExploreDirectory,
  );
  /** Legacy/clients alias; same rules as `join-directory` (directory-listed servers only). */
  fastify.post<{ Params: { serverId: string } }>(
    '/servers/:serverId/join',
    { preHandler: [requireAuth, requireEchoStore] },
    postJoinFromExploreDirectory,
  );

  /** Voluntary leave (non-owners only; transfer ownership first if you own the server). */
  fastify.post<{ Params: { serverId: string } }>(
    '/servers/:serverId/leave',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const userId = getAuthUser(req).id;

      const server = await pool.query(
        `SELECT id, owner_id FROM echo_servers WHERE id = $1`,
        [sid],
      );
      if (!server.rows[0]) {
        return sendError(reply, 404, 'NOT_FOUND', 'Server not found');
      }
      if (String(server.rows[0].owner_id) === userId) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Transfer server ownership before leaving.',
          'OWNER_CANNOT_LEAVE',
        );
      }
      const mem = await pool.query(
        `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
        [sid, userId],
      );
      if (mem.rows.length === 0) {
        return sendError(
          reply,
          404,
          'NOT_FOUND',
          'You are not a member of this server.',
        );
      }

      let liveKitVoiceChannelId: string | null = null;
      if (config.liveKitEnabled) {
        const vp = await pool.query(
          `SELECT channel_id FROM echo_voice_participants WHERE server_id = $1 AND user_id = $2`,
          [sid, userId],
        );
        const channelId = vp.rows[0]?.channel_id;
        if (channelId != null) liveKitVoiceChannelId = String(channelId);
      }

      await removeEchoServerMember(pool, sid, userId);

      await evictUserFromEchoServerRealtimeScopes(fastify, pool, {
        serverId: sid,
        userId,
      });
      if (config.liveKitEnabled && liveKitVoiceChannelId) {
        try {
          await removeLiveKitParticipant(
            liveKitRoomName(sid, liveKitVoiceChannelId),
            userId,
          );
        } catch (e) {
          req.log.warn(
            { err: e, serverId: sid, userId, liveKitVoiceChannelId },
            'Failed to remove Echo member from LiveKit after self-leave',
          );
        }
      }

      const auditId = await insertEchoAudit(
        pool,
        sid,
        userId,
        'member.leave',
        'user',
        userId,
        {},
      );
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'membership_changed',
          version: auditId,
          serverId: sid,
          userId,
        },
        { serverId: sid, userId },
      );
      return reply.code(200).send({ ok: true });
    },
  );
}
