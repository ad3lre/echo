import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { requireAuth } from '../../../auth/middleware';
import { config } from '../../../config';
import { ECHO_MSG_NOT_SERVER_MEMBER, sendError } from '../../errors';
import {
  getEchoInvitePreview,
  joinEchoServerFromInvite,
  getEchoServerVanityCode,
  resolveEchoInviteTarget,
} from '../../../domain/echoStore';
import {
  canUserCreateInvite,
  isMemberOfServer,
} from '../../../domain/echoPermissions';
import { clientIpFromFastifyRequest } from '../../../net/clientIp';
import { publishEchoWorkspaceEvent } from '../../../platform/echoPlatformEvents';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';
import {
  buildEchoInviteShareHtml,
  buildEchoInviteShareNotFoundHtml,
} from '../../../services/echoInviteSharePage';

export default async function echoInvitesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  /**
   * Read-only: current vanity segment for building share links. Any member may call; does not create audit rows.
   * (POST /invites remains for flows that require `canUserCreateInvite`.)
   */
  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/invite-link',
    { preHandler: [requireAuth, requireEchoStore] },
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
      const rawVc = await getEchoServerVanityCode(pool, sid);
      const appBase = config.echoAppPublicUrl.replace(/\/$/, '');
      const enc = rawVc ? encodeURIComponent(rawVc) : '';
      const inviteUrl = rawVc ? `${appBase}/${enc}` : '';
      return reply.code(200).send({
        vanityCode: rawVc,
        inviteUrl,
      });
    },
  );

  fastify.post<{ Params: { serverId: string } }>(
    '/servers/:serverId/invites',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okInv = await canUserCreateInvite(pool, sid, req.authUser!.id);
      if (!okInv)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Cannot create invites in this server',
        );
      const rawVc = await getEchoServerVanityCode(pool, sid);
      if (!rawVc) {
        return sendError(
          reply,
          400,
          'VANITY_REQUIRED',
          'Set a vanity URL in server settings before sharing an invite link',
        );
      }
      const appBase = config.echoAppPublicUrl.replace(/\/$/, '');
      const enc = encodeURIComponent(rawVc);
      const inviteUrl = `${appBase}/${enc}`;
      return reply.code(201).send({ vanityCode: rawVc, inviteUrl });
    },
  );

  /** Public: server name / icon / banner for in-chat invite embeds (no auth). */
  await fastify.register(async (previewScope) => {
    await previewScope.register(rateLimit, {
      max: 60,
      timeWindow: '1 minute',
      keyGenerator: (req) => `invite_preview:${req.ip}`,
      addHeaders: { 'retry-after': true },
    });
    previewScope.get<{
      Params: { code: string };
      Querystring: { voice?: string };
    }>(
      '/invites/:code/preview',
      { preHandler: [requireEchoStore] },
      async (req, reply) => {
        const pool = echoPool(req);
        const code = trimEchoPathParam(
          typeof req.params.code === 'string' ? req.params.code : '',
        );
        const voiceRaw =
          typeof req.query.voice === 'string' ? req.query.voice.trim() : '';
        const preview = await getEchoInvitePreview(
          pool,
          code,
          voiceRaw || undefined,
        );
        if (!preview)
          return sendError(reply, 404, 'NOT_FOUND', 'Invalid invite');
        return reply.code(200).send(preview);
      },
    );

    previewScope.get<{
      Params: { code: string };
      Querystring: { voice?: string };
    }>(
      '/invites/:code/share',
      { preHandler: [requireEchoStore] },
      async (req, reply) => {
        const pool = echoPool(req);
        const code = trimEchoPathParam(
          typeof req.params.code === 'string' ? req.params.code : '',
        );
        const voiceRaw =
          typeof req.query.voice === 'string' ? req.query.voice.trim() : '';
        const voiceQueryFor404 = voiceRaw
          ? `?voice=${encodeURIComponent(voiceRaw)}`
          : '';
        const preview = await getEchoInvitePreview(
          pool,
          code,
          voiceRaw || undefined,
        );
        if (!preview) {
          const html = buildEchoInviteShareNotFoundHtml({
            canonicalAppBase: config.echoAppPublicUrl,
            socialRequestPath: `/${code}${voiceQueryFor404}`,
          });
          return reply
            .header('content-type', 'text/html; charset=utf-8')
            .header('cache-control', 'public, max-age=120')
            .code(404)
            .send(html);
        }
        const target = await resolveEchoInviteTarget(pool, code);
        if (!target) {
          const html = buildEchoInviteShareNotFoundHtml({
            canonicalAppBase: config.echoAppPublicUrl,
            socialRequestPath: `/${code}${voiceQueryFor404}`,
          });
          return reply
            .header('content-type', 'text/html; charset=utf-8')
            .header('cache-control', 'public, max-age=120')
            .code(404)
            .send(html);
        }
        const rawVc = (
          await getEchoServerVanityCode(pool, target.serverId)
        ).trim();
        const landingVoiceQ =
          voiceRaw && preview.voiceChannel
            ? `?voice=${encodeURIComponent(preview.voiceChannel.id)}`
            : '';
        const landingPath = rawVc
          ? `/${rawVc}${landingVoiceQ}`
          : `/invite/${encodeURIComponent(code)}${landingVoiceQ}`;
        const html = buildEchoInviteShareHtml({
          preview,
          canonicalAppBase: config.echoAppPublicUrl,
          landingPath,
          apiPublicBase: config.echoApiPublicUrl,
        });
        return reply
          .header('content-type', 'text/html; charset=utf-8')
          .header('cache-control', 'public, max-age=300')
          .code(200)
          .send(html);
      },
    );
  });

  fastify.post<{ Params: { code: string } }>(
    '/invites/:code/join',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const inv = await resolveEchoInviteTarget(
        pool,
        trimEchoPathParam(req.params.code),
      );
      if (!inv) return sendError(reply, 404, 'NOT_FOUND', 'Invalid invite');
      const r = await joinEchoServerFromInvite(
        pool,
        inv.serverId,
        req.authUser!.id,
        clientIpFromFastifyRequest(req),
      );
      if (!r.ok) {
        if (r.reason === 'not_found') {
          return sendError(reply, 404, 'NOT_FOUND', 'Invite not found');
        }
        if (r.reason === 'raid_protection') {
          return sendError(
            reply,
            429,
            'RAID_PROTECTION_ACTIVE',
            'This server is temporarily protected from burst joins. Please try again shortly.',
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
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You are banned from this server',
          'BANNED_FROM_SERVER',
        );
      }
      if (!r.alreadyMember && r.joinAuditId) {
        publishEchoWorkspaceEvent(
          fastify,
          {
            kind: 'membership_changed',
            version: r.joinAuditId,
            serverId: inv.serverId,
            userId: req.authUser!.id,
          },
          { serverId: inv.serverId, userId: req.authUser!.id },
        );
      }
      return reply
        .code(200)
        .send({ serverId: inv.serverId, alreadyMember: r.alreadyMember });
    },
  );
}
